/**
 * Module-level registry for the currently mounted XpCounter View.
 *
 * Spec 1 (the XP arc animation) calls `measureXpCounter()` to find the
 * counter's position without caring which variant is mounted.
 *
 * Session variant takes priority over chrome variant when both are mounted.
 */
import type { View } from 'react-native';

let _session: View | null = null;
let _chrome: View | null = null;

export function registerXpCounter(
  variant: 'session' | 'chrome',
  ref: View | null,
): void {
  if (variant === 'session') _session = ref;
  else _chrome = ref;
}

/**
 * Measures the active XpCounter via `measureInWindow` (session if mounted,
 * otherwise chrome). Resolves to null when neither is mounted.
 */
export function measureXpCounter(): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
} | null> {
  const view = _session ?? _chrome;
  if (!view) return Promise.resolve(null);
  return new Promise((resolve) => {
    view.measureInWindow((x, y, width, height) => {
      resolve({ x, y, width, height });
    });
  });
}

// ── Pop trigger (Spec 1 XP arc lands) ────────────────────────────────────────

let _sessionPop: (() => void) | null = null;
let _chromePop: (() => void) | null = null;

/** Counters register a callback that plays their landing "pop". */
export function registerXpCounterPop(
  variant: 'session' | 'chrome',
  cb: (() => void) | null,
): void {
  if (variant === 'session') _sessionPop = cb;
  else _chromePop = cb;
}

/** Pops the active counter (session takes priority, same as the measure). */
export function popXpCounter(): void {
  (_session ? _sessionPop : _chromePop)?.();
}
