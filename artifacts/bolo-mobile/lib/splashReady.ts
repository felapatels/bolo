/**
 * "Home has its data", published from the leaf and read at the root.
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

export function __resetSplashReadyForTests(): void {
  ready = false;
  listeners.clear();
}
