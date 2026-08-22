/**
 * Chacha-ji's welcome to the bazaar. Mobile twin of web's
 * gujarati-coach/src/components/bazaar-welcome.tsx.
 *
 * ONCE A DAY, not once a session and not every visit: the bazaar is a shop a
 * learner opens repeatedly to buy things, and a greeting that plays on every
 * entry stops being a greeting. The stamp is the calendar day, so the second
 * visit today is silent and tomorrow's first is not. Key and value format
 * match web exactly, so a learner on both platforms gets one day boundary
 * rather than two.
 *
 * INTERRUPTIBLE. Tapping anywhere ends it, and ending it STOPS THE VOICE.
 * Chacha-ji carrying on talking over the shop is the same defect his farewell
 * had on the journey, and it is fixed here by construction rather than by
 * remembering to call stop in four places: one cleanup owns the whole
 * lifetime.
 *
 * REDUCED MOTION shows the still instead of the film, and still speaks. The
 * setting suppresses movement, not sound.
 *
 * The poster IS the key art (keyart.png, already bundled for the stall bands),
 * so there is no second still to keep in step.
 */
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useReducedMotion } from 'react-native-reanimated';
// RESTORED 2026-08-20. This import was ripped out on 2026-08-19 because
// expo-video was the leading suspect for the launch crash. It was innocent: the
// cause was react-native-worklets 0.5.1, thirty crashes in thirty launches, and
// the crash carried on for hours after expo-video was gone. The splash's own
// film is back and verified at 10 cold starts for 10; this is the same
// treatment for the greeting, which is not even on the launch path.
//
// Web's twin, gujarati-coach/src/components/bazaar-welcome.tsx, never lost its
// <video> and has been the odd one out for a day. This restores parity.
import { VideoView, useVideoPlayer } from 'expo-video';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { activateSfxPlaybackRoute } from '@/lib/audio';
import { AppFonts } from '@/constants/fonts';

/** Metro static requires, the house pattern (lib/tearAudio.ts, ChaiStall). */
const WELCOME_FILM = require('../assets/images/bazaar/welcome.mp4') as number;
const WELCOME_STILL = require('../assets/images/bazaar/keyart.png') as number;
const WELCOME_VOICE = require('../assets/images/bazaar/chacha-welcome.mp3') as number;

/**
 * The film runs 5.04s and the voice 4.28s, so this outlasts both. expo-video
 * exposes an end event, but a timer is what the brand splash already uses and
 * it cannot be missed by a listener that attached late. Move this if the film
 * is ever swapped for a longer one.
 */
const WELCOME_MS = 5200;
/** Reduced motion holds the still long enough for the voice to finish. */
const STILL_MS = 4600;

const WELCOME_KEY = 'bolo-bazaar-welcome-day';

/** Local calendar day, unpadded, byte-identical to web's today(). */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

async function seenToday(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(WELCOME_KEY)) === today();
  } catch {
    // Fail CLOSED, matching web: an unreadable stamp is treated as already
    // seen, so a storage failure never means the greeting on every entry.
    return true;
  }
}

async function markSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(WELCOME_KEY, today());
  } catch {
    // A greeting is a nicety; losing the stamp just means it greets again.
  }
}

export function BazaarWelcome() {
  const reduceMotion = useReducedMotion();
  // undefined while the stamp is being read: render nothing rather than a
  // flash of full-screen black before the answer arrives.
  const [open, setOpen] = React.useState<boolean | undefined>(undefined);
  const voiceRef = React.useRef<AudioPlayer | null>(null);

  // Configured here, STARTED in the effect below. Playing in this setup
  // callback meant the film began at mount, while the AsyncStorage stamp was
  // still being read, so by the time the overlay appeared Chacha-ji's lips
  // were ahead of his voice by the length of that read, and the opening frames
  // were never seen at all. Web has no such gap because localStorage is
  // synchronous and its <video autoPlay> mounts only once open.
  const player = useVideoPlayer(
    reduceMotion ? null : WELCOME_FILM,
    (p) => {
      p.muted = true;
      p.loop = false;
    },
  );

  // Decide once, at mount. AsyncStorage cannot be read synchronously, so the
  // overlay is absent for a frame or two rather than appearing and vanishing.
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const seen = await seenToday();
      if (cancelled) return;
      if (seen) {
        setOpen(false);
        return;
      }
      // Stamped when it OPENS, not when it ends: a learner who backs out
      // mid-greeting has still had today's.
      await markSeen();
      if (!cancelled) setOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * ONE effect owns the voice and the auto-close, so every exit path stops the
   * audio: the skip tap, the timer, a back gesture, and the screen unmounting
   * all run this cleanup. Nothing else calls stop.
   */
  React.useEffect(() => {
    if (open !== true) return;
    let cancelled = false;

    // Film, voice, and the close timer all start on THIS tick. That is the
    // whole point of starting playback here rather than at mount.
    if (!reduceMotion) {
      try {
        player.play();
      } catch {
        /* a silent still is still a greeting */
      }
    }

    try {
      const p = createAudioPlayer(WELCOME_VOICE);
      voiceRef.current = p;
      // Same route flip the tear SFX needs: with a warm mic session iOS would
      // send this to the earpiece. Fire-and-forget, so it never delays the
      // film.
      void activateSfxPlaybackRoute()
        .catch(() => {})
        .then(() => {
          if (cancelled) return;
          try {
            p.play();
          } catch {
            /* a silent greeting is still a greeting */
          }
        });
    } catch {
      voiceRef.current = null;
    }

    const t = setTimeout(
      () => setOpen(false),
      reduceMotion ? STILL_MS : WELCOME_MS,
    );

    return () => {
      cancelled = true;
      clearTimeout(t);
      // The film stops on the same cleanup as the voice. A skipped greeting
      // that keeps decoding behind the shop is the same defect as one that
      // keeps talking.
      try {
        player.pause();
      } catch {
        /* already released */
      }
      try {
        voiceRef.current?.remove();
      } catch {
        /* already released */
      }
      voiceRef.current = null;
    };
    // `player` is intentionally absent: useVideoPlayer only rebuilds it when
    // its source changes, and the source depends solely on reduceMotion, which
    // is already a dependency. Adding it would restart the voice on any
    // incidental identity change.
  }, [open, reduceMotion]);

  if (open !== true) return null;

  return (
    <Pressable
      testID="bazaar-welcome"
      accessibilityRole="button"
      accessibilityLabel="Skip the welcome"
      onPress={() => setOpen(false)}
      style={styles.overlay}
    >
      {reduceMotion ? (
        <Image
          testID="bazaar-welcome-still"
          source={WELCOME_STILL}
          style={styles.media}
          resizeMode="contain"
        />
      ) : (
        <VideoView
          testID="bazaar-welcome-video"
          player={player}
          style={styles.media}
          nativeControls={false}
          contentFit="contain"
        />
      )}
      <View pointerEvents="none" style={styles.hintWrap}>
        <Text style={styles.hint}>Tap to skip</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: '#000000',
    justifyContent: 'center',
    zIndex: 9998,
    elevation: 9998,
  },
  media: {
    height: '100%',
    width: '100%',
  },
  hintWrap: {
    bottom: 40,
    position: 'absolute',
  },
  hint: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: AppFonts.extrabold,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
});