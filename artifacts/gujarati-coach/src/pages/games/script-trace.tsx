import { useState, useRef, useEffect, useCallback } from "react";
import { Redirect } from "wouter";
import { ArrowLeft, ChevronRight, RotateCcw, CheckCircle2, XCircle, Trophy } from "lucide-react";
import { Link } from "wouter";
import { useEntitlements } from "@/lib/entitlements";
import { BottomNav } from "@/components/layout/bottom-nav";
import { cn } from "@/lib/utils";
import {
  SCRIPT_TRACE_CHAPTERS,
  type TraceChapter,
  type TraceCharacter,
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

/** Parse an SVG path string into a polyline of sampled points. */
function parseSvgPath(d: string, samples = 80): Point[] {
  const points: Point[] = [];
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

  return samplePath(points, samples);
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

/** 0-100 accuracy score: higher is better. */
function scoreTrace(drawn: Point[], guide: Point[]): number {
  if (drawn.length < 5) return 0;
  const n = 60;
  const dNorm = normalise(samplePath(drawn, n));
  const gNorm = normalise(samplePath(guide, n));

  // Average nearest-point distance between the two point sets
  let total = 0;
  for (let i = 0; i < n; i++) {
    const d = dNorm[i];
    let minDist = Infinity;
    for (let j = Math.max(0, i - 10); j < Math.min(n, i + 10); j++) {
      const dist = Math.hypot(d.x - gNorm[j].x, d.y - gNorm[j].y);
      if (dist < minDist) minDist = dist;
    }
    total += minDist;
  }
  const avgDist = total / n;
  // avgDist of 0 = perfect, 50 = terrible (across a 100-unit space)
  const score = Math.max(0, Math.min(100, Math.round(100 - avgDist * 2)));
  return score;
}

const PASS_THRESHOLD = 70;

// ── Chapter selection ─────────────────────────────────────────────────────────

function ChapterGrid({
  onSelect,
}: {
  onSelect: (chapter: TraceChapter) => void;
}) {
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
            <p className="text-sm text-muted-foreground">Choose a chapter to practice</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 pt-6 lg:px-6">
        <div className="grid gap-3 sm:grid-cols-2">
          {SCRIPT_TRACE_CHAPTERS.map((chapter) => (
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
                  {chapter.characters.length} characters · {chapter.scriptName} script
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}

// ── Canvas tracing component ──────────────────────────────────────────────────

function ScriptTraceCanvas({
  character,
  onResult,
  guidePoints,
}: {
  character: TraceCharacter;
  onResult: (score: number, passed: boolean) => void;
  guidePoints: Point[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawnRef = useRef<Point[]>([]);
  const isDrawingRef = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [pulseGuide, setPulseGuide] = useState(false);
  const PRIMARY = "#6366f1";

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

    ctx.clearRect(0, 0, W, H);

    // Draw guide path (faint)
    if (guidePoints.length > 1) {
      ctx.save();
      ctx.strokeStyle = pulseGuide ? "#f59e0b" : "#d1d5db";
      ctx.lineWidth = W * 0.05;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo((guidePoints[0].x / 100) * W, (guidePoints[0].y / 100) * H);
      for (let i = 1; i < guidePoints.length; i++) {
        ctx.lineTo((guidePoints[i].x / 100) * W, (guidePoints[i].y / 100) * H);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Draw user's traced path
    const drawn = drawnRef.current;
    if (drawn.length > 1) {
      ctx.save();
      ctx.strokeStyle = PRIMARY;
      ctx.lineWidth = W * 0.045;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo((drawn[0].x / 100) * W, (drawn[0].y / 100) * H);
      for (let i = 1; i < drawn.length; i++) {
        ctx.lineTo((drawn[i].x / 100) * W, (drawn[i].y / 100) * H);
      }
      ctx.stroke();
      ctx.restore();
    }
  }, [guidePoints, pulseGuide]);

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

    const onStart = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      isDrawingRef.current = true;
      drawnRef.current = [getPos(e, rect)];
      setPulseGuide(false);
      setHasDrawn(true);
    };

    const onMove = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      if (!isDrawingRef.current) return;
      const rect = canvas.getBoundingClientRect();
      drawnRef.current.push(getPos(e, rect));
      drawCanvas();
    };

    const onEnd = () => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;
      const score = scoreTrace(drawnRef.current, guidePoints);
      const passed = score >= PASS_THRESHOLD;
      if (!passed) setPulseGuide(true);
      onResult(score, passed);
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
    };
  }, [guidePoints, onResult, drawCanvas]);

  const handleReset = () => {
    drawnRef.current = [];
    setPulseGuide(false);
    setHasDrawn(false);
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

      {/* Trace hint */}
      <p className="text-xs text-muted-foreground">Trace the grey outline below</p>

      {/* Canvas */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="h-64 w-64 cursor-crosshair touch-none rounded-2xl border-2 border-border bg-muted/20 sm:h-72 sm:w-72"
          style={{ imageRendering: "pixelated" }}
        />
        {!hasDrawn && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="text-xs text-muted-foreground/60">Start tracing here</p>
          </div>
        )}
      </div>

      {/* Reset button */}
      <button
        onClick={handleReset}
        className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Clear
      </button>
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
  const [result, setResult] = useState<SessionResult>(null);
  const [passedSet, setPassedSet] = useState<Set<string>>(new Set());
  const [sessionDone, setSessionDone] = useState(false);

  const character = chapter.characters[charIndex];
  const guidePoints = character ? parseSvgPath(character.guide) : [];

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
      setResult(null);
    }
  };

  const handleRetry = () => {
    setResult(null);
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
          key={`${chapter.id}-${charIndex}`}
          character={character}
          onResult={handleResult}
          guidePoints={guidePoints}
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
