import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import ScriptTraceProto from "@/pages/games/script-trace-proto";
import { DEVANAGARI_PROTOTYPE_GLYPHS } from "@workspace/script-trace";

// ---------------------------------------------------------------------------
// The sandbox shipped without a single test of the DRAWING, and was reported
// back as "doesn't work". It had a real bug: the finished stroke was committed
// from inside a setState updater, which is a side effect in an updater, so
// React was free to run it twice and every stroke landed twice.
//
// These tests drive the pointer the way a hand does, so "it works" is a
// measurement rather than a claim.
// ---------------------------------------------------------------------------

/** jsdom gives every element a zero-size box, and the page converts pointer
 *  positions through it. Without this every coordinate is NaN. */
function stubBox(el: Element) {
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

/** Glyph space is 0-100 and the stubbed box is 200px, so client = glyph * 2. */
const at = (p: { x: number; y: number }) => ({ clientX: p.x * 2, clientY: p.y * 2 });

function drawStroke(canvas: Element, pts: { x: number; y: number }[]) {
  fireEvent.pointerDown(canvas, { pointerId: 1, ...at(pts[0]!) });
  for (const p of pts.slice(1)) {
    fireEvent.pointerMove(canvas, { pointerId: 1, ...at(p) });
  }
  fireEvent.pointerUp(canvas, { pointerId: 1, ...at(pts[pts.length - 1]!) });
}

function renderProto() {
  const { hook } = memoryLocation({ path: "/games/script-trace-proto" });
  const view = render(
    <Router hook={hook}>
      <ScriptTraceProto />
    </Router>,
  );
  const canvas = screen.getByTestId("proto-canvas");
  stubBox(canvas);
  return { ...view, canvas };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("the sandbox actually records what you draw", () => {
  test("it renders with no result until something is drawn", () => {
    renderProto();
    expect(screen.getByTestId("proto-canvas")).toBeInTheDocument();
    expect(screen.queryByTestId("proto-result")).not.toBeInTheDocument();
  });

  test("one stroke registers as ONE stroke, not two", () => {
    // The reported bug: a stroke committed from inside a setState updater
    // landed twice, so the first thing you drew already read as too much ink.
    const { canvas } = renderProto();
    const na = DEVANAGARI_PROTOTYPE_GLYPHS[0]!;
    drawStroke(canvas, na.strokes[0]!);

    const result = screen.getByTestId("proto-result");
    expect(result).toBeInTheDocument();
    // Three authored strokes, one drawn: missing, never "too many".
    expect(result).toHaveTextContent("Some strokes are missing.");
    expect(result).not.toHaveTextContent("There is ink here the letter does not have.");
  });

  test("a full, correct trace passes", () => {
    const { canvas } = renderProto();
    const na = DEVANAGARI_PROTOTYPE_GLYPHS[0]!;
    for (const s of na.strokes) drawStroke(canvas, s);

    const result = screen.getByTestId("proto-result");
    expect(result).toHaveTextContent("Passed");
    expect(result).toHaveTextContent("100");
  });

  test("the head-line drawn FIRST is caught, which is the whole demo", () => {
    const { canvas } = renderProto();
    const na = DEVANAGARI_PROTOTYPE_GLYPHS[0]!;
    for (const s of [na.strokes[2]!, na.strokes[0]!, na.strokes[1]!]) {
      drawStroke(canvas, s);
    }

    expect(screen.getByTestId("proto-result")).toHaveTextContent(
      "Right shapes, wrong order.",
    );
  });

  test("a stroke drawn backwards is named", () => {
    const { canvas } = renderProto();
    const na = DEVANAGARI_PROTOTYPE_GLYPHS[0]!;
    drawStroke(canvas, [...na.strokes[0]!].reverse());
    drawStroke(canvas, na.strokes[1]!);
    drawStroke(canvas, na.strokes[2]!);

    expect(screen.getByTestId("proto-result")).toHaveTextContent(
      "A stroke was drawn backwards.",
    );
  });

  test("Clear removes everything", () => {
    const { canvas } = renderProto();
    drawStroke(canvas, DEVANAGARI_PROTOTYPE_GLYPHS[0]!.strokes[0]!);
    expect(screen.getByTestId("proto-result")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("proto-clear"));
    expect(screen.queryByTestId("proto-result")).not.toBeInTheDocument();
  });

  test("a tap with no movement is not a stroke", () => {
    // One point cannot be a stroke, and treating it as one would let a tap
    // count toward the glyph.
    const { canvas } = renderProto();
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 60, clientY: 60 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 60, clientY: 60 });
    expect(screen.queryByTestId("proto-result")).not.toBeInTheDocument();
  });

  test("switching glyph clears the canvas", () => {
    const { canvas } = renderProto();
    drawStroke(canvas, DEVANAGARI_PROTOTYPE_GLYPHS[0]!.strokes[0]!);
    fireEvent.click(screen.getByTestId(`proto-glyph-${DEVANAGARI_PROTOTYPE_GLYPHS[1]!.id}`));
    expect(screen.queryByTestId("proto-result")).not.toBeInTheDocument();
  });
});
