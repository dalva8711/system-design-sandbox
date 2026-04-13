import type { Edge, Node } from "@xyflow/react";
import type {
  DesignEdgeData,
  DesignNodeData,
  SimLoadTier,
  SimulationMetrics,
} from "@/lib/design/types";
import {
  illustrativeHourlyUsd,
  simLoadTierFromUtilization,
} from "@/lib/design/types";

function statusMultiplier(status: DesignNodeData["status"]): number {
  if (status === "down") return 0;
  if (status === "degraded") return 0.5;
  return 1;
}

function capPerTick(
  node: Node<DesignNodeData>,
  dt: number,
): number {
  const mult = statusMultiplier(node.data.status);
  return node.data.capacity * dt * mult;
}

/**
 * Pedagogical toy model: discrete-time flow with capacity limits and drops.
 * Not a faithful distributed-systems simulator.
 */
export function simulateStep(params: {
  nodes: Node<DesignNodeData>[];
  edges: Edge<DesignEdgeData>[];
  globalRps: number;
  dt: number;
}): SimulationMetrics {
  const { nodes, edges, globalRps, dt } = params;

  if (dt <= 0 || nodes.length === 0) {
    return {
      throughputRps: 0,
      droppedRps: 0,
      approximateLatencyMs: 0,
      totalOfferedRps: globalRps,
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

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const outAdj = new Map<string, Edge<DesignEdgeData>[]>();
  for (const e of edges) {
    if (!nodeById.has(e.source) || !nodeById.has(e.target)) continue;
    if (!outAdj.has(e.source)) outAdj.set(e.source, []);
    outAdj.get(e.source)!.push(e);
  }

  const clients = nodes.filter((n) => n.data.kind === "client");
  const totalOffered = globalRps * dt;
  const offeredPerClient =
    clients.length > 0 ? totalOffered / clients.length : totalOffered;

  let load = new Map<string, number>();
  let peakUtilization = 0;
  let totalDropped = 0;
  const edgeFlowPerTick = new Map<string, number>();
  const nodeUtil = new Map<string, number>();
  const nodeServedTick = new Map<string, number>();
  const nodeDroppedTick = new Map<string, number>();

  function bumpServed(nodeId: string, amount: number) {
    if (amount <= 0) return;
    nodeServedTick.set(nodeId, (nodeServedTick.get(nodeId) ?? 0) + amount);
  }

  function bumpDropped(nodeId: string, amount: number) {
    if (amount <= 0) return;
    nodeDroppedTick.set(nodeId, (nodeDroppedTick.get(nodeId) ?? 0) + amount);
  }

  function bumpNodeUtil(nodeId: string, incoming: number, cap: number) {
    if (incoming <= 0) return;
    if (cap <= 0) {
      nodeUtil.set(nodeId, Math.max(nodeUtil.get(nodeId) ?? 0, 10));
    } else {
      nodeUtil.set(
        nodeId,
        Math.max(nodeUtil.get(nodeId) ?? 0, incoming / cap),
      );
    }
  }

  if (clients.length === 0) {
    if (globalRps > 0) {
      totalDropped = totalOffered;
    }
  } else {
    for (const c of clients) {
      const cap = capPerTick(c, dt);
      const raw = offeredPerClient;
      const accepted = Math.min(raw, cap);
      const drop = raw - accepted;
      totalDropped += drop;
      bumpServed(c.id, accepted);
      bumpDropped(c.id, drop);
      if (raw > 0) {
        if (cap <= 0) peakUtilization = Math.max(peakUtilization, 10);
        else peakUtilization = Math.max(peakUtilization, raw / cap);
        bumpNodeUtil(c.id, raw, cap);
      }
      load.set(c.id, (load.get(c.id) ?? 0) + accepted);
    }
  }
  let absorbedAtSinks = 0;
  const maxInner = 40;
  const epsilon = 1e-9;

  for (let _i = 0; _i < maxInner; _i += 1) {
    if (load.size === 0) break;
    const next = new Map<string, number>();
    let progressed = false;

    for (const [id, incoming] of load) {
      const n = nodeById.get(id);
      if (!n) continue;
      const cap = capPerTick(n, dt);
      const served = Math.min(incoming, cap);
      const dropped = incoming - served;
      totalDropped += dropped;
      bumpServed(id, served);
      bumpDropped(id, dropped);
      if (cap <= 0) {
        if (incoming > 0) {
          peakUtilization = Math.max(peakUtilization, 10);
        }
      } else {
        peakUtilization = Math.max(peakUtilization, incoming / cap);
      }
      bumpNodeUtil(id, incoming, cap);

      const outs = outAdj.get(id) ?? [];
      if (outs.length === 0) {
        absorbedAtSinks += served;
      } else {
        const share = served / outs.length;
        if (share > epsilon) progressed = true;
        for (const e of outs) {
          edgeFlowPerTick.set(
            e.id,
            (edgeFlowPerTick.get(e.id) ?? 0) + share,
          );
          const t = e.target;
          next.set(t, (next.get(t) ?? 0) + share);
        }
      }
    }

    load = next;
    if (!progressed && load.size > 0) {
      // residual numerical dust
      for (const [id, v] of load) {
        totalDropped += v;
        bumpDropped(id, v);
      }
      break;
    }
  }

  const throughputRps = absorbedAtSinks / dt;
  const droppedRps = totalDropped / dt;

  const approxLatency = estimateLatency(
    nodes,
    edges,
    nodeById,
    outAdj,
    peakUtilization,
  );

  const edgeFlowRps: Record<string, number> = {};
  for (const [eid, vol] of edgeFlowPerTick) {
    edgeFlowRps[eid] = vol / dt;
  }
  const nodeUtilization: Record<string, number> = {};
  for (const [nid, u] of nodeUtil) {
    nodeUtilization[nid] = u;
  }

  const nodeServedRps: Record<string, number> = {};
  for (const [nid, vol] of nodeServedTick) {
    nodeServedRps[nid] = vol / dt;
  }
  const nodeDroppedRps: Record<string, number> = {};
  for (const [nid, vol] of nodeDroppedTick) {
    nodeDroppedRps[nid] = vol / dt;
  }

  const nodeCostUsdPerHour: Record<string, number> = {};
  let totalCostUsdPerHour = 0;
  const nodeLoadTier: Record<string, SimLoadTier> = {};

  for (const n of nodes) {
    const u = nodeUtilization[n.id] ?? 0;
    const rate = illustrativeHourlyUsd(n.data.kind, u);
    nodeCostUsdPerHour[n.id] = rate;
    totalCostUsdPerHour += rate;
    nodeLoadTier[n.id] = simLoadTierFromUtilization(u);
  }

  return {
    throughputRps,
    droppedRps,
    approximateLatencyMs: approxLatency,
    totalOfferedRps: globalRps,
    peakUtilization: Math.min(peakUtilization, 10),
    edgeFlowRps,
    nodeUtilization,
    nodeServedRps,
    nodeDroppedRps,
    nodeCostUsdPerHour,
    totalCostUsdPerHour,
    nodeLoadTier,
  };
}

function estimateLatency(
  nodes: Node<DesignNodeData>[],
  edges: Edge<DesignEdgeData>[],
  nodeById: Map<string, Node<DesignNodeData>>,
  outAdj: Map<string, Edge<DesignEdgeData>[]>,
  peakUtilization: number,
): number {
  const clients = nodes.filter(
    (n) => n.data.kind === "client" && n.data.status !== "down",
  );
  if (clients.length === 0) return 0;

  let bestMaxPath = 0;

  for (const start of clients) {
    const stack: { id: string; sum: number; depth: number }[] = [
      { id: start.id, sum: 0, depth: 0 },
    ];
    const maxDepth = Math.max(nodes.length * 3, 8);

    while (stack.length) {
      const cur = stack.pop()!;
      if (cur.depth > maxDepth) continue;
      const node = nodeById.get(cur.id);
      if (!node || node.data.status === "down") continue;

      const outs = outAdj.get(cur.id) ?? [];
      if (outs.length === 0) {
        bestMaxPath = Math.max(bestMaxPath, cur.sum);
        continue;
      }
      for (const e of outs) {
        const target = nodeById.get(e.target);
        if (!target || target.data.status === "down") continue;
        const lat = e.data?.latencyMs ?? 10;
        stack.push({
          id: e.target,
          sum: cur.sum + lat,
          depth: cur.depth + 1,
        });
      }
    }
  }

  const utilizationPenalty = 1 + Math.min(peakUtilization, 2) * 40;
  return bestMaxPath * utilizationPenalty;
}
