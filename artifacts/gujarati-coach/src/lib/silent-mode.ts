// Whether the coach's voice is skipped before recording begins. Defaults to
// off; persists per browser (same pattern as spoken-feedback) and is
// intentionally not synced across devices.
export const SILENT_MODE_STORAGE_KEY = "bolo.silentMode";

export function loadSilentMode(): boolean {
  try {
    return localStorage.getItem(SILENT_MODE_STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

export function saveSilentMode(enabled: boolean): void {
  try {
    localStorage.setItem(SILENT_MODE_STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Persistence is best-effort; the in-session choice still applies.
  }
}
