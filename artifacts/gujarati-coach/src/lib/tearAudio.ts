/**
 * Paper-tear SFX for the boarding-pass tear animation (Task 905 / Task 984).
 *
 * Plays the recorded paper-tear asset (`public/sounds/tear-sfx.mp3`, 0.392s,
 * stereo, 44.1kHz, owner-supplied v2 clip) through Web Audio. The clip is fetched
 * and decoded ONCE at screen mount (preloadTearAudio) into a module-cached
 * AudioBuffer, so the first play has zero fetch or decode lag.
 *
 * Constraints:
 *   - Never delays or gates the animation. Both exports return immediately.
 *   - Fails silently on browsers without AudioContext or when autoplay is
 *     blocked (common on mobile until a user gesture has occurred).
 *   - preloadTearAudio() should be called once at screen mount. It pre-warms
 *     the AudioContext and decodes the clip so the first play is instant.
 *   - If the buffer is not ready (preload failed or never ran), playTearSfx()
 *     stays SILENT -- never a fetch-then-play that would lag the tap.
 */

// Playback gain for the recorded clip. The owner-supplied v2 asset measures
// -3.5 dB peak, -24.6 dB RMS (ffmpeg volumedetect), hotter than the old
// synthesized burst (-16.5 dB peak, -33 dB RMS), so this sits well below
// unity. 0.40 (-8 dB) keeps the tear present without being startling.
export const TEAR_SFX_GAIN = 0.4;

let warmCtx: AudioContext | null = null;
/** Decoded clip, cached at preload. Null until decode succeeds. */
let tearBuffer: AudioBuffer | null = null;
/** Guards against duplicate fetch+decode on repeated mounts. */
let loadStarted = false;

function getCtorOrNull(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ??
    ((window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext ??
      null)
  );
}

/**
 * Pre-warm the AudioContext AND fetch + decode the tear clip at screen mount
 * so the first playback has zero startup, fetch, or decode lag. No-ops
 * silently on unsupported browsers; any fetch/decode failure is silent
 * (playTearSfx then simply stays quiet).
 */
export function preloadTearAudio(): void {
  try {
    const Ctor = getCtorOrNull();
    if (!Ctor) return;
    if (!warmCtx) {
      warmCtx = new Ctor();
      // Suspend immediately -- we just want the context object to exist,
      // not an active audio graph sitting idle.
      void warmCtx.suspend().catch(() => {});
    }
    if (loadStarted || tearBuffer) return;
    loadStarted = true;
    const base: string = import.meta.env.BASE_URL ?? "/";
    const ctx = warmCtx;
    void fetch(`${base}sounds/tear-sfx.mp3`)
      .then((res) => {
        if (!res.ok) throw new Error(`tear sfx fetch ${res.status}`);
        return res.arrayBuffer();
      })
      // decodeAudioData works on a suspended context.
      .then((bytes) => ctx.decodeAudioData(bytes))
      .then((decoded) => {
        tearBuffer = decoded;
      })
      .catch(() => {
        // Allow a later mount to retry the load.
        loadStarted = false;
      });
  } catch {
    // Pre-warming is best-effort; any failure is silent.
  }
}

/**
 * Play the recorded paper-tear clip. Fire-and-forget: returns immediately and
 * never throws. Silent when the decoded buffer is not ready (preload failed
 * or never ran) -- a late fetch would lag the tap, so silence is the fallback.
 */
export function playTearSfx(): void {
  try {
    if (!tearBuffer) return; // not decoded (yet) -- stay silent, never lag
    const Ctor = getCtorOrNull();
    if (!Ctor) return;
    // Re-use the pre-warmed context when available; create a fresh one if it
    // was closed out from under us (AudioBuffers are context-independent).
    let ctx: AudioContext;
    if (warmCtx && warmCtx.state !== "closed") {
      ctx = warmCtx;
      // Resume -- context may have been auto-suspended by the browser.
      void ctx.resume().catch(() => {});
    } else {
      ctx = new Ctor();
    }
    const source = ctx.createBufferSource();
    source.buffer = tearBuffer;
    const gain = ctx.createGain();
    gain.gain.value = TEAR_SFX_GAIN;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(0);
    // Close a freshly created context after playback to free resources.
    // Leave the pre-warmed context alive for subsequent plays.
    if (ctx !== warmCtx) {
      source.onended = () => {
        void ctx.close();
      };
    }
  } catch {
    // Autoplay blocked, no AudioContext, or any other failure -- silent.
  }
}
