import { useEffect, useRef, useState } from "react";

/**
 * The measured content-box width of an element, 0 until it has been laid out.
 *
 * A ResizeObserver rather than a window resize listener, because the thing
 * being measured is usually a GRID COLUMN (the home hero's board), and a
 * column changes width without the viewport doing anything: the sidebar
 * mounting, a font loading, the desktop rail appearing.
 *
 * jsdom stubs the observer to a no-op, so tests see 0 and every consumer
 * falls back to its unmeasured value. That is on purpose: a layout number
 * guessed in a test is worth less than none.
 *
 * Same shape as the journey's useMapWidth, which measures the map column
 * for the serpentine; that one stays local to the map because it also owns
 * the MAP_MAX_W fallback.
 */
export function useElementWidth<T extends HTMLElement>(): {
  ref: React.RefObject<T | null>;
  width: number;
} {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const cw = el.clientWidth;
      if (cw > 0) setWidth((prev) => (prev === cw ? prev : cw));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}
