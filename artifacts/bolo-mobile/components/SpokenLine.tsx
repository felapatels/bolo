import React from 'react';
import { Animated, Easing } from 'react-native';

/** How much a line grows while it is the one being spoken. */
const SPOKEN_SCALE = 1.06;
const IN_MS = 180;
const OUT_MS = 260;

/**
 * A LINE THAT SWELLS WHILE IT IS THE ONE BEING SPOKEN.
 *
 * The owner, build 29: "is it possible to show an animation of the word
 * enlarging on the screen when it's being spoken. then the meaning be enlarged
 * so learners can tie the visual to the audio for better learning?"
 *
 * It is teaching, not decoration. The coach says two things in a row, the
 * phrase and then its meaning, and the card gave no signal which one was
 * playing, so a learner had to work it out from the sound alone. Swelling the
 * line that is currently speaking is dual coding: eye and ear land on the same
 * thing at the same moment.
 *
 * THREE DECISIONS THAT ARE NOT PREFERENCES.
 *
 * SCALE, NEVER fontSize. Animating font size relayouts the card and everything
 * under it jumps on every play. A transform scales in place and costs no
 * layout at all.
 *
 * useNativeDriver: false. This app's native animation driver does not tick in
 * release builds, which is measured rather than assumed; see the measurement
 * rules in CLAUDE.md. `true` would look perfect in a simulator and leave the
 * word completely still on a real device, which is the worst of both.
 *
 * 1.06, NOT SOMETHING YOU CAN SEE MOVING. The eye only needs pulling to the
 * right line. A word lurching a third larger reads as a bug, and on a long
 * sentence it would collide with whatever sits beside it.
 *
 * Reduced motion holds it at rest. A learner who has asked the system for less
 * movement gets none, and loses nothing: the audio still says both parts.
 */
export function SpokenLine({
  speaking,
  reduceMotion,
  children,
  style,
}: {
  speaking: boolean;
  reduceMotion: boolean;
  children: React.ReactNode;
  style?: React.ComponentProps<typeof Animated.View>['style'];
}) {
  const scale = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (reduceMotion) {
      scale.setValue(1);
      return;
    }
    Animated.timing(scale, {
      toValue: speaking ? SPOKEN_SCALE : 1,
      duration: speaking ? IN_MS : OUT_MS,
      easing: speaking ? Easing.out(Easing.quad) : Easing.inOut(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [speaking, reduceMotion, scale]);

  return (
    <Animated.View style={[style, { transform: [{ scale }] }]}>
      {children}
    </Animated.View>
  );
}
