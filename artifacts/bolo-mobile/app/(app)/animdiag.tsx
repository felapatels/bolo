/**
 * THREE BARS, ONE QUESTION: WHICH ANIMATION DRIVERS ARE ALIVE IN A RELEASE BUILD?
 *
 * WHY THIS EXISTS. CLAUDE.md carries a rule from build 270 (2026-08-21, measured
 * on device): the native animation driver is dead in this app's release builds,
 * `useNativeDriver: false` is the only thing that animates, and reanimated's
 * frame loop never starts because it drives from native too.
 *
 * THE LAST CLAUSE IS ALREADY FALSE AND THE REPO PROVES IT. Twenty-two call sites
 * animate through `useLoopProgress`, which IS reanimated, including the boarding
 * pass whose own comment says it breathes in the shipped 1.0.5 build. So the
 * rule has been over-broad for a while, and five components sit on RN Animated's
 * JS driver citing it, which is the slowest path there is: every frame crosses
 * the bridge, and CLAUDE.md admits the cost in the same breath ("a busy JS
 * thread can stutter idle motion").
 *
 * WHAT IS STILL GENUINELY UNKNOWN is the first bar: `useNativeDriver: true`. It
 * was measured ONCE, during the era when two builds of byte-identical source
 * produced different bundles (44,080 functions against 52,900), and the cause of
 * that era has since been removed. Nobody has re-measured.
 *
 * SO PUT THE UNKNOWN ON THE SCREEN. Rule 9 of the measurement rules: one
 * diagnostic banner "replaced about seven bisect builds and ended five wrong
 * theories at once".
 *
 * A DEV BUILD CANNOT ANSWER THIS. Rule 2: a development build animates where a
 * release build does not, even serving production JS. **This screen is only
 * evidence in TestFlight or the store**, and it says so on itself so a screenshot
 * taken in a simulator cannot be mistaken for a result.
 *
 * NOT LINKED FROM ANYWHERE. Reachable only by `bolo-mobile://animdiag`, the same
 * way the Nest is reachable and unlinked. It renders three rectangles and reads
 * nothing, so it is inert in a store binary rather than merely hidden.
 */
import React from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Reanimated, {
  useAnimatedStyle,
  useReducedMotion,
} from 'react-native-reanimated';
import Constants from 'expo-constants';
import { useColors } from '@/hooks/useColors';
import { useLoopProgress } from '@/lib/useLoopProgress';
import { AppFonts } from '@/constants/fonts';

const CYCLE_MS = 1500;
const TRAVEL = 220;

/** One RN Animated bar, on whichever driver the caller names. */
function RnBar({ native, color }: { native: boolean; color: string }) {
  const value = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue: 1,
          duration: CYCLE_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: native,
        }),
        Animated.timing(value, {
          toValue: 0,
          duration: CYCLE_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: native,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [native, value]);

  const translateX = value.interpolate({
    inputRange: [0, 1],
    outputRange: [0, TRAVEL],
  });
  return (
    <View style={styles.track}>
      <Animated.View
        style={[styles.dot, { backgroundColor: color, transform: [{ translateX }] }]}
      />
    </View>
  );
}

/** The reanimated bar, through the same loop every idle animation here uses. */
function ReanimatedBar({ color }: { color: string }) {
  const lap = useLoopProgress(CYCLE_MS * 2, true);
  const style = useAnimatedStyle(() => {
    // A there-and-back triangle so it traces the same path as the two above.
    const t = lap.value < 0.5 ? lap.value * 2 : (1 - lap.value) * 2;
    return { transform: [{ translateX: t * TRAVEL }] };
  });
  return (
    <View style={styles.track}>
      <Reanimated.View style={[styles.dot, { backgroundColor: color }, style]} />
    </View>
  );
}

export default function AnimDiagScreen() {
  const colors = useColors();
  const reanimatedSaysReduced = useReducedMotion();
  const [osSaysReduced, setOsSaysReduced] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (alive) setOsSaysReduced(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  const rows: { label: string; note: string; bar: React.ReactNode }[] = [
    {
      label: '1. Animated, useNativeDriver: TRUE',
      note: 'The one nobody has re-measured since build 270.',
      bar: <RnBar native color="#EF4444" />,
    },
    {
      label: '2. Animated, useNativeDriver: FALSE',
      note: 'The path five components use today, on CLAUDE.md’s rule.',
      bar: <RnBar native={false} color="#F59E0B" />,
    },
    {
      label: '3. reanimated, via useLoopProgress',
      note: 'What the boarding pass uses in the shipped build.',
      bar: <ReanimatedBar color="#10B981" />,
    },
  ];

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.page}
      testID="anim-diag"
    >
      <Text style={[styles.title, { color: colors.foreground }]}>
        Animation drivers
      </Text>
      <Text style={[styles.warn, { color: colors.mutedForeground }]}>
        A DEV BUILD CANNOT ANSWER THIS. A development build animates where a
        release build does not, so this screen is only evidence in TestFlight or
        the store. Watch each bar for five seconds: a bar that never moves is a
        dead driver.
      </Text>

      {rows.map((row) => (
        <View key={row.label} style={styles.row}>
          <Text style={[styles.label, { color: colors.foreground }]}>{row.label}</Text>
          <Text style={[styles.note, { color: colors.mutedForeground }]}>{row.note}</Text>
          {row.bar}
        </View>
      ))}

      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.foreground }]}>
          Reduce Motion, both readings
        </Text>
        <Text style={[styles.note, { color: colors.mutedForeground }]}>
          {/* These two disagreeing is itself a cause: a bar can sit still
              because a driver is dead OR because something upstream thinks
              motion is switched off. Print both rather than assume they agree. */}
          reanimated says {String(reanimatedSaysReduced)} {'·'} the OS says{' '}
          {osSaysReduced === null ? 'reading...' : String(osSaysReduced)}
        </Text>
      </View>

      <Text style={[styles.note, { color: colors.mutedForeground }]}>
        {Platform.OS} {'·'} version {Constants.expoConfig?.version ?? '?'}{' '}
        {'·'} build{' '}
        {Platform.OS === 'ios'
          ? (Constants.expoConfig?.ios?.buildNumber ?? '?')
          : String(Constants.expoConfig?.android?.versionCode ?? '?')}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingTop: 64, gap: 22 },
  title: { fontFamily: AppFonts.extrabold, fontSize: 26 },
  warn: { fontFamily: AppFonts.semibold, fontSize: 13, lineHeight: 19 },
  row: { gap: 6 },
  label: { fontFamily: AppFonts.semibold, fontSize: 15 },
  note: { fontFamily: AppFonts.regular, fontSize: 12, lineHeight: 17 },
  track: {
    height: 34,
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(127,127,127,0.12)',
    paddingHorizontal: 6,
  },
  dot: { width: 22, height: 22, borderRadius: 11 },
});
