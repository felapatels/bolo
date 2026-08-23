// Script Trace: the authoring tool.
//
// WHAT THIS IS FOR. The shipped tracing guides come from font outlines, so they
// know a letter's SHAPE but not its ORDER or its DIRECTION. The scorer can
// already report "wrong-order" and "reversed-stroke" and has nothing to score
// against, because AUTHORED_GLYPHS holds three prototype Devanagari letters
// against a playable floor of twelve. Tracing is therefore switched off in
// every language.
//
// The alternative to this screen was hand-typing coordinate arrays for ~45
// Devanagari glyphs and then repeating that eleven more times. This makes the
// app author them instead: someone who writes the script traces each letter
// once, over the font outline the app already ships, and what their finger did
// IS the data. Two consequences worth the build:
//
//   1. It works for all twelve scripts, not just the one somebody can type out.
//   2. Review becomes tracing. A relative who writes Gujarati can verify a set
//      without reading a diff, which is the only form of review that will
//      actually happen.
//
// NOT LINKED FROM ANYWHERE, on purpose. It is internal, it ships in release
// builds because there is no dev client and a finger is required, and it is
// reached by deep link:
//
//   adb shell am start -a android.intent.action.VIEW -d "bolo-mobile://author-strokes"
//
// It reads nothing and writes nothing. Output leaves via the clipboard.
//
// REACH: mobile only, and deliberately. Web has no finger, the artifact shares
// no components with this one, and the part that is genuinely worth sharing
// (simplify, quantize, serialize) already lives in @workspace/script-trace
// where the web app can import it the day it needs to.

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Dimensions,
} from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Svg, { Path as SvgPath, Text as SvgText, Circle as SvgCircle } from 'react-native-svg';
import * as Clipboard from 'expo-clipboard';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import {
  SCRIPT_NAMES,
  SCRIPT_ORDER_TIP,
  alphabetForScript,
  PLAYABLE_GLYPH_FLOOR,
  glyphPointCount,
  serializeAuthoredGlyphs,
  traceToAuthoredGlyph,
  type AuthoredGlyph,
  type ScriptId,
  type StrokePoint,
} from '@workspace/script-trace';

const CANVAS = Math.min(Dimensions.get('window').width - 40, 340);

/** Scripts that have chapters to trace over, in the roster's own order. */
const SCRIPT_IDS = Object.keys(SCRIPT_NAMES) as ScriptId[];

/** 0..100 points to an SVG path in the same space. */
function toPathD(points: StrokePoint[]): string {
  if (points.length === 0) return '';
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(' ');
}

export default function AuthorStrokesScreen() {
  const colors = useColors();
  const router = useRouter();

  const [script, setScript] = useState<ScriptId>('devanagari');
  const [index, setIndex] = useState(0);
  const [authored, setAuthored] = useState<AuthoredGlyph[]>([]);
  const [copied, setCopied] = useState(false);

  // Committed strokes for the character on screen, in writing order.
  const [strokes, setStrokes] = useState<StrokePoint[][]>([]);
  // The stroke currently under the finger. Ref for the gesture, state to draw.
  const liveRef = useRef<StrokePoint[]>([]);
  const [live, setLive] = useState<StrokePoint[]>([]);
  const drawingRef = useRef(false);

  const roster = useMemo(() => alphabetForScript(script), [script]);
  const character = roster[index];

  const reset = useCallback(() => {
    liveRef.current = [];
    setLive([]);
    setStrokes([]);
  }, []);

  const goTo = useCallback(
    (next: number) => {
      reset();
      setIndex(Math.max(0, Math.min(roster.length - 1, next)));
    },
    [reset, roster.length],
  );

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onBegin((e) => {
      drawingRef.current = true;
      liveRef.current = [{ x: (e.x / CANVAS) * 100, y: (e.y / CANVAS) * 100 }];
      setLive(liveRef.current);
      setCopied(false);
    })
    .onUpdate((e) => {
      if (!drawingRef.current) return;
      liveRef.current = [
        ...liveRef.current,
        { x: (e.x / CANVAS) * 100, y: (e.y / CANVAS) * 100 },
      ];
      setLive(liveRef.current);
    })
    .onFinalize(() => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      // Two points is the floor the package uses; anything less was a tap.
      if (liveRef.current.length >= 2) {
        setStrokes((prev) => [...prev, liveRef.current]);
      }
      liveRef.current = [];
      setLive([]);
    });

  // The glyph as it would be committed right now, so the readout shows what
  // will actually land in the file rather than the raw finger data.
  const preview = useMemo<AuthoredGlyph | null>(() => {
    if (!character || strokes.length === 0) return null;
    return traceToAuthoredGlyph(
      { id: character.id, char: character.char, label: character.label },
      strokes,
    );
  }, [character, strokes]);

  const alreadyDone = useMemo(
    () => new Set(authored.map((g) => g.id)),
    [authored],
  );

  const saveAndNext = useCallback(() => {
    if (!preview || preview.strokes.length === 0) return;
    setAuthored((prev) => [...prev.filter((g) => g.id !== preview.id), preview]);
    goTo(index + 1);
  }, [preview, goTo, index]);

  const copyAll = useCallback(async () => {
    if (authored.length === 0) return;
    const name = `${script.toUpperCase().replace(/-/g, '_')}_GLYPHS`;
    await Clipboard.setStringAsync(serializeAuthoredGlyphs(authored, name));
    setCopied(true);
  }, [authored, script]);

  const undo = useCallback(() => setStrokes((prev) => prev.slice(0, -1)), []);

  if (!character) {
    return (
      <Screen>
        <Text style={[styles.title, { color: colors.foreground }]}>
          No alphabet chapters for {SCRIPT_NAMES[script]}
        </Text>
      </Screen>
    );
  }

  const remaining = Math.max(0, PLAYABLE_GLYPH_FLOOR - authored.length);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
            <Feather name="chevron-left" size={26} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.title, { color: colors.foreground }]}>Author strokes</Text>
        </View>

        {/* Script roster. Twelve scripts, one authored set each. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
          {SCRIPT_IDS.map((id) => {
            const on = id === script;
            return (
              <Pressable
                key={id}
                onPress={() => {
                  setScript(id);
                  setIndex(0);
                  reset();
                }}
                style={[
                  styles.chip,
                  { borderColor: colors.border },
                  on && { backgroundColor: colors.foreground, borderColor: colors.foreground },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.chipText, { color: on ? colors.background : colors.mutedForeground }]}>
                  {SCRIPT_NAMES[id]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* The one writing-order rule this script turns on. */}
        <Text style={[styles.tip, { color: colors.mutedForeground, borderColor: colors.border }]}>
          {SCRIPT_ORDER_TIP[script]}
        </Text>

        <Text style={[styles.counter, { color: colors.mutedForeground }]}>
          {index + 1} of {roster.length}
          {'   ·   '}
          {authored.length} authored
          {remaining > 0 ? `   ·   ${remaining} more to reach the playable floor` : '   ·   playable'}
        </Text>

        <View style={styles.charRow}>
          <Text style={[styles.bigChar, { color: colors.foreground }]}>{character.char}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.foreground }]}>{character.label}</Text>
            <Text style={[styles.id, { color: colors.mutedForeground }]}>{character.id}</Text>
            {alreadyDone.has(character.id) ? (
              <Text style={[styles.done, { color: colors.mutedForeground }]}>already authored</Text>
            ) : null}
          </View>
        </View>

        {/* Trace over the font outline. The outline gives the shape; the finger
            gives the order and the direction, which is the part worth having. */}
        <GestureDetector gesture={pan}>
          <View style={[styles.canvas, { width: CANVAS, height: CANVAS, borderColor: colors.border }]}>
            <Svg width={CANVAS} height={CANVAS} viewBox="0 0 100 100">
              {character.guide ? (
                <SvgPath d={character.guide} fill={colors.mutedForeground} opacity={0.16} />
              ) : (
                <SvgText
                  x={50}
                  y={72}
                  fontSize={68}
                  textAnchor="middle"
                  fill={colors.mutedForeground}
                  opacity={0.16}
                >
                  {character.char}
                </SvgText>
              )}

              {strokes.map((s, i) => (
                <React.Fragment key={i}>
                  <SvgPath
                    d={toPathD(s)}
                    stroke={colors.foreground}
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                  {/* Start dot: where this stroke begins is its direction. */}
                  <SvgCircle cx={s[0].x} cy={s[0].y} r={2.6} fill={colors.foreground} />
                  <SvgText
                    x={s[0].x}
                    y={s[0].y + 1.4}
                    fontSize={3.4}
                    textAnchor="middle"
                    fill={colors.background}
                  >
                    {String(i + 1)}
                  </SvgText>
                </React.Fragment>
              ))}

              {live.length >= 2 ? (
                <SvgPath
                  d={toPathD(live)}
                  stroke={colors.foreground}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  opacity={0.6}
                />
              ) : null}
            </Svg>
          </View>
        </GestureDetector>

        <Text style={[styles.readout, { color: colors.mutedForeground }]}>
          {strokes.length} stroke{strokes.length === 1 ? '' : 's'}
          {preview ? `   ·   ${glyphPointCount(preview)} points after simplifying` : ''}
        </Text>

        <View style={styles.buttonRow}>
          <Btn label="Undo" icon="rotate-ccw" onPress={undo} disabled={strokes.length === 0} colors={colors} />
          <Btn label="Clear" icon="x" onPress={reset} disabled={strokes.length === 0} colors={colors} />
          <Btn label="Skip" icon="chevron-right" onPress={() => goTo(index + 1)} colors={colors} />
        </View>

        <Pressable
          onPress={saveAndNext}
          disabled={strokes.length === 0}
          accessibilityRole="button"
          style={[
            styles.primary,
            { backgroundColor: colors.foreground },
            strokes.length === 0 && styles.primaryOff,
          ]}
        >
          <Text style={[styles.primaryText, { color: colors.background }]}>Save and next</Text>
        </Pressable>

        <Pressable
          onPress={copyAll}
          disabled={authored.length === 0}
          accessibilityRole="button"
          style={[styles.secondary, { borderColor: colors.border }, authored.length === 0 && styles.primaryOff]}
        >
          <Feather name={copied ? 'check' : 'clipboard'} size={16} color={colors.foreground} />
          <Text style={[styles.secondaryText, { color: colors.foreground }]}>
            {copied ? 'Copied' : `Copy ${authored.length} glyph${authored.length === 1 ? '' : 's'} as TypeScript`}
          </Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function Btn({
  label,
  icon,
  onPress,
  disabled,
  colors,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[styles.btn, { borderColor: colors.border }, disabled && styles.primaryOff]}
    >
      <Feather name={icon} size={15} color={colors.foreground} />
      <Text style={[styles.btnText, { color: colors.foreground }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20 },
  title: { fontSize: 22, fontFamily: AppFonts.displayBold },
  chips: { marginTop: 14, paddingLeft: 20 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8 },
  chipText: { fontSize: 13, fontFamily: AppFonts.bodyMedium },
  tip: {
    marginTop: 14,
    marginHorizontal: 20,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
    lineHeight: 18,
  },
  counter: { marginTop: 12, paddingHorizontal: 20, fontSize: 12.5, fontFamily: AppFonts.bodyMedium },
  charRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, marginTop: 10 },
  bigChar: { fontSize: 46 },
  label: { fontSize: 18, fontFamily: AppFonts.displayBold },
  id: { fontSize: 12 },
  done: { fontSize: 12, fontStyle: 'italic', marginTop: 2 },
  canvas: { alignSelf: 'center', marginTop: 14, borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  readout: { textAlign: 'center', marginTop: 10, fontSize: 12.5 },
  buttonRow: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginTop: 14 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  btnText: { fontSize: 14, fontFamily: AppFonts.bodyMedium },
  primary: {
    marginTop: 14,
    marginHorizontal: 20,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { fontSize: 16, fontFamily: AppFonts.displayBold },
  primaryOff: { opacity: 0.35 },
  secondary: {
    marginTop: 10,
    marginHorizontal: 20,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryText: { fontSize: 14, fontFamily: AppFonts.bodyMedium },
});
