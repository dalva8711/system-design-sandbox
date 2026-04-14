"use client";

import { NumericDraftInput } from "@/components/design/inspector/NumericDraftInput";
import type {
  LbAlgorithm,
  NodeBehavior,
  NodeKind,
} from "@/lib/design/types";

type Props = {
  /** Stable id (e.g. node id) so draft strings reset when switching selection. */
  inputScope: string;
  kind: NodeKind;
  behavior: NodeBehavior;
  onBehaviorChange: (next: NodeBehavior) => void;
};

const LB_ALGOS: { value: LbAlgorithm; label: string }[] = [
  { value: "uniform", label: "Uniform split" },
  { value: "roundRobin", label: "Round robin" },
  { value: "weighted", label: "Weighted (edge weights)" },
  { value: "random", label: "Random" },
];

export function NodeBehaviorFields({
  inputScope,
  kind,
  behavior,
  onBehaviorChange,
}: Props) {
  return (
    <fieldset className="space-y-3 rounded-md border border-black/10 bg-black/[0.02] p-2 dark:border-white/10 dark:bg-white/[0.03]">
      <legend className="px-1 text-xs font-semibold text-black/65 dark:text-white/55">
        Behavior (simulation)
      </legend>
      <p className="text-[10px] leading-relaxed text-black/50 dark:text-white/45">
        Teaching toy: knobs illustrate how each component shapes traffic, not
        vendor-accurate numbers.
      </p>

      {kind === "client" && behavior.behaviorKind === "client" ? (
        <div className="space-y-2">
          <label className="block text-xs font-medium">
            Traffic weight
            <NumericDraftInput
              scopeKey={`${inputScope}-trafficWeight`}
              value={behavior.trafficWeight}
              onCommit={(n) =>
                onBehaviorChange({
                  ...behavior,
                  trafficWeight: n,
                })
              }
              inputMode="decimal"
              min={0}
              step={0.1}
              className="mt-1 w-full rounded border border-black/15 bg-[var(--background)] px-2 py-1.5 text-sm tabular-nums dark:border-white/15"
            />
            <span className="mt-0.5 block text-[10px] font-normal text-black/45 dark:text-white/40">
              When multiple clients exist, offered load is split by weight.
            </span>
          </label>
          <label className="block text-xs font-medium">
            Burstiness (0–1)
            <NumericDraftInput
              scopeKey={`${inputScope}-burstiness`}
              value={behavior.burstiness}
              onCommit={(n) =>
                onBehaviorChange({
                  ...behavior,
                  burstiness: n,
                })
              }
              inputMode="decimal"
              min={0}
              max={1}
              step={0.05}
              className="mt-1 w-full rounded border border-black/15 bg-[var(--background)] px-2 py-1.5 text-sm tabular-nums dark:border-white/15"
            />
          </label>
        </div>
      ) : null}

      {kind === "lb" && behavior.behaviorKind === "lb" ? (
        <div className="space-y-2">
          <label className="block text-xs font-medium">
            Algorithm
            <select
              className="mt-1 w-full rounded border border-black/15 bg-[var(--background)] px-2 py-1.5 text-sm dark:border-white/15"
              value={behavior.algorithm}
              onChange={(e) =>
                onBehaviorChange({
                  ...behavior,
                  algorithm: e.target.value as LbAlgorithm,
                })
              }
            >
              {LB_ALGOS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium">
            Max concurrent (rps cap, optional)
            <input
              type="text"
              inputMode="numeric"
              placeholder="Use node capacity"
              className="mt-1 w-full rounded border border-black/15 bg-[var(--background)] px-2 py-1.5 text-sm dark:border-white/15"
              value={
                behavior.maxConcurrentRps === null
                  ? ""
                  : String(behavior.maxConcurrentRps)
              }
              onChange={(e) => {
                const t = e.target.value.trim();
                if (t === "") {
                  onBehaviorChange({ ...behavior, maxConcurrentRps: null });
                  return;
                }
                const n = Number(t);
                if (!Number.isFinite(n) || n < 0) return;
                onBehaviorChange({ ...behavior, maxConcurrentRps: n });
              }}
            />
          </label>
        </div>
      ) : null}

      {kind === "api" && behavior.behaviorKind === "api" ? (
        <label className="block text-xs font-medium">
          Parallelism multiplier
          <NumericDraftInput
            scopeKey={`${inputScope}-parallelism`}
            value={behavior.parallelism}
            onCommit={(n) =>
              onBehaviorChange({
                ...behavior,
                parallelism: n,
              })
            }
            inputMode="decimal"
            min={0.05}
            step={0.05}
            className="mt-1 w-full rounded border border-black/15 bg-[var(--background)] px-2 py-1.5 text-sm tabular-nums dark:border-white/15"
          />
          <span className="mt-0.5 block text-[10px] font-normal text-black/45 dark:text-white/40">
            Scales effective capacity (workers, lighter CPU per request).
          </span>
        </label>
      ) : null}

      {kind === "db" && behavior.behaviorKind === "db" ? (
        <div className="space-y-2">
          <label className="block text-xs font-medium">
            Query cost (≥ 0.05)
            <NumericDraftInput
              scopeKey={`${inputScope}-queryCost`}
              value={behavior.queryCost}
              onCommit={(n) =>
                onBehaviorChange({
                  ...behavior,
                  queryCost: n,
                })
              }
              inputMode="decimal"
              min={0.05}
              step={0.05}
              className="mt-1 w-full rounded border border-black/15 bg-[var(--background)] px-2 py-1.5 text-sm tabular-nums dark:border-white/15"
            />
          </label>
          <label className="block text-xs font-medium">
            Replica / read scale
            <NumericDraftInput
              scopeKey={`${inputScope}-replicaCount`}
              value={behavior.replicaCount}
              onCommit={(n) =>
                onBehaviorChange({
                  ...behavior,
                  replicaCount: n,
                })
              }
              inputMode="decimal"
              min={0.05}
              step={0.05}
              className="mt-1 w-full rounded border border-black/15 bg-[var(--background)] px-2 py-1.5 text-sm tabular-nums dark:border-white/15"
            />
          </label>
        </div>
      ) : null}

      {kind === "cache" && behavior.behaviorKind === "cache" ? (
        <label className="block text-xs font-medium">
          Hit rate (0–1)
          <NumericDraftInput
            scopeKey={`${inputScope}-hitRate`}
            value={behavior.hitRate}
            onCommit={(n) =>
              onBehaviorChange({
                ...behavior,
                hitRate: n,
              })
            }
            inputMode="decimal"
            min={0}
            max={1}
            step={0.01}
            className="mt-1 w-full rounded border border-black/15 bg-[var(--background)] px-2 py-1.5 text-sm tabular-nums dark:border-white/15"
          />
          <span className="mt-0.5 block text-[10px] font-normal text-black/45 dark:text-white/40">
            Hits complete at the cache; misses follow outgoing edges. With no
            outgoing edges, traffic is treated as all hits.
          </span>
        </label>
      ) : null}

      {kind === "queue" && behavior.behaviorKind === "queue" ? (
        <div className="space-y-2">
          <label className="block text-xs font-medium">
            Publish cap (rps)
            <NumericDraftInput
              scopeKey={`${inputScope}-publishCapRps`}
              value={behavior.publishCapRps}
              onCommit={(n) =>
                onBehaviorChange({
                  ...behavior,
                  publishCapRps: n,
                })
              }
              inputMode="numeric"
              min={0}
              step={100}
              className="mt-1 w-full rounded border border-black/15 bg-[var(--background)] px-2 py-1.5 text-sm tabular-nums dark:border-white/15"
            />
          </label>
          <label className="block text-xs font-medium">
            Consume cap (rps)
            <NumericDraftInput
              scopeKey={`${inputScope}-consumeCapRps`}
              value={behavior.consumeCapRps}
              onCommit={(n) =>
                onBehaviorChange({
                  ...behavior,
                  consumeCapRps: n,
                })
              }
              inputMode="numeric"
              min={0}
              step={100}
              className="mt-1 w-full rounded border border-black/15 bg-[var(--background)] px-2 py-1.5 text-sm tabular-nums dark:border-white/15"
            />
          </label>
        </div>
      ) : null}

      {kind === "cdn" && behavior.behaviorKind === "cdn" ? (
        <div className="space-y-2">
          <label className="block text-xs font-medium">
            Edge hit rate (0–1)
            <NumericDraftInput
              scopeKey={`${inputScope}-edgeHitRate`}
              value={behavior.edgeHitRate}
              onCommit={(n) =>
                onBehaviorChange({
                  ...behavior,
                  edgeHitRate: n,
                })
              }
              inputMode="decimal"
              min={0}
              max={1}
              step={0.01}
              className="mt-1 w-full rounded border border-black/15 bg-[var(--background)] px-2 py-1.5 text-sm tabular-nums dark:border-white/15"
            />
          </label>
          <label className="block text-xs font-medium">
            Origin pull multiplier
            <NumericDraftInput
              scopeKey={`${inputScope}-originPullMultiplier`}
              value={behavior.originPullMultiplier}
              onCommit={(n) =>
                onBehaviorChange({
                  ...behavior,
                  originPullMultiplier: n,
                })
              }
              inputMode="decimal"
              min={0.05}
              step={0.05}
              className="mt-1 w-full rounded border border-black/15 bg-[var(--background)] px-2 py-1.5 text-sm tabular-nums dark:border-white/15"
            />
          </label>
        </div>
      ) : null}

      {kind === "storage" && behavior.behaviorKind === "storage" ? (
        <label className="block text-xs font-medium">
          Latency tax (ms)
          <NumericDraftInput
            scopeKey={`${inputScope}-latencyTaxMs`}
            value={behavior.latencyTaxMs}
            onCommit={(n) =>
              onBehaviorChange({
                ...behavior,
                latencyTaxMs: n,
              })
            }
            inputMode="numeric"
            min={0}
            step={1}
            className="mt-1 w-full rounded border border-black/15 bg-[var(--background)] px-2 py-1.5 text-sm tabular-nums dark:border-white/15"
          />
          <span className="mt-0.5 block text-[10px] font-normal text-black/45 dark:text-white/40">
            Added along paths that traverse this node in the latency estimate.
          </span>
        </label>
      ) : null}
    </fieldset>
  );
}
