import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import {
  GestureDetector,
  Gesture,
} from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import {
  SCRIPT_TRACE_CHAPTERS,
  type TraceChapter,
  type TraceCharacter,
} from '@/lib/game-data/script-trace-chapters';
import Svg, { Path as SvgPath } from 'react-native-svg';
import { recordScriptTraceProgress } from '@workspace/api-client-react';

// ── Accuracy scoring ──────────────────────────────────────────────────────────

type Point = { x: number; y: number };

function samplePath(points: Point[], n: number): Point[] {
  if (points.length === 0) return [];
  if (points.length === 1) return Array(n).fill(points[0]);
  let total = 0;
  const segs: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
    );
    segs.push(d);
    total += d;
  }
  if (total === 0) return Array(n).fill(points[0]);
  const result: Point[] = [];
  let segDist = 0;
  let seg = 0;
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

// Parse an SVG path string into one polyline per subpath (per M command).
function parseSvgSubpaths(d: string): Point[][] {
  const subpaths: Point[][] = [];
  let points: Point[] = [];
  const cmds = d.trim().match(/[MLQC][^MLQC]*/g) ?? [];
  let cx = 0,
    cy = 0;
  for (const cmd of cmds) {
    const type = cmd[0];
    const nums = cmd
      .slice(1)
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (type === 'M') {
      if (points.length > 0) subpaths.push(points);
      points = [];
      cx = nums[0];
      cy = nums[1];
      points.push({ x: cx, y: cy });
    } else if (type === 'L') {
      cx = nums[0];
      cy = nums[1];
      points.push({ x: cx, y: cy });
    } else if (type === 'Q') {
      const [qx1, qy1, qx2, qy2] = nums;
      for (let t = 0; t <= 1; t += 0.05) {
        points.push({
          x: (1 - t) ** 2 * cx + 2 * (1 - t) * t * qx1 + t ** 2 * qx2,
          y: (1 - t) ** 2 * cy + 2 * (1 - t) * t * qy1 + t ** 2 * qy2,
        });
      }
      cx = qx2;
      cy = qy2;
    } else if (type === 'C') {
      const [cx1, cy1, cx2, cy2, ex, ey] = nums;
      for (let t = 0; t <= 1; t += 0.05) {
        points.push({
          x:
            (1 - t) ** 3 * cx +
            3 * (1 - t) ** 2 * t * cx1 +
            3 * (1 - t) * t ** 2 * cx2 +
            t ** 3 * ex,
          y:
            (1 - t) ** 3 * cy +
            3 * (1 - t) ** 2 * t * cy1 +
            3 * (1 - t) * t ** 2 * cy2 +
            t ** 3 * ey,
        });
      }
      cx = ex;
      cy = ey;
    }
  }
  if (points.length > 0) subpaths.push(points);
  return subpaths;
}

// Parse an SVG path into ~`samples` evenly spaced points. Samples are
// distributed across subpaths proportionally to their length and each subpath
// is sampled independently, so separate glyph contours never contribute
// phantom "connector" geometry between an M boundary and the previous point.
function parseSvgPath(d: string, samples = 80): Point[] {
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

function normalise(pts: Point[]): Point[] {
  if (pts.length === 0) return [];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs);
  const minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const range = Math.max(maxX - minX, maxY - minY, 1);
  return pts.map((p) => ({
    x: ((p.x - minX) / range) * 100,
    y: ((p.y - minY) / range) * 100,
  }));
}

// Average nearest-point distance from every point in `from` to the set `to`.
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

// 0-100 accuracy score. Guides are closed glyph outlines extracted from the
// font, so the old index-windowed comparison (which assumed the user traces
// the guide in the same direction and order) no longer applies. Symmetric
// nearest-point (Chamfer) distance: the drawn path must stay close to the
// outline AND cover it — taking the worse of the two directions punishes
// both stray marks and missing sections, regardless of stroke order.
function scoreTrace(drawn: Point[], guide: Point[]): number {
  if (drawn.length < 5) return 0;
  const n = 60;
  const dNorm = normalise(samplePath(drawn, n));
  // Guide points are already sampled per-subpath by parseSvgPath — do NOT
  // resample here, or interpolation would bridge separate glyph contours.
  const gNorm = normalise(guide);
  const avgDist = Math.max(avgNearestDist(dNorm, gNorm), avgNearestDist(gNorm, dNorm));
  return Math.max(0, Math.min(100, Math.round(100 - avgDist * 2)));
}

// Convert an array of points to an SVG path string for live drawing.
function pointsToPath(points: Point[], size: number): string {
  if (points.length < 2) return '';
  const scale = size / 100;
  const [first, ...rest] = points;
  const start = `M ${first.x * scale},${first.y * scale}`;
  const lines = rest.map((p) => `L ${p.x * scale},${p.y * scale}`).join(' ');
  return `${start} ${lines}`;
}

const CANVAS_SIZE = Math.min(Dimensions.get('window').width - 48, 300);
const PASS_THRESHOLD = 70;
const ANIM_DURATION_MS = 2200;

// ── Animation helper ───────────────────────────────────────────────────────────

/**
 * Split the composite guide path into individual per-stroke subpath strings.
 * Each returned string is one closed stroke shape (starts with M, self-contained).
 * The fill-reveal animation paints these shapes in one at a time so the user
 * sees each ink region appear, not a dot tracing the letter's outer edge.
 */
function splitGuideSubpaths(d: string): string[] {
  return d.split(/(?=M )/).filter((s) => s.trim().length > 0);
}

// ── Chapter selection ─────────────────────────────────────────────────────────

function ChapterGrid({ onSelect }: { onSelect: (chapter: TraceChapter) => void }) {
  const colors = useColors();
  const router = useRouter();

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Script Trace</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Choose a chapter
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.chapterList}
        showsVerticalScrollIndicator={false}
      >
        {SCRIPT_TRACE_CHAPTERS.map((chapter) => (
          <TouchableOpacity
            key={chapter.id}
            onPress={() => onSelect(chapter)}
            style={[
              styles.chapterCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            activeOpacity={0.7}
          >
            <Text style={[styles.chapterChar, { color: colors.foreground }]}>
              {chapter.characters[0]?.char}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.chapterTitle, { color: colors.foreground }]}>
                {chapter.title}
              </Text>
              <Text style={[styles.chapterMeta, { color: colors.mutedForeground }]}>
                {chapter.characters.length} characters · {chapter.scriptName} script
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </Screen>
  );
}

// ── Canvas tracing ────────────────────────────────────────────────────────────

function TraceCanvas({
  character,
  onResult,
  guidePoints,
}: {
  character: TraceCharacter;
  onResult: (score: number, passed: boolean) => void;
  guidePoints: Point[];
}) {
  const colors = useColors();
  const [drawnPath, setDrawnPath] = useState('');
  // Controls whether the guide pulses amber on a failed trace.
  const [guidePulsed, setGuidePulsed] = useState(false);
  const drawnRef = useRef<Point[]>([]);
  const isDrawingRef = useRef(false);

  // ── Stroke-order animation state ──
  const animFrameRef = useRef<number | null>(null);
  const animStartRef = useRef<number | null>(null);
  // progress: null = not playing, 0–1 = playing
  const [animProgress, setAnimProgress] = useState<number | null>(0);
  const [isAnimating, setIsAnimating] = useState(false);
  // Speed: 1 = normal (ANIM_DURATION_MS), 0.5 = slow (2× longer)
  const animSpeedRef = useRef<number>(1);
  const [animSpeed, setAnimSpeed] = useState<1 | 0.5>(1);

  // Split the guide into per-stroke subpath strings for the fill-reveal animation.
  const guideSubpaths = React.useMemo(
    () => splitGuideSubpaths(character.guide),
    [character.guide],
  );

  const startAnim = useCallback(() => {
    if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
    animStartRef.current = null;
    setAnimProgress(0);
    setIsAnimating(true);

    const duration = ANIM_DURATION_MS / animSpeedRef.current;

    const tick = (ts: number) => {
      if (animStartRef.current === null) animStartRef.current = ts;
      const elapsed = ts - animStartRef.current;
      const progress = Math.min(elapsed / duration, 1);
      setAnimProgress(progress);
      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        // Hold the completed trail briefly then clear
        setTimeout(() => {
          setAnimProgress(null);
          setIsAnimating(false);
        }, 600);
        animFrameRef.current = null;
      }
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const toggleSpeed = useCallback(() => {
    const next: 1 | 0.5 = animSpeedRef.current === 1 ? 0.5 : 1;
    animSpeedRef.current = next;
    setAnimSpeed(next);
    // Restart the animation at the new speed if it's currently playing
    if (isAnimating) startAnim();
  }, [isAnimating, startAnim]);

  // Auto-play on mount
  useEffect(() => {
    startAnim();
    return () => {
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Guide is a font-accurate glyph outline in a 0-100 viewBox; render the raw
  // path data and scale it to the canvas so separate contours stay separate.
  const guideScale = CANVAS_SIZE / 100;

  // Amber pulse: show for 600ms then revert.
  const triggerPulse = useCallback(() => {
    setGuidePulsed(true);
    setTimeout(() => setGuidePulsed(false), 600);
  }, []);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onBegin((e) => {
      // Stop animation when user starts drawing
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
      setAnimProgress(null);
      setIsAnimating(false);

      isDrawingRef.current = true;
      drawnRef.current = [
        { x: (e.x / CANVAS_SIZE) * 100, y: (e.y / CANVAS_SIZE) * 100 },
      ];
      setGuidePulsed(false);
      setDrawnPath('');
    })
    .onUpdate((e) => {
      if (!isDrawingRef.current) return;
      drawnRef.current.push({
        x: (e.x / CANVAS_SIZE) * 100,
        y: (e.y / CANVAS_SIZE) * 100,
      });
      setDrawnPath(pointsToPath(drawnRef.current, CANVAS_SIZE));
    })
    .onFinalize(() => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;
      const score = scoreTrace(drawnRef.current, guidePoints);
      const passed = score >= PASS_THRESHOLD;
      if (!passed) triggerPulse();
      onResult(score, passed);
    });

  const handleClear = () => {
    drawnRef.current = [];
    setDrawnPath('');
    setGuidePulsed(false);
  };


  return (
    <View style={styles.canvasSection}>
      {/* Character display */}
      <View style={styles.charDisplay}>
        <Text style={[styles.bigChar, { color: colors.foreground }]}>
          {character.char}
        </Text>
        <Text style={[styles.charLabel, { color: colors.mutedForeground }]}>
          /{character.label}/
        </Text>
      </View>

      {isAnimating ? (
        <Text style={[styles.traceHint, { color: colors.primary }]}>
          Watch the strokes appear…
        </Text>
      ) : (
        <Text style={[styles.traceHint, { color: colors.mutedForeground }]}>
          Trace the character
        </Text>
      )}

      {/* SVG canvas with gesture detector */}
      <GestureDetector gesture={pan}>
        <View
          style={[
            styles.canvas,
            {
              borderColor: colors.border,
              backgroundColor: colors.muted + '30',
            },
          ]}
        >
          <Svg width={CANVAS_SIZE} height={CANVAS_SIZE}>
            {/* Guide path — filled glyph shape, no stroke outline.
                fillRule="nonzero" matches TrueType winding conventions so
                enclosed counters (holes in letters) render correctly. */}
            <SvgPath
              d={character.guide}
              scale={guideScale}
              fill={guidePulsed ? '#f59e0b' : colors.mutedForeground}
              fillOpacity={guidePulsed ? 0.6 : 0.35}
              fillRule="nonzero"
              stroke="none"
            />

            {/* Fill-reveal animation: each stroke shape fills in sequentially.
                Paints each ink region with primary colour one at a time so the
                user sees the strokes of the character appearing, not a dot
                travelling around the letter's outer contour edge. */}
            {animProgress !== null && guideSubpaths.map((subStr, idx) => {
              const n = guideSubpaths.length;
              const segStart = idx / n;
              const segEnd = (idx + 1) / n;
              if (animProgress <= segStart) return null;
              const alpha =
                Math.min(
                  (animProgress - segStart) / Math.max(segEnd - segStart, 0.001),
                  1,
                ) * 0.72;
              return (
                <SvgPath
                  key={idx}
                  d={subStr}
                  scale={guideScale}
                  fill={colors.primary}
                  fillOpacity={alpha}
                  fillRule="nonzero"
                  stroke="none"
                />
              );
            })}

            {/* User's traced path */}
            {drawnPath ? (
              <SvgPath
                d={drawnPath}
                stroke={colors.primary}
                strokeWidth={5}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ) : null}
          </Svg>
        </View>
      </GestureDetector>

      {/* Controls */}
      <View style={styles.controlRow}>
        <TouchableOpacity
          onPress={handleClear}
          style={[
            styles.controlBtn,
            { borderColor: colors.border, backgroundColor: colors.card },
          ]}
          activeOpacity={0.7}
        >
          <Feather name="rotate-ccw" size={14} color={colors.mutedForeground} />
          <Text style={[styles.controlText, { color: colors.mutedForeground }]}>
            Clear
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={startAnim}
          disabled={isAnimating}
          style={[
            styles.controlBtn,
            {
              borderColor: colors.primary + '60',
              backgroundColor: colors.primary + '18',
              opacity: isAnimating ? 0.4 : 1,
            },
          ]}
          activeOpacity={0.7}
        >
          <Feather name="play" size={14} color={colors.primary} />
          <Text style={[styles.controlText, { color: colors.primary }]}>
            {isAnimating ? 'Playing…' : 'Watch again'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={toggleSpeed}
          style={[
            styles.controlBtn,
            { borderColor: colors.border, backgroundColor: colors.card },
          ]}
          activeOpacity={0.7}
        >
          <Feather name="clock" size={14} color={colors.mutedForeground} />
          <Text style={[styles.controlText, { color: colors.mutedForeground }]}>
            {animSpeed === 1 ? '1×' : '½×'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
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
  const colors = useColors();
  const [charIndex, setCharIndex] = useState(0);
  const [result, setResult] = useState<SessionResult>(null);
  const [passedSet, setPassedSet] = useState<Set<string>>(new Set());
  const [sessionDone, setSessionDone] = useState(false);

  const character = chapter.characters[charIndex];
  const guidePoints = React.useMemo(
    () => (character ? parseSvgPath(character.guide) : []),
    [character],
  );

  const handleResult = useCallback(
    (score: number, passed: boolean) => {
      setResult({ score, passed });
      if (passed && character) {
        setPassedSet((prev) => new Set([...prev, character.id]));
        // Persist via the generated API client — it uses customFetch which
        // applies the configured base URL and auth token automatically, so this
        // works both on web and native without a hard-coded '/api' prefix.
        recordScriptTraceProgress({
          chapter: chapter.id as
            | 'gujarati-vowels'
            | 'gujarati-consonants'
            | 'hindi-vowels'
            | 'hindi-consonants',
          characterId: character.id,
          passed: true,
          score,
        }).catch(() => {
          /* best-effort: don't block UX on network errors */
        });
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

  const handleRetry = () => setResult(null);

  if (sessionDone) {
    const total = chapter.characters.length;
    const passed = passedSet.size;
    return (
      <View style={styles.doneContainer}>
        <Feather name="award" size={64} color={colors.primary} />
        <Text style={[styles.doneTitle, { color: colors.foreground }]}>
          Chapter Complete!
        </Text>
        <Text style={[styles.doneSubtitle, { color: colors.mutedForeground }]}>
          You passed {passed} of {total} characters in {chapter.title}.
        </Text>
        <View style={styles.doneButtons}>
          <TouchableOpacity
            onPress={onBack}
            style={[
              styles.btn,
              { borderColor: colors.border, backgroundColor: colors.card },
            ]}
            activeOpacity={0.7}
          >
            <Text style={[styles.btnText, { color: colors.foreground }]}>
              Chapters
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setCharIndex(0);
              setResult(null);
              setPassedSet(new Set());
              setSessionDone(false);
            }}
            style={[styles.btn, { backgroundColor: colors.primary }]}
            activeOpacity={0.7}
          >
            <Text style={[styles.btnText, { color: '#fff' }]}>Replay</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.session}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Progress bar */}
      <View style={styles.progressRow}>
        <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>
          {charIndex + 1} / {chapter.characters.length}
        </Text>
        <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: colors.primary,
                width: `${(charIndex / chapter.characters.length) * 100}%`,
              },
            ]}
          />
        </View>
      </View>

      {/* Trace canvas */}
      {character && (
        <TraceCanvas
          key={`${chapter.id}-${charIndex}`}
          character={character}
          onResult={handleResult}
          guidePoints={guidePoints}
        />
      )}

      {/* Result feedback */}
      {result && (
        <Animated.View
          style={[
            styles.resultCard,
            {
              backgroundColor: result.passed
                ? colors.primary + '18'
                : '#f59e0b18',
              borderColor: result.passed
                ? colors.primary + '40'
                : '#f59e0b40',
            },
          ]}
        >
          <Feather
            name={result.passed ? 'check-circle' : 'x-circle'}
            size={20}
            color={result.passed ? colors.primary : '#f59e0b'}
          />
          <Text
            style={[
              styles.resultText,
              { color: result.passed ? colors.primary : '#f59e0b' },
            ]}
          >
            {result.passed ? 'Great trace!' : 'Keep trying!'} — {result.score}%
          </Text>
          <View style={styles.resultButtons}>
            {!result.passed && (
              <TouchableOpacity
                onPress={handleRetry}
                style={[
                  styles.btn,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                  },
                ]}
                activeOpacity={0.7}
              >
                <Text style={[styles.btnText, { color: colors.foreground }]}>
                  Retry
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={result.passed ? handleNext : handleRetry}
              style={[
                styles.btn,
                {
                  backgroundColor: result.passed
                    ? colors.primary
                    : '#f59e0b',
                },
              ]}
              activeOpacity={0.7}
            >
              <Text style={[styles.btnText, { color: '#fff' }]}>
                {result.passed
                  ? charIndex >= chapter.characters.length - 1
                    ? 'Finish'
                    : 'Next'
                  : 'Try Again'}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </ScrollView>
  );
}

// ── Screen root ───────────────────────────────────────────────────────────────

export default function ScriptTraceScreen() {
  const colors = useColors();
  const router = useRouter();
  const { isPlus, isLoading } = useEntitlements();
  const [activeChapter, setActiveChapter] = useState<TraceChapter | null>(null);

  React.useEffect(() => {
    if (!isLoading && !isPlus) {
      router.replace('/(app)/paywall');
    }
  }, [isLoading, isPlus, router]);

  // While entitlements load, show the chapter grid immediately (static data).
  // The useEffect above will redirect non-Plus users once loading finishes.
  if (!isPlus && !isLoading) return null;

  if (!activeChapter) {
    return <ChapterGrid onSelect={setActiveChapter} />;
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          onPress={() => setActiveChapter(null)}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {activeChapter.title}
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {activeChapter.scriptName} script
          </Text>
        </View>
      </View>

      <TraceSession
        chapter={activeChapter}
        onBack={() => setActiveChapter(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: AppFonts.bold, fontSize: 18 },
  subtitle: { fontFamily: AppFonts.regular, fontSize: 12, marginTop: 1 },
  chapterList: { paddingHorizontal: 16, paddingBottom: TAB_BAR_CLEARANCE, gap: 10 },
  chapterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  chapterChar: { fontFamily: 'serif', fontSize: 36, width: 48, textAlign: 'center' },
  chapterTitle: { fontFamily: AppFonts.bold, fontSize: 16 },
  chapterMeta: { fontFamily: AppFonts.regular, fontSize: 13, marginTop: 2 },
  session: { paddingHorizontal: 20, paddingBottom: TAB_BAR_CLEARANCE, gap: 20 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressLabel: { fontFamily: AppFonts.semibold, fontSize: 12, width: 40 },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  canvasSection: { alignItems: 'center', gap: 12 },
  charDisplay: { alignItems: 'center', gap: 4 },
  bigChar: { fontSize: 80, fontFamily: 'serif', lineHeight: 96 },
  charLabel: { fontFamily: AppFonts.semibold, fontSize: 14 },
  traceHint: { fontFamily: AppFonts.regular, fontSize: 12 },
  canvas: {
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
    borderRadius: 20,
    borderWidth: 2,
    overflow: 'hidden',
  },
  controlRow: { flexDirection: 'row', gap: 8 },
  controlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  controlText: { fontFamily: AppFonts.semibold, fontSize: 13 },
  resultCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 10,
  },
  resultText: { fontFamily: AppFonts.bold, fontSize: 15 },
  resultButtons: { flexDirection: 'row', gap: 10 },
  btn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  btnText: { fontFamily: AppFonts.bold, fontSize: 14 },
  doneContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },
  doneTitle: {
    fontFamily: AppFonts.extrabold,
    fontSize: 26,
    textAlign: 'center',
  },
  doneSubtitle: {
    fontFamily: AppFonts.regular,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  doneButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
});
