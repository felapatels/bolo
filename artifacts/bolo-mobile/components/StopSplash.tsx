/**
 * The stop transition overlay. Mounted at the ROOT beside BrandSplash, above
 * the Stack, so it survives the navigation it is covering: a stop tap pushes
 * the practice route underneath while this holds the screen.
 *
 * Web twin: src/components/stop-splash.tsx. See lib/stopSplash.ts for why this
 * is one animated value and not a per-stop scatter.
 *
 * IT CAPTURES TOUCH WHILE PLAYING, so a tap skips straight to the fade. The
 * boot splash learned this the hard way on 2026-08-26: pointerEvents none let
 * every tap fall through to the live screen underneath and fire it unseen.
 * During the fade it goes back to none, so the tap that skips is not followed
 * by a second one landing in a half-faded overlay.
 *
 * Any failure renders null and the learner simply arrives at the stop page with
 * no transition, which is the same thing an unfilmed zone does.
 */
import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useReducedMotion } from 'react-native-reanimated';
import {
  STOP_SPLASH_EXIT_MS,
  STOP_SPLASH_HOLD_MS,
  endStopSplash,
  stopSplashFor,
  useStopSplashZone,
} from '@/lib/stopSplash';

export function StopSplash() {
  const zone = useStopSplashZone();
  if (zone === null) return null;
  // Keyed on the zone so a second tap into a different zone mounts a fresh
  // player rather than reusing one that is already part-way through.
  return <StopSplashFilm key={zone} zone={zone} />;
}

function StopSplashFilm({ zone }: { zone: number }) {
  const source = stopSplashFor(zone);
  const reduceMotion = useReducedMotion();
  const opacity = React.useRef(new Animated.Value(1)).current;
  const [exiting, setExiting] = React.useState(false);

  const player = useVideoPlayer(source, (p) => {
    p.loop = false;
    p.muted = true;
    p.play();
  });

  // The hold is a timer rather than a play-to-end, because a film that fails to
  // decode must not trap the learner behind the overlay. Same failsafe reasoning
  // as SPLASH_MAX_HOLD_MS on the boot film.
  React.useEffect(() => {
    const t = setTimeout(() => setExiting(true), STOP_SPLASH_HOLD_MS);
    return () => clearTimeout(t);
  }, []);

  React.useEffect(() => {
    if (!exiting) return;
    // useNativeDriver: false. Per CLAUDE.md the native driver does not tick in
    // release builds of this app, so `true` here would leave the overlay sitting
    // at full opacity until the callback fired and then vanish in one frame.
    const anim = Animated.timing(opacity, {
      toValue: 0,
      duration: reduceMotion ? 0 : STOP_SPLASH_EXIT_MS,
      useNativeDriver: false,
    });
    anim.start(() => endStopSplash());
    return () => anim.stop();
  }, [exiting, reduceMotion, opacity]);

  return (
    <Animated.View
      testID="stop-splash"
      pointerEvents={exiting ? 'none' : 'auto'}
      onStartShouldSetResponder={() => !exiting}
      onResponderRelease={() => setExiting(true)}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.overlay, { opacity }]}
    >
      {/* The ground is the film's own opening tone, the same value the boot
          splash and index.html carry, so a frame the video has not painted yet
          never flashes light. */}
      <View style={styles.ground} />
      <VideoView
        testID="stop-splash-film"
        player={player}
        style={styles.layer}
        nativeControls={false}
        contentFit="cover"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { backgroundColor: '#89695B', zIndex: 9998, elevation: 9998 },
  ground: { ...StyleSheet.absoluteFillObject, backgroundColor: '#89695B' },
  layer: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
});
