// Script Trace, rebuilt on stroke scoring.
//
// The shipped games/script-trace.tsx scores AREA COVERAGE of a font outline and
// cannot see stroke order or direction, which in an Indic script is the skill
// itself. This one runs on authored strokes: it knows where the pen starts,
// where it goes and when it lifts, so it can say "the head-line goes on last"
// instead of only "not enough ink".
//
// GATED ON CONTENT, not on a flag. lib/scripts.ts serves the authored set for
// the learner's script and traceReadyFor() is false until a real alphabet
// exists, so this screen tells the learner plainly rather than dealing them a
// three-letter game. The old page is untouched and still hidden; it should be
// deleted once this one has an alphabet behind it.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Check, Eraser, Play, Undo2 } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import {
  scoreGlyph,
  strokesUpTo,
  PASS_SCORE,
  type AuthoredGlyph,
  type StrokePoint,
  type TraceFault,
} from "@/lib/stroke-scoring";
import {
  glyphsForLanguage,
  scriptFor,
  SCRIPT_NAMES,
  traceReadyFor,
  PLAYABLE_GLYPH_FLOOR,
} from "@/lib/scripts";

const BOX = 100;
/** Glyphs per run. Short enough to finish standing up. */
export const ROUNDS = 6;

/**
 * WATCH, THEN TRACE.
 *
 * The guide stays hidden during the attempt, which is right: a visible guide
 * turns the game into colouring in. But hiding it on a letter the learner has
 * never seen written is not teaching either, it is testing something never
 * taught. So every letter opens with the pen demo, and the attempt begins when
 * the learner says it does.
 *
 * The demo is free here in a way it never was for the shipped game: it replays
 * the authored stroke instead of trying to recover a path from an outline.
 */
const DEMO_MS = 2200;
const DEMO_TICK_MS = 40;

const FAULT_COPY: Record<TraceFault, string> = {
  "too-few-strokes": "Some strokes are missing.",
  "too-many-strokes": "There is ink here the letter does not have.",
  "wrong-order": "Right shapes, wrong order.",
  "reversed-stroke": "A stroke went the wrong way.",
  shape: "A stroke is the wrong shape.",
};

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
    : `M ${pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ")}`;

/**
 * The run's glyphs. Deterministic per mount rather than reshuffled on every
 * render, so a re-render mid-round cannot swap the letter under the learner.
 */
function pickRound(all: AuthoredGlyph[]): AuthoredGlyph[] {
  const pool = [...all];
  const out: AuthoredGlyph[] = [];
  while (out.length < Math.min(ROUNDS, all.length) && pool.length > 0) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!);
  }
  return out;
}

export default function ScriptTraceGame() {
  const { activeLang, activeLanguage } = useLanguage();
  const all = glyphsForLanguage(activeLang);
  const ready = traceReadyFor(activeLang);
  const script = scriptFor(activeLang);

  const [run] = useState(() => pickRound(all));
  const [idx, setIdx] = useState(0);
  const [strokes, setStrokes] = useState<StrokePoint[][]>([]);
  const [checked, setChecked] = useState(false);
  const [scores, setScores] = useState<number[]>([]);
  const [phase, setPhase] = useState<"watch" | "trace">("watch");
  const [demoT, setDemoT] = useState(0);
  const [replay, setReplay] = useState(0);

  const liveRef = useRef<StrokePoint[]>([]);
  const [live, setLive] = useState<StrokePoint[]>([]);
  const drawing = useRef(false);

  const glyph = run[idx];
  const result = useMemo(
    () => (glyph && strokes.length > 0 ? scoreGlyph(strokes, glyph) : null),
    [strokes, glyph],
  );

  // Runs only while watching, so a learner mid-attempt is never re-animated.
  useEffect(() => {
    if (phase !== "watch") return;
    const started = performance.now();
    const id = setInterval(() => {
      const t = Math.min(1, (performance.now() - started) / DEMO_MS);
      setDemoT(t);
      if (t >= 1) clearInterval(id);
    }, DEMO_TICK_MS);
    return () => clearInterval(id);
  }, [phase, idx, replay]);

  const watchAgain = () => {
    setDemoT(0);
    setReplay((r) => r + 1);
    setPhase("watch");
  };

  const clear = () => {
    liveRef.current = [];
    setLive([]);
    setStrokes([]);
    setChecked(false);
  };

  // Not enough authored glyphs to make a game. Saying so is the honest move:
  // the alternative is dealing three letters and calling it Script Trace.
  if (!ready) {
    return (
      <div className="mx-auto min-h-[100dvh] w-full max-w-lg px-4 py-6">
        <Link href="/games" className="text-sm font-bold text-muted-foreground">
          <ArrowLeft className="mr-1 inline h-4 w-4" /> Games
        </Link>
        <div
          data-testid="trace-not-ready"
          className="mt-6 rounded-2xl border-2 border-dashed border-border p-6 text-center"
        >
          <h1 className="text-lg font-extrabold text-foreground">
            Script Trace is not ready for{" "}
            {activeLanguage?.name ?? activeLang} yet
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tracing {script ? SCRIPT_NAMES[script] : "this script"} needs its
            letters authored stroke by stroke, in writing order.{" "}
            {all.length} of {PLAYABLE_GLYPH_FLOOR} are done.
          </p>
        </div>
      </div>
    );
  }

  const finished = idx >= run.length;
  if (finished) {
    const total = Math.round(scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length));
    return (
      <div className="mx-auto min-h-[100dvh] w-full max-w-lg px-4 py-6 text-center">
        <h1 className="text-2xl font-black text-foreground">Run complete</h1>
        <p
          data-testid="trace-total"
          className="mt-3 text-5xl font-black tabular-nums text-foreground"
        >
          {total}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {scores.filter((s) => s >= PASS_SCORE).length} of {scores.length} letters clean
        </p>
        <Link
          href="/games"
          className="mt-8 inline-block rounded-2xl px-6 py-3 text-sm font-black text-white"
          style={{ background: "hsl(var(--primary))" }}
        >
          Back to Games
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-lg px-4 pb-16">
      <header className="flex items-center gap-2 py-4">
        <Link href="/games" aria-label="Back to Games" className="rounded-full p-2 hover:bg-muted">
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
        </Link>
        <h1 className="flex-1 text-lg font-extrabold text-foreground">Script Trace</h1>
        <span data-testid="trace-progress" className="text-xs font-bold text-muted-foreground">
          {idx + 1} of {run.length}
        </span>
      </header>

      <p className="text-center text-sm font-bold text-muted-foreground">
        {phase === "watch" ? "Watch" : "Trace"}{" "}
        <span className="text-2xl text-foreground">{glyph!.char}</span> ({glyph!.label})
      </p>
      {glyph!.example ? (
        <p data-testid="trace-example" className="pb-2 pt-0.5 text-center text-xs text-muted-foreground">
          <span className="text-foreground">{glyph!.char}</span> as in{" "}
          <span className="font-bold text-foreground">{glyph!.example.word}</span>{" "}
          ({glyph!.example.roman}), {glyph!.example.gloss}
        </p>
      ) : (
        <div className="pb-2" />
      )}

      <svg
        viewBox={`0 0 ${BOX} ${BOX}`}
        data-testid="trace-canvas"
        className="aspect-square w-full touch-none rounded-2xl border-2 border-border bg-card"
        onPointerDown={(e) => {
          if (checked || phase !== "trace") return;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          drawing.current = true;
          liveRef.current = [toGlyphSpace(e, e.currentTarget)];
          setLive(liveRef.current);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          liveRef.current = [...liveRef.current, toGlyphSpace(e, e.currentTarget)];
          setLive(liveRef.current);
        }}
        onPointerUp={() => {
          drawing.current = false;
          const done = liveRef.current;
          liveRef.current = [];
          setLive([]);
          if (done.length > 1) setStrokes((s) => [...s, done]);
        }}
        onPointerCancel={() => {
          drawing.current = false;
          liveRef.current = [];
          setLive([]);
        }}
      >
        {/* The pen demo: the authored strokes drawing themselves, in order. Only
            while watching, so the attempt itself stays unguided. */}
        {phase === "watch" &&
          strokesUpTo(glyph!.strokes, demoT).map((s, i) => (
            <g key={`demo-${i}`} data-testid={`trace-demo-stroke-${i}`}>
              <path
                d={toPath(s)}
                fill="none"
                stroke="currentColor"
                strokeWidth={6}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-primary"
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

        {/* The guide appears only AFTER a check. Showing it while tracing turns
            the game into colouring in; showing it with the verdict is how a
            learner sees what they got wrong. */}
        {checked &&
          glyph!.strokes.map((s, i) => (
            <g key={i} opacity={0.3}>
              <path
                d={toPath(s)}
                fill="none"
                stroke="currentColor"
                strokeWidth={6}
                strokeLinecap="round"
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

        {[...strokes, live].map((s, i) => (
          <path
            key={i}
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

      {checked && result ? (
        <div
          data-testid="trace-verdict"
          className="mt-3 rounded-2xl border-2 p-3"
          style={{ borderColor: result.passed ? "#10B981" : "#EF4444" }}
        >
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-black tabular-nums text-foreground">
              {result.score}
            </span>
            <span className="text-sm font-bold text-muted-foreground">
              {result.passed ? "Clean" : "Try the order again"}
            </span>
          </div>
          {result.faults.map((f) => (
            <p key={f} className="mt-1 text-sm font-semibold text-foreground">
              {FAULT_COPY[f]}
            </p>
          ))}
        </div>
      ) : null}

      <div className="flex gap-2 pt-3">
        {phase === "watch" ? (
          <>
            <button
              onClick={watchAgain}
              data-testid="trace-watch-again"
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-border bg-card py-2.5 text-sm font-bold"
            >
              <Play className="h-4 w-4" /> Watch again
            </button>
            <button
              onClick={() => setPhase("trace")}
              data-testid="trace-my-turn"
              className="flex flex-[1.4] items-center justify-center rounded-xl py-2.5 text-sm font-black text-white"
              style={{ background: "hsl(var(--primary))" }}
            >
              My turn
            </button>
          </>
        ) : !checked ? (
          <>
            <button
              onClick={() => setStrokes((s) => s.slice(0, -1))}
              data-testid="trace-undo"
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-border bg-card py-2.5 text-sm font-bold"
            >
              <Undo2 className="h-4 w-4" /> Undo
            </button>
            <button
              onClick={clear}
              data-testid="trace-clear"
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-border bg-card py-2.5 text-sm font-bold"
            >
              <Eraser className="h-4 w-4" /> Clear
            </button>
            <button
              onClick={() => setChecked(true)}
              disabled={strokes.length === 0}
              data-testid="trace-check"
              className="flex flex-[1.4] items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-black text-white disabled:opacity-40"
              style={{ background: "hsl(var(--primary))" }}
            >
              <Check className="h-4 w-4" /> Check
            </button>
          </>
        ) : (
          <button
            onClick={() => {
              setScores((s) => [...s, result?.score ?? 0]);
              setIdx((i) => i + 1);
              clear();
              // Every letter opens with its demo, including ones already seen:
              // a run deals six different letters, not six attempts at one.
              setDemoT(0);
              setPhase("watch");
            }}
            data-testid="trace-next"
            className="flex-1 rounded-xl py-2.5 text-sm font-black text-white"
            style={{ background: "hsl(var(--primary))" }}
          >
            {idx + 1 >= run.length ? "Finish" : "Next letter"}
          </button>
        )}
      </div>
    </div>
  );
}
