/**
 * Instant band call-outs (Task 903).
 *
 * The moment a practice result lands, Bolo speaks the band name from a
 * static pre-bundled clip — no TTS round-trip. The six clips (five ladder
 * bands + the neutral nocatch line) live under `public/sounds/bands/` and
 * were generated with the same voice as the spoken-feedback path (nova) so
 * the call-out and the feedback sentence sound like one speaker.
 *
 * Gating: callers gate on the spoken-feedback preference (these clips are
 * Bolo's VOICE, not a sound-effect cue) — deliberately NOT on the Spec 1a
 * sound-effects preference used by playCue.
 */
import type { Band } from "@/components/ui/band-pill";

const BAND_CLIP_FILES: Record<Band, string> = {
  perfect: "perfect.mp3",
  great: "great.mp3",
  good: "good.mp3",
  almost: "almost.mp3",
  retry: "retry.mp3",
  nocatch: "nocatch.mp3",
};

function clipUrl(band: Band): string {
  const base: string = import.meta.env.BASE_URL ?? "/";
  return `${base}sounds/bands/${BAND_CLIP_FILES[band]}`;
}

let preloaded = false;

/**
 * Warm the browser HTTP cache for all six clips. Called on the first record
 * gesture so that by the time a result lands the clip plays with zero fetch
 * delay. Runs once per page load; failures are silent (playBandClip will
 * fetch on demand).
 */
export function preloadBandClips(): void {
  if (preloaded) return;
  preloaded = true;
  try {
    for (const band of Object.keys(BAND_CLIP_FILES) as Band[]) {
      const audio = new Audio(clipUrl(band));
      audio.preload = "auto";
    }
  } catch {
    // Preloading is best-effort only.
  }
}

export type BandClipHandle = {
  /** Resolves when the clip finishes (or errors/is stopped) — never rejects. */
  finished: Promise<void>;
  stop: () => void;
};

/**
 * Play the band clip for a result. Returns a handle immediately; returns
 * null when playback could not even start. Never throws — a missing clip
 * must not disturb the result card.
 */
export function playBandClip(band: Band): BandClipHandle | null {
  try {
    const audio = new Audio(clipUrl(band));
    let done!: () => void;
    const finished = new Promise<void>((resolve) => {
      done = resolve;
    });
    audio.onended = () => done();
    audio.onerror = () => done();
    void audio.play().catch(() => done());
    return {
      finished,
      stop: () => {
        try {
          audio.pause();
        } catch {
          // jsdom's stub pause can throw; stopping is best-effort.
        }
        done();
      },
    };
  } catch {
    return null;
  }
}
