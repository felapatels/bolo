// Visitor platform detection for platform-specific guidance (currently the
// signed-in home page's add-to-home-screen block).
//
// Deliberately separate from isIosSafariWeb() in lib/iosAudio.ts. That helper
// gates audio workarounds and the signed-out hero's App Store badge, it is
// iPhone-shaped on purpose, and its behavior must not change. This one is
// wider: it also recognizes an iPad, and it names Android.

export type ShortcutPlatform = "ios" | "android" | "unknown";

/**
 * True on iPadOS 13 and later, which Safari reports with a Macintosh user
 * agent by default ("Request Desktop Website" is the factory setting), so no
 * iPad token appears in the UA string at all.
 *
 * The tell is touch: a desktop Mac reports maxTouchPoints of 0, an iPad
 * reports 5. navigator.platform is deprecated but still populated by Safari,
 * and it is the pairing of the two that separates the devices.
 */
export function isIpadOsDesktopUa(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1;
}

/**
 * The visitor's platform for home-screen guidance purposes.
 *
 * "unknown" is a real answer, not a failure: desktop browsers and anything
 * unrecognized land here and get neutral copy, because showing an iPad user
 * Android steps (or the reverse) is worse than showing everyone something
 * general.
 */
export function detectShortcutPlatform(): ShortcutPlatform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent ?? "";
  if (/iPad|iPhone|iPod/.test(ua) || isIpadOsDesktopUa()) return "ios";
  if (/Android/.test(ua)) return "android";
  return "unknown";
}
