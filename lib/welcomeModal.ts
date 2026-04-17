export const WELCOME_MODAL_SUPPRESS_KEY =
  "system-design-sandbox-welcome-suppressed";

const SUPPRESS_VALUE = "1";

export function isWelcomeModalSuppressed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(WELCOME_MODAL_SUPPRESS_KEY) === SUPPRESS_VALUE;
  } catch {
    return false;
  }
}

export function setWelcomeModalSuppressed(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WELCOME_MODAL_SUPPRESS_KEY, SUPPRESS_VALUE);
  } catch {
    // ignore quota / private mode
  }
}
