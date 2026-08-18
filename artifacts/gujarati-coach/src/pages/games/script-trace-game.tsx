// Script Trace, rebuilt on stroke scoring, with a ladder.
//
// The shipped games/script-trace.tsx scores AREA COVERAGE of a font outline and
// cannot see stroke order or direction, which in an Indic script is the skill
// itself. This one runs on authored strokes: it knows where the pen starts,
// where it goes and when it lifts, so it can say "the head-line goes on last"
// instead of only "not enough ink".
//
// THE LADDER IS LETTERS, WORDS, SENTENCES, and it costs no new stroke data: a
// word is the authored letters traced in sequence. See lib/trace-levels.ts for
// the arithmetic and the composability gate that comes with it.
//
// GATED TWICE. On content, by lib/scripts.ts and the per-level floors, so a
// level with three items says so instead of dealing a three-item game. And on
// plan, because this is paid: the ladder is the deepest thing in the games
// roster and it sits behind /upgrade the way Bolo Quiz does.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Redirect } from "wouter";
import { ArrowLeft, Check, Eraser, Lock, Play, Undo2 } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { useEntitlements } from "@/lib/entitlements";
import {
  useListCategories,
  useListCategoryPhrases,
  getListCategoriesQueryKey,
  getListCategoryPhrasesQueryKey,
} from "@workspace/api-client-react";
import {
  scoreGlyph,
  strokesUpTo,
  PASS_SCORE,
  type StrokePoint,
  type TraceFault,
} from "@/lib/stroke-scoring";
import { glyphsForLanguage, scriptFor, SCRIPT_NAMES } from "@/lib/scripts";
import {
  itemsForLevel,
  levelLadder,
  LEVEL_BLURBS,
  LEVEL_NAMES,
  type TraceItem,
  type TraceLevel,
  type TraceSource,
} from "@/lib/trace-levels";

const BOX = 100;
/** Items per run. Short enough to finish standing up. */
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
 * The run's items. Deterministic per mount rather than reshuffled on every
 * render, so a re-render mid-round cannot swap the letter under the learner.
 */
function pickRound(all: TraceItem[]): TraceItem[] {
  const pool = [...all];
  const out: TraceItem[] = [];
  while (out.length < Math.min(ROUNDS, all.length) && pool.length > 0) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!);
  }
  return out;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-lg px-4 pb-16">
      <header className="flex items-center gap-2 py-4">
        <Link href="/games" aria-label="Back to Games" className="rounded-full p-2 hover:bg-muted">
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
        </Link>
        <h1 className="flex-1 text-lg font-extrabold text-foreground">Script Trace</h1>
      </header>
      {children}
    </div>
  );
}

/**
 * The ladder.
 *
 * A locked level is SHOWN, with how far off it is. Hiding it would read as a
 * missing feature; naming the shortfall reads as a roadmap.
 */
function LevelPicker({
  ladder,
  onPick,
  languageName,
  scriptName,
}: {
  ladder: ReturnType<typeof levelLadder>;
  onPick: (l: TraceLevel) => void;
  languageName: string;
  scriptName: string;
}) {
  return (
    <Shell>
      <p className="pb-4 text-sm text-muted-foreground">
        Writing {scriptName} for {languageName}, in writing order.
      </p>
      <div className="flex flex-col gap-3">
        {ladder.map(({ level, ready, have, need }) =>
          ready ? (
            <button
              key={level}
              data-testid={`trace-level-${level}`}
              onClick={() => onPick(level)}
              className="rounded-2xl border-2 border-border bg-card p-4 text-left"
            >
              <span className="block text-base font-black text-foreground">
                {LEVEL_NAMES[level]}
              </span>
              <span className="block pt-0.5 text-xs text-muted-foreground">
                {LEVEL_BLURBS[level]}
              </span>
            </button>
          ) : (
            <div
              key={level}
              data-testid={`trace-level-locked-${level}`}
              className="rounded-2xl border-2 border-dashed border-border p-4 opacity-70"
            >
              <span className="flex items-center gap-2 text-base font-black text-muted-foreground">
                <Lock className="h-4 w-4" /> {LEVEL_NAMES[level]}
              </span>
              <span className="block pt-0.5 text-xs text-muted-foreground">
                {have} of {need} ready. {LEVEL_BLURBS[level]}
              </span>
            </div>
          ),
        )}
      </div>
    </Shell>
  );
}

function Run({ items, onDone }: { items: TraceItem[]; onDone: () => void }) {
  const [run] = useState(() => pickRound(items));
  const [itemIdx, setItemIdx] = useState(0);
  const [glyphIdx, setGlyphIdx] = useState(0);
  const [strokes, setStrokes] = useState<StrokePoint[][]>([]);
  const [checked, setChecked] = useState(false);
  const [scores, setScores] = useState<number[]>([]);
  const [phase, setPhase] = useState<"watch" | "trace">("watch");
  const [demoT, setDemoT] = useState(0);
  const [replay, setReplay] = useState(0);

  const liveRef = useRef<StrokePoint[]>([]);
  const [live, setLive] = useState<StrokePoint[]>([]);
  const drawing = useRef(false);

  const item = run[itemIdx];
  const glyph = item?.glyphs[glyphIdx];
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
  }, [phase, itemIdx, glyphIdx, replay]);

  const clear = () => {
    liveRef.current = [];
    setLive([]);
    setStrokes([]);
    setChecked(false);
  };

  const watchAgain = () => {
    setDemoT(0);
    setReplay((r) => r + 1);
    setPhase("watch");
  };

  /** Next letter within the item, or the next item, or the end of the run. */
  const advance = () => {
    setScores((s) => [...s, result?.score ?? 0]);
    clear();
    setDemoT(0);
    setPhase("watch");
    if (item && glyphIdx + 1 < item.glyphs.length) {
      setGlyphIdx((i) => i + 1);
    } else {
      setGlyphIdx(0);
      setItemIdx((i) => i + 1);
    }
  };

  if (itemIdx >= run.length) {
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
        <button
          onClick={onDone}
          data-testid="trace-again"
          className="mt-8 inline-block rounded-2xl px-6 py-3 text-sm font-black text-white"
          style={{ background: "hsl(var(--primary))" }}
        >
          Back to levels
        </button>
      </div>
    );
  }

  const multi = item!.glyphs.length > 1;

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-lg px-4 pb-16">
      <header className="flex items-center gap-2 py-4">
        <Link href="/games" aria-label="Back to Games" className="rounded-full p-2 hover:bg-muted">
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
        </Link>
        <h1 className="flex-1 text-lg font-extrabold text-foreground">Script Trace</h1>
        <span data-testid="trace-progress" className="text-xs font-bold text-muted-foreground">
          {itemIdx + 1} of {run.length}
        </span>
      </header>

      {/* For a word, the whole word with the current letter marked: a learner
          tracing letter three of कमल needs to see which letter that is. */}
      {multi ? (
        <p data-testid="trace-word" className="pb-1 text-center text-3xl text-muted-foreground">
          {item!.glyphs.map((g, i) => (
            <span
              key={i}
              data-active={i === glyphIdx ? "true" : undefined}
              className={i === glyphIdx ? "font-black text-foreground" : undefined}
            >
              {g.char}
              {item!.breaks.includes(i + 1) ? " " : ""}
            </span>
          ))}
        </p>
      ) : null}

      <p className="text-center text-sm font-bold text-muted-foreground">
        {phase === "watch" ? "Watch" : "Trace"}{" "}
        <span className="text-2xl text-foreground">{glyph!.char}</span> ({glyph!.label})
        {multi ? (
          <span data-testid="trace-letter-of" className="pl-2 text-xs">
            letter {glyphIdx + 1} of {item!.glyphs.length}
          </span>
        ) : null}
      </p>

      {item!.gloss ? (
        <p data-testid="trace-example" className="pb-2 pt-0.5 text-center text-xs text-muted-foreground">
          <span className="font-bold text-foreground">{item!.roman}</span>, {item!.gloss}
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
            onClick={advance}
            data-testid="trace-next"
            className="flex-1 rounded-xl py-2.5 text-sm font-black text-white"
            style={{ background: "hsl(var(--primary))" }}
          >
            {itemIdx + 1 >= run.length && glyphIdx + 1 >= item!.glyphs.length
              ? "Finish"
              : glyphIdx + 1 < item!.glyphs.length
                ? "Next letter"
                : "Next word"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function ScriptTraceGame() {
  const { isPlus, isLoading: entLoading } = useEntitlements();
  const { activeLang, activeLanguage } = useLanguage();
  const [level, setLevel] = useState<TraceLevel | null>(null);

  const all = glyphsForLanguage(activeLang);
  const script = scriptFor(activeLang);

  // Sentences come from the learner's own first zone, so the level asks them to
  // write things they have actually been taught to say.
  const catParams = { lang: activeLang };
  const { data: categories } = useListCategories(catParams, {
    query: {
      enabled: !!isPlus && !!activeLang,
      queryKey: getListCategoriesQueryKey(catParams),
    },
  });
  const firstCategory = categories?.[0]?.id;
  const { data: phraseData } = useListCategoryPhrases(firstCategory!, activeLang, {
    query: {
      enabled: !!isPlus && !!firstCategory && !!activeLang,
      queryKey: getListCategoryPhrasesQueryKey(firstCategory!, activeLang),
    },
  });
  const phrases: TraceSource[] = useMemo(
    () =>
      (phraseData ?? []).map((p) => ({
        nativeScript: p.nativeScript,
        romanized: p.romanized,
        english: p.english,
      })),
    [phraseData],
  );

  const ladder = useMemo(() => levelLadder(all, phrases), [all, phrases]);
  const items = useMemo(
    () => (level ? itemsForLevel(level, all, phrases) : []),
    [level, all, phrases],
  );

  // Paid, like Bolo Quiz. The ladder is the deepest thing in the roster.
  if (!entLoading && !isPlus) {
    return <Redirect to="/upgrade" />;
  }

  // Nothing authored at all: say so once, rather than three locked rows all
  // reporting the same shortfall.
  if (!ladder.some((l) => l.ready)) {
    const letters = ladder.find((l) => l.level === "letters")!;
    return (
      <Shell>
        <div
          data-testid="trace-not-ready"
          className="mt-2 rounded-2xl border-2 border-dashed border-border p-6 text-center"
        >
          <h1 className="text-lg font-extrabold text-foreground">
            Script Trace is not ready for {activeLanguage?.name ?? activeLang} yet
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tracing {script ? SCRIPT_NAMES[script] : "this script"} needs its letters
            authored stroke by stroke, in writing order. {letters.have} of {letters.need}{" "}
            are done.
          </p>
        </div>
      </Shell>
    );
  }

  if (!level) {
    return (
      <LevelPicker
        ladder={ladder}
        onPick={setLevel}
        languageName={activeLanguage?.name ?? activeLang}
        scriptName={script ? SCRIPT_NAMES[script] : "this script"}
      />
    );
  }

  return <Run key={level} items={items} onDone={() => setLevel(null)} />;
}
