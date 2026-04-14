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

export type LbAlgorithm = "uniform" | "roundRobin" | "weighted" | "random";

/** Discriminator matches `DesignNodeData.kind` for each variant. */
export type ClientBehavior = {
  behaviorKind: "client";
  trafficWeight: number;
  /** 0 = steady; 1 = stronger time-varying offered load (teaching toy). */
  burstiness: number;
};

export type LbBehavior = {
  behaviorKind: "lb";
  algorithm: LbAlgorithm;
  /** When set, caps effective processing rate (rps) before fan-out. */
  maxConcurrentRps: number | null;
};

export type ApiBehavior = {
  behaviorKind: "api";
  /** Multiplier on effective capacity (more workers / lighter handlers). */
  parallelism: number;
};

export type DbBehavior = {
  behaviorKind: "db";
  /** Heavier queries reduce effective throughput (>= 1). */
  queryCost: number;
  /** Read / serve scaling multiplier (>= 1). */
  replicaCount: number;
};

export type CacheBehavior = {
  behaviorKind: "cache";
  /** Fraction of served traffic that completes at the cache (0–1). */
  hitRate: number;
};

export type QueueBehavior = {
  behaviorKind: "queue";
  /** Max RPS that may enter the backlog each tick. */
  publishCapRps: number;
  /** Max RPS drained from backlog toward downstream each tick. */
  consumeCapRps: number;
};

export type CdnBehavior = {
  behaviorKind: "cdn";
  /** Fraction of served traffic served from edge (0–1). */
  edgeHitRate: number;
  /** Multiplier on miss traffic forwarded toward origin (>= 1). */
  originPullMultiplier: number;
};

export type StorageBehavior = {
  behaviorKind: "storage";
  /** Added to path latency estimates when this node appears on a path. */
  latencyTaxMs: number;
};

export type NodeBehavior =
  | ClientBehavior
  | LbBehavior
  | ApiBehavior
  | DbBehavior
  | CacheBehavior
  | QueueBehavior
  | CdnBehavior
  | StorageBehavior;

export function defaultNodeBehavior(kind: NodeKind): NodeBehavior {
  switch (kind) {
    case "client":
      return { behaviorKind: "client", trafficWeight: 1, burstiness: 0 };
    case "lb":
      return {
        behaviorKind: "lb",
        algorithm: "uniform",
        maxConcurrentRps: null,
      };
    case "api":
      return { behaviorKind: "api", parallelism: 1 };
    case "db":
      return { behaviorKind: "db", queryCost: 1, replicaCount: 1 };
    case "cache":
      return { behaviorKind: "cache", hitRate: 0.65 };
    case "queue":
      return {
        behaviorKind: "queue",
        publishCapRps: 12_000,
        consumeCapRps: 10_000,
      };
    case "cdn":
      return {
        behaviorKind: "cdn",
        edgeHitRate: 0.88,
        originPullMultiplier: 1,
      };
    case "storage":
      return { behaviorKind: "storage", latencyTaxMs: 8 };
  }
}

/** Ensure `behavior` matches `kind` and fields are finite (for migrated JSON). */
export function coerceNodeData(data: DesignNodeData): DesignNodeData {
  const kind = data.kind;
  let behavior = data.behavior;
  if (!behavior || behavior.behaviorKind !== kind) {
    behavior = defaultNodeBehavior(kind);
  } else {
    behavior = sanitizeBehavior(kind, behavior);
  }
  return { ...data, behavior };
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function sanitizeBehavior(kind: NodeKind, b: NodeBehavior): NodeBehavior {
  switch (kind) {
    case "client":
      if (b.behaviorKind !== "client") return defaultNodeBehavior("client");
      return {
        behaviorKind: "client",
        trafficWeight: Math.max(0, b.trafficWeight),
        burstiness: clamp(b.burstiness, 0, 1),
      };
    case "lb":
      if (b.behaviorKind !== "lb") return defaultNodeBehavior("lb");
      const alg = b.algorithm;
      const algorithm: LbAlgorithm =
        alg === "uniform" ||
        alg === "roundRobin" ||
        alg === "weighted" ||
        alg === "random"
          ? alg
          : "uniform";
      return {
        behaviorKind: "lb",
        algorithm,
        maxConcurrentRps:
          b.maxConcurrentRps === null || b.maxConcurrentRps === undefined
            ? null
            : Math.max(0, b.maxConcurrentRps),
      };
    case "api":
      if (b.behaviorKind !== "api") return defaultNodeBehavior("api");
      return {
        behaviorKind: "api",
        parallelism: Math.max(0.05, b.parallelism),
      };
    case "db":
      if (b.behaviorKind !== "db") return defaultNodeBehavior("db");
      return {
        behaviorKind: "db",
        queryCost: Math.max(0.05, b.queryCost),
        replicaCount: Math.max(0.05, b.replicaCount),
      };
    case "cache":
      if (b.behaviorKind !== "cache") return defaultNodeBehavior("cache");
      return {
        behaviorKind: "cache",
        hitRate: clamp(b.hitRate, 0, 1),
      };
    case "queue":
      if (b.behaviorKind !== "queue") return defaultNodeBehavior("queue");
      return {
        behaviorKind: "queue",
        publishCapRps: Math.max(0, b.publishCapRps),
        consumeCapRps: Math.max(0, b.consumeCapRps),
      };
    case "cdn":
      if (b.behaviorKind !== "cdn") return defaultNodeBehavior("cdn");
      return {
        behaviorKind: "cdn",
        edgeHitRate: clamp(b.edgeHitRate, 0, 1),
        originPullMultiplier: Math.max(0.05, b.originPullMultiplier),
      };
    case "storage":
      if (b.behaviorKind !== "storage") return defaultNodeBehavior("storage");
      return {
        behaviorKind: "storage",
        latencyTaxMs: Math.max(0, b.latencyTaxMs),
      };
  }
}

export interface DesignNodeData extends Record<string, unknown> {
  kind: NodeKind;
  label: string;
  /** Max sustained requests per second the node can process */
  capacity: number;
  status: NodeStatus;
  behavior: NodeBehavior;
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
  /** Used when the source LB uses the weighted algorithm (default 1). */
  routeWeight: number;
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
  /** Queue backlog in requests after the last tick (toy model). */
  queueDepth: Record<string, number>;
}

export const PERSISTENCE_VERSION = 2;

export interface PersistedState {
  version: number;
  nodes: DesignNode[];
  edges: DesignEdge[];
  sim: {
    globalRps: number;
    running: boolean;
  };
}

export const STORAGE_KEY = "system-design-sandbox-v2";

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

export type TransientSimState = {
  /** Per LB node: round-robin cursor (integer offset). */
  lbCursor: Record<string, number>;
  /** Per queue node: backlog size in requests. */
  queueDepth: Record<string, number>;
  /** Increments each simulation tick (deterministic “random”). */
  simTick: number;
};

export function emptyTransientSimState(): TransientSimState {
  return { lbCursor: {}, queueDepth: {}, simTick: 0 };
}

export function normalizeEdgeData(d: DesignEdgeData | undefined): DesignEdgeData {
  const latencyMs =
    d?.latencyMs !== undefined && Number.isFinite(d.latencyMs)
      ? Math.max(0, d.latencyMs)
      : 10;
  const routeWeight =
    d?.routeWeight !== undefined && Number.isFinite(d.routeWeight)
      ? Math.max(0.01, d.routeWeight)
      : 1;
  return { latencyMs, routeWeight };
}

/** Normalize nodes/edges from disk (any supported version). */
export function normalizePersistedState(raw: unknown): PersistedState | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const ver = o.version;
  if (ver === PERSISTENCE_VERSION) {
    if (!Array.isArray(o.nodes) || !Array.isArray(o.edges)) return null;
    return migrateNodesEdgesInPlace({
      version: PERSISTENCE_VERSION,
      nodes: o.nodes as DesignNode[],
      edges: o.edges as DesignEdge[],
      sim: (o.sim as PersistedState["sim"]) ?? {
        globalRps: 1500,
        running: false,
      },
    });
  }
  if (ver === 1) {
    if (!Array.isArray(o.nodes) || !Array.isArray(o.edges)) return null;
    return migrateV1ToCurrent(o as PersistedStateV1);
  }
  return null;
}

type PersistedStateV1 = {
  version: 1;
  nodes: DesignNode[];
  edges: DesignEdge[];
  sim: PersistedState["sim"];
};

function migrateV1ToCurrent(data: PersistedStateV1): PersistedState {
  const nodes = (data.nodes ?? []).map((n) => ({
    ...n,
    data: coerceNodeData(n.data as DesignNodeData),
  })) as DesignNode[];

  const edges = (data.edges ?? []).map((e) => ({
    ...e,
    data: normalizeEdgeData(e.data as DesignEdgeData | undefined),
  })) as DesignEdge[];

  return {
    version: PERSISTENCE_VERSION,
    nodes,
    edges,
    sim: data.sim ?? { globalRps: 1500, running: false },
  };
}

function migrateNodesEdgesInPlace(data: PersistedState): PersistedState {
  return {
    ...data,
    nodes: data.nodes.map((n) => ({
      ...n,
      data: coerceNodeData(n.data),
    })),
    edges: data.edges.map((e) => ({
      ...e,
      data: normalizeEdgeData(e.data as DesignEdgeData | undefined),
    })),
  };
}
