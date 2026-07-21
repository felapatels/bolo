import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Redirect } from "wouter";
import { ArrowLeft, ChevronRight, RotateCcw, CheckCircle2, XCircle, Trophy, Play } from "lucide-react";
import { Link } from "wouter";
import { useEntitlements } from "@/lib/entitlements";
import { useLanguage } from "@/lib/language-context";
import { BottomNav } from "@/components/layout/bottom-nav";
import { cn } from "@/lib/utils";
import {
  SCRIPT_TRACE_CHAPTERS,
  type TraceChapter,
  type TraceCharacter,
  type ChapterStage,
} from "@/data/script-trace-chapters";

// ── Accuracy scoring ─────────────────────────────────────────────────────────

type Point = { x: number; y: number };

/** Sample N evenly-spaced points along a polyline. */
function samplePath(points: Point[], n: number): Point[] {
  if (points.length === 0) return [];
  if (points.length === 1) return Array(n).fill(points[0]);

  // Total length
  let total = 0;
  const segs: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    segs.push(d);
    total += d;
  }

  if (total === 0) return Array(n).fill(points[0]);

  const result: Point[] = [];
  let dist = 0;
  let seg = 0;
  let segDist = 0;

  for (let i = 0; i < n; i++) {
    const target = (i / (n - 1)) * total;
    while (seg < segs.length - 1 && segDist + segs[seg] < target) {
      segDist += segs[seg];
      seg++;
    }
    const t = segs[seg] > 0 ? (target - segDist) / segs[seg] : 0;
    result.push({
      x: points[seg].x + t * (points[seg + 1].x - points[seg].x),
      y: points[seg].y + t * (points[seg + 1].y - points[seg].y),
    });
  }
  return result;
}

/** Parse an SVG path string into one polyline per subpath (per M command). */
function parseSvgSubpaths(d: string): Point[][] {
  const subpaths: Point[][] = [];
  let points: Point[] = [];
  const cmds = d.trim().match(/[MLQC][^MLQC]*/g) ?? [];
  let cx = 0, cy = 0;

  for (const cmd of cmds) {
    const type = cmd[0];
    const nums = cmd
      .slice(1)
      .trim()
      .split(/[\s,]+/)
      .map(Number);

    if (type === "M") {
      if (points.length > 0) subpaths.push(points);
      points = [];
      cx = nums[0]; cy = nums[1];
      points.push({ x: cx, y: cy });
    } else if (type === "L") {
      cx = nums[0]; cy = nums[1];
      points.push({ x: cx, y: cy });
    } else if (type === "Q") {
      // Quadratic bezier — sample 20 intermediate points
      const [qx1, qy1, qx2, qy2] = nums;
      for (let t = 0; t <= 1; t += 0.05) {
        const x = (1 - t) ** 2 * cx + 2 * (1 - t) * t * qx1 + t ** 2 * qx2;
        const y = (1 - t) ** 2 * cy + 2 * (1 - t) * t * qy1 + t ** 2 * qy2;
        points.push({ x, y });
      }
      cx = qx2; cy = qy2;
    } else if (type === "C") {
      const [cx1, cy1, cx2, cy2, ex, ey] = nums;
      for (let t = 0; t <= 1; t += 0.05) {
        const x =
          (1 - t) ** 3 * cx +
          3 * (1 - t) ** 2 * t * cx1 +
          3 * (1 - t) * t ** 2 * cx2 +
          t ** 3 * ex;
        const y =
          (1 - t) ** 3 * cy +
          3 * (1 - t) ** 2 * t * cy1 +
          3 * (1 - t) * t ** 2 * cy2 +
          t ** 3 * ey;
        points.push({ x, y });
      }
      cx = ex; cy = ey;
    }
  }

  if (points.length > 0) subpaths.push(points);
  return subpaths;
}

/**
 * Parse an SVG path into ~`samples` evenly spaced points. Samples are
 * distributed across subpaths proportionally to their length and each subpath
 * is sampled independently, so separate glyph contours never contribute
 * phantom "connector" geometry between an M boundary and the previous point.
 */
export function parseSvgPath(d: string, samples = 80): Point[] {
  const subpaths = parseSvgSubpaths(d).filter((sp) => sp.length > 1);
  if (subpaths.length === 0) return [];
  const lengths = subpaths.map((sp) => {
    let len = 0;
    for (let i = 1; i < sp.length; i++) {
      len += Math.hypot(sp[i].x - sp[i - 1].x, sp[i].y - sp[i - 1].y);
    }
    return len;
  });
  const total = lengths.reduce((a, b) => a + b, 0);
  if (total === 0) return [subpaths[0][0]];
  const out: Point[] = [];
  subpaths.forEach((sp, i) => {
    const n = Math.max(2, Math.round((lengths[i] / total) * samples));
    out.push(...samplePath(sp, n));
  });
  return out;
}

/** Normalise a set of points so they fit inside a 0-100 box. */
function normalise(pts: Point[]): Point[] {
  if (pts.length === 0) return [];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const range = Math.max(maxX - minX, maxY - minY, 1);
  return pts.map((p) => ({
    x: ((p.x - minX) / range) * 100,
    y: ((p.y - minY) / range) * 100,
  }));
}

/** Average nearest-point distance from every point in `from` to the set `to`. */
function avgNearestDist(from: Point[], to: Point[]): number {
  let total = 0;
  for (const p of from) {
    let minDist = Infinity;
    for (const q of to) {
      const dist = Math.hypot(p.x - q.x, p.y - q.y);
      if (dist < minDist) minDist = dist;
    }
    total += minDist;
  }
  return total / from.length;
}

/**
 * 0-100 accuracy score: higher is better.
 *
 * Guides are now closed glyph outlines extracted from the font, so the old
 * index-windowed comparison (which assumed the user traces the guide in the
 * same direction and order) no longer applies. Instead we use a symmetric
 * nearest-point (Chamfer) distance: the drawn path must stay close to the
 * outline AND cover it — taking the worse of the two directions punishes both
 * stray marks and missing sections, regardless of stroke order.
 */
export function scoreTrace(drawn: Point[], guide: Point[]): number {
  if (drawn.length < 5) return 0;
  const n = 60;
  const dNorm = normalise(samplePath(drawn, n));
  // Guide points are already sampled per-subpath by parseSvgPath — do NOT
  // resample here, or interpolation would bridge separate glyph contours.
  const gNorm = normalise(guide);
  const avgDist = Math.max(avgNearestDist(dNorm, gNorm), avgNearestDist(gNorm, dNorm));
  // avgDist of 0 = perfect, 50 = terrible (across a 100-unit space)
  return Math.max(0, Math.min(100, Math.round(100 - avgDist * 2)));
}

export const PASS_THRESHOLD = 40; // % interior coverage needed to pass

// ── Interior coverage scoring ─────────────────────────────────────────────────
//
// The old Chamfer metric compared user strokes against the *outline* of the
// filled glyph.  Font outlines are the PERIMETER of a filled shape — a stroke
// drawn naturally through the centre of a letter has high distance to the
// outline and therefore a low (wrong) score.
//
// Coverage scoring asks instead: what fraction of the character's filled
// interior did the user's strokes reach?  Drawing through the middle scores
// well; random scribbles outside the shape score poorly.

/** Cross product used by the winding-number inside test. */
function cross2(a: Point, b: Point, pt: Point): number {
  return (b.x - a.x) * (pt.y - a.y) - (pt.x - a.x) * (b.y - a.y);
}

/**
 * Winding number test over multiple polygon subpaths (nonzero fill rule,
 * matching TrueType / font-outline winding).  Returns non-zero when `pt` is
 * inside the combined shape.
 */
function windingInSubpaths(pt: Point, subpaths: Point[][]): number {
  let wn = 0;
  for (const poly of subpaths) {
    const n = poly.length;
    for (let i = 0; i < n - 1; i++) {
      const a = poly[i], b = poly[i + 1];
      if (a.y <= pt.y) {
        if (b.y > pt.y && cross2(a, b, pt) > 0) wn++;
      } else {
        if (b.y <= pt.y && cross2(a, b, pt) < 0) wn--;
      }
    }
  }
  return wn;
}

/**
 * Sample a grid of points from INSIDE the filled glyph shape using a
 * winding-number test against the parsed subpath polylines.
 * Coordinates are in the same 0-100 space as the guide SVG path.
 */
function getInteriorPoints(svgPathD: string, gridN = 16): Point[] {
  const subpaths = parseSvgSubpaths(svgPathD).filter((sp) => sp.length > 2);
  if (subpaths.length === 0) return [];
  const allPts = subpaths.flat();
  const minX = Math.min(...allPts.map((p) => p.x));
  const maxX = Math.max(...allPts.map((p) => p.x));
  const minY = Math.min(...allPts.map((p) => p.y));
  const maxY = Math.max(...allPts.map((p) => p.y));
  const interior: Point[] = [];
  for (let i = 0; i <= gridN; i++) {
    for (let j = 0; j <= gridN; j++) {
      const x = minX + (maxX - minX) * (i / gridN);
      const y = minY + (maxY - minY) * (j / gridN);
      if (windingInSubpaths({ x, y }, subpaths) !== 0) interior.push({ x, y });
    }
  }
  return interior;
}

/**
 * For text-mode characters (guide = ""), use an offscreen canvas to find which
 * grid points fall on actual rendered text pixels (accurate for any Unicode char).
 * Falls back to a centre-region grid if the canvas API is unavailable.
 */
function getTextInteriorPoints(char: string, gridN = 14): Point[] {
  try {
    const offscreen = document.createElement("canvas");
    offscreen.width = 100;
    offscreen.height = 100;
    const ctx = offscreen.getContext("2d");
    if (!ctx) return getTextFallbackPoints(gridN);
    ctx.fillStyle = "black";
    ctx.font = "bold 45px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(char, 50, 50);
    const { data } = ctx.getImageData(0, 0, 100, 100);
    const pts: Point[] = [];
    for (let i = 0; i <= gridN; i++) {
      for (let j = 0; j <= gridN; j++) {
        const px = Math.round((i / gridN) * 99);
        const py = Math.round((j / gridN) * 99);
        if (data[(py * 100 + px) * 4 + 3] > 64) {
          pts.push({ x: (i / gridN) * 100, y: (j / gridN) * 100 });
        }
      }
    }
    return pts.length > 4 ? pts : getTextFallbackPoints(gridN);
  } catch {
    return getTextFallbackPoints(gridN);
  }
}

function getTextFallbackPoints(gridN = 10): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= gridN; i++)
    for (let j = 0; j <= gridN; j++)
      pts.push({ x: 10 + (i / gridN) * 80, y: 18 + (j / gridN) * 58 });
  return pts;
}

/** In 0-100 canvas units: how close a stroke must come to "cover" a ref point. */
const COVERAGE_TOLERANCE = 9;

/**
 * Coverage score (0-100): fraction of interior reference points reached by
 * at least one user stroke point within COVERAGE_TOLERANCE.
 */
export function scoreCoverage(strokes: Point[][], referencePoints: Point[]): number {
  if (referencePoints.length === 0 || strokes.length === 0) return 0;
  const allPts = strokes.flat();
  if (allPts.length < 3) return 0;
  let covered = 0;
  outer: for (const ref of referencePoints) {
    for (const pt of allPts) {
      if (Math.hypot(pt.x - ref.x, pt.y - ref.y) < COVERAGE_TOLERANCE) {
        covered++;
        continue outer;
      }
    }
  }
  return Math.round((covered / referencePoints.length) * 100);
}

// ── Animation helper ───────────────────────────────────────────────────────────

/**
 * Split the composite guide path into individual per-stroke subpath strings.
 * Each returned string is one closed stroke shape (starts with M, self-contained).
 */
function splitGuideSubpaths(d: string): string[] {
  return d.split(/(?=M )/).filter((s) => s.trim().length > 0);
}

/**
 * Build a boustrophedon (snake-scan) set of paths through interior reference points.
 * Groups points into horizontal rows (within ±4 units of Y), alternating L→R and
 * R→L so the animated "pen" sweeps continuously through the character's interior —
 * instead of tracing the outer boundary of the glyph outline.
 */
function buildScanlinePaths(pts: Point[]): Array<{ d: string; length: number }> {
  if (pts.length === 0) return [];
  const sorted = [...pts].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: Point[][] = [];
  let row: Point[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].y - row[0].y > 4) { rows.push(row); row = []; }
    row.push(sorted[i]);
  }
  if (row.length > 0) rows.push(row);

  return rows.map((r, i) => {
    const ordered = i % 2 === 0
      ? [...r].sort((a, b) => a.x - b.x)
      : [...r].sort((a, b) => b.x - a.x);
    let d = `M ${ordered[0].x} ${ordered[0].y}`;
    let length = 0;
    for (let j = 1; j < ordered.length; j++) {
      length += Math.hypot(ordered[j].x - ordered[j - 1].x, ordered[j].y - ordered[j - 1].y);
      d += ` L ${ordered[j].x} ${ordered[j].y}`;
    }
    if (ordered.length === 1) { d += ` L ${ordered[0].x + 0.5} ${ordered[0].y}`; length = 0.5; }
    return { d, length: Math.max(length, 0.5) };
  });
}

// ── Language → chapter mapping ────────────────────────────────────────────────

/** Maps a language code to the Script Trace chapter IDs for its script. */
const LANG_CHAPTER_IDS: Record<string, string[]> = {
  // Gujarati
  gu:  ["gujarati-vowels", "gujarati-consonants", "gujarati-words", "gujarati-sentences"],
  // Devanagari script languages
  hi:  ["hindi-vowels", "hindi-consonants", "hindi-words", "hindi-sentences"],
  mr:  ["hindi-vowels", "hindi-consonants", "hindi-words", "hindi-sentences"],
  ne:  ["hindi-vowels", "hindi-consonants", "hindi-words", "hindi-sentences"],
  sa:  ["hindi-vowels", "hindi-consonants", "hindi-words", "hindi-sentences"],
  mai: ["hindi-vowels", "hindi-consonants", "hindi-words", "hindi-sentences"],
  kok: ["hindi-vowels", "hindi-consonants", "hindi-words", "hindi-sentences"],
  doi: ["hindi-vowels", "hindi-consonants", "hindi-words", "hindi-sentences"],
  brx: ["hindi-vowels", "hindi-consonants", "hindi-words", "hindi-sentences"],
  // Bengali / Assamese
  bn:  ["bengali-vowels", "bengali-consonants", "bengali-words", "bengali-sentences"],
  as:  ["bengali-vowels", "bengali-consonants", "bengali-words", "bengali-sentences"],
  // Punjabi / Gurmukhi
  pa:  ["gurmukhi-vowels", "gurmukhi-consonants", "gurmukhi-words", "gurmukhi-sentences"],
  // Odia
  or:  ["odia-vowels", "odia-consonants", "odia-words", "odia-sentences"],
  // Tamil
  ta:  ["tamil-vowels", "tamil-consonants", "tamil-words", "tamil-sentences"],
  // Telugu
  te:  ["telugu-vowels", "telugu-consonants", "telugu-words", "telugu-sentences"],
  // Kannada
  kn:  ["kannada-vowels", "kannada-consonants", "kannada-words", "kannada-sentences"],
  // Malayalam
  ml:  ["malayalam-vowels", "malayalam-consonants", "malayalam-words", "malayalam-sentences"],
  // Urdu / Sindhi / Kashmiri (Nastaliq)
  ur:  ["urdu-letters", "urdu-words", "urdu-sentences"],
  sd:  ["urdu-letters", "sindhi-additional", "urdu-words", "urdu-sentences"],
  ks:  ["urdu-letters", "kashmiri-additional", "urdu-words", "urdu-sentences"],
  // Santali / Ol Chiki
  sat: ["olchiki-vowels", "olchiki-consonants", "olchiki-words", "olchiki-sentences"],
  // Meitei / Meitei Mayek
  mni: ["meitei-letters", "meitei-words", "meitei-sentences"],
};

function chaptersForLang(langCode: string): TraceChapter[] {
  const ids = LANG_CHAPTER_IDS[langCode] ?? [];
  return SCRIPT_TRACE_CHAPTERS.filter((c) => ids.includes(c.id));
}

// ── Chapter selection ─────────────────────────────────────────────────────────

const STAGE_LABELS: Record<ChapterStage, string> = {
  alphabet: "🔤 Alphabet",
  words: "📝 Words",
  sentences: "💬 Phrases",
  "full-sentences": "📖 Full Sentences",
};
const STAGE_ORDER: ChapterStage[] = ["alphabet", "words", "sentences", "full-sentences"];

function ChapterGrid({
  onSelect,
}: {
  onSelect: (chapter: TraceChapter) => void;
}) {
  const { activeLang, activeLanguage } = useLanguage();
  const chapters = chaptersForLang(activeLang);

  // Group by stage in display order
  const grouped = STAGE_ORDER.flatMap((stage) => {
    const stageChapters = chapters.filter((c) => c.stage === stage);
    return stageChapters.length > 0 ? [{ stage, chapters: stageChapters }] : [];
  });

  return (
    <div className="min-h-[100dvh] bg-background pb-24 lg:pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4 lg:px-6">
          <Link href="/games">
            <button className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card hover:bg-muted transition-colors">
              <ArrowLeft className="h-4 w-4 text-foreground" />
            </button>
          </Link>
          <div>
            <h1 className="text-xl font-extrabold leading-none tracking-tight text-foreground">
              Script Trace
            </h1>
            <p className="text-sm text-muted-foreground">
              {chapters.length > 0
                ? "Choose a chapter to practice"
                : activeLanguage?.name ?? activeLang}
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 pt-6 lg:px-6">
        {chapters.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <span className="text-3xl">✏️</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Coming soon</h2>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                Script Trace for {activeLanguage?.name ?? activeLang} is on its way.
                Switch to Gujarati or Hindi to practise now.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {grouped.map(({ stage, chapters: stageChapters }) => (
              <div key={stage}>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {STAGE_LABELS[stage]}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {stageChapters.map((chapter) => (
                    <button
                      key={chapter.id}
                      onClick={() => onSelect(chapter)}
                      className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-left transition-all hover:border-primary/30 hover:bg-muted/40 hover:shadow-md active:scale-[0.98]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-3xl font-bold text-foreground" style={{ fontFamily: "serif", lineHeight: 1 }}>
                          {chapter.characters[0]?.char}
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground">{chapter.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          {chapter.characters.length} {stage === "alphabet" ? "characters" : "items"} · {chapter.scriptName} script
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

// ── Canvas tracing component ──────────────────────────────────────────────────

const ANIM_DURATION_MS = 2200;

function ScriptTraceCanvas({
  character,
  onResult,
  guidePoints,
  interiorPoints,
}: {
  character: TraceCharacter;
  onResult: (score: number, passed: boolean) => void;
  guidePoints: Point[];
  interiorPoints: Point[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawnRef = useRef<Point[]>([]);
  const isDrawingRef = useRef(false);
  // All strokes the user has drawn so far (completed pen-down → pen-up segments).
  // Kept across finger/mouse lifts so multi-stroke characters work correctly.
  const allStrokesRef = useRef<Point[][]>([]);
  // Pending debounce timer: score fires 1.2 s after the last stroke ends.
  const scoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [pulseGuide, setPulseGuide] = useState(false);
  // Amber dots overlaid on uncovered regions after a failed attempt.
  const failedPointsRef = useRef<Point[] | null>(null);
  // Live coverage percentage shown below the canvas while drawing.
  const [liveCoverage, setLiveCoverage] = useState<number | null>(null);
  const lastCoverageTimeRef = useRef<number>(0);
  const PRIMARY = "#6366f1";

  // ── Stroke-order animation state ──
  // RAF progress refs
  const animFrameRef = useRef<number | null>(null);
  const animStartRef = useRef<number | null>(null);
  const animProgressRef = useRef<number | null>(0); // null = not playing
  const [isAnimating, setIsAnimating] = useState(false);

  // Build scanline paths through the character's interior for the demo animation.
  // Sweeps row-by-row so the animated pen moves inside the letter, not around its edge.
  const scanlinePaths = useMemo(
    () => buildScanlinePaths(interiorPoints),
    [interiorPoints],
  );

  const getPos = (e: MouseEvent | TouchEvent, rect: DOMRect): Point => {
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  };

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    // Snapshot refs so the rest of this function sees consistent values
    const isDrawing = isDrawingRef.current;
    const hasStrokes = allStrokesRef.current.length > 0 || isDrawing;

    ctx.clearRect(0, 0, W, H);

    // Draw guide: filled glyph path when available (guide has SVG path data),
    // or the character rendered as large text for text-mode chapters (guide="").
    if (character.guide) {
      ctx.save();
      ctx.scale(W / 100, H / 100);
      const glyph = new Path2D(character.guide);
      ctx.globalAlpha = pulseGuide ? 0.6 : 0.35;
      ctx.fillStyle = pulseGuide ? "#f59e0b" : "#64748b";
      ctx.fill(glyph, "nonzero");
      ctx.restore();
    } else {
      // Text-mode: render the character(s) as large guide text to trace over
      ctx.save();
      ctx.globalAlpha = pulseGuide ? 0.50 : 0.20;
      ctx.fillStyle = pulseGuide ? "#f59e0b" : "#64748b";
      const fontSize = Math.max(W * 0.45, 30);
      ctx.font = `bold ${fontSize}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(character.char, W / 2, H / 2);
      ctx.restore();
    }

    // ── Interior scanline animation ──────────────────────────────────────────────
    // Each horizontal row of the character's filled region is drawn in sequence
    // so the animated "pen" sweeps through the inside of the letter rather than
    // tracing its outer boundary.
    const animT = animProgressRef.current;
    if (animT !== null && animT > 0 && character.guide) {
      const n = scanlinePaths.length;
      if (n > 0) {
        ctx.save();
        ctx.scale(W / 100, H / 100);
        scanlinePaths.forEach(({ d, length }, idx) => {
          const segStart = idx / n;
          const segEnd = (idx + 1) / n;
          if (animT <= segStart) return;
          const segProgress = Math.min(
            (animT - segStart) / Math.max(segEnd - segStart, 0.001),
            1,
          );
          const path = new Path2D(d);
          ctx.setLineDash([length]);
          ctx.lineDashOffset = length * (1 - segProgress);
          ctx.strokeStyle = PRIMARY;
          ctx.lineWidth = 4;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.globalAlpha = 0.85;
          ctx.stroke(path);
        });
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    // ── Text-mode "writing" animation ────────────────────────────────────────
    // Progressive left-to-right reveal so the learner watches the character
    // being drawn rather than seeing a static or pulsing placeholder.
    if (animT !== null && !character.guide) {
      const fontSize = Math.max(W * 0.45, 30);
      ctx.font = `bold ${fontSize}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Compute how far across the canvas the "pen" has travelled.
      // Hold at the right edge for the last 15 % of the animation so the
      // fully-written character is visible for a moment before the guide fades.
      const revealFraction = Math.min(animT / 0.85, 1);
      const revealX = revealFraction * W;

      // Colored text revealed progressively by a left-to-right clip rect
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, revealX, H);
      ctx.clip();
      ctx.globalAlpha = 0.82;
      ctx.fillStyle = PRIMARY;
      ctx.fillText(character.char, W / 2, H / 2);
      ctx.restore();

      // Cursor dot at the leading edge — mimics a fingertip writing the word
      if (revealFraction < 1) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(revealX, H / 2, W * 0.028, 0, Math.PI * 2);
        ctx.fillStyle = PRIMARY;
        ctx.globalAlpha = 0.92;
        ctx.fill();
        ctx.restore();
      }
    }

    // ── Failed-region dots ────────────────────────────────────────────────────
    // After a failed trace, amber dots mark the interior points the user
    // didn't cover — they can see exactly where to focus on the next attempt.
    const fp = failedPointsRef.current;
    if (fp && fp.length > 0) {
      ctx.save();
      ctx.fillStyle = "#f59e0b";
      ctx.globalAlpha = 0.60;
      for (const pt of fp) {
        ctx.beginPath();
        ctx.arc((pt.x / 100) * W, (pt.y / 100) * H, W * 0.015, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // ── Start indicator ───────────────────────────────────────────────────────
    // A green dot at the approximate stroke-start position so the learner
    // knows where to put their pen. Hidden once they begin drawing.
    if (animT === null && character.guide && guidePoints.length > 0 && !hasStrokes) {
      // Use the topmost guide point (min Y) as the approximate writing start.
      // Most Indian scripts begin at the top of the character (the headline).
      const startPt = guidePoints.reduce(
        (best, p) => p.y < best.y ? p : best,
        guidePoints[0],
      );
      const cx = (startPt.x / 100) * W;
      const cy = (startPt.y / 100) * H;
      const r = W * 0.038;
      ctx.save();
      // Soft outer glow
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = "#22c55e";
      ctx.globalAlpha = 0.22;
      ctx.fill();
      // Main dot
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = "#22c55e";
      ctx.globalAlpha = 0.90;
      ctx.fill();
      // Play triangle to indicate "start here"
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = 1.0;
      ctx.font = `bold ${r * 1.1}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("▶", cx + 1, cy + 1);
      ctx.restore();
    }

    // Draw all completed strokes + the current in-progress stroke.
    // Each stroke is rendered as its own independent subpath so there is no
    // connecting line drawn between the end of one stroke and the start of the
    // next (i.e. lifting the pen between strokes renders correctly).
    const allStrokes = [...allStrokesRef.current, drawnRef.current].filter(s => s.length > 1);
    if (allStrokes.length > 0) {
      ctx.save();
      ctx.strokeStyle = PRIMARY;
      ctx.lineWidth = W * 0.045;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const stroke of allStrokes) {
        ctx.beginPath();
        ctx.moveTo((stroke[0].x / 100) * W, (stroke[0].y / 100) * H);
        for (let i = 1; i < stroke.length; i++) {
          ctx.lineTo((stroke[i].x / 100) * W, (stroke[i].y / 100) * H);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }, [character.guide, character.char, pulseGuide, guidePoints, scanlinePaths]);

  // Start the stroke-order animation
  const startAnim = useCallback(() => {
    if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
    animProgressRef.current = 0;
    animStartRef.current = null;
    setIsAnimating(true);

    const tick = (ts: number) => {
      if (animStartRef.current === null) animStartRef.current = ts;
      const elapsed = ts - animStartRef.current;
      const progress = Math.min(elapsed / ANIM_DURATION_MS, 1);
      animProgressRef.current = progress;
      drawCanvas();
      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        // Hold the completed trail briefly then clear
        setTimeout(() => {
          animProgressRef.current = null;
          setIsAnimating(false);
          drawCanvas();
        }, 600);
      }
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, [drawCanvas]);

  // Auto-play on mount
  useEffect(() => {
    startAnim();
    return () => {
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only on mount (character key resets the whole component)

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas, hasDrawn, pulseGuide]);

  // Set canvas resolution
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const size = canvas.getBoundingClientRect();
      canvas.width = size.width * window.devicePixelRatio;
      canvas.height = size.height * window.devicePixelRatio;
      drawCanvas();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [drawCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const stopAnim = () => {
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
      animProgressRef.current = null;
      setIsAnimating(false);
    };

    const onStart = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      stopAnim();
      // Cancel any pending score debounce — user is adding another stroke.
      if (scoreTimerRef.current !== null) {
        clearTimeout(scoreTimerRef.current);
        scoreTimerRef.current = null;
      }
      const rect = canvas.getBoundingClientRect();
      isDrawingRef.current = true;
      drawnRef.current = [getPos(e, rect)];
      setPulseGuide(false);
      setHasDrawn(true);
      // allStrokesRef is intentionally preserved so previous strokes stay visible.
    };

    const onMove = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      if (!isDrawingRef.current) return;
      const rect = canvas.getBoundingClientRect();
      drawnRef.current.push(getPos(e, rect));
      drawCanvas();
      // Throttled live coverage update (at most every 150 ms).
      const now = Date.now();
      if (now - lastCoverageTimeRef.current > 150) {
        lastCoverageTimeRef.current = now;
        const partial = [...allStrokesRef.current, [...drawnRef.current]];
        setLiveCoverage(scoreCoverage(partial, interiorPoints));
      }
    };

    const onEnd = () => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;

      // Stash the completed stroke so it stays visible when the user lifts.
      if (drawnRef.current.length >= 2) {
        allStrokesRef.current = [...allStrokesRef.current, [...drawnRef.current]];
      }
      drawnRef.current = [];
      drawCanvas();

      // Debounce: score the full accumulated drawing 1.2 s after the last lift.
      // Text-mode characters now use coverage scoring (no more auto-pass).
      if (scoreTimerRef.current !== null) clearTimeout(scoreTimerRef.current);
      scoreTimerRef.current = setTimeout(() => {
        scoreTimerRef.current = null;
        if (allStrokesRef.current.every(s => s.length < 2)) return;
        const score = scoreCoverage(allStrokesRef.current, interiorPoints);
        const passed = score >= PASS_THRESHOLD;
        setLiveCoverage(score);
        if (!passed) {
          setPulseGuide(true);
          // Mark uncovered interior points as amber dots.
          const allPts = allStrokesRef.current.flat();
          const uncovered = interiorPoints.filter(ref =>
            allPts.every(pt => Math.hypot(pt.x - ref.x, pt.y - ref.y) >= COVERAGE_TOLERANCE)
          );
          failedPointsRef.current = uncovered.length > 80
            ? uncovered.filter((_, i) => i % 2 === 0)
            : (uncovered.length > 0 ? uncovered : null);
          drawCanvas();
        } else {
          failedPointsRef.current = null;
        }
        onResult(score, passed);
      }, 1200);
    };

    canvas.addEventListener("mousedown", onStart);
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseup", onEnd);
    canvas.addEventListener("mouseleave", onEnd);
    canvas.addEventListener("touchstart", onStart, { passive: false });
    canvas.addEventListener("touchmove", onMove, { passive: false });
    canvas.addEventListener("touchend", onEnd);

    return () => {
      canvas.removeEventListener("mousedown", onStart);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseup", onEnd);
      canvas.removeEventListener("mouseleave", onEnd);
      canvas.removeEventListener("touchstart", onStart);
      canvas.removeEventListener("touchmove", onMove);
      canvas.removeEventListener("touchend", onEnd);
      if (scoreTimerRef.current !== null) clearTimeout(scoreTimerRef.current);
    };
  }, [guidePoints, onResult, drawCanvas, interiorPoints]);

  const handleReset = () => {
    if (scoreTimerRef.current !== null) {
      clearTimeout(scoreTimerRef.current);
      scoreTimerRef.current = null;
    }
    allStrokesRef.current = [];
    drawnRef.current = [];
    setPulseGuide(false);
    setHasDrawn(false);
    failedPointsRef.current = null;
    setLiveCoverage(null);
    lastCoverageTimeRef.current = 0;
    drawCanvas();
  };

  return (
    <div className="relative flex flex-col items-center gap-4">
      {/* Character display */}
      <div className="flex flex-col items-center gap-1">
        <span className="text-8xl font-bold text-foreground" style={{ fontFamily: "serif", lineHeight: 1.1 }}>
          {character.char}
        </span>
        <span className="text-sm text-muted-foreground font-medium">/{character.label}/</span>
      </div>

      {/* Trace hint / animation state */}
      {isAnimating ? (
        <p className="text-xs font-medium text-primary/80">
          {character.guide ? 'Watch where the pen moves…' : 'Study this shape, then trace it'}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {character.guide && !hasDrawn ? 'Start at the green dot' : 'Trace the character'}
        </p>
      )}

      {/* Canvas */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="h-64 w-64 cursor-crosshair touch-none rounded-2xl border-2 border-border bg-muted/20 sm:h-72 sm:w-72"
          style={{ imageRendering: "pixelated" }}
        />
        {!hasDrawn && !isAnimating && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="text-xs text-muted-foreground/60">Start tracing here</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Clear
        </button>
        <button
          onClick={startAnim}
          disabled={isAnimating}
          className="flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Play className="h-3.5 w-3.5" />
          {isAnimating ? "Playing…" : "Watch again"}
        </button>
      </div>

      {/* Live coverage feedback — shown while drawing and after scoring */}
      {liveCoverage !== null && (
        <p className={`text-xs font-semibold ${liveCoverage >= PASS_THRESHOLD ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
          {liveCoverage}% covered{liveCoverage >= PASS_THRESHOLD ? " ✓" : ""}
        </p>
      )}
    </div>
  );
}

// ── Session screen ────────────────────────────────────────────────────────────

type SessionResult = { score: number; passed: boolean } | null;

function TraceSession({
  chapter,
  onBack,
}: {
  chapter: TraceChapter;
  onBack: () => void;
}) {
  const [charIndex, setCharIndex] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [result, setResult] = useState<SessionResult>(null);
  const [passedSet, setPassedSet] = useState<Set<string>>(new Set());
  const [sessionDone, setSessionDone] = useState(false);

  const character = chapter.characters[charIndex];
  const guidePoints = character ? parseSvgPath(character.guide) : [];
  const interiorPoints = useMemo(
    () => character
      ? character.guide
        ? getInteriorPoints(character.guide)
        : getTextInteriorPoints(character.char)
      : [],
    [character],
  );

  const handleResult = useCallback(
    (score: number, passed: boolean) => {
      setResult({ score, passed });
      if (passed && character) {
        setPassedSet((prev) => new Set([...prev, character.id]));
        // Persist to server (fire-and-forget; don't block UX)
        fetch("/api/games/script-trace/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            chapter: chapter.id,
            characterId: character.id,
            passed: true,
            score,
          }),
        }).catch(() => {/* best-effort */});
      }
    },
    [character, chapter.id],
  );

  const handleNext = () => {
    if (charIndex >= chapter.characters.length - 1) {
      setSessionDone(true);
    } else {
      setCharIndex((i) => i + 1);
      setRetryCount(0);
      setResult(null);
    }
  };

  const handleRetry = () => {
    setResult(null);
    setRetryCount((c) => c + 1);
  };

  if (sessionDone) {
    const total = chapter.characters.length;
    const passed = passedSet.size;
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <Trophy className="h-16 w-16 text-primary" />
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-foreground">
            Chapter Complete!
          </h2>
          <p className="mt-2 text-muted-foreground">
            You passed {passed} of {total} characters in {chapter.title}.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="rounded-xl border border-border bg-card px-5 py-2.5 font-semibold text-foreground hover:bg-muted transition-colors"
          >
            Choose Chapter
          </button>
          <button
            onClick={() => {
              setCharIndex(0);
              setResult(null);
              setPassedSet(new Set());
              setSessionDone(false);
            }}
            className="rounded-xl bg-primary px-5 py-2.5 font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Replay
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 px-4 pb-6">
      {/* Progress bar */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {charIndex + 1} / {chapter.characters.length}
        </span>
        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${((charIndex) / chapter.characters.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Trace canvas */}
      {character && (
        <ScriptTraceCanvas
          key={`${chapter.id}-${charIndex}-${retryCount}`}
          character={character}
          onResult={handleResult}
          guidePoints={guidePoints}
          interiorPoints={interiorPoints}
        />
      )}

      {/* Result feedback */}
      {result && (
        <div
          className={cn(
            "rounded-2xl border p-4 text-center transition-all",
            result.passed
              ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
              : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30",
          )}
        >
          <div className="flex items-center justify-center gap-2">
            {result.passed ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <XCircle className="h-5 w-5 text-amber-600" />
            )}
            <span
              className={cn(
                "font-bold",
                result.passed ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400",
              )}
            >
              {result.passed ? "Great trace!" : "Keep trying!"} — {result.score}%
            </span>
          </div>
          <div className="mt-3 flex justify-center gap-3">
            {!result.passed && (
              <button
                onClick={handleRetry}
                className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
              >
                Retry
              </button>
            )}
            <button
              onClick={result.passed ? handleNext : handleRetry}
              className={cn(
                "rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
                result.passed
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-amber-500 text-white hover:bg-amber-600",
              )}
            >
              {result.passed
                ? charIndex >= chapter.characters.length - 1
                  ? "Finish"
                  : "Next Character"
                : "Try Again"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page root ─────────────────────────────────────────────────────────────────

export default function ScriptTracePage() {
  const { isPlus, isLoading } = useEntitlements();
  const [activeChapter, setActiveChapter] = useState<TraceChapter | null>(null);

  if (!isLoading && !isPlus) {
    return <Redirect to="/upgrade" />;
  }

  if (!activeChapter) {
    return <ChapterGrid onSelect={setActiveChapter} />;
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-4">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4 lg:px-6">
          <button
            onClick={() => setActiveChapter(null)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-extrabold leading-none tracking-tight text-foreground">
              {activeChapter.title}
            </h1>
            <p className="text-sm text-muted-foreground">{activeChapter.scriptName} script</p>
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-2xl flex-col pt-6">
        <TraceSession chapter={activeChapter} onBack={() => setActiveChapter(null)} />
      </div>
    </div>
  );
}
