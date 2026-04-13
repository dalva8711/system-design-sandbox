import type { Edge, Node } from "@xyflow/react";

export type NodeKind =
  | "client"
  | "lb"
  | "api"
  | "db"
  | "cache"
  | "queue"
  | "cdn"
  | "storage";

export type NodeStatus = "up" | "down" | "degraded";

/** Derived from utilization while the sim runs; does not change persisted `status`. */
export type SimLoadTier = "none" | "elevated" | "severe";

export interface DesignNodeData extends Record<string, unknown> {
  kind: NodeKind;
  label: string;
  /** Max sustained requests per second the node can process */
  capacity: number;
  status: NodeStatus;
  /** Ephemeral: merged on the canvas from the last simulation tick. */
  simUtil?: number;
  /** Ephemeral: true while the simulation clock is running. */
  simActive?: boolean;
  /** Ephemeral: accepted load processed at this node last tick (rps). */
  simServedRps?: number;
  /** Ephemeral: load dropped at this hop last tick (rps). */
  simDroppedRps?: number;
  /** Ephemeral: illustrative $/hr from last tick (teaching numbers only). */
  simCostPerHr?: number;
  /** Ephemeral: visual overload tier from last tick utilization. */
  simLoadTier?: SimLoadTier;
}

export interface DesignEdgeData extends Record<string, unknown> {
  latencyMs: number;
  /** Ephemeral: merged on the canvas for edge animation. */
  flowRps?: number;
  flowNorm?: number;
  simActive?: boolean;
}

export type DesignNode = Node<DesignNodeData>;
export type DesignEdge = Edge<DesignEdgeData>;

export interface SimulationMetrics {
  throughputRps: number;
  droppedRps: number;
  approximateLatencyMs: number;
  totalOfferedRps: number;
  peakUtilization: number;
  /** Per-edge request rate that traversed the edge in the last tick (for diagram animation). */
  edgeFlowRps: Record<string, number>;
  /** Per-node max incoming/capacity ratio during the last tick. */
  nodeUtilization: Record<string, number>;
  /** Accepted load processed at each node last tick (rps). */
  nodeServedRps: Record<string, number>;
  /** Drops attributed to each node when incoming exceeded cap (rps). */
  nodeDroppedRps: Record<string, number>;
  /** Illustrative hourly rate per node (USD/hr); not a real quote. */
  nodeCostUsdPerHour: Record<string, number>;
  /** Sum of `nodeCostUsdPerHour` for the graph. */
  totalCostUsdPerHour: number;
  /** Visual-only overload tier from utilization thresholds. */
  nodeLoadTier: Record<string, SimLoadTier>;
}

export const PERSISTENCE_VERSION = 1;

export interface PersistedState {
  version: number;
  nodes: DesignNode[];
  edges: DesignEdge[];
  sim: {
    globalRps: number;
    running: boolean;
  };
}

export const STORAGE_KEY = "system-design-sandbox-v1";

export const NODE_KIND_DEFAULTS: Record<
  NodeKind,
  { label: string; capacity: number }
> = {
  client: { label: "Client", capacity: 50_000 },
  lb: { label: "Load balancer", capacity: 20_000 },
  api: { label: "API service", capacity: 5_000 },
  db: { label: "Database", capacity: 1_200 },
  cache: { label: "Cache", capacity: 30_000 },
  queue: { label: "Message queue", capacity: 8_000 },
  cdn: { label: "CDN", capacity: 100_000 },
  storage: { label: "Object storage", capacity: 3_000 },
};

/** Round teaching numbers only — illustrative hourly baseline before load scaling. */
export const NODE_KIND_HOURLY_BASE_USD: Record<NodeKind, number> = {
  client: 12,
  lb: 45,
  api: 180,
  db: 420,
  cache: 90,
  queue: 120,
  cdn: 35,
  storage: 55,
};

const UTIL_ELEVATED = 0.85;
const UTIL_SEVERE = 1.0;

export function simLoadTierFromUtilization(util: number): SimLoadTier {
  if (!Number.isFinite(util) || util < UTIL_ELEVATED) return "none";
  if (util >= UTIL_SEVERE) return "severe";
  return "elevated";
}

export function illustrativeHourlyUsd(
  kind: NodeKind,
  utilization: number,
): number {
  const base = NODE_KIND_HOURLY_BASE_USD[kind];
  const u = Math.min(Math.max(utilization, 0), 2);
  return base * (0.25 + 0.75 * u);
}
