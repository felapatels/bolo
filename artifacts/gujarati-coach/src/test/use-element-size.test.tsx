import { describe, test, expect, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useEffect, useState } from "react";
import { useElementSize } from "@/hooks/use-element-size";

// THE HOOK MEASURES A NODE THAT MOUNTS LATE (build 21). Its predecessor,
// useElementWidth, read `ref.current` once inside a useEffect with an empty
// dependency list. Home renders a skeleton until categories load, so on every
// cold load that effect ran while the pass did not exist, found null, and
// never ran again: the ticket build 18 taught to scale with its board sat at
// scale 1 in production from the day it shipped, which is what the owner's
// screenshot showed. A callback ref fires whenever the node actually mounts.
//
// jsdom has no layout and no ResizeObserver, so this suite supplies both: a
// stub observer, and clientWidth/clientHeight getters on the prototype.

class StubResizeObserver {
  static instances: StubResizeObserver[] = [];
  observed: Element[] = [];
  constructor(public cb: () => void) {
    StubResizeObserver.instances.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  disconnect() {
    this.observed = [];
  }
}

function withLayout(width: number, height: number, run: () => void) {
  const proto = HTMLElement.prototype;
  const w = Object.getOwnPropertyDescriptor(proto, "clientWidth");
  const h = Object.getOwnPropertyDescriptor(proto, "clientHeight");
  Object.defineProperty(proto, "clientWidth", { configurable: true, get: () => width });
  Object.defineProperty(proto, "clientHeight", { configurable: true, get: () => height });
  try {
    run();
  } finally {
    if (w) Object.defineProperty(proto, "clientWidth", w);
    else delete (proto as unknown as Record<string, unknown>).clientWidth;
    if (h) Object.defineProperty(proto, "clientHeight", h);
    else delete (proto as unknown as Record<string, unknown>).clientHeight;
  }
}

/** Home's shape: a skeleton first, the measured node only after a flip. */
function LateMount() {
  const [ready, setReady] = useState(false);
  const size = useElementSize<HTMLDivElement>();
  useEffect(() => {
    setReady(true);
  }, []);
  if (!ready) return <p>skeleton</p>;
  return (
    <div ref={size.ref} data-testid="measured" data-w={size.width} data-h={size.height} />
  );
}

afterEach(() => {
  StubResizeObserver.instances = [];
  vi.unstubAllGlobals();
});

describe("useElementSize", () => {
  test("measures a node that mounts after the first render, and observes it", () => {
    vi.stubGlobal("ResizeObserver", StubResizeObserver);
    withLayout(598, 209, () => {
      act(() => {
        render(<LateMount />);
      });
      const node = screen.getByTestId("measured");
      expect(node.getAttribute("data-w")).toBe("598");
      expect(node.getAttribute("data-h")).toBe("209");
      // The observer follows the node, so a column that changes width later
      // (the desktop rail appearing) re-measures too.
      expect(StubResizeObserver.instances).toHaveLength(1);
      expect(StubResizeObserver.instances[0]!.observed).toContain(node);
    });
  });

  test("without a ResizeObserver it reports 0 by 0 and every consumer falls back", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    withLayout(598, 209, () => {
      act(() => {
        render(<LateMount />);
      });
      const node = screen.getByTestId("measured");
      expect(node.getAttribute("data-w")).toBe("0");
      expect(node.getAttribute("data-h")).toBe("0");
    });
  });
});
