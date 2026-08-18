// STROKE AUTHORING TOOL for Script Trace.
//
// The blocker on stroke-based tracing is data: someone who writes the script
// has to say, per glyph, where the pen starts, where it goes, and when it
// lifts. A font cannot answer that, which is the whole finding of the
// post-mortem. This is the thing that makes answering it cheap.
//
// THE FONT IS THE VISUAL REFERENCE, NEVER THE STROKE DATA. The real character
// is rendered large and faint behind the canvas so the author traces an
// accurate letterform, and the stroke ORDER and DIRECTION come from the human
// hand doing the tracing. That distinction is the entire difference between
// this and the shipped generator.
//
// Output is the AuthoredGlyph shape the scorer already consumes, so a finished
// set pastes straight into a data module with no transformation step to get
// wrong.
//
// Unlisted: reachable at /games/script-trace-author and linked from nowhere.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, ArrowLeft, Check, Copy, Eraser, Play, Trash2, Undo2 } from "lucide-react";
import { strokesUpTo, type AuthoredGlyph, type GlyphExample, type StrokePoint } from "@/lib/stroke-scoring";
import { SCRIPT_NAMES, SCRIPT_ORDER_TIP, type ScriptId } from "@/lib/scripts";

const BOX = 100;

// An authoring run is ~45 glyphs and the better part of an hour of hand
// tracing, held until now in React state alone. In dev that is one saved file
// away from gone: Vite hot-reloads the module on any edit anywhere in the app
// and the set resets silently. Persist every add, so the only way to lose a
// draft is to ask for it.
/**
 * The id prefix for each script.
 *
 * Was a free-text box. That is a quiet hazard in a session that authors 45
 * glyphs: a stray keystroke files the rest under a prefix nothing looks up, and
 * the damage only shows when the game deals an empty round.
 */
export const SCRIPT_PREFIX: Record<ScriptId, string> = {
  devanagari: "deva",
  bengali: "beng",
  gujarati: "guj",
  gurmukhi: "guru",
  tamil: "taml",
  telugu: "telu",
  kannada: "knda",
  malayalam: "mlym",
  odia: "orya",
  "perso-arabic": "arab",
  "ol-chiki": "olck",
  meitei: "mtei",
};

const DRAFT_KEY = "bolo:script-trace-author:draft:v1";

/**
 * Whether this browser will actually keep a draft.
 *
 * A write that throws was being caught and swallowed, so an author in an
 * embedded preview pane got no draft AND no warning: the failure mode this
 * whole feature exists to prevent, dressed up as working. Storage is commonly
 * blocked inside a third-party iframe, which is exactly where the Replit
 * preview runs, so probe it and say so out loud.
 */
function storageWorks(): boolean {
  try {
    const probe = `${DRAFT_KEY}:probe`;
    globalThis.localStorage?.setItem(probe, "1");
    const ok = globalThis.localStorage?.getItem(probe) === "1";
    globalThis.localStorage?.removeItem(probe);
    return ok;
  } catch {
    return false;
  }
}

function loadDraft(): AuthoredGlyph[] {
  try {
    const raw = globalThis.localStorage?.getItem(DRAFT_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as AuthoredGlyph[]) : [];
  } catch {
    // A corrupt or unreadable draft must not take the whole tool down with it.
    return [];
  }
}

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
 * Drop points that land almost on top of the previous one.
 *
 * A pointer emits far more samples than a stroke needs, and every one of them
 * ends up in a data file someone has to read. Thinning at author time keeps the
 * committed data legible without changing the shape: the scorer resamples
 * anyway, so density buys nothing downstream.
 */
function thin(pts: StrokePoint[], minGap = 2.5): StrokePoint[] {
  if (pts.length <= 2) return pts;
  const out: StrokePoint[] = [pts[0]!];
  for (const p of pts.slice(1, -1)) {
    const last = out[out.length - 1]!;
    if (Math.hypot(p.x - last.x, p.y - last.y) >= minGap) out.push(p);
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

/** `id` has to be stable and file-safe; derive it rather than ask for it. */
function deriveId(script: ScriptId, label: string, index: number): string {
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${SCRIPT_PREFIX[script]}-${slug || `glyph-${index + 1}`}`;
}

export default function ScriptTraceAuthor() {
  const [script, setScript] = useState<ScriptId>("devanagari");
  const [exWord, setExWord] = useState("");
  const [exRoman, setExRoman] = useState("");
  const [exGloss, setExGloss] = useState("");
  const [char, setChar] = useState("");
  const [label, setLabel] = useState("");
  const [strokes, setStrokes] = useState<StrokePoint[][]>([]);
  const [glyphs, setGlyphs] = useState<AuthoredGlyph[]>(loadDraft);
  const [copied, setCopied] = useState(false);
  const [saves] = useState(storageWorks);
  const [replayT, setReplayT] = useState<number | null>(null);

  const liveRef = useRef<StrokePoint[]>([]);
  const [live, setLive] = useState<StrokePoint[]>([]);
  const drawing = useRef(false);

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(DRAFT_KEY, JSON.stringify(glyphs));
    } catch {
      // Private-mode or quota failures are not worth interrupting authoring for.
    }
  }, [glyphs]);

  const canAdd = char.trim().length > 0 && strokes.length > 0;

  const json = useMemo(
    () =>
      JSON.stringify(
        glyphs.map((g) => ({
          id: g.id,
          char: g.char,
          label: g.label,
          strokes: g.strokes.map((s) => s.map((p) => ({ x: +p.x.toFixed(1), y: +p.y.toFixed(1) }))),
          ...(g.example ? { example: g.example } : {}),
        })),
        null,
        2,
      ),
    [glyphs],
  );

  // Replays what you just drew, at the pace the learner will see it. The point
  // is to catch a wrong stroke ORDER before it is banked, which is invisible in
  // a finished drawing and expensive to find 40 glyphs later.
  useEffect(() => {
    if (replayT === null) return;
    const started = performance.now();
    const id = setInterval(() => {
      const t = (performance.now() - started) / 2200;
      if (t >= 1) {
        clearInterval(id);
        setReplayT(null);
      } else {
        setReplayT(t);
      }
    }, 40);
    return () => clearInterval(id);
    // Starts on the transition into replay, not on every frame it sets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayT === null]);

  const clearCanvas = () => {
    liveRef.current = [];
    setLive([]);
    setStrokes([]);
  };

  /** All three parts or none: half a mnemonic teaches worse than no mnemonic. */
  const exampleOf = (): GlyphExample | undefined => {
    const word = exWord.trim();
    const roman = exRoman.trim();
    const gloss = exGloss.trim();
    return word && roman && gloss ? { word, roman, gloss } : undefined;
  };

  const addGlyph = () => {
    if (!canAdd) return;
    const example = exampleOf();
    setGlyphs((g) => [
      ...g,
      {
        id: deriveId(script, label || char, g.length),
        char: char.trim(),
        label: label.trim() || char.trim(),
        strokes,
        ...(example ? { example } : {}),
      },
    ]);
    setChar("");
    setLabel("");
    setExWord("");
    setExRoman("");
    setExGloss("");
    clearCanvas();
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
          <h1 className="text-lg font-extrabold text-foreground">Stroke authoring</h1>
          <p className="text-xs text-muted-foreground">
            Trace each letter once, in writing order. Export when the set is done.
          </p>
        </div>
      </header>

      {/* Loud, because the alternative is an hour of tracing that evaporates on
          a refresh with nothing having warned anyone. */}
      {!saves ? (
        <div
          data-testid="author-no-save"
          className="mb-3 flex gap-2 rounded-xl border-2 p-3"
          style={{ borderColor: "#EF4444" }}
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "#EF4444" }} />
          <p className="text-xs font-bold text-foreground">
            This browser is not keeping your draft. Anything you trace here is
            lost on a refresh.
            <span className="block pt-1 font-normal text-muted-foreground">
              Storage is blocked inside an embedded preview pane. Open this page
              in its own browser tab and the warning goes away.
            </span>
          </p>
        </div>
      ) : (
        <p data-testid="author-saves" className="mb-3 text-xs text-muted-foreground">
          Draft is kept in this browser. A refresh will not lose your work.
        </p>
      )}

      <div className="flex gap-2 pb-3">
        <select
          value={script}
          onChange={(e) => setScript(e.target.value as ScriptId)}
          aria-label="Alphabet"
          data-testid="author-script"
          className="w-36 rounded-xl border-2 border-border bg-card px-3 py-2 text-sm font-bold text-foreground"
        >
          {(Object.keys(SCRIPT_NAMES) as ScriptId[]).map((id) => (
            <option key={id} value={id}>
              {SCRIPT_NAMES[id]}
            </option>
          ))}
        </select>
        <input
          value={char}
          onChange={(e) => setChar(e.target.value)}
          aria-label="The character"
          data-testid="author-char"
          className="w-20 rounded-xl border-2 border-border bg-card px-3 py-2 text-center text-2xl text-foreground"
          placeholder="क"
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          aria-label="Romanised label"
          data-testid="author-label"
          className="flex-1 rounded-xl border-2 border-border bg-card px-3 py-2 text-sm font-bold text-foreground"
          placeholder="ka"
        />
      </div>

      {/* The mnemonic a letter is actually taught with: क से कमल. Optional, but
          a glyph without one reaches the learner as a bare sound. */}
      <div className="flex gap-2 pb-3">
        <input
          value={exWord}
          onChange={(e) => setExWord(e.target.value)}
          aria-label="Example word in the script"
          data-testid="author-ex-word"
          className="w-24 rounded-xl border-2 border-border bg-card px-3 py-2 text-center text-lg text-foreground"
          placeholder="कमल"
        />
        <input
          value={exRoman}
          onChange={(e) => setExRoman(e.target.value)}
          aria-label="Example word romanised"
          data-testid="author-ex-roman"
          className="flex-1 rounded-xl border-2 border-border bg-card px-3 py-2 text-sm font-bold text-foreground"
          placeholder="kamal"
        />
        <input
          value={exGloss}
          onChange={(e) => setExGloss(e.target.value)}
          aria-label="Example word in English"
          data-testid="author-ex-gloss"
          className="flex-1 rounded-xl border-2 border-border bg-card px-3 py-2 text-sm font-bold text-foreground"
          placeholder="lotus"
        />
      </div>

      <svg
        viewBox={`0 0 ${BOX} ${BOX}`}
        data-testid="author-canvas"
        className="aspect-square w-full touch-none rounded-2xl border-2 border-border bg-card"
        onPointerDown={(e) => {
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
          const finished = thin(liveRef.current);
          liveRef.current = [];
          setLive([]);
          if (finished.length > 1) setStrokes((s) => [...s, finished]);
        }}
        onPointerCancel={() => {
          drawing.current = false;
          liveRef.current = [];
          setLive([]);
        }}
      >
        {/* The real letterform, faint, as a TRACING REFERENCE. Using the font
            to look at is correct; using it as stroke data is the mistake this
            whole tool exists to undo. */}
        {char.trim() && (
          <text
            x={BOX / 2}
            y={BOX * 0.78}
            textAnchor="middle"
            className="fill-muted-foreground"
            style={{ fontSize: BOX * 0.8, opacity: 0.15 }}
          >
            {char.trim()}
          </text>
        )}

        {(replayT !== null ? strokesUpTo(strokes, replayT) : [...strokes, live]).map((s, i) => (
          <g key={i}>
            <path
              d={toPath(s)}
              fill="none"
              stroke="currentColor"
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-foreground"
            />
            {s.length > 0 && i < strokes.length && (
              <>
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
              </>
            )}
          </g>
        ))}
      </svg>

      <div className="flex gap-2 pt-3">
        <button
          onClick={() => setStrokes((s) => s.slice(0, -1))}
          data-testid="author-undo"
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-border bg-card py-2.5 text-sm font-bold"
        >
          <Undo2 className="h-4 w-4" /> Undo
        </button>
        <button
          onClick={() => setReplayT(0)}
          disabled={strokes.length === 0 || replayT !== null}
          data-testid="author-replay"
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-border bg-card py-2.5 text-sm font-bold disabled:opacity-40"
        >
          <Play className="h-4 w-4" /> Replay
        </button>
        <button
          onClick={clearCanvas}
          data-testid="author-clear"
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-border bg-card py-2.5 text-sm font-bold"
        >
          <Eraser className="h-4 w-4" /> Clear
        </button>
        <button
          onClick={addGlyph}
          disabled={!canAdd}
          data-testid="author-add"
          className="flex flex-[1.4] items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-black text-white disabled:opacity-40"
          style={{ background: "hsl(var(--primary))" }}
        >
          <Check className="h-4 w-4" /> Add glyph
        </button>
      </div>

      <p className="pt-2 text-xs text-muted-foreground">
        {strokes.length === 0 ? (
          <>
            Draw the first stroke.{" "}
            <span data-testid="author-order-tip" className="font-bold text-foreground">
              {SCRIPT_ORDER_TIP[script]}
            </span>
          </>
        ) : (
          `${strokes.length} stroke${strokes.length === 1 ? "" : "s"} recorded.`
        )}
      </p>

      {glyphs.length > 0 && (
        <section className="mt-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-foreground">
              {glyphs.length} glyph{glyphs.length === 1 ? "" : "s"} authored
            </h2>
            <button
              data-testid="author-copy"
              onClick={() => {
                void navigator.clipboard?.writeText(json);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="flex items-center gap-1.5 rounded-lg border-2 border-border bg-card px-3 py-1.5 text-xs font-bold"
            >
              <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy JSON"}
            </button>
          </div>

          <ul className="mt-2 divide-y divide-border rounded-xl border-2 border-border bg-card">
            {glyphs.map((g, i) => (
              <li key={g.id} className="flex items-center gap-3 px-3 py-2">
                <span className="text-xl text-foreground">{g.char}</span>
                <span className="flex-1 text-xs font-bold text-muted-foreground">
                  {g.label} · {g.strokes.length} strokes
                </span>
                <button
                  aria-label={`Remove ${g.label}`}
                  data-testid={`author-remove-${g.id}`}
                  onClick={() => setGlyphs((gs) => gs.filter((_, j) => j !== i))}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>

          <textarea
            readOnly
            data-testid="author-json"
            value={json}
            className="mt-3 h-40 w-full rounded-xl border-2 border-border bg-card p-3 font-mono text-[11px] text-foreground"
          />
        </section>
      )}
    </div>
  );
}
