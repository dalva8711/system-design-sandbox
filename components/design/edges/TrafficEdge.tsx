"use client";

import {
  BaseEdge,
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
  },
  "traffic"
>;

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
  const [path] = getSmoothStepPath({
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
    </>
  );
}
