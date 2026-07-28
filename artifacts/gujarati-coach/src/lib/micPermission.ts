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
  try {
    navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((status) => {
        if (!cancelled && status.state === "granted") {
          prepare().catch(() => {});
        }
      })
      .catch(() => {
        // Descriptor unsupported — skip the prewarm.
      });
  } catch {
    // permissions.query threw synchronously — skip the prewarm.
  }
  return () => {
    cancelled = true;
  };
}
