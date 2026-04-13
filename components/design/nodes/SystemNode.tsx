"use client";

import { Handle, Position } from "@xyflow/react";
import type { Node, NodeProps } from "@xyflow/react";
import type { DesignNodeData, NodeKind } from "@/lib/design/types";

const accent: Record<NodeKind, string> = {
  client:
    "border-violet-500/35 bg-violet-500/10 text-violet-900 dark:text-violet-100",
  lb: "border-sky-500/35 bg-sky-500/10 text-sky-900 dark:text-sky-100",
  api: "border-emerald-500/35 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100",
  db: "border-amber-500/35 bg-amber-500/10 text-amber-950 dark:text-amber-100",
  cache: "border-fuchsia-500/35 bg-fuchsia-500/10 text-fuchsia-900 dark:text-fuchsia-100",
  queue: "border-cyan-500/35 bg-cyan-500/10 text-cyan-950 dark:text-cyan-100",
  cdn: "border-indigo-500/35 bg-indigo-500/10 text-indigo-900 dark:text-indigo-100",
  storage:
    "border-stone-500/35 bg-stone-500/10 text-stone-900 dark:text-stone-100",
};

const statusPill: Record<
  DesignNodeData["status"],
  { label: string; className: string }
> = {
  up: {
    label: "Healthy",
    className:
      "border-emerald-500/45 bg-emerald-500/15 text-emerald-900 dark:text-emerald-100",
  },
  degraded: {
    label: "Degraded",
    className:
      "border-amber-500/50 bg-amber-500/15 text-amber-950 dark:text-amber-100",
  },
  down: {
    label: "Down",
    className:
      "border-rose-500/50 bg-rose-500/15 text-rose-900 dark:text-rose-100",
  },
};

export function SystemNode({
  data,
  selected,
}: NodeProps<Node<DesignNodeData>>) {
  const pill = statusPill[data.status];
  const statusClass =
    data.status === "down"
      ? "opacity-90 ring-2 ring-rose-500/55"
      : data.status === "degraded"
        ? "ring-2 ring-amber-500/55"
        : "";

  const simUtil = data.simUtil ?? 0;
  const simActive = data.simActive ?? false;
  const simTier = data.simLoadTier ?? "none";
  const simSevere = simActive && simTier === "severe";
  const simElevated = simActive && simTier === "elevated";
  const overloadRing = simSevere
    ? "ring-2 ring-orange-600/70 dark:ring-orange-500/65"
    : simElevated
      ? "ring-2 ring-amber-500/60 dark:ring-amber-400/55"
      : "";

  return (
    <div
      className={`min-w-[168px] max-w-[228px] rounded-lg border-2 bg-[var(--background)] px-3 py-2 text-[var(--foreground)] shadow-sm transition-shadow ${accent[data.kind]} ${statusClass} ${selected ? "shadow-md ring-2 ring-sky-500/80" : ""} ${overloadRing} ${simSevere ? "node-sim-load-hot" : ""} `}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!size-2.5 !border-2 !border-[var(--foreground)]/30 !bg-[var(--background)]"
      />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-[10px] font-semibold uppercase tracking-wide opacity-60">
          {data.kind}
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${pill.className}`}
        >
          {pill.label}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <div className="min-w-0 flex-1 text-sm font-semibold leading-snug">
          {data.label}
        </div>
        {simActive && simTier !== "none" ? (
          <span
            className={`shrink-0 rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide ${
              simTier === "severe"
                ? "border-orange-600/55 bg-orange-500/15 text-orange-900 dark:text-orange-100"
                : "border-amber-600/50 bg-amber-500/12 text-amber-950 dark:text-amber-100"
            }`}
          >
            {simTier === "severe" ? "Overload" : "Hot"}
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-[11px] opacity-65">
        {Math.round(data.capacity).toLocaleString()} rps capacity
      </div>
      {simActive ? (
        <div className="mt-1.5 border-t border-black/10 pt-1.5 text-[10px] leading-snug dark:border-white/10">
          <div className="font-mono tabular-nums text-black/75 dark:text-white/70">
            {(Math.min(simUtil, 10) * 100).toFixed(0)}% util · served{" "}
            {(data.simServedRps ?? 0).toFixed(0)} rps · dropped{" "}
            {(data.simDroppedRps ?? 0).toFixed(0)} rps
          </div>
          <div className="mt-0.5 font-mono text-[10px] tabular-nums text-black/60 dark:text-white/55">
            ~${(data.simCostPerHr ?? 0).toFixed(2)}/hr
          </div>
        </div>
      ) : null}
      <Handle
        type="source"
        position={Position.Right}
        className="!size-2.5 !border-2 !border-[var(--foreground)]/30 !bg-[var(--background)]"
      />
    </div>
  );
}
