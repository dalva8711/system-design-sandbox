"use client";

import { useState, type InputHTMLAttributes } from "react";

export type NumericDraftInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "defaultValue" | "onChange"
> & {
  /** When this changes (e.g. selected node/edge id), the draft resets from `value`. */
  scopeKey: string;
  value: number;
  onCommit: (n: number) => void;
  inputMode?: "numeric" | "decimal";
};

/**
 * Text field for numeric editing: keeps a local string while typing so clearing
 * the field does not immediately coerce to 0 / min clamp (unlike controlled
 * type="number" with Number(e.target.value) on every keystroke).
 */
export function NumericDraftInput({
  scopeKey,
  value,
  onCommit,
  inputMode = "decimal",
  className,
  onBlur,
  onKeyDown,
  ...rest
}: NumericDraftInputProps) {
  const [draft, setDraft] = useState(String(value));
  const [synced, setSynced] = useState({ scopeKey, value });

  if (synced.scopeKey !== scopeKey || synced.value !== value) {
    setSynced({ scopeKey, value });
    setDraft(String(value));
  }

  const flush = () => {
    const t = draft.trim();
    if (t === "" || t === "-" || t === "." || t === "-.") {
      setDraft(String(value));
      return;
    }
    const n = Number(t);
    if (!Number.isFinite(n)) {
      setDraft(String(value));
      return;
    }
    onCommit(n);
    // Normalize display when the stored number is unchanged and effects would not run.
    setDraft(String(n));
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode={inputMode}
      autoComplete="off"
      className={className}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        flush();
        onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        }
        onKeyDown?.(e);
      }}
    />
  );
}
