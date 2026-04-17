"use client";

import { useEffect, useRef, useState } from "react";
import {
  isWelcomeModalSuppressed,
  setWelcomeModalSuppressed,
} from "@/lib/welcomeModal";

export function WelcomeModal() {
  const [open, setOpen] = useState<boolean | null>(null);
  const [doNotShowAgain, setDoNotShowAgain] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    queueMicrotask(() => {
      setOpen(isWelcomeModalSuppressed() ? false : true);
    });
  }, []);

  useEffect(() => {
    const el = dialogRef.current;
    if (open !== true || !el) return;
    if (!el.open) el.showModal();
    return () => {
      if (el.open) el.close();
    };
  }, [open]);

  if (open !== true) return null;

  const handleOk = () => {
    if (doNotShowAgain) setWelcomeModalSuppressed();
    dialogRef.current?.close();
  };

  return (
    <dialog
      ref={dialogRef}
      className="welcome-modal-dialog z-50 w-[min(100%,28rem)] max-w-[calc(100vw-2rem)] rounded-lg border border-black/15 bg-[var(--background)] p-5 text-[var(--foreground)] shadow-lg dark:border-white/15"
      aria-labelledby="welcome-modal-title"
      aria-describedby="welcome-modal-desc"
      onClose={() => setOpen(false)}
    >
      <h2
        id="welcome-modal-title"
        className="text-lg font-semibold tracking-tight"
      >
        Welcome to the system design sandbox
      </h2>
      <div
        id="welcome-modal-desc"
        className="mt-3 space-y-2 text-sm text-black/75 dark:text-white/70"
      >
        <p>
          This is a small playground for practicing system diagrams: drag
          components from the palette, connect nodes on the canvas, tune
          behavior in the inspector, then run simple traffic and failure
          simulation.
        </p>
        <p>
          Delete selected items with Backspace or Delete, or drag a node to the
          trash on the canvas. Your diagram autosaves in this browser.
        </p>
      </div>
      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={doNotShowAgain}
            onChange={(e) => setDoNotShowAgain(e.target.checked)}
            className="size-4 rounded border border-black/25 accent-sky-600 dark:border-white/30 dark:accent-sky-500"
          />
          Do not show again
        </label>
        <button
          type="button"
          onClick={handleOk}
          className="rounded-md border border-black/15 bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] dark:border-white/20"
        >
          Ok
        </button>
      </div>
    </dialog>
  );
}
