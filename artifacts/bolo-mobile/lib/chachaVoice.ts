/**
 * Chacha-ji's spoken lines, played strictly one after another.
 *
 * The queue lives at MODULE SCOPE for two reasons, matching the web app's
 * lib/chachaVoice.ts beat for beat:
 *
 *   1. Sequencing. His three lines land from separate events (dialog open,
 *      arrival response, dismissal) and must never overlap — a line waits for
 *      the previous one to finish rather than talking over it.
 *   2. Lifetime. The farewell is queued as the modal is being dismissed, so it
 *      cannot ride the dialog's own player: that one is torn down by the
 *      unmount cleanup and the line would be cut off before it started.
 *
 * Playback goes through the shared playBase64Audio helper, so the iOS audio
 * session handling already in lib/audio.ts (playback-mode flip while the mic
 * is warm, keepAudioSessionActive) covers his lines with no new session code.
 *
 * This is flavour dialogue: every failure path is silent, with no error UI and
 * no retry.
 */
import { playBase64Audio } from './audio';

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
    void playBase64Audio(clip.audioBase64, clip.format || 'mp3', done).catch(done);
  });
}

/**
 * Queue one of his lines behind whatever is already speaking.
 *
 * `onStart` fires when this line actually begins (its turn in the queue), and
 * `onEnd` when it finishes or fails — that pair is what drives the on-screen
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
