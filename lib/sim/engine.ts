import type { Edge, Node } from "@xyflow/react";
import type {
  DesignEdgeData,
  DesignNodeData,
  SimLoadTier,
  SimulationMetrics,
  TransientSimState,
} from "@/lib/design/types";
import {
  coerceNodeData,
  emptyTransientSimState,
  illustrativeHourlyUsd,
  simLoadTierFromUtilization,
} from "@/lib/design/types";
import { splitLbOutbound } from "@/lib/sim/dispatch";

function statusMultiplier(status: DesignNodeData["status"]): number {
  if (status === "down") return 0;
  if (status === "degraded") return 0.5;
  return 1;
}

function capPerTick(node: Node<DesignNodeData>, dt: number): number {
  const mult = statusMultiplier(node.data.status);
  return node.data.capacity * dt * mult;
}

function effectiveCapPerTick(node: Node<DesignNodeData>, dt: number): number {
  const base = capPerTick(node, dt);
  const b = node.data.behavior;
  switch (node.data.kind) {
    case "api":
      return b.behaviorKind === "api" ? base * b.parallelism : base;
    case "db":
      return b.behaviorKind === "db"
        ? base * (b.replicaCount / b.queryCost)
        : base;
    case "lb":
      if (b.behaviorKind !== "lb" || b.maxConcurrentRps === null) return base;
      const capConc = b.maxConcurrentRps * dt * statusMultiplier(node.data.status);
      return Math.min(base, capConc);
    default:
      return base;
  }
}

function forwardEven(
  amount: number,
  outs: Edge<DesignEdgeData>[],
  edgeFlowPerTick: Map<string, number>,
  next: Map<string, number>,
  epsilon: number,
): boolean {
  if (amount <= epsilon || outs.length === 0) return false;
  const share = amount / outs.length;
  for (const e of outs) {
    edgeFlowPerTick.set(e.id, (edgeFlowPerTick.get(e.id) ?? 0) + share);
    next.set(e.target, (next.get(e.target) ?? 0) + share);
  }
  return true;
}

export function simulateStep(params: {
  nodes: Node<DesignNodeData>[];
  edges: Edge<DesignEdgeData>[];
  globalRps: number;
  dt: number;
  prevTransient: TransientSimState;
}): { metrics: SimulationMetrics; nextTransient: TransientSimState } {
  const { nodes: rawNodes, edges, globalRps, dt, prevTransient } = params;

  const nodes = rawNodes.map((n) => ({
    ...n,
    data: coerceNodeData(n.data),
  }));

  const nextTransient: TransientSimState = {
    lbCursor: { ...prevTransient.lbCursor },
    queueDepth: { ...prevTransient.queueDepth },
    simTick: prevTransient.simTick + 1,
  };
  const simTick = nextTransient.simTick;

  const emptyMetrics = (): SimulationMetrics => ({
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
    queueDepth: {},
  });

  if (dt <= 0 || nodes.length === 0) {
    return { metrics: emptyMetrics(), nextTransient: emptyTransientSimState() };
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

  const weights = clients.map((c) => {
    const b = c.data.behavior;
    const w = b.behaviorKind === "client" ? Math.max(0, b.trafficWeight) : 1;
    const burst = b.behaviorKind === "client" ? b.burstiness : 0;
    const phase = Math.sin((simTick + c.id.length * 0.7) * 0.31);
    return w * (1 + burst * phase * 0.4);
  });
  const sumW = weights.reduce((a, b) => a + b, 0) || 1;

  let load = new Map<string, number>();
  let peakUtilization = 0;
  let totalDropped = 0;
  const edgeFlowPerTick = new Map<string, number>();
  const nodeUtil = new Map<string, number>();
  const nodeServedTick = new Map<string, number>();
  const nodeDroppedTick = new Map<string, number>();

  const queueWorkingDepth = new Map<string, number>();
  for (const n of nodes) {
    if (n.data.kind === "queue") {
      queueWorkingDepth.set(n.id, nextTransient.queueDepth[n.id] ?? 0);
    }
  }

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
    for (let i = 0; i < clients.length; i++) {
      const c = clients[i]!;
      const cap = capPerTick(c, dt);
      const raw = (totalOffered * (weights[i] ?? 1)) / sumW;
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

    const orderedIds = [...load.keys()].sort();

    for (const id of orderedIds) {
      const incoming = load.get(id) ?? 0;
      if (incoming <= epsilon) continue;

      const n = nodeById.get(id);
      if (!n) continue;

      const outs = outAdj.get(id) ?? [];

      if (n.data.kind === "queue" && n.data.behavior.behaviorKind === "queue") {
        const b = n.data.behavior;
        const mult = statusMultiplier(n.data.status);
        const publishTick = b.publishCapRps * dt * mult;
        const consumeTick = b.consumeCapRps * dt * mult;
        const capTick = capPerTick(n, dt);
        const publishRoom = Math.min(publishTick, capTick);

        bumpNodeUtil(id, incoming, Math.max(publishRoom, 1e-9));

        const enter = Math.min(incoming, publishRoom);
        const dropPublish = incoming - enter;
        totalDropped += dropPublish;
        bumpDropped(id, dropPublish);

        let depth = queueWorkingDepth.get(id) ?? 0;
        depth += enter;
        const drain = Math.min(depth, consumeTick);
        depth -= drain;
        queueWorkingDepth.set(id, depth);
        nextTransient.queueDepth[id] = depth;

        bumpServed(id, enter + drain);

        if (capTick > 0) {
          peakUtilization = Math.max(peakUtilization, incoming / capTick);
        } else if (incoming > 0) {
          peakUtilization = Math.max(peakUtilization, 10);
        }

        if (outs.length === 0) {
          absorbedAtSinks += drain;
        } else if (forwardEven(drain, outs, edgeFlowPerTick, next, epsilon)) {
          progressed = true;
        }
        continue;
      }

      const cap = effectiveCapPerTick(n, dt);
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

      if (served <= epsilon) continue;

      if (n.data.kind === "cache" || n.data.kind === "cdn") {
        const bh = n.data.behavior;
        const hitRate =
          n.data.kind === "cache" && bh.behaviorKind === "cache"
            ? bh.hitRate
            : n.data.kind === "cdn" && bh.behaviorKind === "cdn"
              ? bh.edgeHitRate
              : 0.5;
        const effHit =
          outs.length === 0 ? 1 : Math.min(1, Math.max(0, hitRate));
        const hit = served * effHit;
        let miss = served - hit;
        if (
          n.data.kind === "cdn" &&
          n.data.behavior.behaviorKind === "cdn" &&
          miss > epsilon
        ) {
          miss *= n.data.behavior.originPullMultiplier;
        }
        absorbedAtSinks += hit;
        if (outs.length === 0) {
          absorbedAtSinks += miss;
        } else if (forwardEven(miss, outs, edgeFlowPerTick, next, epsilon)) {
          progressed = true;
        }
        continue;
      }

      if (outs.length === 0) {
        absorbedAtSinks += served;
      } else if (n.data.kind === "lb") {
        const bh = n.data.behavior;
        const algo =
          bh.behaviorKind === "lb" ? bh.algorithm : "uniform";
        const cursor = nextTransient.lbCursor[id] ?? 0;
        const { amounts, nextCursor } = splitLbOutbound(
          served,
          outs,
          algo,
          id,
          simTick,
          cursor,
        );
        nextTransient.lbCursor[id] = nextCursor;
        for (let j = 0; j < outs.length; j++) {
          const amt = amounts[j] ?? 0;
          if (amt <= epsilon) continue;
          progressed = true;
          const e = outs[j]!;
          edgeFlowPerTick.set(e.id, (edgeFlowPerTick.get(e.id) ?? 0) + amt);
          next.set(e.target, (next.get(e.target) ?? 0) + amt);
        }
      } else if (forwardEven(served, outs, edgeFlowPerTick, next, epsilon)) {
        progressed = true;
      }
    }

    load = next;
    if (!progressed && load.size > 0) {
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

  const queueDepthOut: Record<string, number> = {};
  for (const n of nodes) {
    if (n.data.kind === "queue") {
      queueDepthOut[n.id] = queueWorkingDepth.get(n.id) ?? 0;
    }
  }

  for (const n of nodes) {
    const u = nodeUtilization[n.id] ?? 0;
    const rate = illustrativeHourlyUsd(n.data.kind, u);
    nodeCostUsdPerHour[n.id] = rate;
    totalCostUsdPerHour += rate;
    nodeLoadTier[n.id] = simLoadTierFromUtilization(u);
  }

  const metrics: SimulationMetrics = {
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
    queueDepth: queueDepthOut,
  };

  return { metrics, nextTransient };
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

      const tax =
        node.data.kind === "storage" &&
        node.data.behavior.behaviorKind === "storage"
          ? node.data.behavior.latencyTaxMs
          : 0;

      const outs = outAdj.get(cur.id) ?? [];
      if (outs.length === 0) {
        bestMaxPath = Math.max(bestMaxPath, cur.sum + tax);
        continue;
      }
      for (const e of outs) {
        const target = nodeById.get(e.target);
        if (!target || target.data.status === "down") continue;
        const lat = e.data?.latencyMs ?? 10;
        stack.push({
          id: e.target,
          sum: cur.sum + lat + tax,
          depth: cur.depth + 1,
        });
      }
    }
  }

  const utilizationPenalty = 1 + Math.min(peakUtilization, 2) * 40;
  return bestMaxPath * utilizationPenalty;
}
