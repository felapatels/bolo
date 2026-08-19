import React from 'react';
import { Image, StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { appear, appearZoom } from '@/lib/entrance';
import { accessoryOverlaySource, mascotSource } from '@/lib/mascotOutfits';
import { useEquippedOutfit } from '@/contexts/OutfitContext';

/**
 * Bolo the Parrot, the friendly face of the app. Renders one of the five
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
 * - cheer:    wins, lesson complete, streak milestone, badge earned
 * - thumbsup: a good attempt, correct answer, decent score
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
 * `working` is the evaluating state: Bolo zooms out small and spins in place
 * while something is being worked out for the learner, then zooms back in when
 * it lands. It replaced the throbber inside the practice record button.
 */
export type MascotMotion = 'none' | 'float' | 'bounce' | 'sway' | 'working';

/** How small Bolo gets while he is working. */
const WORKING_SCALE = 0.45;

// Pose art (canonical and dressed) resolves in lib/mascotOutfits.ts, so every
// surface that renders <Mascot> shows the equipped outfit without knowing
// outfits exist.

// ---------------------------------------------------------------------------
// Funny idle sequences, at least 5 one-shot animations that fire when isIdle
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
  accessory,
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
  /**
   * Force an accessory instead of the learner's equipped one, the head slot's
   * twin of `outfit`, so the shop can preview a hat over whatever garment is
   * already on the bird. Pass null for bare-headed.
   */
  accessory?: string | null;
}) {
  const equipped = useEquippedOutfit();
  const wornOutfit = outfit === undefined ? equipped.garment : outfit;
  const wornAccessory =
    accessory === undefined ? equipped.accessory : accessory;
  const reduceMotion = useReducedMotion();
  const loop = useSharedValue(0);

  // Working (evaluating) state. The shrink itself is a PLAIN style on an inner
  // view, applied for as long as the mascot is working; the shared values carry
  // only the zoom INTO and OUT OF it and the spin. Keeping the state itself out
  // of the worklet means he still reads as "away and busy" wherever animations
  // don't run at all.
  const working = motion === 'working';
  /** Multiplies the plain shrink: >1 cancels it, so the spring reads as a zoom. */
  const zoom = useSharedValue(1);
  const spin = useSharedValue(0);
  const breathe = useSharedValue(1);

  // Extra shared values for funny idle transforms.
  const funnyY = useSharedValue(0);
  const funnyRotate = useSharedValue(0);
  const funnyScale = useSharedValue(1);

  // Track previous isIdle to detect rising edge.
  const prevIsIdle = React.useRef(false);

  // Idle loop (float / bounce / sway), skipped when reduced motion is on.
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

  // Zoom out into the working state and back in when it ends. The plain style
  // has already snapped him to WORKING_SCALE by the time this runs, so the
  // spring starts from a value that CANCELS it (1 / WORKING_SCALE = full size)
  // and settles at 1. Leaving, the plain style is gone, so the same spring runs
  // from WORKING_SCALE up to 1. Set through withSequence rather than two writes
  // so the spring is guaranteed to start from the intended value.
  const wasWorking = React.useRef(false);
  React.useEffect(() => {
    const was = wasWorking.current;
    wasWorking.current = working;
    if (reduceMotion || working === was) {
      if (reduceMotion) zoom.value = 1;
      return;
    }
    zoom.value = withSequence(
      withTiming(working ? 1 / WORKING_SCALE : WORKING_SCALE, { duration: 0 }),
      withSpring(1, { damping: 13, stiffness: 170 }),
    );
  }, [working, reduceMotion, zoom]);

  // The spin itself, one revolution every 1.4s for as long as he is away
  // working, then a quick unwind so he faces front again as he zooms back in.
  React.useEffect(() => {
    if (reduceMotion) {
      spin.value = 0;
      return;
    }
    spin.value = working
      ? withRepeat(withTiming(360, { duration: 1400, easing: Easing.linear }), -1, false)
      : withTiming(0, { duration: 220 });
  }, [working, reduceMotion, spin]);

  // Reduced motion gets neither the zoom nor the spin, and a bird sitting small
  // and still does not read as "working". A slow opacity breathe carries that
  // instead, no movement, so it stays motion-safe. It has to opt out of the
  // system reduced-motion switch explicitly or reanimated snaps it straight to
  // the end value and leaves the mascot dimmed.
  React.useEffect(() => {
    if (working && reduceMotion) {
      breathe.value = withRepeat(
        withTiming(0.5, { duration: 850, reduceMotion: ReduceMotion.Never }),
        -1,
        true,
      );
    } else {
      breathe.value = 1;
    }
  }, [working, reduceMotion, breathe]);

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

  // Celebrate bounce, fires a quick scale-pop when celebrateBounce increments.
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

  // Funny idle, fire a random one-shot sequence when isIdle becomes true.
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
      // Spin, full 360° then back to 0
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
      // Sneeze-scale, puff then settle
      funnyScale.value = withSequence(
        withSpring(1.3, { damping: 6, stiffness: 260 }),
        withTiming(0.85, { duration: 100 }),
        withSpring(1.1, { damping: 8, stiffness: 260 }),
        withTiming(1, { duration: 150 }),
      );
    } else if (idx === 3) {
      // Jump, bouncy hop with afterbounce
      funnyY.value = withSequence(
        withSpring(-24, { damping: 6, stiffness: 300 }),
        withSpring(0, { damping: 8, stiffness: 220 }),
        withSpring(-12, { damping: 8, stiffness: 260 }),
        withSpring(0, { damping: 10, stiffness: 200 }),
      );
    } else {
      // Dizzy spiral, wobble + float
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
    if (pose === 'cheer') rotate += (t - 0.5) * 10;

    // The working spin, and the zoom that cancels (or restores) the plain
    // shrink underneath it.
    rotate += spin.value;

    // Layer funny transforms on top.
    translateY += funnyY.value;
    rotate += funnyRotate.value;
    const scale = funnyScale.value * zoom.value;

    return {
      opacity: breathe.value,
      transform: [{ translateY }, { rotate: `${rotate}deg` }, { scale }],
    };
  });

  // Entrance "pop", a progressive enhancement implemented as a reanimated
  // layout animation. If it never commits, the view is simply shown at rest
  // (fully visible) rather than staying transparent. Re-keyed on pose so the pop
  // replays on pose changes, matching the previous lively reaction.
  const entrance =
    entering && !reduceMotion
      ? appearZoom(40)
      : undefined;

  const overlay = accessoryOverlaySource(pose, wornAccessory);
  const base = (
    <Image
      source={mascotSource(pose, wornOutfit)}
      style={[{ width: size, height: size }, styles.img, style]}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel={`Bolo the parrot, ${pose}`}
    />
  );

  // The head slot, stacked over whatever base the garment picked. Both files
  // are the same 1024 frame, so drawing the overlay at the same size in the
  // same box lines them up with no per-pose maths. The overlay carries its own
  // explicit width/height: a bare absoluteFill Image renders at intrinsic size
  // on iOS and ignores resizeMode.
  const image = overlay ? (
    <View style={{ width: size, height: size }}>
      {base}
      <Image
        source={overlay}
        style={[styles.overlay, { width: size, height: size }]}
        resizeMode="contain"
                accessible={false}
      />
    </View>
  ) : (
    base
  );

  return (
    <Animated.View key={pose} entering={appear(entrance)}>
      <Animated.View style={animatedStyle}>
        {working ? (
          <View style={styles.working} testID="mascot-working">
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
  overlay: { position: 'absolute', top: 0, left: 0 },
  /** The shrink itself, a plain transform, so it holds with animations off. */
  working: { transform: [{ scale: WORKING_SCALE }] },
});
