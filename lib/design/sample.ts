import type { DesignEdge, DesignNode } from "./types";
import type { PersistedState } from "./types";
import {
  defaultNodeBehavior,
  NODE_KIND_DEFAULTS,
  PERSISTENCE_VERSION,
} from "./types";

const c = "sample-client";
const cdn = "sample-cdn";
const lb = "sample-lb";
const api = "sample-api";
const apiCold = "sample-api-cold";
const db = "sample-db";
const cache = "sample-cache";
const q = "sample-queue";
const st = "sample-storage";

export function getSampleDiagram(): { nodes: DesignNode[]; edges: DesignEdge[] } {
  return {
    nodes: [
      {
        id: c,
        type: "system",
        position: { x: 20, y: 160 },
        data: {
          kind: "client",
          label: "Browser",
          capacity: NODE_KIND_DEFAULTS.client.capacity,
          status: "up",
          behavior: {
            behaviorKind: "client",
            trafficWeight: 1,
            burstiness: 0.25,
          },
        },
      },
      {
        id: cdn,
        type: "system",
        position: { x: 140, y: 160 },
        data: {
          kind: "cdn",
          label: "CDN edge",
          capacity: NODE_KIND_DEFAULTS.cdn.capacity,
          status: "up",
          behavior: {
            behaviorKind: "cdn",
            edgeHitRate: 0.82,
            originPullMultiplier: 1.05,
          },
        },
      },
      {
        id: lb,
        type: "system",
        position: { x: 300, y: 160 },
        data: {
          kind: "lb",
          label: "Load balancer",
          capacity: NODE_KIND_DEFAULTS.lb.capacity,
          status: "up",
          behavior: {
            behaviorKind: "lb",
            algorithm: "weighted",
            maxConcurrentRps: 18_000,
          },
        },
      },
      {
        id: api,
        type: "system",
        position: { x: 540, y: 80 },
        data: {
          kind: "api",
          label: "API tier",
          capacity: NODE_KIND_DEFAULTS.api.capacity,
          status: "up",
          behavior: { behaviorKind: "api", parallelism: 1.35 },
        },
      },
      {
        id: apiCold,
        type: "system",
        position: { x: 540, y: 220 },
        data: {
          kind: "api",
          label: "API (cold pool)",
          capacity: 2_800,
          status: "up",
          behavior: { behaviorKind: "api", parallelism: 0.85 },
        },
      },
      {
        id: db,
        type: "system",
        position: { x: 820, y: 200 },
        data: {
          kind: "db",
          label: "Primary DB",
          capacity: NODE_KIND_DEFAULTS.db.capacity,
          status: "up",
          behavior: {
            behaviorKind: "db",
            queryCost: 1.15,
            replicaCount: 2,
          },
        },
      },
      {
        id: cache,
        type: "system",
        position: { x: 820, y: 40 },
        data: {
          kind: "cache",
          label: "Redis",
          capacity: NODE_KIND_DEFAULTS.cache.capacity,
          status: "up",
          behavior: { behaviorKind: "cache", hitRate: 0.72 },
        },
      },
      {
        id: q,
        type: "system",
        position: { x: 700, y: 300 },
        data: {
          kind: "queue",
          label: "Async writes",
          capacity: NODE_KIND_DEFAULTS.queue.capacity,
          status: "up",
          behavior: {
            behaviorKind: "queue",
            publishCapRps: 9_000,
            consumeCapRps: 7_000,
          },
        },
      },
      {
        id: st,
        type: "system",
        position: { x: 920, y: 300 },
        data: {
          kind: "storage",
          label: "Object store",
          capacity: NODE_KIND_DEFAULTS.storage.capacity,
          status: "up",
          behavior: { behaviorKind: "storage", latencyTaxMs: 22 },
        },
      },
    ],
    edges: [
      {
        id: "sample-e0",
        source: c,
        target: cdn,
        data: { latencyMs: 8, routeWeight: 1 },
      },
      {
        id: "sample-e1",
        source: cdn,
        target: lb,
        data: { latencyMs: 6, routeWeight: 1 },
      },
      {
        id: "sample-e2",
        source: lb,
        target: api,
        data: { latencyMs: 4, routeWeight: 3 },
      },
      {
        id: "sample-e2b",
        source: lb,
        target: apiCold,
        data: { latencyMs: 5, routeWeight: 1 },
      },
      {
        id: "sample-e3",
        source: api,
        target: db,
        data: { latencyMs: 6, routeWeight: 1 },
      },
      {
        id: "sample-e3b",
        source: apiCold,
        target: db,
        data: { latencyMs: 7, routeWeight: 1 },
      },
      {
        id: "sample-e4",
        source: api,
        target: cache,
        data: { latencyMs: 2, routeWeight: 1 },
      },
      {
        id: "sample-e5",
        source: api,
        target: q,
        data: { latencyMs: 3, routeWeight: 1 },
      },
      {
        id: "sample-e6",
        source: q,
        target: st,
        data: { latencyMs: 8, routeWeight: 1 },
      },
    ],
  };
}

export function getSampleState(): PersistedState {
  const { nodes, edges } = getSampleDiagram();
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
    sim: { globalRps: 3200, running: false },
  };
}
