"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { toPng, toSvg } from "html-to-image";
import type { NodeKind } from "@/lib/design/types";
import { normalizePersistedState } from "@/lib/design/types";
import {
  requestAutosave,
  useDesignStore,
} from "@/lib/design/store";

const TOP_NODE_ROWS = 8;

type CostTableRow = {
  id: string;
  label: string;
  kind: NodeKind;
  cost: number;
  util: number;
};

export function SimulationBlock() {
  const metrics = useDesignStore((s) => s.metrics);
  const nodes = useDesignStore((s) => s.nodes);
  const globalRps = useDesignStore((s) => s.globalRps);
  const simRunning = useDesignStore((s) => s.simRunning);
  const tickMs = useDesignStore((s) => s.tickMs);
  const setGlobalRps = useDesignStore((s) => s.setGlobalRps);
  const setSimRunning = useDesignStore((s) => s.setSimRunning);
  const exportPersisted = useDesignStore((s) => s.exportPersisted);
  const hydrateFromImport = useDesignStore((s) => s.hydrateFromImport);
  const fileRef = useRef<HTMLInputElement>(null);
  const rf = useReactFlow();

  const downloadDiagram = useCallback(
    async (kind: "png" | "svg") => {
      if (nodes.length === 0) return;
      const bg =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--background")
          .trim() || "#ffffff";
      try {
        rf.fitView({ padding: 0.18 });
        await new Promise<void>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r())),
        );
        const el = document.querySelector(
          ".react-flow__viewport",
        ) as HTMLElement | null;
        if (!el) {
          window.alert("Could not find the diagram viewport.");
          return;
        }
        const dataUrl =
          kind === "png"
            ? await toPng(el, {
                pixelRatio: 2,
                backgroundColor: bg,
                cacheBust: true,
              })
            : await toSvg(el, { backgroundColor: bg, cacheBust: true });
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download =
          kind === "png"
            ? "system-design-diagram.png"
            : "system-design-diagram.svg";
        a.click();
      } catch {
        window.alert("Could not export the diagram image.");
      }
    },
    [nodes.length, rf],
  );

  const [rpsDraft, setRpsDraft] = useState(String(globalRps));

  useEffect(() => {
    setRpsDraft(String(globalRps));
  }, [globalRps]);

  const commitGlobalRps = () => {
    const trimmed = rpsDraft.trim().replace(/,/g, "");
    if (trimmed === "") {
      setGlobalRps(0);
      setRpsDraft("0");
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) {
      setRpsDraft(String(useDesignStore.getState().globalRps));
      return;
    }
    setGlobalRps(n);
    setRpsDraft(String(n));
  };

  const onExport = () => {
    const data = exportPersisted();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "system-design-sandbox.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const onPickImport = () => fileRef.current?.click();

  const onImportFile: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as unknown;
        const normalized = normalizePersistedState(parsed);
        if (!normalized) {
          window.alert("Unsupported or invalid diagram file.");
          return;
        }
        hydrateFromImport(normalized);
        requestAutosave();
      } catch {
        window.alert("Could not read that JSON file.");
      } finally {
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  };

  const dropRate =
    metrics.totalOfferedRps > 0
      ? Math.min(
          1,
          metrics.droppedRps / Math.max(metrics.totalOfferedRps, 1e-6),
        )
      : 0;

  const { minNodeUtil, maxNodeUtil } = useMemo(() => {
    const vals = Object.values(metrics.nodeUtilization);
    if (vals.length === 0) return { minNodeUtil: 0, maxNodeUtil: 0 };
    let minV = vals[0]!;
    let maxV = vals[0]!;
    for (const v of vals) {
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    return { minNodeUtil: minV, maxNodeUtil: maxV };
  }, [metrics.nodeUtilization]);

  const topNodesByCost = useMemo((): { rows: CostTableRow[]; more: number } => {
    if (nodes.length === 0) return { rows: [], more: 0 };
    const scored: CostTableRow[] = nodes.map((n) => ({
      id: n.id,
      label: n.data.label,
      kind: n.data.kind,
      cost: metrics.nodeCostUsdPerHour[n.id] ?? 0,
      util: metrics.nodeUtilization[n.id] ?? 0,
    }));
    scored.sort((a, b) => b.cost - a.cost || b.util - a.util);
    const rows = scored.slice(0, TOP_NODE_ROWS);
    const more = Math.max(0, scored.length - rows.length);
    return { rows, more };
  }, [nodes, metrics.nodeCostUsdPerHour, metrics.nodeUtilization]);

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-lg border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03]">
        <header>
          <h3 className="text-sm font-semibold">Simulation</h3>
          <p className="text-xs leading-relaxed text-black/55 dark:text-white/50">
            Traffic enters through{" "}
            <span className="font-medium">client</span> nodes, flows across
            edges, and is capped by each component. This is a teaching toy, not
            a production-grade model.
          </p>
        </header>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              commitGlobalRps();
              setSimRunning(!simRunning);
            }}
            className="rounded-md bg-[var(--foreground)] px-3 py-1.5 text-sm font-medium text-[var(--background)] hover:opacity-90"
          >
            {simRunning ? "Pause" : "Run"}
          </button>
          <span className="text-xs text-black/50 dark:text-white/45">
            Tick {tickMs} ms
          </span>
        </div>
        <label className="block text-xs font-medium">
          Global offered load (rps)
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            className="mt-1 w-full rounded border border-black/15 bg-[var(--background)] px-2 py-1.5 text-sm tabular-nums dark:border-white/15"
            value={rpsDraft}
            onChange={(e) => setRpsDraft(e.target.value)}
            onBlur={commitGlobalRps}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commitGlobalRps();
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
        </label>
      </section>

      <section className="space-y-2 rounded-lg border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03]">
        <h3 className="text-sm font-semibold">Metrics</h3>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <dt className="text-black/55 dark:text-white/50">Throughput</dt>
          <dd className="font-mono text-right">
            {metrics.throughputRps.toFixed(0)} rps
          </dd>
          <dt className="text-black/55 dark:text-white/50">Dropped</dt>
          <dd className="font-mono text-right text-rose-600 dark:text-rose-400">
            {metrics.droppedRps.toFixed(0)} rps
          </dd>
          <dt className="text-black/55 dark:text-white/50">Drop rate</dt>
          <dd className="font-mono text-right">
            {(dropRate * 100).toFixed(1)}%
          </dd>
          <dt className="text-black/55 dark:text-white/50">Approx. latency</dt>
          <dd className="font-mono text-right">
            {metrics.approximateLatencyMs.toFixed(0)} ms
          </dd>
          <dt className="text-black/55 dark:text-white/50">Peak util.</dt>
          <dd className="font-mono text-right">
            {(Math.min(metrics.peakUtilization, 10) * 100).toFixed(0)}%
          </dd>
        </dl>
      </section>

      <section className="space-y-2 rounded-lg border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03]">
        <header className="space-y-1">
          <h3 className="text-sm font-semibold">Cost &amp; load (last tick)</h3>
          <p className="text-[10px] leading-relaxed text-black/50 dark:text-white/45">
            Dollar rates are illustrative teaching numbers, not a quote or
            bill.
          </p>
        </header>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <dt className="text-black/55 dark:text-white/50">Total ~$/hr</dt>
          <dd className="font-mono text-right">
            ${metrics.totalCostUsdPerHour.toFixed(2)}
          </dd>
          <dt className="text-black/55 dark:text-white/50">Node util (min)</dt>
          <dd className="font-mono text-right">
            {(Math.min(minNodeUtil, 10) * 100).toFixed(0)}%
          </dd>
          <dt className="text-black/55 dark:text-white/50">Node util (max)</dt>
          <dd className="font-mono text-right">
            {(Math.min(maxNodeUtil, 10) * 100).toFixed(0)}%
          </dd>
        </dl>
        {topNodesByCost.rows.length > 0 ? (
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-black/45 dark:text-white/40">
              Top nodes by ~$/hr
            </p>
            <div className="max-h-[11rem] overflow-auto rounded border border-black/10 text-[10px] dark:border-white/10">
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 bg-[var(--background)] text-black/50 dark:text-white/45">
                  <tr>
                    <th className="px-2 py-1 font-medium">Node</th>
                    <th className="px-2 py-1 font-medium">$/hr</th>
                    <th className="px-2 py-1 font-medium">Util</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {topNodesByCost.rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t border-black/8 dark:border-white/8"
                    >
                      <td className="max-w-[7rem] truncate px-2 py-1">
                        <span className="text-black/45 dark:text-white/40">
                          {r.kind}
                        </span>{" "}
                        {r.label}
                      </td>
                      <td className="px-2 py-1">${r.cost.toFixed(2)}</td>
                      <td className="px-2 py-1">
                        {(Math.min(r.util, 10) * 100).toFixed(0)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {topNodesByCost.more > 0 ? (
              <p className="text-[10px] text-black/45 dark:text-white/40">
                +{topNodesByCost.more} more
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="space-y-2 rounded-lg border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03]">
        <h3 className="text-sm font-semibold">File</h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onExport}
            className="rounded-md border border-black/15 px-3 py-1.5 text-sm font-medium dark:border-white/15"
          >
            Export JSON
          </button>
          <button
            type="button"
            onClick={onPickImport}
            className="rounded-md border border-black/15 px-3 py-1.5 text-sm font-medium dark:border-white/15"
          >
            Import JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={onImportFile}
          />
        </div>
        <div className="space-y-2 border-t border-black/10 pt-2 dark:border-white/10">
          <h4 className="text-xs font-semibold text-black/70 dark:text-white/60">
            Image
          </h4>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={nodes.length === 0}
              onClick={() => void downloadDiagram("png")}
              className="rounded-md border border-black/15 px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/15"
            >
              Download PNG
            </button>
            <button
              type="button"
              disabled={nodes.length === 0}
              onClick={() => void downloadDiagram("svg")}
              className="rounded-md border border-black/15 px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/15"
            >
              Download SVG
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-black/50 dark:text-white/45">
            Fits the diagram to the view, then saves (good for slides).
          </p>
        </div>
        <p className="text-[11px] leading-relaxed text-black/50 dark:text-white/45">
          Diagrams autosave in this browser. Export to share or back up.
        </p>
      </section>
    </div>
  );
}
