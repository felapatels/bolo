import { useEffect, useRef, useState } from "react";

/**
 * Returns `true` after `seconds` of no user interaction (mouse, keyboard,
 * pointer, scroll, touch). Resets to `false` the instant any event fires.
 *
 * All listeners are passive and captured at the window level so they fire
 * even when a child element stops propagation.
 */
export function useIdleTimer(seconds: number): boolean {
  const [isIdle, setIsIdle] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const ms = seconds * 1000;

    function reset() {
      // Always reset, no stale-closure conditional. React bails on re-render
      // when the value was already false, so this is safe to call every time.
      setIsIdle(false);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setIsIdle(true), ms);
    }

    const opts: AddEventListenerOptions = { passive: true, capture: true };
    const events = ["mousemove", "keydown", "pointerdown", "scroll", "touchstart"] as const;

    events.forEach((e) => window.addEventListener(e, reset, opts));
    // Start the initial countdown
    timerRef.current = setTimeout(() => setIsIdle(true), ms);

    return () => {
      events.forEach((e) => window.removeEventListener(e, reset, opts));
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [seconds]);

  return isIdle;
}
