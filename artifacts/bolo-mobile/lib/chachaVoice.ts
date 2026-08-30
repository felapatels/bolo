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
import { playBase64Audio, type PlaybackHandle } from './audio';

export type ChachaClip = { audioBase64: string; format: string };

/** Tail of the queue. Every enqueued line chains onto it. */
let chain: Promise<void> = Promise.resolve();

/** Test-only: drop the pending chain so one test's queue cannot bleed into the next. */
export function __resetChachaVoiceQueueForTests(): void {
  chain = Promise.resolve();
}

/**
 * The clip SOUNDING right now. Retained only so it can be cut off: playOnce
 * used to discard the handle playBase64Audio returns, which left nothing in
 * the module able to stop a line once it started.
 */
let current: PlaybackHandle | null = null;

function playOnce(clip: ChachaClip, onStart?: () => void): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      current = null;
      resolve();
    };
    // onStart rides through to the player, which fires it when sound is
    // ACTUALLY out (lib/audio's firstSoundNotifier), not when the line is
    // merely next in the queue. See speakChachaLine.
    void playBase64Audio(clip.audioBase64, clip.format || 'mp3', done, onStart)
      .then((handle) => {
        // The clip can finish (or fail) while the handle is still in flight;
        // retaining it then would leave a stale ref pointing at silence.
        if (settled) return;
        current = handle;
      })
      .catch(done);
  });
}

/**
 * Queue one of his lines behind whatever is already speaking.
 *
 * `onStart` fires when this line's voice is actually coming out, and `onEnd`
 * when it finishes or fails. The pair drives the caption on the stall and the
 * MOUTH on the call: InCall opens him only while `voicing`, and `voicing` is
 * this onStart.
 *
 * IT USED TO FIRE AT THE LINE'S TURN IN THE QUEUE, before the clip was even
 * written to disk, so on the call he mimed through the file write, the load
 * and the decode on every turn. The guard against exactly that had been built
 * into playBase64Audio (firstSoundNotifier, 2026-08-28) and this queue never
 * passed its onStart through, which is why the owner saw the mouth move before
 * the sound on 1.0.6 (build 25). Now the player fires it, with the player's own
 * 2.6 s safety net so a start that never reports still opens his mouth.
 */
export function speakChachaLine(
  clip: ChachaClip,
  hooks?: { onStart?: () => void; onEnd?: () => void },
): void {
  chain = chain.then(async () => {
    try {
      await playOnce(clip, hooks?.onStart);
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
 * Two halves, both needed: stop the clip that is SOUNDING now, and
 * reset the queue so lines already chained behind it never start.
 * Without the second half a farewell queued microseconds earlier
 * still fires over the next screen.
 */
export function stopChachaVoice(): void {
  chain = Promise.resolve();
  try {
    current?.stop();
  } catch {
    // Best effort. A failure here must never block navigation.
  }
  current = null;
}
