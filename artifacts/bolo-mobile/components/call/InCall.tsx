/**
 * The call, once it has been answered.
 *
 * HE MOVES WHEN HE TALKS AND HOLDS STILL WHEN HE LISTENS, which is the whole
 * reason this screen has two backdrop states rather than one. The clips
 * genuinely animate his face (the backseat one moves about 45x a static part of
 * the same frame), so leaving the loop running while the learner is speaking
 * would show him talking over them. Listening holds frame 0, which is the same
 * image the poster already is, so the handover has nothing to jump over.
 *
 * NOTHING ON THIS SCREEN SCORES ANYONE. A call is an event, not a lesson. The
 * only feedback is chai the learner EARNED, and an answer that earned none is
 * not remarked on at all. There is no red state anywhere here and there should
 * never be one.
 *
 * THE REPO SCARS, same four as the ringing screen: useNativeDriver: false
 * because the native driver does not tick in release builds; the still sized in
 * explicit points rather than percentages; NO react-native-svg anywhere near
 * the hang-up control; and no expo-image.
 */
import React from 'react';
import { Animated, Dimensions, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { useReducedMotion } from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { hapticMedium } from '@/lib/haptics';
import { CALL_POSTERS, CALL_VIDEOS, type CallBackdropId } from './backdrops';
import { CallCaptions } from './CallCaptions';
import { SelfView } from './SelfView';

/** Who currently holds the floor. */
export type CallPhase = 'speaking' | 'listening';

export interface InCallProps {
  backdrop: CallBackdropId;
  phase: CallPhase;
  /** His current line, in the language's own script. */
  text: string;
  romanized?: string | null;
  chaiEarned?: number;
  /** Seconds since the call connected, for the timer. */
  elapsedSeconds: number;
  onHangUp: () => void;
}

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function InCall({
  backdrop,
  phase,
  text,
  romanized,
  chaiEarned,
  elapsedSeconds,
  onHangUp,
}: InCallProps) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const { width, height } = Dimensions.get('window');
  const speaking = phase === 'speaking';

  // Reduce Motion never gets the loop at all: the source is null, so the film
  // is not handed to the decoder rather than decoded and then covered. That is
  // the same shape BrandSplash uses, and the reason is the same.
  const moving = !reduceMotion;
  const player = useVideoPlayer(moving ? CALL_VIDEOS[backdrop] : null, (p) => {
    p.muted = true;
    p.loop = true;
  });

  React.useEffect(() => {
    if (!moving) return;
    try {
      if (speaking) player.play();
      // Pausing rather than seeking to 0: he holds where he is, which reads as
      // attentive. Snapping back to the first frame every time the learner
      // speaks would be a visible twitch on every single turn.
      else player.pause();
    } catch {
      // A player that has already been released is not worth a crash on a call.
    }
  }, [moving, speaking, player]);

  // The listening pip. useNativeDriver: false, per CLAUDE.md.
  const pulse = React.useRef(new Animated.Value(0.4)).current;
  React.useEffect(() => {
    if (speaking || reduceMotion) {
      pulse.setValue(speaking ? 0.4 : 1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 620, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0.4, duration: 620, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [speaking, reduceMotion, pulse]);

  return (
    <View testID="in-call" style={styles.root}>
      {/* The still is ALWAYS mounted underneath. It is the poster while he
          listens and the film's own first frame while he speaks, so there is
          never a black rectangle between the two states. */}
      <Image
        testID="in-call-still"
        source={CALL_POSTERS[backdrop]}
        style={{ position: 'absolute', top: 0, left: 0, width, height }}
        resizeMode="cover"
      />
      {moving && speaking ? (
        <VideoView
          testID="in-call-video"
          player={player}
          style={{ position: 'absolute', top: 0, left: 0, width, height }}
          nativeControls={false}
          contentFit="cover"
        />
      ) : null}
      <View style={[styles.scrim, { width, height }]} />

      <View style={styles.top}>
        <Text testID="in-call-name" style={styles.name}>
          Chacha-ji
        </Text>
        <Text testID="in-call-timer" style={styles.timer}>
          {mmss(elapsedSeconds)}
        </Text>
      </View>

      <SelfView />

      <View style={styles.bottom}>
        <CallCaptions text={text} romanized={romanized} chaiEarned={chaiEarned} />

        <View testID="in-call-phase" style={styles.phase}>
          <Animated.View
            style={[
              styles.pip,
              { backgroundColor: speaking ? 'rgba(255,255,255,0.5)' : colors.success, opacity: pulse },
            ]}
          />
          {/* The WORD carries the state, never the dot's colour on its own. */}
          <Text style={styles.phaseText}>
            {speaking ? 'Chacha-ji is talking' : 'Your turn, go ahead'}
          </Text>
        </View>

        <View style={styles.hangUpWrap}>
          <Pressable
            testID="in-call-hangup"
            accessibilityRole="button"
            accessibilityLabel="Hang up. You can call again later."
            hitSlop={12}
            android_ripple={{ color: 'rgba(255,255,255,0.24)', borderless: true, radius: 34 }}
            onPress={() => {
              hapticMedium();
              onHangUp();
            }}
            style={({ pressed }) => [
              styles.hangUp,
              { backgroundColor: colors.destructive, opacity: pressed ? 0.75 : 1 },
            ]}
          >
            {/* Handset turned down. Word plus shape plus glyph, same rule as
                the ringing screen: never colour alone. */}
            <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
          </Pressable>
          <Text style={styles.hangUpLabel}>Hang up</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', justifyContent: 'space-between' },
  scrim: { position: 'absolute', top: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.3)' },
  top: { marginTop: 64, alignItems: 'center' },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  timer: {
    marginTop: 2,
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  bottom: { marginBottom: 44 },
  phase: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pip: { width: 9, height: 9, borderRadius: 5 },
  phaseText: {
    fontSize: 14,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  hangUpWrap: { marginTop: 22, alignItems: 'center' },
  hangUp: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  hangUpLabel: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
});
