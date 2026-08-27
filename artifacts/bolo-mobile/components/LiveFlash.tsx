/**
 * THE LIVE FLASH. A card washes once, softly, when its content changes under
 * the learner, so a surface that is otherwise still reads as live rather than
 * as a screenshot.
 *
 * Asked for 2026-08-27: "lets do the live home card updates with flashing
 * subtle making it feel live". The green dot from 2026-08-26 (FeedPulse)
 * already says SOMETHING ARRIVED; this says it about the whole card, which is
 * what the eye actually catches at a glance.
 *
 * ONE WASH, NOT A LOOP, and that is the whole design. A card that pulses
 * forever is an advert: the eye learns it in a day and then filters it, and it
 * costs battery to be ignored. A wash that fires only on a real change means
 * something every single time it happens, which is the same rule FeedPulse
 * follows and the reason it works.
 *
 * IT NEVER MOVES THE CARD. Only opacity changes: no scale, no translate, no
 * layout property. A card that grows on update nudges everything under it, and
 * on a home screen that is a list of other cards. It also means the wash cannot
 * cost a layout pass on a screen that is already fetching three things.
 *
 * REANIMATED, MATCHING THE FILE IT LANDS IN. HomeSocialStrip already drives its
 * rotation crossfade with useSharedValue/withTiming, and a second animation
 * mechanism inside one card would be worse than either alone. Note the standing
 * warning in CLAUDE.md: the NATIVE Animated driver does not tick in release
 * builds of this app, so every react-native Animated port here passes
 * useNativeDriver: false. That warning is about that API, not this one.
 *
 * REDUCED MOTION GETS NOTHING AT ALL. Not a dimmer flash: a learner who has
 * asked the system to stop animating things has asked for exactly that, and the
 * dot beside the text still tells them the news landed.
 */
import React from 'react';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native';

/**
 * The wash, in and out.
 *
 * IN FAST, OUT SLOW, which is what makes it read as a flash rather than a
 * blink. 160ms up catches the eye; 700ms down lets it leave without the card
 * appearing to switch off. Total is under a second on purpose: any longer and
 * a learner who looks up mid-wash cannot tell whether it is animating or the
 * card is simply that colour.
 */
export const LIVE_FLASH_IN_MS = 160;
export const LIVE_FLASH_OUT_MS = 700;

/**
 * Peak opacity of the wash.
 *
 * 0.14. Deliberately at the bottom of what is visible on a mid-grey row: the
 * ask was "subtle", and the wash sits UNDER live text that has to stay
 * readable through it at all times. Anything above ~0.2 starts to read as the
 * row changing colour rather than catching light.
 */
export const LIVE_FLASH_PEAK = 0.14;

/**
 * A one-shot wash over the parent, fired by `active` going true.
 *
 * Absolutely positioned and non-interactive, so it costs no layout and can
 * never eat a tap from the card it sits on. The parent needs `overflow:
 * 'hidden'` and its own radius for the wash to keep the card's shape.
 */
export function LiveFlash({
  active,
  color,
  testID,
}: {
  /** True for as long as the caller considers the news fresh. */
  active: boolean;
  /** The wash colour, normally the surface's own accent. */
  color: string;
  testID?: string;
}) {
  const reduceMotion = useReducedMotion();
  const wash = useSharedValue(0);

  React.useEffect(() => {
    if (!active || reduceMotion) {
      // Snapped, not faded: a learner turning reduced motion on mid-wash
      // should not then watch it animate away.
      wash.value = 0;
      return;
    }
    wash.value = withSequence(
      withTiming(LIVE_FLASH_PEAK, {
        duration: LIVE_FLASH_IN_MS,
        easing: Easing.out(Easing.quad),
      }),
      withTiming(0, {
        duration: LIVE_FLASH_OUT_MS,
        easing: Easing.in(Easing.quad),
      }),
    );
  }, [active, reduceMotion, wash]);

  const style = useAnimatedStyle(() => ({ opacity: wash.value }));

  return (
    <Animated.View
      testID={testID}
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: color }, style]}
    />
  );
}
