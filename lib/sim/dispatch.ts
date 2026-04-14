import type { Edge } from "@xyflow/react";
import type { DesignEdgeData, LbAlgorithm } from "@/lib/design/types";

const RR_BUCKETS = 48;

function pseudoUnit(nodeId: string, tick: number, salt: number): number {
  let h = 2166136261;
  for (const c of `${nodeId}\0${tick}\0${salt}`) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10_000) / 10_000;
}

/**
 * Split `served` across outgoing edges for a load balancer (toy traffic shaping).
 */
export function splitLbOutbound(
  served: number,
  outs: Edge<DesignEdgeData>[],
  algorithm: LbAlgorithm,
  nodeId: string,
  simTick: number,
  lbCursor: number,
): { amounts: number[]; nextCursor: number } {
  const n = outs.length;
  if (n === 0 || served <= 0) {
    return { amounts: [], nextCursor: lbCursor };
  }

  if (algorithm === "uniform") {
    const share = served / n;
    return {
      amounts: outs.map(() => share),
      nextCursor: lbCursor,
    };
  }

  if (algorithm === "weighted") {
    const weights = outs.map(
      (e) => e.data?.routeWeight ?? 1,
    );
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum <= 0) {
      const share = served / n;
      return {
        amounts: outs.map(() => share),
        nextCursor: lbCursor,
      };
    }
    return {
      amounts: weights.map((w) => (served * w) / sum),
      nextCursor: lbCursor,
    };
  }

  if (algorithm === "roundRobin") {
    const amounts = new Array<number>(n).fill(0);
    const per = served / RR_BUCKETS;
    const cursor = ((lbCursor % n) + n) % n;
    for (let b = 0; b < RR_BUCKETS; b++) {
      const i = (cursor + b) % n;
      amounts[i] += per;
    }
    return { amounts, nextCursor: (cursor + RR_BUCKETS) % n };
  }

  // random
  const raw = outs.map((_, i) => pseudoUnit(nodeId, simTick, i) + 0.05);
  const sum = raw.reduce((a, b) => a + b, 0);
  return {
    amounts: raw.map((w) => (served * w) / sum),
    nextCursor: lbCursor,
  };
}
