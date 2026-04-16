import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type NodePositionChange,
} from "@xyflow/react";
import { create } from "zustand";
import { simulateStep } from "@/lib/sim/engine";
import {
  coerceNodeData,
  defaultNodeBehavior,
  emptyTransientSimState,
  NODE_KIND_DEFAULTS,
  normalizeEdgeData,
  normalizePersistedState,
  type DesignEdge,
  type DesignEdgeData,
  type DesignNode,
  type DesignNodeData,
  type NodeKind,
  type PersistedState,
  type SimulationMetrics,
  type TransientSimState,
  PERSISTENCE_VERSION,
} from "./types";
import { layoutDesignGraph } from "./autoLayout";
import { getSampleState } from "./sample";
import { scheduleAutosave } from "./persist";

const MAX_GRAPH_HISTORY = 75;

type GraphSnapshot = { nodes: DesignNode[]; edges: DesignEdge[] };

/** Nested undo/redo must not push onto the history stacks. */
let graphHistoryDepth = 0;

/**
 * True while a pointer node-drag is in progress (after first `position`+`dragging:true`
 * batch). Used so we record the pre-drag snapshot once, skip intermediate moves, and
 * skip the final `dragging:false` batch (positions are already applied during drag).
 */
let nodePositionDragSession = false;

function cloneGraphSnapshot(nodes: DesignNode[], edges: DesignEdge[]): GraphSnapshot {
  return structuredClone({ nodes, edges });
}

function resetNodePositionDragSession() {
  nodePositionDragSession = false;
}

function shouldRecordNodesChange(changes: NodeChange[]): boolean {
  if (changes.length === 0) return false;
  if (changes.every((c) => c.type === "select" || c.type === "dimensions")) {
    return false;
  }

  const onlyPosition = changes.every((c) => c.type === "position");
  if (!onlyPosition) {
    resetNodePositionDragSession();
    return true;
  }

  const allDragging = changes.every(
    (c) =>
      c.type === "position" &&
      (c as NodePositionChange).dragging === true,
  );

  if (allDragging) {
    if (!nodePositionDragSession) {
      nodePositionDragSession = true;
      return true;
    }
    return false;
  }

  if (nodePositionDragSession) {
    resetNodePositionDragSession();
    return false;
  }

  return true;
}

function shouldRecordEdgesChange(changes: EdgeChange[]): boolean {
  if (changes.length === 0) return false;
  return !changes.every((c) => c.type === "select");
}

function defaultMetrics(): SimulationMetrics {
  return {
    throughputRps: 0,
    droppedRps: 0,
    approximateLatencyMs: 0,
    totalOfferedRps: 0,
    peakUtilization: 0,
    edgeFlowRps: {},
    nodeUtilization: {},
    nodeServedRps: {},
    nodeDroppedRps: {},
    nodeCostUsdPerHour: {},
    totalCostUsdPerHour: 0,
    nodeLoadTier: {},
    queueDepth: {},
  };
}

/** Avoid replacing `metrics` when the step is a no-op, so the canvas can stay stable while editing. */
function metricsFingerprint(m: SimulationMetrics): string {
  return JSON.stringify({
    throughputRps: m.throughputRps,
    droppedRps: m.droppedRps,
    approximateLatencyMs: m.approximateLatencyMs,
    totalOfferedRps: m.totalOfferedRps,
    peakUtilization: m.peakUtilization,
    edgeFlowRps: m.edgeFlowRps,
    nodeUtilization: m.nodeUtilization,
    nodeServedRps: m.nodeServedRps,
    nodeDroppedRps: m.nodeDroppedRps,
    nodeCostUsdPerHour: m.nodeCostUsdPerHour,
    totalCostUsdPerHour: m.totalCostUsdPerHour,
    nodeLoadTier: m.nodeLoadTier,
    queueDepth: m.queueDepth,
  });
}

/** Canvas merges ephemeral sim fields into nodes for display; strip before persisting. */
function withoutEphemeralNodeData(nodes: DesignNode[]): DesignNode[] {
  return nodes.map((n) => {
    if (
      n.data.simUtil === undefined &&
      n.data.simActive === undefined &&
      n.data.simServedRps === undefined &&
      n.data.simDroppedRps === undefined &&
      n.data.simCostPerHr === undefined &&
      n.data.simLoadTier === undefined
    ) {
      return n;
    }
    const data = { ...n.data };
    delete data.simUtil;
    delete data.simActive;
    delete data.simServedRps;
    delete data.simDroppedRps;
    delete data.simCostPerHr;
    delete data.simLoadTier;
    return { ...n, data };
  });
}

function coerceNodes(nodes: DesignNode[]): DesignNode[] {
  return nodes.map((n) => ({ ...n, data: coerceNodeData(n.data) }));
}

function createNode(kind: NodeKind, position: { x: number; y: number }): DesignNode {
  const defaults = NODE_KIND_DEFAULTS[kind];
  return {
    id: crypto.randomUUID(),
    type: "system",
    position,
    data: coerceNodeData({
      kind,
      label: defaults.label,
      capacity: defaults.capacity,
      status: "up",
      behavior: defaultNodeBehavior(kind),
    }),
  };
}

export type SelectionState = { nodeId: string | null; edgeId: string | null };

function reconcileSelectionAfterGraphRestore(
  nodes: DesignNode[],
  edges: DesignEdge[],
  sel: SelectionState,
): SelectionState {
  const nodeId =
    sel.nodeId && nodes.some((n) => n.id === sel.nodeId) ? sel.nodeId : null;
  const edgeId =
    sel.edgeId && edges.some((e) => e.id === sel.edgeId) ? sel.edgeId : null;
  return { nodeId, edgeId };
}

export type DesignStore = {
  nodes: DesignNode[];
  edges: DesignEdge[];
  simRunning: boolean;
  globalRps: number;
  tickMs: number;
  metrics: SimulationMetrics;
  /** Per-tick state for LB RR and queue backlog while the sim runs. */
  transientSim: TransientSimState;
  selection: SelectionState;
  /** Incremented when the canvas should refit (sample load, import). */
  fitViewNonce: number;

  graphPast: GraphSnapshot[];
  graphFuture: GraphSnapshot[];

  undoGraph: () => void;
  redoGraph: () => void;

  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addNodeAt: (kind: NodeKind, position: { x: number; y: number }) => void;
  updateNodeData: (id: string, partial: Partial<DesignNodeData>) => void;
  updateEdgeData: (id: string, partial: Partial<DesignEdgeData>) => void;
  setSelection: (selection: SelectionState) => void;
  setSimRunning: (running: boolean) => void;
  setGlobalRps: (rps: number) => void;
  stepSimulation: () => void;
  hydrateFromImport: (data: unknown) => void;
  exportPersisted: () => PersistedState;
  loadSample: () => void;
  clearCanvas: () => void;
  /** Remove nodes and any edges incident to them. */
  removeNodesById: (ids: string[]) => void;
  /** Dagre auto-layout; bumps fitViewNonce so the canvas refits. */
  autoLayoutCanvas: () => void;
};

export const useDesignStore = create<DesignStore>((set, get) => ({
  nodes: [],
  edges: [],
  simRunning: false,
  globalRps: 1500,
  tickMs: 120,
  metrics: defaultMetrics(),
  transientSim: emptyTransientSimState(),
  selection: { nodeId: null, edgeId: null },
  fitViewNonce: 0,

  graphPast: [],
  graphFuture: [],

  undoGraph: () => {
    const s = get();
    if (s.graphPast.length === 0) return;
    resetNodePositionDragSession();
    graphHistoryDepth++;
    try {
      const prev = s.graphPast[s.graphPast.length - 1];
      const newPast = s.graphPast.slice(0, -1);
      const currentSnap = cloneGraphSnapshot(s.nodes, s.edges);
      const selection = reconcileSelectionAfterGraphRestore(
        prev.nodes,
        prev.edges,
        s.selection,
      );
      set({
        nodes: prev.nodes,
        edges: prev.edges,
        graphPast: newPast,
        graphFuture: [currentSnap, ...s.graphFuture].slice(0, MAX_GRAPH_HISTORY),
        selection,
      });
    } finally {
      graphHistoryDepth--;
    }
  },

  redoGraph: () => {
    const s = get();
    if (s.graphFuture.length === 0) return;
    resetNodePositionDragSession();
    graphHistoryDepth++;
    try {
      const [next, ...restFuture] = s.graphFuture;
      const currentSnap = cloneGraphSnapshot(s.nodes, s.edges);
      const selection = reconcileSelectionAfterGraphRestore(
        next.nodes,
        next.edges,
        s.selection,
      );
      set({
        nodes: next.nodes,
        edges: next.edges,
        graphPast: [...s.graphPast, currentSnap].slice(-MAX_GRAPH_HISTORY),
        graphFuture: restFuture,
        selection,
      });
    } finally {
      graphHistoryDepth--;
    }
  },

  onNodesChange: (changes) => {
    const record =
      graphHistoryDepth === 0 && shouldRecordNodesChange(changes);
    set((s) => ({
      graphPast: record
        ? [...s.graphPast, cloneGraphSnapshot(s.nodes, s.edges)].slice(
            -MAX_GRAPH_HISTORY,
          )
        : s.graphPast,
      graphFuture: record ? [] : s.graphFuture,
      nodes: coerceNodes(
        withoutEphemeralNodeData(
          applyNodeChanges(changes, s.nodes) as DesignNode[],
        ),
      ),
    }));
  },

  onEdgesChange: (changes) => {
    const record =
      graphHistoryDepth === 0 && shouldRecordEdgesChange(changes);
    if (record) resetNodePositionDragSession();
    set((s) => ({
      graphPast: record
        ? [...s.graphPast, cloneGraphSnapshot(s.nodes, s.edges)].slice(
            -MAX_GRAPH_HISTORY,
          )
        : s.graphPast,
      graphFuture: record ? [] : s.graphFuture,
      edges: applyEdgeChanges(changes, s.edges) as DesignEdge[],
    }));
  },

  onConnect: (connection) =>
    set((s) => {
      const record = graphHistoryDepth === 0;
      if (record) resetNodePositionDragSession();
      return {
        graphPast: record
          ? [...s.graphPast, cloneGraphSnapshot(s.nodes, s.edges)].slice(
              -MAX_GRAPH_HISTORY,
            )
          : s.graphPast,
        graphFuture: record ? [] : s.graphFuture,
        edges: addEdge(
          {
            ...connection,
            data: { latencyMs: 10, routeWeight: 1 } satisfies DesignEdgeData,
          },
          s.edges,
        ) as DesignEdge[],
      };
    }),

  addNodeAt: (kind, position) =>
    set((s) => {
      const record = graphHistoryDepth === 0;
      if (record) resetNodePositionDragSession();
      return {
        graphPast: record
          ? [...s.graphPast, cloneGraphSnapshot(s.nodes, s.edges)].slice(
              -MAX_GRAPH_HISTORY,
            )
          : s.graphPast,
        graphFuture: record ? [] : s.graphFuture,
        nodes: [...s.nodes, createNode(kind, position)],
      };
    }),

  updateNodeData: (id, partial) =>
    set((s) => {
      const record = graphHistoryDepth === 0;
      if (record) resetNodePositionDragSession();
      return {
        graphPast: record
          ? [...s.graphPast, cloneGraphSnapshot(s.nodes, s.edges)].slice(
              -MAX_GRAPH_HISTORY,
            )
          : s.graphPast,
        graphFuture: record ? [] : s.graphFuture,
        nodes: s.nodes.map((n) => {
          if (n.id !== id) return n;
          const merged: DesignNodeData = { ...n.data, ...partial };
          if (partial.kind != null && partial.kind !== n.data.kind) {
            merged.behavior = defaultNodeBehavior(partial.kind);
          }
          return { ...n, data: coerceNodeData(merged) };
        }),
      };
    }),

  updateEdgeData: (id, partial) =>
    set((s) => {
      const record = graphHistoryDepth === 0;
      if (record) resetNodePositionDragSession();
      return {
        graphPast: record
          ? [...s.graphPast, cloneGraphSnapshot(s.nodes, s.edges)].slice(
              -MAX_GRAPH_HISTORY,
            )
          : s.graphPast,
        graphFuture: record ? [] : s.graphFuture,
        edges: s.edges.map((e) =>
          e.id === id
            ? {
                ...e,
                data: {
                  latencyMs: 10,
                  routeWeight: 1,
                  ...(e.data ?? {}),
                  ...partial,
                } satisfies DesignEdgeData,
              }
            : e,
        ),
      };
    }),

  setSelection: (selection) => set({ selection }),

  setSimRunning: (simRunning) =>
    set({
      simRunning,
      ...(simRunning ? {} : { transientSim: emptyTransientSimState() }),
    }),

  setGlobalRps: (globalRps) =>
    set({ globalRps: Number.isFinite(globalRps) ? Math.max(0, globalRps) : 0 }),

  stepSimulation: () => {
    const { nodes, edges, globalRps, tickMs, metrics: prev, simRunning } = get();
    const dt = tickMs / 1000;
    const prevTransient = simRunning
      ? get().transientSim
      : emptyTransientSimState();
    const { metrics: next, nextTransient } = simulateStep({
      nodes,
      edges,
      globalRps,
      dt,
      prevTransient,
    });
    if (metricsFingerprint(prev) === metricsFingerprint(next)) {
      if (simRunning) {
        set({ transientSim: nextTransient });
      }
      return;
    }
    set({
      metrics: next,
      transientSim: simRunning ? nextTransient : emptyTransientSimState(),
    });
  },

  hydrateFromImport: (data) => {
    const normalized = normalizePersistedState(data);
    if (!normalized) return;
    resetNodePositionDragSession();
    set((s) => ({
      nodes: coerceNodes(normalized.nodes),
      edges: normalized.edges.map((e) => ({
        ...e,
        data: normalizeEdgeData(e.data),
      })),
      globalRps: normalized.sim.globalRps,
      simRunning: false,
      selection: { nodeId: null, edgeId: null },
      metrics: defaultMetrics(),
      transientSim: emptyTransientSimState(),
      fitViewNonce: s.fitViewNonce + 1,
      graphPast: [],
      graphFuture: [],
    }));
  },

  exportPersisted: () => {
    const { nodes, edges, globalRps, simRunning } = get();
    return {
      version: PERSISTENCE_VERSION,
      nodes: coerceNodes(withoutEphemeralNodeData(nodes)),
      edges: edges.map((e) => ({
        ...e,
        data: normalizeEdgeData(e.data),
      })),
      sim: { globalRps, running: simRunning },
    };
  },

  loadSample: () => {
    get().hydrateFromImport(getSampleState());
  },

  clearCanvas: () => {
    resetNodePositionDragSession();
    set({
      nodes: [],
      edges: [],
      selection: { nodeId: null, edgeId: null },
      metrics: defaultMetrics(),
      simRunning: false,
      transientSim: emptyTransientSimState(),
      graphPast: [],
      graphFuture: [],
    });
  },

  autoLayoutCanvas: () =>
    set((s) => {
      if (s.nodes.length === 0) return {};
      const record = graphHistoryDepth === 0;
      if (record) resetNodePositionDragSession();
      const next = layoutDesignGraph(
        withoutEphemeralNodeData(s.nodes),
        s.edges,
      );
      return {
        graphPast: record
          ? [...s.graphPast, cloneGraphSnapshot(s.nodes, s.edges)].slice(
              -MAX_GRAPH_HISTORY,
            )
          : s.graphPast,
        graphFuture: record ? [] : s.graphFuture,
        nodes: coerceNodes(next),
        fitViewNonce: s.fitViewNonce + 1,
      };
    }),

  removeNodesById: (ids) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    set((s) => {
      const record = graphHistoryDepth === 0;
      if (record) resetNodePositionDragSession();
      const nodes = s.nodes.filter((n) => !idSet.has(n.id));
      const edges = s.edges.filter(
        (e) => !idSet.has(e.source) && !idSet.has(e.target),
      );
      const nodeId =
        s.selection.nodeId && idSet.has(s.selection.nodeId)
          ? null
          : s.selection.nodeId;
      const edgeId =
        s.selection.edgeId && !edges.some((e) => e.id === s.selection.edgeId)
          ? null
          : s.selection.edgeId;
      const lbCursor = { ...s.transientSim.lbCursor };
      const queueDepth = { ...s.transientSim.queueDepth };
      for (const id of idSet) {
        delete lbCursor[id];
        delete queueDepth[id];
      }
      return {
        graphPast: record
          ? [...s.graphPast, cloneGraphSnapshot(s.nodes, s.edges)].slice(
              -MAX_GRAPH_HISTORY,
            )
          : s.graphPast,
        graphFuture: record ? [] : s.graphFuture,
        nodes,
        edges,
        selection: { nodeId, edgeId },
        transientSim: { ...s.transientSim, lbCursor, queueDepth },
      };
    });
  },
}));

export function requestAutosave() {
  scheduleAutosave(() => useDesignStore.getState().exportPersisted());
}
