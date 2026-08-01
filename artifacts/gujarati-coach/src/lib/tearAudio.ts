/**
 * Paper-tear SFX for the boarding-pass tear animation (Task 905).
 *
 * Synthesized via Web Audio API -- no file to fetch, no loading delay, works
 * offline. The sound is a filtered white-noise burst with an exponential decay
 * envelope, shaped to sit in the crinkle-frequency range of thin paper (~2 kHz)
 * rather than the low thud of cardboard -- subtle, not cartoonish.
 *
 * Constraints:
 *   - Never delays or gates the animation. Both exports return immediately.
 *   - Fails silently on browsers without AudioContext or when autoplay is
 *     blocked (common on mobile until a user gesture has occurred).
 *   - preloadTearAudio() should be called once at screen mount. It pre-warms
 *     the AudioContext so the first play has zero startup lag.
 */
let warmCtx: AudioContext | null = null;
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
 * Pre-warm the AudioContext at screen mount so the first playback has zero
 * startup lag. No-ops silently on unsupported browsers.
 */
export function preloadTearAudio(): void {
  try {
    const Ctor = getCtorOrNull();
    if (!Ctor || warmCtx) return;
    warmCtx = new Ctor();
    // Suspend immediately -- we just want the context object to exist,
    // not an active audio graph sitting idle.
    void warmCtx.suspend().catch(() => {});
  } catch {
    // Pre-warming is best-effort; any failure is silent.
  }
}
/**
 * Play a short (~350 ms), subtle paper-tear noise burst. Fire-and-forget:
 * returns immediately and never throws.
 */
export function playTearSfx(): void {
  try {
    const Ctor = getCtorOrNull();
    if (!Ctor) return;
    // Re-use the pre-warmed context when available; create a fresh one on
    // first call if preloadTearAudio() was not called.
    let ctx: AudioContext;
    if (warmCtx && warmCtx.state !== "closed") {
      ctx = warmCtx;
      // Resume -- context may have been auto-suspended by the browser.
      void ctx.resume().catch(() => {});
    } else {
      ctx = new Ctor();
    }
    const sampleRate = ctx.sampleRate;
    // Target ~350 ms -- comfortably under the 500 ms spec limit.
    const duration = 0.35;
    const bufferSize = Math.floor(sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);
    // White noise with an exponential-decay amplitude envelope.
    // Decay constant 9 gives near-silence at ~350 ms (e^(-9*0.35) ~ 0.04).
    for (let i = 0; i < bufferSize; i++) {
      const t = i / sampleRate;
      const envelope = Math.exp(-t * 9);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    // Bandpass centred at ~2.2 kHz -- thin-paper crinkle range.
    // Low Q (0.7) keeps the spectrum broad and natural, not "electronic".
    const bpf = ctx.createBiquadFilter();
    bpf.type = "bandpass";
    bpf.frequency.value = 2200;
    bpf.Q.value = 0.7;
    // Subtle gain -- present but not startling.
    const gain = ctx.createGain();
    gain.gain.value = 0.22;
    source.connect(bpf);
    bpf.connect(gain);
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
