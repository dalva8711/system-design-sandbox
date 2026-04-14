import type { PersistedState } from "./types";
import { normalizePersistedState, STORAGE_KEY } from "./types";

const DEBOUNCE_MS = 400;

/** Previous autosave key (v1); migrated on read. */
const LEGACY_STORAGE_KEY = "system-design-sandbox-v1";

let timer: ReturnType<typeof setTimeout> | null = null;

export function scheduleAutosave(getSnapshot: () => PersistedState) {
  if (typeof window === "undefined") return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    try {
      const snap = getSnapshot();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
    } catch {
      // ignore quota / private mode
    }
  }, DEBOUNCE_MS);
}

export function loadPersisted(): PersistedState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw =
      window.localStorage.getItem(STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return normalizePersistedState(parsed);
  } catch {
    return null;
  }
}
