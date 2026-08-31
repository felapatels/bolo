/**
 * The boot film overlay. Mobile twin of web's brand-splash.tsx.
 *
 * Mounted at the ROOT, not inside home, because the wait it covers is
 * Clerk resolving plus two redirect hops that happen above home in the
 * tree. It sits over the Stack and never gates, delays or blocks anything
 * below it: every screen mounts and fetches exactly as it would with no
 * splash present.
 *
 * IT DOES CAPTURE TOUCH WHILE PLAYING, and that is a change from the
 * original. The overlay was pointerEvents="none" unconditionally, so every
 * tap fell through to the live screen underneath: tapping the middle of the
 * film launched the journey from the boarding pass and the learner saw
 * nothing happen until the splash ended. Reported on device 2026-08-26.
 * A tap now skips to the exit fade instead.
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
import { Animated, Image, Platform, StyleSheet } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useReducedMotion } from 'react-native-reanimated';
// THE SPLASH IS A STILL, RENDERED BY REACT NATIVE'S OWN Image, AND BOTH HALVES
// OF THAT ARE LOAD-BEARING. Do not casually change either one.
//
// expo-video went first: this component mounts at the ROOT layout, so it
// decoded a film on EVERY cold start. Removing it did NOT stop the crash, which
// is recorded in CLAUDE.md because an older commit message says otherwise.
//
// expo-image went second, and that one IS a clean result. Three builds, same
// app, one line apart:
//   d429f289  react-native Image, still poster      5 cold starts, 0 crashes
//   c56157f0  expo-image, animated WebP             5 cold starts, 5 crashes
//   0f349d37  expo-image, same still poster         5 cold starts, 5 crashes
// The film was never the variable. Swapping the Image component was. Whatever
// expo-image does on this SDK, it does not survive the root layout here, and
// it is now imported by nothing in the app.
//
// The poster path already existed for Reduce Motion, so the splash still shows
// and still holds for the same duration. It simply does not move.
import {
  SPLASH_FILM,
  SPLASH_POSTER,
  SPLASH_POSTER_SHORT,
  SPLASH_SHORT_START_S,
  SPLASH_MOTION_ENABLED,
  SPLASH_FULL_PLAY_MS,
  SPLASH_MIN_HOLD_MS,
  SPLASH_MAX_HOLD_MS,
  SPLASH_EXIT_MS,
  SPLASH_HANDOVER_BIRD,
  SPLASH_HANDOVER_BIRD_ANDROID_W,
  SPLASH_HANDOVER_FADE_MS,
  SPLASH_HANDOVER_GROUND,
  SPLASH_FILM_FRAME_FAILSAFE_MS,
  isFirstColdStartToday,
  markFullPlayed,
} from '@/lib/splashFilm';
import { markFilmGone, useHomeReady } from '@/lib/splashReady';

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

function BrandSplashFilm({
  onReady,
  nativeGone = true,
}: {
  onReady?: () => void;
  /**
   * True once the root has taken the native splash away. The handover plate
   * (the bird on white, matching the native splash) holds until then and
   * fades over the film after, so the cut from native to JS is plate for
   * plate and the only visible motion is the crossfade. Defaults to true so a
   * host that has no native splash to wait for gets the fade at once.
   */
  nativeGone?: boolean;
}) {
  // Read the latch once, at mount, before the effect below consumes it.
  const [phase, setPhase] = useState<SplashPhase>(() =>
    coldStartConsumed ? 'done' : 'playing',
  );
  /**
   * THE HANDOVER PLATE'S LIFE (build 18): opaque at mount, so the native
   * splash can hide behind an identical picture; fades once `nativeGone`;
   * unmounted when the fade lands so the film underneath takes no cost from
   * an invisible layer. Reduce Motion swaps instead of fading.
   */
  const handover = useRef(new Animated.Value(1)).current;
  const [handoverDone, setHandoverDone] = useState(false);
  /**
   * THE NATIVE SPLASH IS RELEASED ONLY ONCE THE PLATE'S BIRD HAS LOADED. A
   * simulator burst (build 18) caught one frame of plain white between the
   * native splash and the film: the overlay had laid out, so the root took
   * the native splash away, but the plate's PNG had not decoded yet. On a
   * store build that frame is the bird blinking out and back in. So `onReady`
   * waits for BOTH the layout and the image's onLoad; onError counts as
   * loaded so a missing asset can never hold the native splash up, and the
   * root's 600ms failsafe stands behind all of it.
   */
  const [laidOut, setLaidOut] = useState(false);
  const [birdPainted, setBirdPainted] = useState(false);
  const readyFired = useRef(false);
  useEffect(() => {
    if (readyFired.current || !laidOut || !birdPainted) return;
    readyFired.current = true;
    onReady?.();
  }, [laidOut, birdPainted, onReady]);
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

  /**
   * THE FILM. Muted, no loop, plays as soon as it is ready.
   *
   * Reduce Motion and the kill switch pass a null source, so the film is never
   * handed to the decoder in those modes rather than being decoded and covered.
   */
  const moving = SPLASH_MOTION_ENABLED && !reduceMotion;
  const player = useVideoPlayer(moving ? SPLASH_FILM : null, (p) => {
    p.muted = true;
    p.loop = false;
    // READY is assumed until AsyncStorage says otherwise, so open on the beat
    // where Bolo is already in shot rather than on the empty sky before it.
    // NOT PLAYED HERE (build 23): the film starts once the day's mode is
    // decided, see below, so it never has to rewind on screen.
    p.currentTime = SPLASH_SHORT_START_S;
  });

  /**
   * THE FILM STARTS AFTER THE DAY'S MODE IS DECIDED, AND THE PLATE WAITS FOR
   * ITS FIRST FRAME (build 23, owner off the 1.0.6 build: "there is a flicker
   * between the bolo bird and the splash video playing when i launch").
   *
   * Two things could show through the crossfade before this. The plate began
   * fading the moment the native splash was gone, whether or not the decoder
   * had drawn a frame, so the bird faded onto the POSTER and the film then
   * popped over it a beat later. And the film started playing at the short
   * start immediately, then rewound to 0 a tick later when the day's first
   * play came back from storage: a jump under the fade, or after it on a
   * slow read. Both are the same fault, motion on the film while the bird is
   * still handing over.
   *
   * So: `decided` is set once storage has answered and the film has been
   * put at its true start and played; `filmFrame` once the view has drawn a
   * frame; the plate fades only when both hold (or when there is no film to
   * wait for). SPLASH_FILM_FRAME_FAILSAFE_MS stands behind it so a decoder
   * that never reports cannot park the bird on screen.
   */
  const [decided, setDecided] = useState(false);
  const [filmFrame, setFilmFrame] = useState(false);

  useEffect(() => {
    coldStartConsumed = true;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const first = await isFirstColdStartToday();
      if (cancelled) return;
      if (first) {
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
        // durable. The plate is still up either way, so the wait costs the
        // learner nothing.
        await markFullPlayed();
        if (cancelled) return;
        setFull(true);
      }
      if (moving) {
        try {
          // The rewind happens BEFORE the first play, under the plate, so
          // nothing on screen ever jumps.
          if (first) player.currentTime = 0;
          player.play();
        } catch {
          /* player already released; the film is ending anyway */
        }
      }
      setDecided(true);
    })();
    return () => {
      cancelled = true;
    };
    // Mount only: the mode is decided once per launch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The plate may fade once the film is truly under it, or when there is no
  // film (Reduce Motion, the kill switch), or once the failsafe has run out.
  const filmReady = !moving || (decided && filmFrame);
  const [frameFailsafe, setFrameFailsafe] = useState(false);
  useEffect(() => {
    if (!nativeGone || filmReady) return;
    const t = setTimeout(() => setFrameFailsafe(true), SPLASH_FILM_FRAME_FAILSAFE_MS);
    return () => clearTimeout(t);
  }, [nativeGone, filmReady]);

  // FULL: fixed timer, ready signal ignored.
  useEffect(() => {
    if (phase !== 'playing' || !full) return;
    const t = setTimeout(() => setPhase('exiting'), SPLASH_FULL_PLAY_MS);
    return () => clearTimeout(t);
  }, [phase, full]);

  // THE MINIMUM HOLD COUNTS FROM THE CROSSFADE, NOT FROM MOUNT (build 18).
  // The handover plate covers the film for its fade, and in a dev client for
  // however long the bird takes to arrive over Metro; a hold that started at
  // mount was spent behind the plate, and the simulator burst showed the film
  // for three frames before it exited. The hold is the time the learner sees
  // the FILM, so it restarts when the plate has gone.
  const holdFrom = useRef(Date.now());
  useEffect(() => {
    if (handoverDone) holdFrom.current = Date.now();
  }, [handoverDone]);

  // READY: the later of the ready signal and the minimum hold, so an
  // instantly-settling signal cannot blink the film away.
  useEffect(() => {
    if (phase !== 'playing' || full || !homeReady) return;
    const remaining = SPLASH_MIN_HOLD_MS - (Date.now() - holdFrom.current);
    const t = setTimeout(() => setPhase('exiting'), Math.max(0, remaining));
    return () => clearTimeout(t);
  }, [phase, full, homeReady, handoverDone]);

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

  // THE CROSSFADE, once the native splash is gone. useNativeDriver is FALSE
  // on purpose: CLAUDE.md, "the native animation driver is dead" in this
  // app's release builds, and a fade that does not tick would leave the bird
  // parked over the film for 600ms and then blink. The JS driver is the one
  // proven to move here, and an opacity tween of one view costs nothing.
  useEffect(() => {
    if (!nativeGone || handoverDone || phase === 'done') return;
    // Not before the film has a frame under the plate (build 23), unless the
    // failsafe says the frame is never coming.
    if (!filmReady && !frameFailsafe) return;
    const anim = Animated.timing(handover, {
      toValue: 0,
      duration: reduceMotion ? 0 : SPLASH_HANDOVER_FADE_MS,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => {
      if (finished) setHandoverDone(true);
    });
    return () => anim.stop();
  }, [nativeGone, handoverDone, phase, reduceMotion, handover, filmReady, frameFailsafe]);

  // PUBLISHED FROM HERE, FOR HOME'S COUNT-UP. Anything home animates on
  // arrival is invisible while this overlay is up, and on a cold start that is
  // the whole of it. Fires for the warm launch too, where `phase` starts at
  // 'done' because the play-once latch was already spent: a consumer waiting on
  // a film that was never going to play must not wait forever.
  useEffect(() => {
    if (phase === 'done') markFilmGone();
  }, [phase]);

  if (phase === 'done') return null;

  return (
    <Animated.View
      testID="brand-splash"
      // Captures ONLY while playing. During the exit fade it goes back to
      // none, so the tap that skips is not followed by a second one landing
      // in a half-faded overlay. `markFullPlayed` is stamped when FULL
      // STARTS, so a skip still spends the day's full play and needs no
      // handling here.
      pointerEvents={phase === 'playing' ? 'auto' : 'none'}
      onStartShouldSetResponder={() => phase === 'playing'}
      onResponderRelease={() => setPhase('exiting')}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.overlay, { opacity }]}
      // THE HANDSHAKE THAT KILLS THE WHITE FLASH. onLayout fires once this
      // overlay has been laid out and is about to paint, which is the earliest
      // moment it is safe to take the native splash away. Before this, the
      // root hid the native splash as soon as the FONTS loaded, and the gap
      // between that and this view painting showed the app background:
      // "i see bolo with the brown background, then i see a white page flash
      // then i see the video splash" (2026-08-27). Since build 18 the layout
      // is half of the handshake; the plate's bird loading is the other half.
      onLayout={() => setLaidOut(true)}
    >
      {/* expo-video has no poster prop, so the still is a plain underlay: the
          film paints over it the moment its first frame decodes, and until then
          the overlay is never empty. In the still modes the underlay IS the
          splash and no VideoView is mounted at all. */}
      <Image
        testID="splash-still"
        // THE STILL HAS TO MATCH WHERE THE FILM STARTS (build 26). A short
        // launch opens at SPLASH_SHORT_START_S with Bolo already in shot,
        // and this underlay was always the frame at 0, which is the one
        // stretch of the film with no bird in it. Whenever the frame failsafe
        // lifted the plate before the film had painted, the learner saw the
        // empty sky and then the film popped in mid-flight. `full` is decided
        // from storage before that failsafe can fire, so it is known by the
        // time either of these is visible.
        source={full ? SPLASH_POSTER : SPLASH_POSTER_SHORT}
        style={styles.layer}
        resizeMode="cover"
      />
      {moving ? (
        <VideoView
          testID="splash-film"
          player={player}
          style={styles.layer}
          nativeControls={false}
          contentFit="cover"
          // The plate's other half (build 23): the crossfade waits for this.
          onFirstFrameRender={() => setFilmFrame(true)}
        />
      ) : null}
      {/* THE HANDOVER PLATE, on top of everything until it has faded: the
          same bird on the same white the native splash shows, drawn the way
          the native splash draws it (full-screen aspect-fit on iOS, 200dp on
          Android; see SPLASH_HANDOVER_BIRD). The native splash hides behind
          this, so the cut is invisible, and this fading is the crossfade the
          owner asked for. react-native's own Image, like the poster: nothing
          new on the launch path. */}
      {!handoverDone && (
        <Animated.View
          testID="splash-handover"
          pointerEvents="none"
          style={[styles.layer, styles.handover, { opacity: handover }]}
        >
          <Image
            testID="splash-handover-bird"
            source={SPLASH_HANDOVER_BIRD}
            resizeMode="contain"
            onLoad={() => setBirdPainted(true)}
            onError={() => setBirdPainted(true)}
            style={
              Platform.OS === 'android'
                ? { width: SPLASH_HANDOVER_BIRD_ANDROID_W, height: SPLASH_HANDOVER_BIRD_ANDROID_W }
                : styles.layer
            }
          />
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // THE GROUND IS SAMPLED FROM THE FILM'S FIRST FRAME, and three places carry
  // the same value: here, app.json's native splash backgroundColor, and web's
  // index.html boot style. White at any of them flashes before the film.
  //
  // #89695B is the 2026-08-26 film's average first frame; the 2026-08-20 one
  // was #8E6A59. app.json was left at #F8FAFC through both, which is the white
  // flicker reported on device 2026-08-26: the OS painted a near-white plate,
  // then React painted this. zIndex + elevation put the overlay above
  // everything.
  overlay: {
    backgroundColor: '#89695B',
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
  // The native splash's own white, so the handover is plate for plate. The
  // bird centres itself: iOS gets the full layer to aspect-fit in, Android a
  // fixed square in the middle.
  handover: {
    backgroundColor: SPLASH_HANDOVER_GROUND,
    alignItems: 'center',
    justifyContent: 'center',
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

export function BrandSplash({
  onReady,
  nativeGone,
}: { onReady?: () => void; nativeGone?: boolean } = {}) {
  return (
    <SplashErrorBoundary>
      <BrandSplashFilm onReady={onReady} nativeGone={nativeGone} />
    </SplashErrorBoundary>
  );
}

export default BrandSplash;
