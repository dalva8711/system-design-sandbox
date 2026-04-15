"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { ComponentPalette } from "@/components/design/ComponentPalette";
import { FlowCanvas } from "@/components/design/FlowCanvas";
import { InspectorPanel } from "@/components/design/InspectorPanel";
import { SimulationBlock } from "@/components/design/SimulationBlock";
import { loadPersisted } from "@/lib/design/persist";
import { DESIGN_TEMPLATES } from "@/lib/design/templates";
import {
  requestAutosave,
  useDesignStore,
} from "@/lib/design/store";

export function DesignSandbox() {
  const nodes = useDesignStore((s) => s.nodes);
  const edges = useDesignStore((s) => s.edges);
  const globalRps = useDesignStore((s) => s.globalRps);
  const tickMs = useDesignStore((s) => s.tickMs);
  const simRunning = useDesignStore((s) => s.simRunning);
  const stepSimulation = useDesignStore((s) => s.stepSimulation);
  const clearCanvas = useDesignStore((s) => s.clearCanvas);
  const [templateSelect, setTemplateSelect] = useState("");

  useLayoutEffect(() => {
    const saved = loadPersisted();
    if (saved) {
      useDesignStore.getState().hydrateFromImport(saved);
    }
  }, []);

  useEffect(() => {
    requestAutosave();
  }, [nodes, edges, globalRps]);

  useEffect(() => {
    if (!simRunning) return;
    const id = window.setInterval(() => {
      stepSimulation();
    }, tickMs);
    return () => window.clearInterval(id);
  }, [simRunning, tickMs, stepSimulation]);

  useEffect(() => {
    if (simRunning) return;
    stepSimulation();
  }, [nodes, edges, globalRps, simRunning, stepSimulation]);

  return (
    <ReactFlowProvider>
      <div className="flex h-[calc(100vh-1px)] min-h-[640px] flex-col bg-[var(--background)] text-[var(--foreground)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 px-4 py-3 dark:border-white/10">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              System design sandbox
            </h1>
            <p className="text-xs text-black/55 dark:text-white/50">
              Drag components, connect them, then run traffic. Delete with
              Backspace or Delete when selected, or drag a node to the trash on
              the canvas.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="design-templates">
              Templates
            </label>
            <select
              id="design-templates"
              value={templateSelect}
              onChange={(e) => {
                const id = e.target.value;
                if (!id) return;
                if (
                  nodes.length &&
                  !window.confirm(
                    "Replace the current diagram with this template?",
                  )
                ) {
                  setTemplateSelect("");
                  return;
                }
                const template = DESIGN_TEMPLATES.find((t) => t.id === id);
                if (template) {
                  useDesignStore.getState().hydrateFromImport(template.getState());
                }
                setTemplateSelect("");
              }}
              className="max-w-[220px] rounded-md border border-black/15 bg-[var(--background)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] dark:border-white/15"
            >
              <option value="">Load a template…</option>
              {DESIGN_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id} title={t.shortDescription}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                if (
                  nodes.length &&
                  !window.confirm("Clear the entire canvas?")
                ) {
                  return;
                }
                clearCanvas();
              }}
              className="rounded-md border border-rose-500/40 px-3 py-1.5 text-sm font-medium text-rose-700 dark:text-rose-300"
            >
              Clear canvas
            </button>
          </div>
        </header>
        <div className="flex min-h-0 flex-1">
          <ComponentPalette />
          <div className="flex min-w-0 flex-1 flex-col gap-3 p-3">
            <FlowCanvas />
          </div>
          <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-l border-black/10 p-3 dark:border-white/10">
            <InspectorPanel />
            <SimulationBlock />
          </aside>
        </div>
      </div>
    </ReactFlowProvider>
  );
}
