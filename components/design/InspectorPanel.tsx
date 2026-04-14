"use client";

import { useMemo } from "react";
import { NodeBehaviorFields } from "@/components/design/inspector/NodeBehaviorFields";
import { NumericDraftInput } from "@/components/design/inspector/NumericDraftInput";
import { useDesignStore } from "@/lib/design/store";
import {
  coerceNodeData,
  type NodeBehavior,
  type NodeKind,
  type NodeStatus,
} from "@/lib/design/types";

export function InspectorPanel() {
  const nodes = useDesignStore((s) => s.nodes);
  const edges = useDesignStore((s) => s.edges);
  const metrics = useDesignStore((s) => s.metrics);
  const selection = useDesignStore((s) => s.selection);
  const updateNodeData = useDesignStore((s) => s.updateNodeData);
  const updateEdgeData = useDesignStore((s) => s.updateEdgeData);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selection.nodeId) ?? null,
    [nodes, selection.nodeId],
  );

  const selectedEdge = useMemo(
    () => edges.find((e) => e.id === selection.edgeId) ?? null,
    [edges, selection.edgeId],
  );

  if (selectedNode) {
    const d = coerceNodeData(selectedNode.data);
    const nid = selectedNode.id;
    const lastUtil = metrics.nodeUtilization[nid] ?? 0;
    const lastServed = metrics.nodeServedRps[nid] ?? 0;
    const lastDropped = metrics.nodeDroppedRps[nid] ?? 0;
    const lastCost = metrics.nodeCostUsdPerHour[nid] ?? 0;
    const hasTickData =
      metrics.totalOfferedRps > 0 ||
      metrics.throughputRps > 0 ||
      metrics.droppedRps > 0 ||
      Object.keys(metrics.nodeUtilization).length > 0;

    return (
      <section className="space-y-3 rounded-lg border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03]">
        <header>
          <h3 className="text-sm font-semibold">Node</h3>
          <p className="text-xs text-black/55 dark:text-white/50">
            {d.kind} · {selectedNode.id.slice(0, 8)}…
          </p>
        </header>
        <label className="block text-xs font-medium">
          Label
          <input
            className="mt-1 w-full rounded border border-black/15 bg-[var(--background)] px-2 py-1.5 text-sm dark:border-white/15"
            value={d.label}
            onChange={(e) =>
              updateNodeData(selectedNode.id, { label: e.target.value })
            }
          />
        </label>
        <label className="block text-xs font-medium">
          Capacity (rps)
          <NumericDraftInput
            scopeKey={`${nid}-capacity`}
            value={d.capacity}
            onCommit={(n) =>
              updateNodeData(selectedNode.id, {
                capacity: Math.max(0, n),
              })
            }
            inputMode="numeric"
            min={0}
            className="mt-1 w-full rounded border border-black/15 bg-[var(--background)] px-2 py-1.5 text-sm tabular-nums dark:border-white/15"
          />
        </label>
        <fieldset className="space-y-1 text-xs">
          <legend className="font-medium">Status</legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                [
                  "up",
                  "Healthy",
                  "border-emerald-500/40 bg-emerald-500/10 has-[:checked]:ring-2 has-[:checked]:ring-emerald-500/60",
                ],
                [
                  "degraded",
                  "Degraded",
                  "border-amber-500/45 bg-amber-500/10 has-[:checked]:ring-2 has-[:checked]:ring-amber-500/55",
                ],
                [
                  "down",
                  "Down",
                  "border-rose-500/45 bg-rose-500/10 has-[:checked]:ring-2 has-[:checked]:ring-rose-500/55",
                ],
              ] as const satisfies readonly [NodeStatus, string, string][]
            ).map(([value, label, pillClass]) => (
              <label
                key={value}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium ${pillClass}`}
              >
                <input
                  type="radio"
                  name="node-status"
                  className="accent-[var(--foreground)]"
                  checked={d.status === value}
                  onChange={() =>
                    updateNodeData(selectedNode.id, { status: value })
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block text-xs font-medium">
          Kind
          <select
            className="mt-1 w-full rounded border border-black/15 bg-[var(--background)] px-2 py-1.5 text-sm dark:border-white/15"
            value={d.kind}
            onChange={(e) =>
              updateNodeData(selectedNode.id, {
                kind: e.target.value as NodeKind,
              })
            }
          >
            {(
              [
                "client",
                "lb",
                "api",
                "db",
                "cache",
                "queue",
                "cdn",
                "storage",
              ] as const satisfies readonly NodeKind[]
            ).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <NodeBehaviorFields
          inputScope={nid}
          kind={d.kind}
          behavior={d.behavior}
          onBehaviorChange={(next: NodeBehavior) =>
            updateNodeData(selectedNode.id, { behavior: next })
          }
        />
        {hasTickData ? (
          <div className="rounded-md border border-black/10 bg-black/[0.03] p-2 text-[11px] dark:border-white/10 dark:bg-white/[0.04]">
            <p className="mb-1 font-medium text-black/60 dark:text-white/50">
              Last tick (read-only)
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 font-mono tabular-nums text-black/75 dark:text-white/70">
              <dt className="text-black/50 dark:text-white/45">Util</dt>
              <dd>{(Math.min(lastUtil, 10) * 100).toFixed(0)}%</dd>
              <dt className="text-black/50 dark:text-white/45">Served</dt>
              <dd>{lastServed.toFixed(0)} rps</dd>
              <dt className="text-black/50 dark:text-white/45">Dropped</dt>
              <dd>{lastDropped.toFixed(0)} rps</dd>
              <dt className="text-black/50 dark:text-white/45">~$/hr</dt>
              <dd>${lastCost.toFixed(2)}</dd>
              {d.kind === "queue" ? (
                <>
                  <dt className="text-black/50 dark:text-white/45">
                    Queue depth
                  </dt>
                  <dd>
                    {(metrics.queueDepth[nid] ?? 0).toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}{" "}
                    req
                  </dd>
                </>
              ) : null}
            </dl>
          </div>
        ) : null}
      </section>
    );
  }

  if (selectedEdge) {
    const lat = selectedEdge.data?.latencyMs ?? 10;
    const rw = selectedEdge.data?.routeWeight ?? 1;
    const src = nodes.find((n) => n.id === selectedEdge.source);
    const srcData = src ? coerceNodeData(src.data) : null;
    const showWeightHint =
      srcData?.kind === "lb" &&
      srcData.behavior.behaviorKind === "lb" &&
      srcData.behavior.algorithm === "weighted";

    return (
      <section className="space-y-3 rounded-lg border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03]">
        <header>
          <h3 className="text-sm font-semibold">Edge</h3>
          <p className="text-xs text-black/55 dark:text-white/50">
            {selectedEdge.source} → {selectedEdge.target}
          </p>
        </header>
        <label className="block text-xs font-medium">
          Latency (ms)
          <NumericDraftInput
            scopeKey={`${selectedEdge.id}-latencyMs`}
            value={lat}
            onCommit={(n) =>
              updateEdgeData(selectedEdge.id, {
                latencyMs: Math.max(0, n),
              })
            }
            inputMode="numeric"
            min={0}
            className="mt-1 w-full rounded border border-black/15 bg-[var(--background)] px-2 py-1.5 text-sm tabular-nums dark:border-white/15"
          />
        </label>
        <label className="block text-xs font-medium">
          Route weight
          <NumericDraftInput
            scopeKey={`${selectedEdge.id}-routeWeight`}
            value={rw}
            onCommit={(n) =>
              updateEdgeData(selectedEdge.id, {
                routeWeight: Math.max(0.01, n),
              })
            }
            inputMode="decimal"
            min={0.01}
            step={0.1}
            className="mt-1 w-full rounded border border-black/15 bg-[var(--background)] px-2 py-1.5 text-sm tabular-nums dark:border-white/15"
          />
          {showWeightHint ? (
            <span className="mt-0.5 block text-[10px] font-normal text-black/45 dark:text-white/40">
              Source is a weighted load balancer: relative weights set how much
              traffic each outgoing link receives.
            </span>
          ) : (
            <span className="mt-0.5 block text-[10px] font-normal text-black/45 dark:text-white/40">
              Used when the source node is an LB with the weighted algorithm.
            </span>
          )}
        </label>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-dashed border-black/15 p-3 text-sm text-black/55 dark:border-white/15 dark:text-white/50">
      Select a node or edge to edit simulation fields.
    </section>
  );
}
