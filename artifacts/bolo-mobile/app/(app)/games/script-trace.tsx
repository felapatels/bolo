import React, { useState, useRef, useCallback } from 'react';
import {
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
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { ChunkyButton } from '@/components/ChunkyButton';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import {
  SCRIPT_TRACE_CHAPTERS,
  type TraceChapter,
  type TraceCharacter,
} from './data/script-trace-chapters';
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

function parseSvgPath(d: string, samples = 80): Point[] {
  const points: Point[] = [];
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
  return samplePath(points, samples);
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

function scoreTrace(drawn: Point[], guide: Point[]): number {
  if (drawn.length < 5) return 0;
  const n = 60;
  const dNorm = normalise(samplePath(drawn, n));
  const gNorm = normalise(samplePath(guide, n));
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
  return Math.max(0, Math.min(100, Math.round(100 - (total / n) * 2)));
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

// ── Chapter selection ─────────────────────────────────────────────────────────

function ChapterGrid({ onSelect }: { onSelect: (chapter: TraceChapter) => void }) {
  const colors = useColors();
  const router = useRouter();

  return (
    <Screen>
      <View style={styles.header}>
        <ChunkyButton
          title=""
          icon="arrow-left"
          variant="secondary"
          onPress={() => router.back()}
          style={styles.backBtn}
        />
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
        {SCRIPT_TRACE_CHAPTERS.map((chapter, i) => (
          <Animated.View
            key={chapter.id}
            entering={FadeInDown.duration(300).delay(i * 60)}
          >
            <TouchableOpacity
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
          </Animated.View>
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
  // Controls whether the guide pulses amber on a failed trace (plain state, no
  // Animated.View inside <Svg> which is not supported by react-native-svg).
  const [guidePulsed, setGuidePulsed] = useState(false);
  const drawnRef = useRef<Point[]>([]);
  const isDrawingRef = useRef(false);

  const guidePathStr = React.useMemo(
    () =>
      guidePoints
        .map(
          (p, i) =>
            `${i === 0 ? 'M' : 'L'} ${(p.x / 100) * CANVAS_SIZE},${(p.y / 100) * CANVAS_SIZE}`,
        )
        .join(' '),
    [guidePoints],
  );

  // Amber pulse: show for 600ms then revert.
  const triggerPulse = useCallback(() => {
    setGuidePulsed(true);
    setTimeout(() => setGuidePulsed(false), 600);
  }, []);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onBegin((e) => {
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

  // Guide stroke colour flips between muted grey and amber on a failed attempt.
  const guideColor = guidePulsed ? '#f59e0b' : colors.mutedForeground;

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
      <Text style={[styles.traceHint, { color: colors.mutedForeground }]}>
        Trace the grey outline
      </Text>

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
            {/* Guide path — plain SVG element, no Animated wrapper */}
            <SvgPath
              d={guidePathStr}
              stroke={guideColor}
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={0.45}
            />
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

      {/* Clear button */}
      <TouchableOpacity
        onPress={handleClear}
        style={[
          styles.clearBtn,
          { borderColor: colors.border, backgroundColor: colors.card },
        ]}
        activeOpacity={0.7}
      >
        <Feather name="rotate-ccw" size={14} color={colors.mutedForeground} />
        <Text style={[styles.clearText, { color: colors.mutedForeground }]}>
          Clear
        </Text>
      </TouchableOpacity>
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
          entering={FadeInDown.duration(250)}
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
  const { isPlus } = useEntitlements();
  const [activeChapter, setActiveChapter] = useState<TraceChapter | null>(null);

  React.useEffect(() => {
    if (!isPlus) {
      router.replace('/(app)/paywall');
    }
  }, [isPlus, router]);

  if (!isPlus) return null;

  if (!activeChapter) {
    return <ChapterGrid onSelect={setActiveChapter} />;
  }

  return (
    <Screen>
      <View style={styles.header}>
        <ChunkyButton
          title=""
          icon="arrow-left"
          variant="secondary"
          onPress={() => setActiveChapter(null)}
          style={styles.backBtn}
        />
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
  backBtn: { width: 44, height: 44, minWidth: 0 },
  title: { fontFamily: AppFonts.bold, fontSize: 18 },
  subtitle: { fontFamily: AppFonts.regular, fontSize: 12, marginTop: 1 },
  chapterList: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
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
  session: { paddingHorizontal: 20, paddingBottom: 32, gap: 20 },
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
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  clearText: { fontFamily: AppFonts.semibold, fontSize: 13 },
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
