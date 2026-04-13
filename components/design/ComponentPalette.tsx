"use client";

import type { NodeKind } from "@/lib/design/types";
import { NODE_KIND_DEFAULTS } from "@/lib/design/types";

const ORDER: NodeKind[] = [
  "client",
  "lb",
  "api",
  "cache",
  "queue",
  "db",
  "cdn",
  "storage",
];

function onDragStart(event: React.DragEvent, kind: NodeKind) {
  event.dataTransfer.setData("application/reactflow", kind);
  event.dataTransfer.effectAllowed = "move";
}

export function ComponentPalette() {
  return (
    <aside className="flex w-56 shrink-0 flex-col gap-2 border-r border-black/10 p-3 dark:border-white/10">
      <div>
        <h2 className="text-sm font-semibold">Components</h2>
        <p className="mt-1 text-xs leading-relaxed text-black/60 dark:text-white/55">
          Drag a block onto the canvas. Connect handles to show traffic paths.
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {ORDER.map((kind) => {
          const def = NODE_KIND_DEFAULTS[kind];
          return (
            <li key={kind}>
              <button
                type="button"
                draggable
                onDragStart={(e) => onDragStart(e, kind)}
                className="flex w-full cursor-grab items-center justify-between rounded-md border border-black/10 bg-black/[0.02] px-3 py-2 text-left text-sm font-medium active:cursor-grabbing dark:border-white/10 dark:bg-white/[0.04]"
              >
                <span className="capitalize">{kind}</span>
                <span className="text-[11px] font-normal opacity-55">
                  {def.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
