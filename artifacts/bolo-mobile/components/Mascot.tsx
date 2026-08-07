import React from 'react';
import { Image, StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  ZoomIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { appear } from '@/lib/entrance';
import { mascotSource } from '@/lib/mascotOutfits';
import { useEquippedOutfit } from '@/contexts/OutfitContext';

/**
 * Bolo the Parrot — the friendly face of the app. Renders one of the five
 * mascot poses and gives it life with tasteful, reduced-motion-aware motion.
 *
 * Visibility is never gated on animation: the mascot always renders at full
 * opacity in its resting scale/position. The entrance "pop" and idle motion are
 * layered on top as progressive enhancements, so if animations don't run (e.g.
 * some Expo Go setups where reanimated entrance animations don't reliably
 * commit) the logo is still shown rather than left permanently transparent.
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

/**
 * Idle motion applied while the mascot sits on screen.
 *
 * `flip` is the working/evaluating state: Bolo hangs upside down the way a
 * parrot does, swinging gently, while something is being worked out for the
 * learner. It replaced the throbber inside the practice record button.
 */
export type MascotMotion = 'none' | 'float' | 'bounce' | 'sway' | 'flip';

// Pose art (canonical and dressed) resolves in lib/mascotOutfits.ts, so every
// surface that renders <Mascot> shows the equipped outfit without knowing
// outfits exist.

// ---------------------------------------------------------------------------
// Funny idle sequences — at least 5 one-shot animations that fire when isIdle
// becomes true. Each function drives the three shared values (translateY,
// rotate, scale) by returning a single withSequence (or similar) result.
// ---------------------------------------------------------------------------

type FunnySeq = {
  translateY: number;
  rotate: number;
  scale: number;
};

/**
 * Returns a random funny-idle index from 0..4.
 * Call this on the JS thread (not in a worklet).
 */
function randomFunnyIndex(): number {
  return Math.floor(Math.random() * 5);
}

export function Mascot({
  pose,
  size = 96,
  motion = 'float',
  entering = true,
  isIdle = false,
  celebrateBounce = 0,
  style,
  outfit,
}: {
  pose: MascotPose;
  size?: number;
  motion?: MascotMotion;
  /** Play a spring "pop" the first time the mascot appears / changes pose. */
  entering?: boolean;
  /**
   * When true, Mascot plays a random funny animation to recapture the
   * learner's attention after a period of idle. Set to false to stop and
   * resume the normal idle motion. Ignored when reduceMotion is on.
   */
  isIdle?: boolean;
  /**
   * Increment this counter to trigger a one-shot celebratory bounce (quick
   * scale-pop). Useful when a milestone is hit during a session. Ignored
   * when reduceMotion is on.
   */
  celebrateBounce?: number;
  style?: StyleProp<ImageStyle>;
  /**
   * Force an outfit instead of the learner's equipped one. Only the outfit
   * shop uses this, to preview a costume on the learner's own Bolo before they
   * buy it; pass null to force canonical Bolo.
   */
  outfit?: string | null;
}) {
  const equippedOutfit = useEquippedOutfit();
  const wornOutfit = outfit === undefined ? equippedOutfit : outfit;
  const reduceMotion = useReducedMotion();
  const loop = useSharedValue(0);

  // Hanging (evaluating) state. The 180° itself is a PLAIN style on an inner
  // view, applied for as long as the mascot hangs; the shared value carries
  // only the spring INTO the pose (-180 -> 0) and the pendulum rides the idle
  // loop. Keeping the pose itself out of the worklet means it still reads as
  // "upside down" wherever animations don't run at all.
  const hanging = motion === 'flip';
  const flipIn = useSharedValue(hanging ? 1 : 0);
  const breathe = useSharedValue(1);

  // Extra shared values for funny idle transforms.
  const funnyY = useSharedValue(0);
  const funnyRotate = useSharedValue(0);
  const funnyScale = useSharedValue(1);

  // Track previous isIdle to detect rising edge.
  const prevIsIdle = React.useRef(false);

  // Idle loop (float / bounce / sway) — skipped when reduced motion is on.
  React.useEffect(() => {
    if (reduceMotion || motion === 'none') {
      loop.value = 0;
      return;
    }
    const duration =
      motion === 'bounce'
        ? 650
        : motion === 'sway'
          ? 1400
          : motion === 'flip'
            ? 1600
            : 2200;
    loop.value = withRepeat(
      withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [motion, reduceMotion, loop]);

  // Spring into (and out of) the hang.
  React.useEffect(() => {
    if (hanging) {
      flipIn.value = reduceMotion
        ? 1
        : withSpring(1, { damping: 12, stiffness: 150 });
    } else {
      flipIn.value = 0;
    }
  }, [hanging, reduceMotion, flipIn]);

  // Reduced motion gets neither the flip-in nor the swing, and a bird simply
  // frozen upside down does not read as "working". A slow opacity breathe
  // carries that instead — no movement, so it stays motion-safe. It has to opt
  // out of the system reduced-motion switch explicitly or reanimated snaps it
  // straight to the end value and leaves the mascot dimmed.
  React.useEffect(() => {
    if (hanging && reduceMotion) {
      breathe.value = withRepeat(
        withTiming(0.5, { duration: 850, reduceMotion: ReduceMotion.Never }),
        -1,
        true,
      );
    } else {
      breathe.value = 1;
    }
  }, [hanging, reduceMotion, breathe]);

  // Cheer gets an extra celebratory wiggle whenever the pose becomes "cheer".
  React.useEffect(() => {
    if (reduceMotion || pose !== 'cheer') return;
    loop.value = withSequence(
      withTiming(1, { duration: 220 }),
      withRepeat(
        withTiming(0, { duration: 440, easing: Easing.inOut(Easing.sin) }),
        4,
        true,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pose]);

  // Celebrate bounce — fires a quick scale-pop when celebrateBounce increments.
  const prevCelebrateBounce = React.useRef(0);
  React.useEffect(() => {
    if (reduceMotion) return;
    if (celebrateBounce === 0) return;
    if (celebrateBounce === prevCelebrateBounce.current) return;
    prevCelebrateBounce.current = celebrateBounce;
    funnyScale.value = withSequence(
      withSpring(1.35, { damping: 5, stiffness: 320 }),
      withSpring(0.9, { damping: 8, stiffness: 260 }),
      withSpring(1, { damping: 10, stiffness: 200 }),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebrateBounce, reduceMotion]);

  // Funny idle — fire a random one-shot sequence when isIdle becomes true.
  React.useEffect(() => {
    if (reduceMotion) return;

    const risingEdge = isIdle && !prevIsIdle.current;
    prevIsIdle.current = isIdle;

    if (!isIdle) {
      // Reset funny transforms back to neutral when activity resumes.
      funnyY.value = withTiming(0, { duration: 200 });
      funnyRotate.value = withTiming(0, { duration: 200 });
      funnyScale.value = withTiming(1, { duration: 200 });
      return;
    }

    if (!risingEdge) return;

    const idx = randomFunnyIndex();

    if (idx === 0) {
      // Spin — full 360° then back to 0
      funnyRotate.value = withSequence(
        withTiming(360, { duration: 500, easing: Easing.out(Easing.back(1.2)) }),
        withTiming(0, { duration: 1 }),
      );
    } else if (idx === 1) {
      // Peek left-right
      funnyRotate.value = withSequence(
        withTiming(-20, { duration: 180 }),
        withTiming(20, { duration: 240 }),
        withTiming(-20, { duration: 240 }),
        withTiming(20, { duration: 240 }),
        withTiming(0, { duration: 200 }),
      );
    } else if (idx === 2) {
      // Sneeze-scale — puff then settle
      funnyScale.value = withSequence(
        withSpring(1.3, { damping: 6, stiffness: 260 }),
        withTiming(0.85, { duration: 100 }),
        withSpring(1.1, { damping: 8, stiffness: 260 }),
        withTiming(1, { duration: 150 }),
      );
    } else if (idx === 3) {
      // Jump — bouncy hop with afterbounce
      funnyY.value = withSequence(
        withSpring(-24, { damping: 6, stiffness: 300 }),
        withSpring(0, { damping: 8, stiffness: 220 }),
        withSpring(-12, { damping: 8, stiffness: 260 }),
        withSpring(0, { damping: 10, stiffness: 200 }),
      );
    } else {
      // Dizzy spiral — wobble + float
      funnyRotate.value = withSequence(
        withTiming(-15, { duration: 200 }),
        withTiming(15, { duration: 260 }),
        withTiming(-15, { duration: 260 }),
        withTiming(0, { duration: 200 }),
      );
      funnyY.value = withSequence(
        withTiming(-8, { duration: 460, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 460, easing: Easing.inOut(Easing.sin) }),
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isIdle, reduceMotion]);

  // Idle motion (float/bounce/sway + cheer wiggle) layered on the always-visible
  // resting state. No opacity/scale gating here: the mascot renders at full
  // opacity and resting scale by default, so it can never be left transparent if
  // the animation driver doesn't run.
  const animatedStyle = useAnimatedStyle(() => {
    const t = loop.value;
    let translateY = 0;
    let rotate = 0;
    if (motion === 'float') translateY = -6 * Math.sin(t * Math.PI);
    else if (motion === 'bounce') translateY = -10 * Math.sin(t * Math.PI);
    else if (motion === 'sway') rotate = (t - 0.5) * 6;
    else if (motion === 'flip') rotate = (t - 0.5) * 14; // pendulum on the hang
    if (pose === 'cheer') rotate += (t - 0.5) * 10;

    // Cancels the inner 180° until the spring lands, so he tips over into the
    // hang rather than appearing upside down.
    if (hanging) rotate += (flipIn.value - 1) * 180;

    // Layer funny transforms on top.
    translateY += funnyY.value;
    rotate += funnyRotate.value;
    const scale = funnyScale.value;

    return {
      opacity: breathe.value,
      transform: [{ translateY }, { rotate: `${rotate}deg` }, { scale }],
    };
  });

  // Entrance "pop" — a progressive enhancement implemented as a reanimated
  // layout animation. If it never commits, the view is simply shown at rest
  // (fully visible) rather than staying transparent. Re-keyed on pose so the pop
  // replays on pose changes, matching the previous lively reaction.
  const entrance =
    entering && !reduceMotion
      ? ZoomIn.springify().damping(10).stiffness(140).mass(0.6).delay(40)
      : undefined;

  const image = (
    <Image
      source={mascotSource(pose, wornOutfit)}
      style={[{ width: size, height: size }, styles.img, style]}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel={`Bolo the parrot, ${pose}`}
    />
  );

  return (
    <Animated.View key={pose} entering={appear(entrance)}>
      <Animated.View style={animatedStyle}>
        {hanging ? (
          <View style={styles.hanging} testID="mascot-hanging">
            {image}
          </View>
        ) : (
          image
        )}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  img: {},
  /** The hang itself — a plain transform, so it holds with animations off. */
  hanging: { transform: [{ rotate: '180deg' }] },
});
