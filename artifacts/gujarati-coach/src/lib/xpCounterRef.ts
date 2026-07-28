/**
 * Module-level registry for the currently mounted XpCounter element.
 *
 * Spec 1 (the XP arc animation) calls `getXpCounterRect()` to find where the
 * counter lives on screen without caring which variant is mounted.
 *
 * Session variant takes priority over chrome variant when both are mounted
 * (web desktop during practice).
 */

let _session: HTMLElement | null = null;
let _chrome: HTMLElement | null = null;

export function registerXpCounter(
  variant: "session" | "chrome",
  el: HTMLElement | null,
): void {
  if (variant === "session") _session = el;
  else _chrome = el;
}

/**
 * Returns the bounding rect of the active XpCounter (session if mounted,
 * otherwise chrome), or null when neither is mounted.
 */
export function getXpCounterRect(): DOMRect | null {
  return (_session ?? _chrome)?.getBoundingClientRect() ?? null;
}

// ── Pop trigger (Spec 1 XP arc lands) ────────────────────────────────────────

let _sessionPop: (() => void) | null = null;
let _chromePop: (() => void) | null = null;

/** Counters register a callback that plays their landing "pop". */
export function registerXpCounterPop(
  variant: "session" | "chrome",
  cb: (() => void) | null,
): void {
  if (variant === "session") _sessionPop = cb;
  else _chromePop = cb;
}

/** Pops the active counter (session takes priority, same as the rect). */
export function popXpCounter(): void {
  (_session ? _sessionPop : _chromePop)?.();
}
