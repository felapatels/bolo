// Whether the coach's written feedback + tip are read aloud when a score
// lands. Defaults to on; persists per browser (same pattern as the stop-mode
// preference) and is intentionally not synced across devices.
export const SPOKEN_FEEDBACK_STORAGE_KEY = "bolo.spokenFeedback";

export function loadSpokenFeedback(): boolean {
  try {
    return localStorage.getItem(SPOKEN_FEEDBACK_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveSpokenFeedback(enabled: boolean): void {
  try {
    localStorage.setItem(SPOKEN_FEEDBACK_STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Persistence is best-effort; the in-session choice still applies.
  }
}
