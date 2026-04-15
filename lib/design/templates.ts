import type { DesignEdge, DesignNode, PersistedState } from "./types";
import {
  defaultNodeBehavior,
  NODE_KIND_DEFAULTS,
  PERSISTENCE_VERSION,
} from "./types";
import { getSampleState } from "./sample";

export type DesignTemplate = {
  id: string;
  name: string;
  shortDescription: string;
  getState: () => PersistedState;
};

function persisted(
  nodes: DesignNode[],
  edges: DesignEdge[],
  globalRps: number,
): PersistedState {
  return {
    version: PERSISTENCE_VERSION,
    nodes: nodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        behavior: n.data.behavior ?? defaultNodeBehavior(n.data.kind),
      },
    })),
    edges,
    sim: { globalRps, running: false },
  };
}

/** Classic client → load balancer → app → database. */
function getThreeTierState(): PersistedState {
  const client = "t3-client";
  const lb = "t3-lb";
  const api = "t3-api";
  const db = "t3-db";
  const nodes: DesignNode[] = [
    {
      id: client,
      type: "system",
      position: { x: 40, y: 120 },
      data: {
        kind: "client",
        label: "Client",
        capacity: NODE_KIND_DEFAULTS.client.capacity,
        status: "up",
        behavior: { behaviorKind: "client", trafficWeight: 1, burstiness: 0.1 },
      },
    },
    {
      id: lb,
      type: "system",
      position: { x: 280, y: 120 },
      data: {
        kind: "lb",
        label: "Load balancer",
        capacity: NODE_KIND_DEFAULTS.lb.capacity,
        status: "up",
        behavior: {
          behaviorKind: "lb",
          algorithm: "roundRobin",
          maxConcurrentRps: null,
        },
      },
    },
    {
      id: api,
      type: "system",
      position: { x: 520, y: 120 },
      data: {
        kind: "api",
        label: "API tier",
        capacity: NODE_KIND_DEFAULTS.api.capacity,
        status: "up",
        behavior: { behaviorKind: "api", parallelism: 1 },
      },
    },
    {
      id: db,
      type: "system",
      position: { x: 760, y: 120 },
      data: {
        kind: "db",
        label: "Database",
        capacity: NODE_KIND_DEFAULTS.db.capacity,
        status: "up",
        behavior: {
          behaviorKind: "db",
          queryCost: 1,
          replicaCount: 1,
        },
      },
    },
  ];
  const edges: DesignEdge[] = [
    { id: "t3-e0", source: client, target: lb, data: { latencyMs: 8, routeWeight: 1 } },
    { id: "t3-e1", source: lb, target: api, data: { latencyMs: 5, routeWeight: 1 } },
    { id: "t3-e2", source: api, target: db, data: { latencyMs: 6, routeWeight: 1 } },
  ];
  return persisted(nodes, edges, 2200);
}

/** API fronts a cache; misses continue to the database (read-through). */
function getReadThroughCacheState(): PersistedState {
  const client = "rtc-client";
  const lb = "rtc-lb";
  const api = "rtc-api";
  const cache = "rtc-cache";
  const db = "rtc-db";
  const nodes: DesignNode[] = [
    {
      id: client,
      type: "system",
      position: { x: 40, y: 140 },
      data: {
        kind: "client",
        label: "Client",
        capacity: NODE_KIND_DEFAULTS.client.capacity,
        status: "up",
        behavior: { behaviorKind: "client", trafficWeight: 1, burstiness: 0.15 },
      },
    },
    {
      id: lb,
      type: "system",
      position: { x: 260, y: 140 },
      data: {
        kind: "lb",
        label: "Load balancer",
        capacity: NODE_KIND_DEFAULTS.lb.capacity,
        status: "up",
        behavior: {
          behaviorKind: "lb",
          algorithm: "uniform",
          maxConcurrentRps: null,
        },
      },
    },
    {
      id: api,
      type: "system",
      position: { x: 500, y: 140 },
      data: {
        kind: "api",
        label: "API",
        capacity: NODE_KIND_DEFAULTS.api.capacity,
        status: "up",
        behavior: { behaviorKind: "api", parallelism: 1.1 },
      },
    },
    {
      id: cache,
      type: "system",
      position: { x: 740, y: 80 },
      data: {
        kind: "cache",
        label: "Cache",
        capacity: NODE_KIND_DEFAULTS.cache.capacity,
        status: "up",
        behavior: { behaviorKind: "cache", hitRate: 0.78 },
      },
    },
    {
      id: db,
      type: "system",
      position: { x: 740, y: 220 },
      data: {
        kind: "db",
        label: "Database",
        capacity: NODE_KIND_DEFAULTS.db.capacity,
        status: "up",
        behavior: {
          behaviorKind: "db",
          queryCost: 1.05,
          replicaCount: 1,
        },
      },
    },
  ];
  const edges: DesignEdge[] = [
    { id: "rtc-e0", source: client, target: lb, data: { latencyMs: 8, routeWeight: 1 } },
    { id: "rtc-e1", source: lb, target: api, data: { latencyMs: 5, routeWeight: 1 } },
    { id: "rtc-e2", source: api, target: cache, data: { latencyMs: 2, routeWeight: 1 } },
    { id: "rtc-e3", source: cache, target: db, data: { latencyMs: 4, routeWeight: 1 } },
  ];
  return persisted(nodes, edges, 2800);
}

/** Web tier publishes to a queue; workers drain into a database. */
function getQueueWorkerPipelineState(): PersistedState {
  const client = "qwp-client";
  const lb = "qwp-lb";
  const webApi = "qwp-web-api";
  const queue = "qwp-queue";
  const workerApi = "qwp-worker-api";
  const db = "qwp-db";
  const nodes: DesignNode[] = [
    {
      id: client,
      type: "system",
      position: { x: 20, y: 160 },
      data: {
        kind: "client",
        label: "Client",
        capacity: NODE_KIND_DEFAULTS.client.capacity,
        status: "up",
        behavior: { behaviorKind: "client", trafficWeight: 1, burstiness: 0.12 },
      },
    },
    {
      id: lb,
      type: "system",
      position: { x: 240, y: 160 },
      data: {
        kind: "lb",
        label: "Load balancer",
        capacity: NODE_KIND_DEFAULTS.lb.capacity,
        status: "up",
        behavior: {
          behaviorKind: "lb",
          algorithm: "uniform",
          maxConcurrentRps: null,
        },
      },
    },
    {
      id: webApi,
      type: "system",
      position: { x: 480, y: 100 },
      data: {
        kind: "api",
        label: "Web API",
        capacity: NODE_KIND_DEFAULTS.api.capacity,
        status: "up",
        behavior: { behaviorKind: "api", parallelism: 1.2 },
      },
    },
    {
      id: queue,
      type: "system",
      position: { x: 480, y: 240 },
      data: {
        kind: "queue",
        label: "Job queue",
        capacity: NODE_KIND_DEFAULTS.queue.capacity,
        status: "up",
        behavior: {
          behaviorKind: "queue",
          publishCapRps: 10_000,
          consumeCapRps: 6_000,
        },
      },
    },
    {
      id: workerApi,
      type: "system",
      position: { x: 720, y: 160 },
      data: {
        kind: "api",
        label: "Worker",
        capacity: 3_500,
        status: "up",
        behavior: { behaviorKind: "api", parallelism: 0.9 },
      },
    },
    {
      id: db,
      type: "system",
      position: { x: 960, y: 160 },
      data: {
        kind: "db",
        label: "Database",
        capacity: NODE_KIND_DEFAULTS.db.capacity,
        status: "up",
        behavior: {
          behaviorKind: "db",
          queryCost: 1.1,
          replicaCount: 1,
        },
      },
    },
  ];
  const edges: DesignEdge[] = [
    { id: "qwp-e0", source: client, target: lb, data: { latencyMs: 8, routeWeight: 1 } },
    { id: "qwp-e1", source: lb, target: webApi, data: { latencyMs: 5, routeWeight: 1 } },
    { id: "qwp-e2", source: webApi, target: queue, data: { latencyMs: 3, routeWeight: 1 } },
    {
      id: "qwp-e3",
      source: queue,
      target: workerApi,
      data: { latencyMs: 4, routeWeight: 1 },
    },
    {
      id: "qwp-e4",
      source: workerApi,
      target: db,
      data: { latencyMs: 6, routeWeight: 1 },
    },
  ];
  return persisted(nodes, edges, 2600);
}

/** Named starting points for the canvas (plus full multi-component demo). */
export const DESIGN_TEMPLATES: DesignTemplate[] = [
  {
    id: "three-tier",
    name: "Three-tier web",
    shortDescription: "Client, load balancer, API, and database in a line.",
    getState: getThreeTierState,
  },
  {
    id: "read-through-cache",
    name: "Read-through cache",
    shortDescription: "API talks to cache first; misses flow to the database.",
    getState: getReadThroughCacheState,
  },
  {
    id: "queue-worker",
    name: "Queue-based worker pipeline",
    shortDescription: "Web API enqueues work; a worker drains the queue into a DB.",
    getState: getQueueWorkerPipelineState,
  },
  {
    id: "full-demo",
    name: "Full demo",
    shortDescription: "Rich diagram with CDN, pools, cache, queue, and storage.",
    getState: getSampleState,
  },
];
