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
  NODE_KIND_DEFAULTS,
  type DesignEdge,
  type DesignEdgeData,
  type DesignNode,
  type DesignNodeData,
  type NodeKind,
  type PersistedState,
  type SimulationMetrics,
  PERSISTENCE_VERSION,
} from "./types";
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

function createNode(kind: NodeKind, position: { x: number; y: number }): DesignNode {
  const defaults = NODE_KIND_DEFAULTS[kind];
  return {
    id: crypto.randomUUID(),
    type: "system",
    position,
    data: {
      kind,
      label: defaults.label,
      capacity: defaults.capacity,
      status: "up",
    },
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
  hydrateFromImport: (data: PersistedState) => void;
  exportPersisted: () => PersistedState;
  loadSample: () => void;
  clearCanvas: () => void;
  /** Remove nodes and any edges incident to them. */
  removeNodesById: (ids: string[]) => void;
};

export const useDesignStore = create<DesignStore>((set, get) => ({
  nodes: [],
  edges: [],
  simRunning: false,
  globalRps: 1500,
  tickMs: 120,
  metrics: defaultMetrics(),
  selection: { nodeId: null, edgeId: null },
  fitViewNonce: 0,

  onNodesChange: (changes) =>
    set((s) => ({
      nodes: withoutEphemeralNodeData(
        applyNodeChanges(changes, s.nodes) as DesignNode[],
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
          data: { latencyMs: 10 } satisfies DesignEdgeData,
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
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...partial } } : n,
      ),
    })),

  updateEdgeData: (id, partial) =>
    set((s) => ({
      edges: s.edges.map((e) =>
        e.id === id
          ? {
              ...e,
              data: { ...(e.data ?? { latencyMs: 10 }), ...partial },
            }
          : e,
      ),
    })),

  setSelection: (selection) => set({ selection }),

  setSimRunning: (simRunning) => set({ simRunning }),

  setGlobalRps: (globalRps) =>
    set({ globalRps: Number.isFinite(globalRps) ? Math.max(0, globalRps) : 0 }),

  stepSimulation: () => {
    const { nodes, edges, globalRps, tickMs, metrics: prev } = get();
    const dt = tickMs / 1000;
    const next = simulateStep({
      nodes,
      edges,
      globalRps,
      dt,
    });
    if (metricsFingerprint(prev) === metricsFingerprint(next)) {
      return;
    }
    set({ metrics: next });
  },

  hydrateFromImport: (data) => {
    if (data.version !== PERSISTENCE_VERSION) return;
    set((s) => ({
      nodes: data.nodes,
      edges: data.edges,
      globalRps: data.sim.globalRps,
      simRunning: false,
      selection: { nodeId: null, edgeId: null },
      metrics: defaultMetrics(),
      fitViewNonce: s.fitViewNonce + 1,
    }));
  },

  exportPersisted: () => {
    const { nodes, edges, globalRps, simRunning } = get();
    return {
      version: PERSISTENCE_VERSION,
      nodes,
      edges,
      sim: { globalRps, running: simRunning },
    };
  },

  loadSample: () => {
    const sample = getSampleState();
    set((s) => ({
      nodes: sample.nodes,
      edges: sample.edges,
      globalRps: sample.sim.globalRps,
      simRunning: false,
      selection: { nodeId: null, edgeId: null },
      metrics: defaultMetrics(),
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
      return {
        nodes,
        edges,
        selection: { nodeId, edgeId },
      };
    });
  },
}));

export function requestAutosave() {
  scheduleAutosave(() => useDesignStore.getState().exportPersisted());
}
