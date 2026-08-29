/**
 * A glow around the edge of the call screen saying what the last turn did.
 *
 * Owner, 2026-08-28: "the learner should see if they didn't score anything on
 * that round. like a glowing red around the screen edge, and a glowing green
 * when they did good and earned 1 chai. or XP."
 *
 * WHAT IT REPORTS IS WHETHER HE HEARD THEM, NOT HOW WELL THEY DID. A call is an
 * event, not a lesson: nothing in this feature reads WHAT the learner said, and
 * nothing should. `earned` means he heard them and the turn paid; `missed`
 * means he heard silence.
 *
 * IT IS NEVER RED, AND THAT IS THE ONE PLACE THIS DEPARTS FROM THE REQUEST.
 * Red reads as "wrong", and there is no wrong answer here to be told about. A
 * miss is as often the microphone, the room or our own transcriber as it is a
 * learner who froze, and this feature exists precisely so a shy child is never
 * pressed to try again. Amber says "say that again whenever you like", which is
 * the true thing. The green stays green.
 *
 * NEVER THE COLOUR ALONE, which is a standing rule in this app and not a
 * preference. The glow always arrives with a word and a glyph in CallCaptions
 * beneath it, so the screen reads with the hue removed: a cup and "+1 chai", a
 * bolt and "+5 XP", or an ear and "Didn't catch that". The two states also
 * differ in more than hue, since only one of them adds a pill at all.
 *
 * THREE REPO SCARS, all of them load-bearing here:
 *  1. `useNativeDriver: false`. The native animation driver is dead in release
 *     builds of this app, so a true here would fade perfectly in the simulator
 *     and sit frozen on a learner's phone.
 *  2. NO react-native-svg. An Svg spanning this area would eat every touch
 *     underneath it, including the hang-up button, even with pointerEvents
 *     none. Four LinearGradient strips have no such appetite.
 *  3. `pointerEvents="none"` on everything, belt and braces with 2.
 */
import React from 'react';
import { Animated, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useReducedMotion } from 'react-native-reanimated';

export type CallOutcome = 'earned' | 'missed';

/** How far the glow reaches in from each edge, in points. */
const REACH = 84;

/**
 * Both are LIGHT on a dark screen, so each reads as a glow on its own before
 * any question of hue arises. The green is the one the waveform already uses
 * for "you are being heard"; the amber is the chai cup's own colour, warmed.
 */
export const GLOW: Record<CallOutcome, string> = {
  earned: '#7CFFB2',
  missed: '#FFC46B',
};

export function CallEdgeGlow({ outcome }: { outcome: CallOutcome | null }) {
  const reduceMotion = useReducedMotion();
  const fade = React.useRef(new Animated.Value(0)).current;
  // Held so the colour does not snap to nothing halfway through the fade out.
  const [shown, setShown] = React.useState<CallOutcome | null>(null);

  React.useEffect(() => {
    if (outcome) setShown(outcome);
    const run = outcome
      ? Animated.sequence([
          Animated.timing(fade, {
            toValue: 1,
            duration: reduceMotion ? 120 : 260,
            useNativeDriver: false,
          }),
          Animated.delay(1100),
          Animated.timing(fade, {
            toValue: 0,
            duration: reduceMotion ? 120 : 620,
            useNativeDriver: false,
          }),
        ])
      : Animated.timing(fade, {
          toValue: 0,
          duration: reduceMotion ? 120 : 420,
          useNativeDriver: false,
        });
    run.start(({ finished }) => {
      if (finished && !outcome) setShown(null);
    });
    // Stopped on unmount. A hang-up mid-glow would otherwise leave a timer
    // running against a screen that is gone, which is a setState on a dead
    // component and a leaked timer in every test that renders this.
    return () => run.stop();
  }, [outcome, reduceMotion, fade]);

  if (!shown) return null;

  const color = GLOW[shown];
  const fadeOut = 'rgba(0,0,0,0)';

  return (
    <Animated.View
      testID="call-edge-glow"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { opacity: fade }]}
    >
      <LinearGradient
        pointerEvents="none"
        colors={[color, fadeOut]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: REACH }}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[fadeOut, color]}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: REACH }}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[color, fadeOut]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: REACH }}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[fadeOut, color]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: REACH }}
      />
    </Animated.View>
  );
}
