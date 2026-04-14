"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  RefObject,
} from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  useOnSelectionChange,
  useReactFlow,
  type EdgeTypes,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  TrafficEdge,
  type TrafficEdgeModel,
} from "@/components/design/edges/TrafficEdge";
import { SystemNode } from "@/components/design/nodes/SystemNode";
import {
  coerceNodeData,
  normalizeEdgeData,
  type DesignNode,
  type NodeKind,
} from "@/lib/design/types";
import { useDesignStore } from "@/lib/design/store";

const nodeTypes = {
  system: SystemNode,
} satisfies NodeTypes;

const edgeTypes = {
  traffic: TrafficEdge,
} satisfies EdgeTypes;

const KINDS = new Set<NodeKind>([
  "client",
  "lb",
  "api",
  "db",
  "cache",
  "queue",
  "cdn",
  "storage",
]);

function isNodeKind(value: string): value is NodeKind {
  return KINDS.has(value as NodeKind);
}

function routeWeightAppliesForSource(
  nodeList: DesignNode[],
  sourceId: string,
): boolean {
  const src = nodeList.find((n) => n.id === sourceId);
  if (!src) return false;
  const d = coerceNodeData(src.data);
  return (
    d.kind === "lb" &&
    d.behavior.behaviorKind === "lb" &&
    d.behavior.algorithm === "weighted"
  );
}

function pointInRect(
  clientX: number,
  clientY: number,
  el: HTMLElement | null,
): boolean {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return (
    clientX >= r.left &&
    clientX <= r.right &&
    clientY >= r.top &&
    clientY <= r.bottom
  );
}

function SelectionBridge() {
  const setSelection = useDesignStore((s) => s.setSelection);
  useOnSelectionChange({
    onChange: ({ nodes, edges }) => {
      const nodeId = nodes[0]?.id ?? null;
      const edgeId = edges[0]?.id ?? null;
      setSelection({ nodeId, edgeId });
    },
  });
  return null;
}

function TrashDropTarget({
  trashRef,
  hot,
}: {
  trashRef: RefObject<HTMLDivElement | null>;
  hot: boolean;
}) {
  return (
    <Panel position="top-left" className="m-0">
      <div
        ref={trashRef}
        className={`flex flex-col items-center gap-1 rounded-lg border bg-[var(--background)] px-3 py-2 shadow-sm transition-colors ${
          hot
            ? "border-rose-500/80 bg-rose-500/15 ring-2 ring-rose-500/50"
            : "border-black/15 dark:border-white/15"
        }`}
        aria-label="Drop components here to remove them"
      >
        <TrashIcon className={hot ? "text-rose-600 dark:text-rose-400" : "opacity-70"} />
        <span className="max-w-[7rem] text-center text-[10px] font-medium leading-tight text-black/60 dark:text-white/55">
          Drag here to delete
        </span>
      </div>
    </Panel>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  );
}

function CanvasToolbar() {
  const rf = useReactFlow();
  const nodeCount = useDesignStore((s) => s.nodes.length);
  const autoLayoutCanvas = useDesignStore((s) => s.autoLayoutCanvas);
  return (
    <Panel position="top-right" className="flex gap-2">
      <button
        type="button"
        onClick={() => autoLayoutCanvas()}
        disabled={nodeCount === 0}
        className="rounded-md border border-black/15 bg-[var(--background)] px-2 py-1 text-xs font-medium shadow-sm disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/15"
        aria-label="Tidy layout: auto-arrange all nodes"
      >
        Tidy layout
      </button>
      <button
        type="button"
        onClick={() => rf.fitView({ padding: 0.2 })}
        className="rounded-md border border-black/15 bg-[var(--background)] px-2 py-1 text-xs font-medium shadow-sm dark:border-white/15"
      >
        Fit view
      </button>
    </Panel>
  );
}

function FitViewListener() {
  const nonce = useDesignStore((s) => s.fitViewNonce);
  const rf = useReactFlow();
  useEffect(() => {
    if (!nonce) return;
    const id = requestAnimationFrame(() => {
      rf.fitView({ padding: 0.18 });
    });
    return () => cancelAnimationFrame(id);
  }, [nonce, rf]);
  return null;
}

type FlowInstance = {
  screenToFlowPosition: (p: { x: number; y: number }) => { x: number; y: number };
};

export function FlowCanvas() {
  const nodes = useDesignStore((s) => s.nodes);
  const edges = useDesignStore((s) => s.edges);
  const metrics = useDesignStore((s) => s.metrics);
  const simRunning = useDesignStore((s) => s.simRunning);
  const onNodesChange = useDesignStore((s) => s.onNodesChange);
  const onEdgesChange = useDesignStore((s) => s.onEdgesChange);
  const onConnect = useDesignStore((s) => s.onConnect);
  const addNodeAt = useDesignStore((s) => s.addNodeAt);
  const removeNodesById = useDesignStore((s) => s.removeNodesById);

  const trashRef = useRef<HTMLDivElement>(null);
  const [trashHot, setTrashHot] = useState(false);

  const [showMiniMap, setShowMiniMap] = useState(false);
  const miniMapHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearMiniMapHideTimer = useCallback(() => {
    if (miniMapHideTimerRef.current !== null) {
      clearTimeout(miniMapHideTimerRef.current);
      miniMapHideTimerRef.current = null;
    }
  }, []);

  const onViewportMoveStart = useCallback(() => {
    clearMiniMapHideTimer();
    setShowMiniMap(true);
  }, [clearMiniMapHideTimer]);

  const onViewportMoveEnd = useCallback(() => {
    clearMiniMapHideTimer();
    miniMapHideTimerRef.current = setTimeout(() => {
      miniMapHideTimerRef.current = null;
      setShowMiniMap(false);
    }, 200);
  }, [clearMiniMapHideTimer]);

  useEffect(() => {
    return () => clearMiniMapHideTimer();
  }, [clearMiniMapHideTimer]);

  const onNodeDrag = useCallback((event: ReactMouseEvent) => {
    setTrashHot(pointInRect(event.clientX, event.clientY, trashRef.current));
  }, []);

  const onNodeDragStart = useCallback(() => {
    setTrashHot(false);
  }, []);

  const onNodeDragStop = useCallback(
    (event: ReactMouseEvent, _node: DesignNode, dragged: DesignNode[]) => {
      const over = pointInRect(
        event.clientX,
        event.clientY,
        trashRef.current,
      );
      setTrashHot(false);
      if (over && dragged.length > 0) {
        removeNodesById(dragged.map((n) => n.id));
      }
    },
    [removeNodesById],
  );

  const displayNodes = useMemo((): DesignNode[] => {
    if (!simRunning) {
      return nodes;
    }
    const util = metrics.nodeUtilization;
    const served = metrics.nodeServedRps;
    const dropped = metrics.nodeDroppedRps;
    const cost = metrics.nodeCostUsdPerHour;
    const tier = metrics.nodeLoadTier;
    return nodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        simUtil: util[n.id] ?? 0,
        simActive: true,
        simServedRps: served[n.id] ?? 0,
        simDroppedRps: dropped[n.id] ?? 0,
        simCostPerHr: cost[n.id] ?? 0,
        simLoadTier: tier[n.id] ?? "none",
      },
    }));
  }, [nodes, simRunning, metrics]);

  const displayEdges = useMemo((): TrafficEdgeModel[] => {
    if (!simRunning) {
      return edges.map((e) => ({
        ...e,
        type: "traffic" as const,
        data: {
          ...normalizeEdgeData(e.data),
          routeWeightApplies: routeWeightAppliesForSource(nodes, e.source),
          flowRps: 0,
          flowNorm: 0,
          simActive: false,
        },
      }));
    }
    const flows = metrics.edgeFlowRps;
    let maxFlow = 0;
    for (const e of edges) {
      maxFlow = Math.max(maxFlow, flows[e.id] ?? 0);
    }
    const denom = maxFlow > 0 ? maxFlow : 1;
    return edges.map((e) => ({
      ...e,
      type: "traffic" as const,
      data: {
        ...normalizeEdgeData(e.data),
        routeWeightApplies: routeWeightAppliesForSource(nodes, e.source),
        flowRps: flows[e.id] ?? 0,
        flowNorm: (flows[e.id] ?? 0) / denom,
        simActive: true,
      },
    }));
  }, [edges, nodes, simRunning, metrics]);

  const flowRef = useRef<FlowInstance | null>(null);

  const onInit = useCallback((instance: FlowInstance) => {
    flowRef.current = instance;
  }, []);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const raw = event.dataTransfer.getData("application/reactflow");
      if (!isNodeKind(raw)) return;
      const inst = flowRef.current;
      if (!inst) return;
      const position = inst.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      addNodeAt(raw, position);
    },
    [addNodeAt],
  );

  const defaultEdgeOptions = useMemo(
    () => ({
      type: "traffic" as const,
      data: { latencyMs: 10, routeWeight: 1 },
    }),
    [],
  );

  return (
    <div className="relative h-full min-h-[520px] w-full rounded-lg border border-black/10 bg-zinc-50 dark:border-white/10 dark:bg-zinc-950">
      <ReactFlow<DesignNode, TrafficEdgeModel>
        nodes={displayNodes}
        edges={displayEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={onInit}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable
        nodesConnectable
        elementsSelectable
        onDragOver={onDragOver}
        onDrop={onDrop}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        defaultEdgeOptions={defaultEdgeOptions}
        deleteKeyCode={["Backspace", "Delete"]}
        fitView
        proOptions={{ hideAttribution: true }}
        onMoveStart={onViewportMoveStart}
        onMoveEnd={onViewportMoveEnd}
      >
        <Background gap={18} size={1} variant={BackgroundVariant.Dots} />
        {showMiniMap ? (
          <MiniMap
            pannable
            zoomable
            className="!rounded-md !border !border-black/10 !bg-[var(--background)] dark:!border-white/10"
          />
        ) : null}
        <Controls className="!shadow-md" />
        <TrashDropTarget trashRef={trashRef} hot={trashHot} />
        <SelectionBridge />
        <CanvasToolbar />
        <FitViewListener />
      </ReactFlow>
    </div>
  );
}
