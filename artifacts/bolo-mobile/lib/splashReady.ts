/**
 * THE LAUNCH HANDOVER, BOTH WAYS, in one module.
 *
 * "Home has its data", published from the leaf and read at the root, and
 * "the film has gone", published from the root and read by the leaf.
 *
 * Web mounts its splash INSIDE home, so home's own loading flag is the
 * release signal. Mobile cannot: the film has to cover Clerk resolving
 * and two redirect hops that happen ABOVE home in the tree, or it would
 * appear only after the waiting is already over.
 *
 * So the signal is lifted through a module rather than through context:
 * a provider would have to wrap the root, and the root is exactly what
 * is being covered. Module scope is safe here for the same reason web's
 * coldStartConsumed is: the root layout does not remount on resume, so
 * one module lifetime is one launch.
 */
import { useSyncExternalStore } from 'react';

let ready = false;
const listeners = new Set<() => void>();

/** Called by home the first time its categories query settles. */
export function markHomeReady(): void {
  if (ready) return;
  ready = true;
  listeners.forEach((l) => l());
}

export function useHomeReady(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => ready,
    () => ready,
  );
}

/**
 * THE OTHER DIRECTION: "the film has gone".
 *
 * Home's stats count up from zero over 700ms, and on a cold start the splash
 * is still covering the screen for the whole of it, so the one thing that
 * animation exists to do happens where nobody can see it: "I think the splash
 * covers the countup" (owner, 2026-08-27, chat 12).
 *
 * Kept in this module rather than a new one because it is the same handover,
 * read from the other end, and the reasoning above about module scope applies
 * unchanged: the root layout does not remount on resume, so one module
 * lifetime is one launch.
 *
 * SEPARATE FLAG, NOT A PHASE. `ready` means home has data; this means the
 * overlay is off the screen. They are published by different components at
 * different moments and collapsing them would make each one lie about the
 * other on the launches where they diverge.
 */
let filmGone = false;
const filmListeners = new Set<() => void>();

/**
 * Called by BrandSplash when its film is off the screen, INCLUDING the launch
 * where it never played: a warm start reads the play-once latch and starts at
 * 'done', and a consumer waiting on this must not wait forever for a film that
 * was never going to appear.
 */
export function markFilmGone(): void {
  if (filmGone) return;
  filmGone = true;
  filmListeners.forEach((l) => l());
}

export function useFilmGone(): boolean {
  return useSyncExternalStore(
    (l) => {
      filmListeners.add(l);
      return () => filmListeners.delete(l);
    },
    () => filmGone,
    () => filmGone,
  );
}

export function __resetSplashReadyForTests(): void {
  ready = false;
  listeners.clear();
  filmGone = false;
  filmListeners.clear();
}
