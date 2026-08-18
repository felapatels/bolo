// PROTOTYPE SANDBOX for stroke-based Script Trace scoring.
//
// Not the game, and deliberately not dressed as one. It exists so the scoring
// difference can be FELT rather than read off a test: draw a glyph, and see
// the score and the named faults update as you lift the pen.
//
// The shipped game (games/script-trace.tsx) scores area coverage of a font
// outline and is structurally unable to see stroke order or direction. This
// page draws its guide from AUTHORED strokes instead, so both are available.
//
// Unlisted on purpose: reachable at /games/script-trace-proto and linked from
// nowhere. It should be deleted, or folded into the game, once the approach is
// ruled on either way.
import { useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Eraser, Undo2 } from "lucide-react";
import {
  scoreGlyph,
  PASS_SCORE,
  type StrokePoint,
  type TraceResult,
} from "@/lib/stroke-scoring";
import { DEVANAGARI_PROTOTYPE_GLYPHS } from "@/data/devanagari-strokes";

/** The drawing surface is square and shares the glyph's 0-100 coordinate box,
 *  so a pointer position converts by a single divide. */
const BOX = 100;

function toGlyphSpace(
  e: React.PointerEvent<SVGSVGElement>,
  svg: SVGSVGElement,
): StrokePoint {
  const r = svg.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * BOX,
    y: ((e.clientY - r.top) / r.height) * BOX,
  };
}

const toPath = (pts: StrokePoint[]) =>
  pts.length === 0
    ? ""
    : `M ${pts.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" L ")}`;

/** Plain-English for each fault, which is the half the shipped scorer cannot
 *  produce at all: a coverage number can say "not enough", never "backwards". */
const FAULT_COPY: Record<string, string> = {
  "too-few-strokes": "Some strokes are missing.",
  "too-many-strokes": "There is ink here the letter does not have.",
  "wrong-order": "Right shapes, wrong order. In Devanagari the head-line goes on LAST.",
  "reversed-stroke": "A stroke was drawn backwards.",
  shape: "A stroke is the wrong shape.",
};

export default function ScriptTraceProto() {
  const [glyphIdx, setGlyphIdx] = useState(0);
  const [strokes, setStrokes] = useState<StrokePoint[][]>([]);
  const [current, setCurrent] = useState<StrokePoint[]>([]);
  const [showGuide, setShowGuide] = useState(true);
  const drawing = useRef(false);

  const glyph = DEVANAGARI_PROTOTYPE_GLYPHS[glyphIdx]!;
  const committed = current.length > 1 ? [...strokes, current] : strokes;
  const result: TraceResult | null = useMemo(
    () => (committed.length > 0 ? scoreGlyph(committed, glyph) : null),
    [committed, glyph],
  );

  const reset = () => {
    setStrokes([]);
    setCurrent([]);
  };

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-lg bg-background px-4 pb-16">
      <header className="flex items-center gap-2 py-4">
        <Link
          href="/games"
          aria-label="Back to Games"
          className="rounded-full p-2 text-muted-foreground hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-lg font-extrabold text-foreground">
            Script Trace prototype
          </h1>
          <p className="text-xs text-muted-foreground">
            Stroke scoring, not area coverage. Not the shipped game.
          </p>
        </div>
      </header>

      <div className="flex gap-2 pb-3">
        {DEVANAGARI_PROTOTYPE_GLYPHS.map((g, i) => (
          <button
            key={g.id}
            onClick={() => {
              setGlyphIdx(i);
              reset();
            }}
            data-testid={`proto-glyph-${g.id}`}
            className={
              i === glyphIdx
                ? "rounded-xl border-2 border-primary bg-primary/10 px-4 py-2"
                : "rounded-xl border-2 border-border bg-card px-4 py-2"
            }
          >
            <span className="text-2xl leading-none text-foreground">{g.char}</span>
            <span className="ml-2 text-xs font-bold text-muted-foreground">
              {g.label}
            </span>
          </button>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${BOX} ${BOX}`}
        data-testid="proto-canvas"
        className="aspect-square w-full touch-none rounded-2xl border-2 border-border bg-card"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          setCurrent([toGlyphSpace(e, e.currentTarget)]);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          setCurrent((c) => [...c, toGlyphSpace(e, e.currentTarget)]);
        }}
        onPointerUp={() => {
          drawing.current = false;
          setCurrent((c) => {
            if (c.length > 1) setStrokes((s) => [...s, c]);
            return [];
          });
        }}
      >
        {/* The authored strokes, faint. Numbered, because the ORDER is the
            thing being taught and a guide that hides it teaches a drawing. */}
        {showGuide &&
          glyph.strokes.map((s, i) => (
            <g key={i} opacity={0.28}>
              <path
                d={toPath(s)}
                fill="none"
                stroke="currentColor"
                strokeWidth={6}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-muted-foreground"
              />
              <circle cx={s[0]!.x} cy={s[0]!.y} r={4} className="fill-primary" />
              <text
                x={s[0]!.x}
                y={s[0]!.y + 1.6}
                textAnchor="middle"
                className="fill-white"
                style={{ fontSize: 5, fontWeight: 800 }}
              >
                {i + 1}
              </text>
            </g>
          ))}

        {[...strokes, current].map((s, i) => (
          <path
            key={`drawn-${i}`}
            d={toPath(s)}
            fill="none"
            stroke="currentColor"
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-foreground"
          />
        ))}
      </svg>

      <div className="flex gap-2 pt-3">
        <button
          onClick={() => setStrokes((s) => s.slice(0, -1))}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-border bg-card py-2.5 text-sm font-bold"
        >
          <Undo2 className="h-4 w-4" /> Undo stroke
        </button>
        <button
          onClick={reset}
          data-testid="proto-clear"
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-border bg-card py-2.5 text-sm font-bold"
        >
          <Eraser className="h-4 w-4" /> Clear
        </button>
        <button
          onClick={() => setShowGuide((g) => !g)}
          className="flex-1 rounded-xl border-2 border-border bg-card py-2.5 text-sm font-bold"
        >
          {showGuide ? "Hide guide" : "Show guide"}
        </button>
      </div>

      {result && (
        <div
          data-testid="proto-result"
          className="mt-4 rounded-2xl border-2 p-4"
          style={{ borderColor: result.passed ? "#10B981" : "#EF4444" }}
        >
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-black tabular-nums text-foreground">
              {result.score}
            </span>
            <span className="text-sm font-bold text-muted-foreground">
              {result.passed ? "Passed" : `Needs ${PASS_SCORE}`}
            </span>
          </div>
          {result.faults.length > 0 && (
            <ul className="mt-2 space-y-1">
              {result.faults.map((f) => (
                <li key={f} className="text-sm font-semibold text-foreground">
                  {FAULT_COPY[f] ?? f}
                </li>
              ))}
            </ul>
          )}
          <table className="mt-3 w-full text-xs text-muted-foreground">
            <tbody>
              {result.perStroke.map((p) => (
                <tr key={p.index}>
                  <td className="py-0.5">Stroke {p.index + 1}</td>
                  <td className="py-0.5 tabular-nums">
                    {Number.isFinite(p.distance) ? p.distance.toFixed(1) : "not drawn"}
                  </td>
                  <td className="py-0.5">{p.reversed ? "backwards" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        The three glyphs are approximate placeholders that exercise the format.
        Real stroke data has to be authored by someone who writes the script.
        What is faithful is the rule this turns on: the head-line goes on last.
        Try drawing it first and watch the fault appear.
      </p>
    </div>
  );
}
