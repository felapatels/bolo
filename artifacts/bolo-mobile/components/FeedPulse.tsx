/**
 * THE GREEN PULSE. A dot beside the feed that flares when a new moment lands,
 * so a surface that is otherwise static tells the learner it is live.
 * Asked for 2026-08-26: "add a little green pulse every time the feed is
 * updated on homescreen and feed page so it feels alive."
 *
 * Web twin: src/components/feed-pulse.tsx. Keep the rule below in step.
 *
 * IT FIRES ON A CHANGE, NEVER ON FIRST SIGHT. Pulsing the first time the feed
 * loads would fire on every screen open and would mean nothing; pulsing when
 * the newest id differs from the one already on screen means something arrived
 * while the learner was looking at it. That is the difference between a live
 * signal and decoration.
 *
 * useNativeDriver: false, AND THAT IS NOT A STYLE CHOICE. Per CLAUDE.md the
 * native animation driver does not tick in release builds of this app: build
 * 270 measured a ported Animated value on `true` coming out dead flat while the
 * same value on `false` kept moving beside it in the same binary. Every RN
 * Animated port in this codebase passes false. See lib/useLoopProgressRN.ts.
 */
import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';

/** How long the dot stays up after a new moment lands. */
export const PULSE_HOLD_MS = 4200;

/** One breath of the pulse, in and out. */
const PULSE_HALF_MS = 520;

/**
 * True while a newly arrived feed id is worth flaring about.
 *
 * `latestId` is the id of the newest entry the caller can see. FeedEntry.id is
 * stable across reads and prefixed by source, so it is safe to compare; nothing
 * here should ever compare createdAt, which two projected entries can share.
 */
export function useFeedPulse(latestId: string | null | undefined): boolean {
  const seen = React.useRef<string | null>(null);
  const [pulsing, setPulsing] = React.useState(false);

  React.useEffect(() => {
    if (!latestId) return;
    // First sight is not an update. Record it and stay quiet.
    if (seen.current === null) {
      seen.current = latestId;
      return;
    }
    if (seen.current === latestId) return;
    seen.current = latestId;
    setPulsing(true);
    const t = setTimeout(() => setPulsing(false), PULSE_HOLD_MS);
    return () => clearTimeout(t);
  }, [latestId]);

  return pulsing;
}

/**
 * The dot itself. Renders nothing when idle: a permanently visible dot would
 * stop carrying information within a day, and the point is that its appearance
 * IS the message.
 *
 * Hidden from the accessibility tree on purpose. It says nothing a screen
 * reader user can act on, and the content it is announcing is already in the
 * list underneath it.
 */
export function FeedPulseDot({
  active,
  size = 9,
}: {
  active: boolean;
  size?: number;
}) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const v = React.useRef(new Animated.Value(0.35)).current;

  React.useEffect(() => {
    if (!active) {
      v.setValue(0.35);
      return;
    }
    // Reduce Motion still gets the dot, just held rather than breathing: the
    // information is that something arrived, and that survives without motion.
    if (reduceMotion) {
      v.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, {
          toValue: 1,
          duration: PULSE_HALF_MS,
          useNativeDriver: false,
        }),
        Animated.timing(v, {
          toValue: 0.35,
          duration: PULSE_HALF_MS,
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, reduceMotion, v]);

  if (!active) return null;

  return (
    <View testID="feed-pulse" style={styles.wrap}>
      <Animated.View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.success,
          opacity: v,
          transform: [
            {
              scale: v.interpolate({
                inputRange: [0.35, 1],
                outputRange: [0.72, 1.18],
              }),
            },
          ],
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // A fixed box so the dot appearing never shifts the text beside it.
  wrap: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
});
