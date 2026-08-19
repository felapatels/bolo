/**
 * Instant band call-outs (Task 903).
 *
 * The moment a practice result lands, Bolo speaks the band name from a
 * static bundled clip, no TTS round-trip, no network. The six clips (five
 * ladder bands + the neutral nocatch line) live in `assets/sounds/bands/`
 * and were generated with the same voice as the spoken-feedback path (nova)
 * so the call-out and the feedback sentence sound like one speaker.
 *
 * These clips are Bolo's VOICE, not a sound-effect cue: playback goes
 * through playAssetAudio (coach-audio session handling, iOS earpiece-mode
 * flip, plays in silent mode) and callers gate on the spoken-feedback
 * preference, deliberately NOT on the Spec 1a sound-effects preference used
 * by playCue.
 */
import { playAssetAudio, type PlaybackHandle } from './audio';
import type { Band } from './ui';

// React Native requires static require() calls for bundled assets.
const BAND_CLIP_SOURCES: Record<Band, number> = {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  perfect: require('../assets/sounds/bands/perfect.mp3') as number,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  great: require('../assets/sounds/bands/great.mp3') as number,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  good: require('../assets/sounds/bands/good.mp3') as number,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  almost: require('../assets/sounds/bands/almost.mp3') as number,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  retry: require('../assets/sounds/bands/retry.mp3') as number,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  nocatch: require('../assets/sounds/bands/nocatch.mp3') as number,
};

export type BandClipHandle = {
  /** Resolves when the clip finishes (or fails/is stopped), never rejects. */
  finished: Promise<void>;
  stop: () => void;
};

/**
 * Play the band clip for a result. Returns a handle immediately; returns
 * null when playback could not even start. Never throws, a missing clip
 * must not disturb the result card.
 */
export function playBandClip(band: Band): BandClipHandle | null {
  try {
    let done!: () => void;
    const finished = new Promise<void>((resolve) => {
      done = resolve;
    });
    let handle: PlaybackHandle | null = null;
    let stopped = false;
    void playAssetAudio(BAND_CLIP_SOURCES[band], () => done())
      .then((h) => {
        handle = h;
        // stop() raced ahead of the async start, honor it.
        if (stopped) {
          h.stop();
          done();
        }
      })
      .catch(() => done());
    return {
      finished,
      stop: () => {
        stopped = true;
        handle?.stop();
        done();
      },
    };
  } catch {
    return null;
  }
}
