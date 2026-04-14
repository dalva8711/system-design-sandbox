import dagre from "@dagrejs/dagre";
import type { DesignEdge, DesignNode } from "@/lib/design/types";

const NODE_W = 200;
const NODE_H = 140;
const COMPONENT_GAP = 80;
const ISOLATE_GAP = 28;

function findComponents(nodeIds: string[], edges: DesignEdge[]): string[][] {
  const idSet = new Set(nodeIds);
  const adj = new Map<string, Set<string>>();
  for (const id of nodeIds) {
    adj.set(id, new Set());
  }
  for (const e of edges) {
    if (!idSet.has(e.source) || !idSet.has(e.target)) continue;
    adj.get(e.source)!.add(e.target);
    adj.get(e.target)!.add(e.source);
  }

  const visited = new Set<string>();
  const out: string[][] = [];

  for (const id of nodeIds) {
    if (visited.has(id)) continue;
    const comp: string[] = [];
    const stack = [id];
    visited.add(id);
    while (stack.length) {
      const u = stack.pop()!;
      comp.push(u);
      for (const v of adj.get(u) ?? []) {
        if (!visited.has(v)) {
          visited.add(v);
          stack.push(v);
        }
      }
    }
    out.push(comp);
  }
  return out;
}

function layoutComponent(
  nodeIds: string[],
  edges: DesignEdge[],
): Map<string, { x: number; y: number }> {
  const nodeSet = new Set(nodeIds);
  const internalEdges = edges.filter(
    (e) =>
      nodeSet.has(e.source) &&
      nodeSet.has(e.target) &&
      e.source !== e.target,
  );

  const pos = new Map<string, { x: number; y: number }>();

  if (internalEdges.length === 0) {
    for (let i = 0; i < nodeIds.length; i++) {
      pos.set(nodeIds[i]!, {
        x: i * (NODE_W + ISOLATE_GAP),
        y: 0,
      });
    }
    return pos;
  }

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "LR",
    ranksep: 72,
    nodesep: 36,
    edgesep: 16,
    marginx: 16,
    marginy: 16,
  });

  for (const id of nodeIds) {
    g.setNode(id, { width: NODE_W, height: NODE_H });
  }

  const seen = new Set<string>();
  for (const e of internalEdges) {
    const key = `${e.source}\0${e.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    g.setEdge(e.source, e.target);
  }

  dagre.layout(g);

  for (const id of nodeIds) {
    const nd = g.node(id) as { x?: number; y?: number } | undefined;
    if (!nd || nd.x == null || nd.y == null) {
      pos.set(id, { x: 0, y: 0 });
      continue;
    }
    pos.set(id, {
      x: nd.x - NODE_W / 2,
      y: nd.y - NODE_H / 2,
    });
  }

  return pos;
}

function boundsOf(
  nodeIds: string[],
  pos: Map<string, { x: number; y: number }>,
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const id of nodeIds) {
    const p = pos.get(id);
    if (!p) continue;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + NODE_W);
    maxY = Math.max(maxY, p.y + NODE_H);
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Assigns new `position` for every node using Dagre (LR) per weakly-connected
 * component, packed left-to-right. Edge-free components become a simple row.
 */
export function layoutDesignGraph(
  nodes: DesignNode[],
  edges: DesignEdge[],
): DesignNode[] {
  if (nodes.length === 0) return [];

  const nodeIds = nodes.map((n) => n.id);
  const components = findComponents(nodeIds, edges);
  const global = new Map<string, { x: number; y: number }>();

  let cursorX = 0;

  for (const comp of components) {
    const local = layoutComponent(comp, edges);
    const { minX, minY, maxX } = boundsOf(comp, local);

    for (const id of comp) {
      const p = local.get(id);
      if (!p) continue;
      global.set(id, {
        x: p.x - minX + cursorX,
        y: p.y - minY,
      });
    }

    const width = maxX - minX;
    cursorX += width + COMPONENT_GAP;
  }

  return nodes.map((n) => {
    const p = global.get(n.id);
    if (!p) return n;
    return { ...n, position: { x: p.x, y: p.y } };
  });
}
