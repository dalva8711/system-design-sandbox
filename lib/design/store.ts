import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
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

  onNodesChange: (changes) =>
    set((s) => ({
      nodes: coerceNodes(
        withoutEphemeralNodeData(
          applyNodeChanges(changes, s.nodes) as DesignNode[],
        ),
      ),
    })),

  onEdgesChange: (changes) =>
    set((s) => ({
      edges: applyEdgeChanges(changes, s.edges) as DesignEdge[],
    })),

  onConnect: (connection) =>
    set((s) => ({
      edges: addEdge(
        {
          ...connection,
          data: { latencyMs: 10, routeWeight: 1 } satisfies DesignEdgeData,
        },
        s.edges,
      ) as DesignEdge[],
    })),

  addNodeAt: (kind, position) =>
    set((s) => ({
      nodes: [...s.nodes, createNode(kind, position)],
    })),

  updateNodeData: (id, partial) =>
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== id) return n;
        const merged: DesignNodeData = { ...n.data, ...partial };
        if (partial.kind != null && partial.kind !== n.data.kind) {
          merged.behavior = defaultNodeBehavior(partial.kind);
        }
        return { ...n, data: coerceNodeData(merged) };
      }),
    })),

  updateEdgeData: (id, partial) =>
    set((s) => ({
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
    })),

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
    const sample = getSampleState();
    set((s) => ({
      nodes: coerceNodes(sample.nodes),
      edges: sample.edges,
      globalRps: sample.sim.globalRps,
      simRunning: false,
      selection: { nodeId: null, edgeId: null },
      metrics: defaultMetrics(),
      transientSim: emptyTransientSimState(),
      fitViewNonce: s.fitViewNonce + 1,
    }));
  },

  clearCanvas: () =>
    set({
      nodes: [],
      edges: [],
      selection: { nodeId: null, edgeId: null },
      metrics: defaultMetrics(),
      simRunning: false,
      transientSim: emptyTransientSimState(),
    }),

  autoLayoutCanvas: () =>
    set((s) => {
      if (s.nodes.length === 0) return {};
      const next = layoutDesignGraph(
        withoutEphemeralNodeData(s.nodes),
        s.edges,
      );
      return {
        nodes: coerceNodes(next),
        fitViewNonce: s.fitViewNonce + 1,
      };
    }),

  removeNodesById: (ids) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    set((s) => {
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
