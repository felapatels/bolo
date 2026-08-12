/**
 * Pre-warm the microphone only when permission is ALREADY granted.
 *
 * First-time users must never get a browser permission prompt on page load —
 * their prompt fires on the first explicit record press instead (and the
 * released-before-start guard covers a release that happens while the prompt
 * is open). For returning users who have granted mic access, the prewarm
 * keeps startRecording instant so the first syllable isn't clipped.
 *
 * When the Permissions API is unavailable or doesn't support the
 * "microphone" descriptor (older Safari), the prewarm is skipped entirely —
 * startRecording acquires the device at press time.
 *
 * Returns a cancel function for the caller's effect cleanup.
 */
export function prewarmMicIfGranted(prepare: () => Promise<void>): () => void {
  let cancelled = false;
  let status: PermissionStatus | null = null;

  // A grant can arrive LONG after mount: the learner flips the microphone on
  // in the browser's site settings (the address-bar toggle) with the practice
  // screen already open. Without this listener that session stays cold — the
  // screen only prewarms at mount — so every press pays a full device
  // acquisition and a normal-length click can finish before the recorder is
  // live, which reads as a dead bird until the page is reloaded.
  const onChange = () => {
    if (!cancelled && status?.state === "granted") {
      prepare().catch(() => {});
    }
  };

  try {
    navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((s) => {
        if (cancelled) return;
        status = s;
        if (s.state === "granted") {
          prepare().catch(() => {});
        }
        s.addEventListener?.("change", onChange);
      })
      .catch(() => {
        // Descriptor unsupported — skip the prewarm.
      });
  } catch {
    // permissions.query threw synchronously — skip the prewarm.
  }
  return () => {
    cancelled = true;
    status?.removeEventListener?.("change", onChange);
  };
}
