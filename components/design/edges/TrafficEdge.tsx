"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  type Edge,
  type EdgeProps,
  getSmoothStepPath,
  Position,
} from "@xyflow/react";
import type { DesignEdgeData } from "@/lib/design/types";

export type TrafficEdgeModel = Edge<
  DesignEdgeData & {
    flowNorm?: number;
    flowRps?: number;
    simActive?: boolean;
    /** Ephemeral: true when the source is a weighted LB (for label emphasis). */
    routeWeightApplies?: boolean;
  },
  "traffic"
>;

function formatRouteWeight(w: number): string {
  const rounded = Math.round(w * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  const s = rounded.toFixed(2);
  return s.replace(/0+$/, "").replace(/\.$/, "");
}

function formatLatencyMs(ms: number): string {
  if (!Number.isFinite(ms)) return "0";
  if (Number.isInteger(ms)) return String(ms);
  const t = ms.toFixed(1);
  return t.replace(/\.0$/, "");
}

export function TrafficEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition = Position.Right,
  targetPosition = Position.Left,
  markerEnd,
  style,
  interactionWidth,
  data,
  selected,
}: EdgeProps<TrafficEdgeModel>) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const flowNorm = data?.flowNorm ?? 0;
  const simActive = data?.simActive ?? false;
  const showFlow = simActive && flowNorm > 0.02;
  const durationSec = Math.max(0.45, 2.1 - flowNorm * 1.65);

  const baseStroke = selected ? "rgb(14 165 233)" : "var(--edge-stroke-default)";

  const latencyMs = data?.latencyMs ?? 10;
  const routeWeight = data?.routeWeight ?? 1;
  const routeWeightApplies = data?.routeWeightApplies ?? false;
  const weightCustomized = Math.abs(routeWeight - 1) > 0.0005;
  const showRouteWeight = routeWeightApplies || weightCustomized;
  const flowRps = data?.flowRps ?? 0;
  const showFlowRps = simActive && flowRps > 0;

  const specLine = showRouteWeight
    ? `${formatLatencyMs(latencyMs)} ms · w${formatRouteWeight(routeWeight)}`
    : `${formatLatencyMs(latencyMs)} ms`;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={interactionWidth}
        style={{
          stroke: baseStroke,
          strokeWidth: selected ? 2.25 : 1.5,
          ...style,
        }}
      />
      {showFlow ? (
        <path
          id={`${id}-traffic-flow`}
          d={path}
          fill="none"
          className="traffic-edge-flow stroke-sky-500 dark:stroke-sky-400"
          style={{
            strokeWidth: 2.5,
            strokeDasharray: "10 16",
            strokeLinecap: "round",
            opacity: 0.35 + flowNorm * 0.55,
            animationDuration: `${durationSec}s`,
          }}
        />
      ) : null}
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
          }}
          className="nodrag nopan pointer-events-none"
        >
          <div
            className={`max-w-[11rem] rounded border px-1.5 py-0.5 text-center text-[10px] font-medium tabular-nums shadow-sm ${
              selected
                ? "border-sky-500/70 bg-[var(--background)] text-black/85 ring-1 ring-sky-500/40 dark:text-white/90"
                : "border-black/12 bg-[var(--background)]/95 text-black/75 dark:border-white/12 dark:bg-[var(--background)]/95 dark:text-white/75"
            }`}
          >
            <div className="leading-tight">{specLine}</div>
            {showFlowRps ? (
              <div className="mt-0.5 text-[9px] font-normal leading-tight text-black/50 dark:text-white/45">
                {flowRps.toFixed(0)} rps
              </div>
            ) : null}
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
