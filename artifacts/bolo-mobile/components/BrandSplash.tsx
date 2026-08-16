/**
 * The boot film overlay. Mobile twin of web's brand-splash.tsx.
 *
 * Mounted at the ROOT, not inside home, because the wait it covers is
 * Clerk resolving plus two redirect hops that happen above home in the
 * tree. It sits over the Stack as a pointer-events-none layer and never
 * gates, delays or blocks anything below it: every screen mounts and
 * fetches exactly as it would with no splash present.
 *
 * Lifecycle, identical to web: playing -> exiting -> done.
 *   FULL   the day's first cold start. Plays the film through on a fixed
 *          timer and ignores the ready signal entirely.
 *   READY  every later cold start. Releases at the LATER of the ready
 *          signal (lib/splashReady) and the minimum hold.
 * SPLASH_MAX_HOLD_MS is a failsafe cap in BOTH modes, so a signal that
 * never lands can never trap the learner behind the overlay.
 *
 * Any failure renders null and the app boots normally (boundary below).
 */
import React, { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Image, StyleSheet } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { VideoView, useVideoPlayer } from 'expo-video';
import {
  SPLASH_FILM,
  SPLASH_POSTER,
  SPLASH_FULL_PLAY_MS,
  SPLASH_MIN_HOLD_MS,
  SPLASH_MAX_HOLD_MS,
  SPLASH_EXIT_MS,
  isFirstColdStartToday,
  markFullPlayed,
} from '@/lib/splashFilm';
import { useHomeReady } from '@/lib/splashReady';

/**
 * Play-once latch for this launch, web's exact pattern. Consumed in a
 * mount effect AFTER the phase initializer has read it, so a second
 * mount inside one launch shows nothing.
 */
let coldStartConsumed = false;

export function __resetBrandSplashForTests(): void {
  coldStartConsumed = false;
}

type SplashPhase = 'playing' | 'exiting' | 'done';

function BrandSplashFilm() {
  // Read the latch once, at mount, before the effect below consumes it.
  const [phase, setPhase] = useState<SplashPhase>(() =>
    coldStartConsumed ? 'done' : 'playing',
  );
  /**
   * FULL mode. Web decides this synchronously from localStorage inside
   * the phase initializer; AsyncStorage cannot be read synchronously, so
   * here the decision lands one tick later. Until it resolves the film
   * is already on screen and READY is assumed, and FULL flips on only if
   * the answer comes back true while the phase is still playing. The
   * cost of the difference is bounded: the worst case is a first-of-day
   * launch whose ready signal beats the storage read, which releases
   * early rather than playing through.
   */
  const [full, setFull] = useState(false);
  const homeReady = useHomeReady();
  const reduceMotion = useReducedMotion();
  const mountedAt = useRef(Date.now());
  const opacity = useRef(new Animated.Value(1)).current;

  // Muted, no loop, plays as soon as it is ready. Reduced motion never
  // creates a source, so the film is not decoded at all in that mode.
  const player = useVideoPlayer(reduceMotion ? null : SPLASH_FILM, (p) => {
    p.muted = true;
    p.loop = false;
    p.play();
  });

  useEffect(() => {
    coldStartConsumed = true;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const first = await isFirstColdStartToday();
      if (cancelled || !first) return;
      // Stamped when FULL STARTS, not when it ends: a launch killed
      // mid-film has still spent the day's full play.
      //
      // In PLAIN STATEMENT POSITION, never inside the setFull updater.
      // React updaters must be pure: React may discard an invocation
      // (unmount, thrown-away render) or run it twice, so a write in
      // there fires unpredictably. Every other AsyncStorage write in
      // this app sits in statement position, including the daily-goal
      // stamp in (tabs)/index.tsx, and every one of them is reliable.
      //
      // Awaited, so FULL mode does not engage until the stamp is
      // durable. The film is already on screen either way, so the wait
      // costs the learner nothing.
      await markFullPlayed();
      if (cancelled) return;
      setFull(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // FULL: fixed timer, ready signal ignored.
  useEffect(() => {
    if (phase !== 'playing' || !full) return;
    const t = setTimeout(() => setPhase('exiting'), SPLASH_FULL_PLAY_MS);
    return () => clearTimeout(t);
  }, [phase, full]);

  // READY: the later of the ready signal and the minimum hold, so an
  // instantly-settling signal cannot blink the film away.
  useEffect(() => {
    if (phase !== 'playing' || full || !homeReady) return;
    const remaining = SPLASH_MIN_HOLD_MS - (Date.now() - mountedAt.current);
    const t = setTimeout(() => setPhase('exiting'), Math.max(0, remaining));
    return () => clearTimeout(t);
  }, [phase, full, homeReady]);

  // Failsafe cap, both modes.
  useEffect(() => {
    if (phase !== 'playing') return;
    const remaining = SPLASH_MAX_HOLD_MS - (Date.now() - mountedAt.current);
    const t = setTimeout(() => setPhase('exiting'), Math.max(0, remaining));
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'exiting') return;
    const anim = Animated.timing(opacity, {
      toValue: 0,
      duration: reduceMotion ? 0 : SPLASH_EXIT_MS,
      useNativeDriver: true,
    });
    anim.start(() => setPhase('done'));
    return () => anim.stop();
  }, [phase, reduceMotion, opacity]);

  if (phase === 'done') return null;

  return (
    <Animated.View
      testID="brand-splash"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.overlay, { opacity }]}
    >
      {reduceMotion ? (
        <Image
          testID="splash-still"
          source={SPLASH_POSTER}
          style={styles.layer}
          resizeMode="cover"
        />
      ) : (
        <>
          {/* expo-video has no poster prop, so the still is a plain
              underlay: the film paints over it the moment its first
              frame decodes, and until then the overlay is never empty. */}
          <Image source={SPLASH_POSTER} style={styles.layer} resizeMode="cover" />
          <VideoView
            testID="splash-film"
            player={player}
            style={styles.layer}
            nativeControls={false}
            contentFit="cover"
          />
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // The film opens on a near-white plate, so any other colour flashes at
  // reveal. zIndex + elevation put the overlay above everything.
  overlay: {
    backgroundColor: '#FFFFFF',
    zIndex: 9999,
    elevation: 9999,
  },
  // Explicit 100% alongside absoluteFill: a bare absoluteFill Image lays
  // out at its intrinsic size on iOS, which corner-crops the still and
  // makes resizeMode inert.
  layer: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
});

/**
 * A splash that throws must not take the app with it: render null and
 * let the boot continue. Same contract as web's SplashErrorBoundary,
 * and deliberately NOT components/ErrorBoundary, whose fallback shows a
 * full-screen error UI.
 */
class SplashErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function BrandSplash() {
  return (
    <SplashErrorBoundary>
      <BrandSplashFilm />
    </SplashErrorBoundary>
  );
}

export default BrandSplash;
