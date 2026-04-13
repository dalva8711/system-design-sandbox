import type { PersistedState } from "./types";
import { PERSISTENCE_VERSION, STORAGE_KEY } from "./types";

const DEBOUNCE_MS = 400;

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
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.version !== PERSISTENCE_VERSION) return null;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
