/**
 * Chacha-ji's spoken lines, played strictly one after another.
 *
 * The queue lives at MODULE SCOPE for two reasons:
 *
 *   1. Sequencing. His three lines land from separate events (dialog open,
 *      arrival response, close) and must never overlap, a line waits for the
 *      previous one to finish rather than talking over it.
 *   2. Lifetime. The farewell is queued as the dialog is closing and the route
 *      is changing, so nothing owned by the dialog can be what plays it.
 *
 * Playback goes through the blessed Chacha singleton in lib/iosAudio.ts (see
 * that file for the WebKit per-element blessing contract). This is flavour
 * dialogue: every failure path is silent, with no error UI and no retry.
 */
import { getChachaAudioElement } from "./iosAudio";

export type ChachaClip = { audioBase64: string; format: string };

/** Tail of the queue. Every enqueued line chains onto it. */
let chain: Promise<void> = Promise.resolve();

/** Test-only: drop the pending chain so one test's queue cannot bleed into the next. */
export function __resetChachaVoiceQueueForTests(): void {
  chain = Promise.resolve();
}

function playOnce(clip: ChachaClip): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    try {
      const audio = getChachaAudioElement();
      audio.onended = done;
      audio.onerror = done;
      audio.src = `data:audio/${clip.format};base64,${clip.audioBase64}`;
      const p = audio.play();
      // A refused play() (no blessing, silent switch, autoplay policy) must
      // release the queue immediately, or the lines behind it never speak.
      if (p) void p.catch(done);
    } catch {
      done();
    }
  });
}

/**
 * Queue one of his lines behind whatever is already speaking.
 *
 * `onStart` fires when this line actually begins (its turn in the queue), and
 * `onEnd` when it finishes or fails, that pair is what drives the on-screen
 * caption, so the text and the voice stay in step.
 */
export function speakChachaLine(
  clip: ChachaClip,
  hooks?: { onStart?: () => void; onEnd?: () => void },
): void {
  chain = chain.then(async () => {
    try {
      hooks?.onStart?.();
      await playOnce(clip);
    } catch {
      // Never let one line's failure break the chain for the next.
    } finally {
      try {
        hooks?.onEnd?.();
      } catch {
        /* ignore */
      }
    }
  });
}

/**
 * Cut Chacha-ji off. Called on every path out of the encounter.
 *
 * Two halves, both needed: pause the element that is SOUNDING now,
 * and reset the queue so lines already chained behind it never
 * start. Without the second half a farewell queued microseconds
 * earlier still fires over the next screen.
 */
export function stopChachaVoice(): void {
  chain = Promise.resolve();
  try {
    const audio = getChachaAudioElement();
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    audio.currentTime = 0;
  } catch {
    // Best effort. A failure here must never block navigation.
  }
}
