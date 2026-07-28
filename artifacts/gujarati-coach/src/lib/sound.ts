/**
 * Audio cue layer (Spec 1 v3 §4.3).
 *
 * `playCue(name)` plays a short feedback cue. It reads the Spec 1a sound
 * preference and no-ops when sound is off, and no-ops silently when the cue
 * file is missing so the app works fully before any audio asset exists.
 *
 * Cue files live under `public/sounds/cues/` (served at
 * `${BASE_URL}sounds/cues/<name>.mp3`).
 */
import { loadSoundPref } from "./soundPref";

export type CueName = "correct" | "wrong" | "session_complete";

const CUE_FILES: Record<CueName, string> = {
  correct: "correct.mp3",
  wrong: "wrong.mp3",
  session_complete: "session-complete.mp3",
};

export function playCue(name: CueName): void {
  try {
    if (!loadSoundPref()) return;
    const base: string = import.meta.env.BASE_URL ?? "/";
    const audio = new Audio(`${base}sounds/cues/${CUE_FILES[name]}`);
    audio.volume = 0.6;
    // Missing file or autoplay restriction: swallow both — cues are optional.
    audio.onerror = () => {};
    void audio.play().catch(() => {});
  } catch {
    // Never let an optional cue break the app.
  }
}
