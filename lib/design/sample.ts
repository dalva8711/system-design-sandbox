import type { DesignEdge, DesignNode } from "./types";
import type { PersistedState } from "./types";
import { NODE_KIND_DEFAULTS, PERSISTENCE_VERSION } from "./types";

const c = "sample-client";
const lb = "sample-lb";
const api = "sample-api";
const db = "sample-db";
const cache = "sample-cache";

export function getSampleDiagram(): { nodes: DesignNode[]; edges: DesignEdge[] } {
  return {
    nodes: [
      {
        id: c,
        type: "system",
        position: { x: 40, y: 160 },
        data: {
          kind: "client",
          label: "Browser",
          capacity: NODE_KIND_DEFAULTS.client.capacity,
          status: "up",
        },
      },
      {
        id: lb,
        type: "system",
        position: { x: 260, y: 160 },
        data: {
          kind: "lb",
          label: "Load balancer",
          capacity: NODE_KIND_DEFAULTS.lb.capacity,
          status: "up",
        },
      },
      {
        id: api,
        type: "system",
        position: { x: 500, y: 120 },
        data: {
          kind: "api",
          label: "API tier",
          capacity: NODE_KIND_DEFAULTS.api.capacity,
          status: "up",
        },
      },
      {
        id: db,
        type: "system",
        position: { x: 760, y: 220 },
        data: {
          kind: "db",
          label: "Primary DB",
          capacity: NODE_KIND_DEFAULTS.db.capacity,
          status: "up",
        },
      },
      {
        id: cache,
        type: "system",
        position: { x: 760, y: 40 },
        data: {
          kind: "cache",
          label: "Redis",
          capacity: NODE_KIND_DEFAULTS.cache.capacity,
          status: "up",
        },
      },
    ],
    edges: [
      {
        id: "sample-e1",
        source: c,
        target: lb,
        data: { latencyMs: 12 },
      },
      {
        id: "sample-e2",
        source: lb,
        target: api,
        data: { latencyMs: 4 },
      },
      {
        id: "sample-e3",
        source: api,
        target: db,
        data: { latencyMs: 6 },
      },
      {
        id: "sample-e4",
        source: api,
        target: cache,
        data: { latencyMs: 2 },
      },
    ],
  };
}

export function getSampleState(): PersistedState {
  const { nodes, edges } = getSampleDiagram();
  return {
    version: PERSISTENCE_VERSION,
    nodes,
    edges,
    sim: { globalRps: 2000, running: false },
  };
}
