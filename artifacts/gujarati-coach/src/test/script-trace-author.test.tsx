import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import ScriptTraceAuthor from "@/pages/games/script-trace-author";
import { scoreGlyph, type AuthoredGlyph } from "@/lib/stroke-scoring";

// ---------------------------------------------------------------------------
// The authoring tool is the unblock for stroke-based tracing: someone who
// writes the script traces each letter once, in writing order, and exports.
//
// The contract that matters is the ROUND TRIP. Whatever this tool emits has to
// be consumable by the scorer without a transformation step, because a
// transformation step is somewhere for the order or the direction to get lost.
// The last test here closes that loop for real: author a glyph, feed the
// exported JSON to the scorer, and trace it back.
// ---------------------------------------------------------------------------

function stubBox(el: Element) {
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

const at = (p: { x: number; y: number }) => ({ clientX: p.x * 2, clientY: p.y * 2 });

function drawStroke(canvas: Element, pts: { x: number; y: number }[]) {
  fireEvent.pointerDown(canvas, { pointerId: 1, ...at(pts[0]!) });
  for (const p of pts.slice(1)) fireEvent.pointerMove(canvas, { pointerId: 1, ...at(p) });
  fireEvent.pointerUp(canvas, { pointerId: 1, ...at(pts[pts.length - 1]!) });
}

function renderAuthor() {
  const { hook } = memoryLocation({ path: "/games/script-trace-author" });
  const view = render(
    <Router hook={hook}>
      <ScriptTraceAuthor />
    </Router>,
  );
  const canvas = screen.getByTestId("author-canvas");
  stubBox(canvas);
  return { ...view, canvas };
}

/** A long stroke, so thinning keeps several points rather than collapsing it. */
const DOWN = [
  { x: 30, y: 20 },
  { x: 30, y: 40 },
  { x: 30, y: 60 },
  { x: 30, y: 80 },
];
const ACROSS = [
  { x: 15, y: 22 },
  { x: 50, y: 22 },
  { x: 85, y: 22 },
];

beforeEach(() => {
  vi.restoreAllMocks();
  // The tool restores a draft on mount, so one test's glyphs would otherwise
  // arrive already banked in the next.
  localStorage.clear();
});

describe("authoring a glyph", () => {
  test("a glyph cannot be added without a character AND a stroke", () => {
    const { canvas } = renderAuthor();
    const add = screen.getByTestId("author-add");
    expect(add).toBeDisabled();

    fireEvent.change(screen.getByTestId("author-char"), { target: { value: "क" } });
    expect(add).toBeDisabled(); // character but no strokes

    drawStroke(canvas, DOWN);
    expect(add).toBeEnabled();
  });

  test("strokes are recorded in the order they are drawn", () => {
    const { canvas } = renderAuthor();
    drawStroke(canvas, DOWN);
    expect(screen.getByText("1 stroke recorded.")).toBeInTheDocument();
    drawStroke(canvas, ACROSS);
    expect(screen.getByText("2 strokes recorded.")).toBeInTheDocument();
  });

  test("undo removes the last stroke, clear removes them all", () => {
    const { canvas } = renderAuthor();
    drawStroke(canvas, DOWN);
    drawStroke(canvas, ACROSS);

    fireEvent.click(screen.getByTestId("author-undo"));
    expect(screen.getByText("1 stroke recorded.")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("author-clear"));
    expect(screen.getByText(/Draw the first stroke/)).toBeInTheDocument();
  });

  test("adding a glyph banks it and empties the canvas for the next", () => {
    const { canvas } = renderAuthor();
    fireEvent.change(screen.getByTestId("author-char"), { target: { value: "क" } });
    fireEvent.change(screen.getByTestId("author-label"), { target: { value: "ka" } });
    drawStroke(canvas, DOWN);
    fireEvent.click(screen.getByTestId("author-add"));

    expect(screen.getByText("1 glyph authored")).toBeInTheDocument();
    expect(screen.getByText(/Draw the first stroke/)).toBeInTheDocument();
    expect((screen.getByTestId("author-char") as HTMLInputElement).value).toBe("");
  });

  test("ids are derived, stable and file-safe", () => {
    const { canvas } = renderAuthor();
    fireEvent.change(screen.getByTestId("author-char"), { target: { value: "क" } });
    fireEvent.change(screen.getByTestId("author-label"), { target: { value: "Ka " } });
    drawStroke(canvas, DOWN);
    fireEvent.click(screen.getByTestId("author-add"));

    const json = (screen.getByTestId("author-json") as HTMLTextAreaElement).value;
    expect(JSON.parse(json)[0].id).toBe("deva-ka");
  });

  test("a banked glyph can be removed again", () => {
    const { canvas } = renderAuthor();
    fireEvent.change(screen.getByTestId("author-char"), { target: { value: "क" } });
    fireEvent.change(screen.getByTestId("author-label"), { target: { value: "ka" } });
    drawStroke(canvas, DOWN);
    fireEvent.click(screen.getByTestId("author-add"));

    fireEvent.click(screen.getByTestId("author-remove-deva-ka"));
    expect(screen.queryByTestId("author-json")).not.toBeInTheDocument();
  });
});

describe("the exported data is thinned but faithful", () => {
  test("a dense drag does not emit one point per pointer sample", () => {
    // A pointer emits far more samples than a stroke needs, and every one ends
    // up in a file someone has to read. The scorer resamples anyway, so
    // density buys nothing downstream.
    const { canvas } = renderAuthor();
    const dense = Array.from({ length: 120 }, (_, i) => ({ x: 30, y: 20 + i * 0.5 }));
    fireEvent.change(screen.getByTestId("author-char"), { target: { value: "क" } });
    drawStroke(canvas, dense);
    fireEvent.click(screen.getByTestId("author-add"));

    const [g] = JSON.parse((screen.getByTestId("author-json") as HTMLTextAreaElement).value);
    expect(g.strokes[0].length).toBeLessThan(40);
    expect(g.strokes[0].length).toBeGreaterThan(2);
  });

  test("the endpoints are never thinned away", () => {
    // Thinning must not move where a stroke starts or finishes: those are the
    // direction, and direction is half of what this data exists to carry.
    const { canvas } = renderAuthor();
    const dense = Array.from({ length: 120 }, (_, i) => ({ x: 30, y: 20 + i * 0.5 }));
    fireEvent.change(screen.getByTestId("author-char"), { target: { value: "क" } });
    drawStroke(canvas, dense);
    fireEvent.click(screen.getByTestId("author-add"));

    const [g] = JSON.parse((screen.getByTestId("author-json") as HTMLTextAreaElement).value);
    const s = g.strokes[0];
    expect(s[0].y).toBeCloseTo(20, 0);
    expect(s[s.length - 1].y).toBeCloseTo(79.5, 0);
  });
});

describe("THE ROUND TRIP: what it exports, the scorer consumes", () => {
  test("an authored glyph traces back at 100 with no transformation step", () => {
    const { canvas } = renderAuthor();
    fireEvent.change(screen.getByTestId("author-char"), { target: { value: "क" } });
    fireEvent.change(screen.getByTestId("author-label"), { target: { value: "ka" } });
    drawStroke(canvas, DOWN);
    drawStroke(canvas, ACROSS);
    fireEvent.click(screen.getByTestId("author-add"));

    const exported = JSON.parse(
      (screen.getByTestId("author-json") as HTMLTextAreaElement).value,
    ) as AuthoredGlyph[];

    // Straight into the scorer, exactly as exported.
    const glyph = exported[0]!;
    expect(glyph.strokes).toHaveLength(2);
    const perfect = glyph.strokes.map((s) => s.map((p) => ({ ...p })));
    const result = scoreGlyph(perfect, glyph);
    expect(result.score).toBe(100);
    expect(result.passed).toBe(true);
  });

  test("and the order it recorded is the order the scorer enforces", () => {
    const { canvas } = renderAuthor();
    fireEvent.change(screen.getByTestId("author-char"), { target: { value: "क" } });
    drawStroke(canvas, DOWN);
    drawStroke(canvas, ACROSS);
    fireEvent.click(screen.getByTestId("author-add"));

    const [glyph] = JSON.parse(
      (screen.getByTestId("author-json") as HTMLTextAreaElement).value,
    ) as AuthoredGlyph[];

    const swapped = [glyph!.strokes[1]!, glyph!.strokes[0]!];
    const result = scoreGlyph(swapped, glyph!);
    expect(result.faults).toContain("wrong-order");
    expect(result.passed).toBe(false);
  });
});

describe("A DRAFT SURVIVES A RELOAD", () => {
  // An authoring run is an hour of hand tracing. Before this, any file save in
  // dev hot-reloaded the module and took the whole set with it silently.
  test("banked glyphs come back when the tool is mounted again", () => {
    const first = renderAuthor();
    fireEvent.change(screen.getByTestId("author-char"), { target: { value: "\u0915" } });
    fireEvent.change(screen.getByTestId("author-label"), { target: { value: "ka" } });
    drawStroke(first.canvas, DOWN);
    fireEvent.click(screen.getByTestId("author-add"));
    expect(screen.getByTestId("author-remove-deva-ka")).toBeInTheDocument();

    first.unmount();
    renderAuthor();

    expect(screen.getByTestId("author-remove-deva-ka")).toBeInTheDocument();
    const restored = JSON.parse(
      (screen.getByTestId("author-json") as HTMLTextAreaElement).value,
    ) as AuthoredGlyph[];
    expect(restored).toHaveLength(1);
    // Not just the id: the strokes themselves have to survive, in order.
    expect(restored[0]!.strokes).toHaveLength(1);
    expect(restored[0]!.strokes[0]!.length).toBeGreaterThanOrEqual(2);
  });

  test("removing a glyph removes it from the draft too", () => {
    const first = renderAuthor();
    fireEvent.change(screen.getByTestId("author-char"), { target: { value: "\u0915" } });
    fireEvent.change(screen.getByTestId("author-label"), { target: { value: "ka" } });
    drawStroke(first.canvas, DOWN);
    fireEvent.click(screen.getByTestId("author-add"));
    fireEvent.click(screen.getByTestId("author-remove-deva-ka"));

    first.unmount();
    renderAuthor();

    expect(screen.queryByTestId("author-remove-deva-ka")).not.toBeInTheDocument();
  });

  test("a corrupt draft is ignored rather than breaking the tool", () => {
    localStorage.setItem("bolo:script-trace-author:draft:v1", "{not json");
    renderAuthor();
    expect(screen.getByTestId("author-canvas")).toBeInTheDocument();
  });
});
