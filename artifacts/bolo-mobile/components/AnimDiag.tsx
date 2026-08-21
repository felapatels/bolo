/**
 * TEMPORARY DIAGNOSTIC. Delete this file and its mount in
 * app/(app)/(tabs)/index.tsx once it has answered the question.
 *
 * WHY IT EXISTS, AGAIN. A week of this investigation was spent INFERRING what
 * the app was doing from build artefacts: bundle sizes, Hermes function counts,
 * lockfile diffs. Every one of those was measured correctly and none of them
 * said what is actually broken at runtime. Measurement rule 9 exists for exactly
 * this: put the unknown on the screen instead of deducing it.
 *
 * WHAT EACH ROW DECIDES. Read them top to bottom; the first one that is wrong is
 * the bug.
 *
 *   build            Rule 7. Confirm you are looking at the build you think you
 *                    are, without leaving the app for Settings.
 *   worklet frames   THE IMPORTANT ONE. useFrameCallback runs its body as a
 *                    worklet on the UI thread, once per frame. If this number
 *                    climbs, the worklet runtime is alive and executing
 *                    correctly compiled worklets. If it sits at 0 while the
 *                    reanimated bar is also dead, worklets never started, and
 *                    that is a bundling/transpilation fault rather than an
 *                    animation fault. This is the row the bundle investigation
 *                    could not answer.
 *   runOnJS          Whether the UI thread can call back into JS. Alive worklets
 *                    with a dead runOnJS is a different fault again.
 *   reanimated bar   Ungated. No reduced-motion check, no entrance wrapper, no
 *                    props. If reanimated animates at all, this moves.
 *   RN Animated bar  The same thing through react-native's own Animated, which
 *                    does not use worklets. Separates "reanimated is broken"
 *                    from "nothing animates at all", and no build this week has
 *                    ever distinguished those two.
 *   reduceMotion     Both sources, because they can disagree and a wrong read
 *                    here silently disables everything.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated as RNAnimated, Easing as RNEasing, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withRepeat,
  withTiming,
  useReducedMotion as reanimatedUseReducedMotion,
} from 'react-native-reanimated';
import Constants from 'expo-constants';
import { prefersReducedMotion } from '@/lib/motionPrefs';

/**
 * The two pollers below drive real timers. Under jest they outlive teardown and
 * fail the suite at the suite level, so they are skipped there. Rendering is NOT
 * skipped: the component still mounts in tests, so a crash in it would still be
 * caught. Only the clocks stop.
 */
const IS_TEST = process.env.NODE_ENV === 'test';

/** Best-effort, and wrapped because a failed require here must not blank the app. */
function reanimatedVersion(): string {
  try {
    return String(
      (require('react-native-reanimated/package.json') as { version?: string }).version ?? '?',
    );
  } catch {
    return 'unreadable';
  }
}

export function AnimDiag() {
  // Plain function, not a hook: motionPrefs exposes a snapshot reader.
  const osRM = prefersReducedMotion();
  const reaRM = reanimatedUseReducedMotion();

  const build = String(Constants.expoConfig?.ios?.buildNumber ?? '?');
  const version = String(Constants.expoConfig?.version ?? '?');

  // ---- reanimated: an endless loop nothing gates ----
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = 0;
    p.value = withRepeat(withTiming(1, { duration: 1000, easing: Easing.linear }), -1, true);
  }, [p]);
  const reaBar = useAnimatedStyle(() => ({ width: 20 + p.value * 140 }));

  // ---- worklets: does the UI thread execute a worklet at all ----
  // The counter lives in a shared value written from the worklet, and JS polls
  // it. Polling rather than pushing on purpose: if runOnJS is the broken part,
  // this row still reports honestly.
  const frames = useSharedValue(0);
  const [framesSeen, setFramesSeen] = useState(0);
  useFrameCallback(() => {
    'worklet';
    frames.value = frames.value + 1;
  }, true);
  useEffect(() => {
    if (IS_TEST) return;
    const id = setInterval(() => setFramesSeen(frames.value), 400);
    return () => clearInterval(id);
  }, [frames]);

  // ---- THE ONE THAT DECIDES THE FIX ----
  // A shared value stepped from a plain JS timer, with no withTiming and no
  // withRepeat anywhere near it. Those two are what the dead frame driver
  // powers. Shared-value assignment and the useAnimatedStyle recomputation that
  // follows are a different path, and nothing has ever tested it alone.
  //
  //   moves -> the pipeline is intact and only the driver is dead, so replacing
  //            withTiming/withRepeat with JS-driven stepping fixes every
  //            animation in the app from one small module.
  //   still -> the whole shared-value pipeline is dead and porting to RN
  //            Animated is the only option left.
  const jsDriven = useSharedValue(0);
  useEffect(() => {
    if (IS_TEST) return;
    let t = 0;
    const id = setInterval(() => {
      t = (t + 1) % 40;
      // Plain assignment from the JS thread. No animation helper involved.
      jsDriven.value = t < 20 ? t / 20 : (40 - t) / 20;
    }, 50);
    return () => clearInterval(id);
  }, [jsDriven]);
  const jsBar = useAnimatedStyle(() => ({ width: 20 + jsDriven.value * 140 }));

  // ---- runOnJS: can the UI thread call back into JS ----
  const [jsHits, setJsHits] = useState(0);
  const bumped = useRef(0);
  useEffect(() => {
    if (IS_TEST) return;
    const bump = () => setJsHits((n) => n + 1);
    const id = setInterval(() => {
      bumped.current += 1;
      // Scheduled from JS onto the UI thread and back again, which is the whole
      // round trip in one line.
      const fn = () => {
        'worklet';
        runOnJS(bump)();
      };
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { runOnUI } = require('react-native-reanimated');
        runOnUI(fn)();
      } catch {
        /* reported by the row staying at 0 */
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ---- react-native's own Animated, which uses no worklets ----
  const rnValue = useRef(new RNAnimated.Value(0)).current;
  useEffect(() => {
    if (IS_TEST) return;
    const loop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(rnValue, {
          toValue: 1,
          duration: 1000,
          easing: RNEasing.linear,
          useNativeDriver: false,
        }),
        RNAnimated.timing(rnValue, {
          toValue: 0,
          duration: 1000,
          easing: RNEasing.linear,
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [rnValue]);
  const rnWidth = rnValue.interpolate({ inputRange: [0, 1], outputRange: [20, 160] });

  const workletsAlive = framesSeen > 0;

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Text style={styles.head}>
        {version} ({build})
      </Text>
      <Text style={[styles.line, workletsAlive ? styles.ok : styles.bad]}>
        worklet frames: {framesSeen} {workletsAlive ? 'ALIVE' : 'DEAD'}
      </Text>
      <Text style={[styles.line, jsHits > 0 ? styles.ok : styles.bad]}>
        runOnJS hits: {jsHits}
      </Text>
      <Text style={styles.line}>
        reduceMotion os={String(osRM)} rea={String(reaRM)}
      </Text>
      <Text style={styles.line}>reanimated {reanimatedVersion()} withTiming:</Text>
      <Animated.View style={[styles.bar, styles.reaBar, reaBar]} />
      <Text style={styles.line}>JS-DRIVEN shared value (the one that matters):</Text>
      <Animated.View style={[styles.bar, styles.jsBar, jsBar]} />
      <Text style={styles.line}>RN Animated — bar should pulse:</Text>
      <RNAnimated.View style={[styles.bar, styles.rnBar, { width: rnWidth }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    // Inside the home screen, NOT a root sibling. The root-overlay theory is
    // dead, but there is no reason to reintroduce the one shape that six builds
    // were spent arguing about.
    alignSelf: 'stretch',
    marginBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.86)',
    padding: 10,
    borderRadius: 10,
  },
  head: { color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 4 },
  line: { color: '#fff', fontSize: 12, fontVariant: ['tabular-nums'], marginTop: 2 },
  ok: { color: '#5BE3A8' },
  bad: { color: '#FF6B6B' },
  bar: { height: 10, marginTop: 4, borderRadius: 5 },
  reaBar: { backgroundColor: '#3FBFB2' },
  jsBar: { backgroundColor: '#C084FC' },
  rnBar: { backgroundColor: '#F2B544' },
});

export default AnimDiag;
