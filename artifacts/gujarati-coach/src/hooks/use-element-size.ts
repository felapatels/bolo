import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The measured content-box size of an element, 0 by 0 until it has been laid
 * out.
 *
 * A ResizeObserver rather than a window resize listener, because the thing
 * being measured is usually a GRID COLUMN (the home hero's board), and a
 * column changes width without the viewport doing anything: the sidebar
 * mounting, a font loading, the desktop rail appearing.
 *
 * A CALLBACK REF, NOT A REF OBJECT READ ONCE (build 21, off the owner's
 * screenshot of the live home: "boarding pass ticket is too small"). This
 * was `useElementWidth`, which read `ref.current` inside a `useEffect` with
 * an empty dependency list. Home renders a skeleton until categories load,
 * so on every cold load that effect ran while the pass did not exist yet,
 * found null, returned, and never ran again: the ticket build 18 taught to
 * scale with its board sat at scale 1 in production from the day it shipped.
 * A callback ref fires whenever the node actually mounts, however late, and
 * again with null when it leaves, so the observer follows the element rather
 * than the component's first render.
 *
 * jsdom has no layout, so tests see 0 and every consumer falls back to its
 * unmeasured value. That is on purpose: a layout number guessed in a test is
 * worth less than none.
 *
 * Same shape as the journey's useMapWidth, which measures the map column
 * for the serpentine; that one stays local to the map because it also owns
 * the MAP_MAX_W fallback.
 */
export function useElementSize<T extends HTMLElement>(): {
  ref: (node: T | null) => void;
  width: number;
  height: number;
} {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((node: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const width = node.clientWidth;
      const height = node.clientHeight;
      if (width <= 0 && height <= 0) return;
      setSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    observer.current = ro;
  }, []);
  // Unmount of the HOST, for the case where the node never reports null
  // (React tears the tree down without calling refs on a hard unmount of an
  // ancestor in some paths); disconnecting twice is harmless.
  useEffect(() => () => observer.current?.disconnect(), []);
  return { ref, width: size.width, height: size.height };
}
