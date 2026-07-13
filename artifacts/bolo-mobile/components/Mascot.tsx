import React from 'react';
import { Image, StyleSheet, type ImageStyle, type StyleProp } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

/**
 * Bolo the Parrot — the friendly face of the app. Renders one of the five
 * mascot poses and gives it life with tasteful, reduced-motion-aware motion.
 *
 * Poses (see assets/images/mascot/README.md):
 * - wave:     greetings, home, empty states, welcome back
 * - cheer:    wins — lesson complete, streak milestone, badge earned
 * - thumbsup: a good attempt — correct answer, decent score
 * - thinking: listening / loading / hints
 * - tryagain: a gentle "try again" after a miss
 */
export type MascotPose =
  | 'wave'
  | 'cheer'
  | 'thumbsup'
  | 'thinking'
  | 'tryagain';

/** Idle motion applied while the mascot sits on screen. */
export type MascotMotion = 'none' | 'float' | 'bounce' | 'sway';

const SOURCES: Record<MascotPose, number> = {
  wave: require('../assets/images/mascot/mascot-wave.png'),
  cheer: require('../assets/images/mascot/mascot-cheer.png'),
  thumbsup: require('../assets/images/mascot/mascot-thumbsup.png'),
  thinking: require('../assets/images/mascot/mascot-thinking.png'),
  tryagain: require('../assets/images/mascot/mascot-tryagain.png'),
};

export function Mascot({
  pose,
  size = 96,
  motion = 'float',
  entering = true,
  style,
}: {
  pose: MascotPose;
  size?: number;
  motion?: MascotMotion;
  /** Play a spring "pop" the first time the mascot appears / changes pose. */
  entering?: boolean;
  style?: StyleProp<ImageStyle>;
}) {
  const reduceMotion = useReducedMotion();
  const loop = useSharedValue(0);
  const pop = useSharedValue(entering && !reduceMotion ? 0 : 1);

  // Idle loop (float / bounce / sway) — skipped when reduced motion is on.
  React.useEffect(() => {
    if (reduceMotion || motion === 'none') {
      loop.value = 0;
      return;
    }
    const duration = motion === 'bounce' ? 650 : motion === 'sway' ? 1400 : 2200;
    loop.value = withRepeat(
      withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [motion, reduceMotion, loop]);

  // Entrance "pop" — replays whenever the pose changes for a lively reaction.
  React.useEffect(() => {
    if (reduceMotion || !entering) {
      pop.value = 1;
      return;
    }
    pop.value = 0;
    pop.value = withDelay(
      40,
      withSpring(1, { damping: 10, stiffness: 140, mass: 0.6 }),
    );
    // Cheer gets an extra celebratory wiggle on top of the pop.
    if (pose === 'cheer') {
      loop.value = withSequence(
        withTiming(1, { duration: 220 }),
        withRepeat(
          withTiming(0, { duration: 440, easing: Easing.inOut(Easing.sin) }),
          4,
          true,
        ),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pose]);

  const animatedStyle = useAnimatedStyle(() => {
    const t = loop.value;
    let translateY = 0;
    let rotate = 0;
    if (motion === 'float') translateY = -6 * Math.sin(t * Math.PI);
    else if (motion === 'bounce') translateY = -10 * Math.sin(t * Math.PI);
    else if (motion === 'sway') rotate = (t - 0.5) * 6;
    if (pose === 'cheer') rotate += (t - 0.5) * 10;

    return {
      transform: [
        { scale: 0.6 + pop.value * 0.4 },
        { translateY },
        { rotate: `${rotate}deg` },
      ],
      opacity: pop.value,
    };
  });

  return (
    <Animated.View style={animatedStyle}>
      <Image
        source={SOURCES[pose]}
        style={[{ width: size, height: size }, styles.img, style]}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel={`Bolo the parrot, ${pose}`}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  img: {},
});
