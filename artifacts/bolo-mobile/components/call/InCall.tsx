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
import { AppFonts } from '@/constants/fonts';
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
  /** The learner's own level, 0..1, so they can SEE they are being heard. */
  level?: number;
  /** True while their finger is down and they are being recorded. */
  talking?: boolean;
  onTalkStart?: () => void;
  onTalkEnd?: () => void;
  onHangUp: () => void;
}

/**
 * THE LEARNER'S OWN VOICE, DRAWN.
 *
 * A call with no press-and-hold gives a learner nothing to tell them the phone
 * is listening, so a working call and a broken one look identical while they
 * talk (owner, 2026-08-28: "I can't tell that my response is being captured").
 *
 * Fifteen bars on a rolling history rather than one live level: a single
 * jumping bar shows the CURRENT instant, while a history shows that something
 * was captured a moment ago, which is the actual question being asked.
 *
 * Plain Views resized by state, no Animated and no Svg. The native animation
 * driver is dead in release builds of this app, so an Animated bar would move
 * in the simulator and freeze in the store build; and an Svg spanning this area
 * would eat the taps for the hang-up button underneath it.
 */
function LiveWaveform({ level, active }: { level: number; active: boolean }) {
  const BARS = 15;
  const [history, setHistory] = React.useState<number[]>(() => new Array(BARS).fill(0));
  React.useEffect(() => {
    setHistory((h) => [...h.slice(1), active ? level : 0]);
  }, [level, active]);
  return (
    <View style={styles.waveRow} accessible={false} pointerEvents="none">
      {history.map((v, i) => (
        <View
          key={i}
          style={[
            styles.waveBar,
            {
              // A floor of 3 so the row still reads as a meter at rest rather
              // than vanishing, which would look like the feature had gone.
              height: 3 + Math.round(v * 27),
              backgroundColor: active ? '#7CFFB2' : 'rgba(255,255,255,0.28)',
            },
          ]}
        />
      ))}
    </View>
  );
}

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * A CHAI THAT FLOATS UP AND FADES, on earning one (owner, 2026-08-28: "the
 * learner should see if they scored a chai with a +1 and chai image that shows
 * on screen going up and fades away").
 *
 * useNativeDriver: FALSE, and that is not a preference. CLAUDE.md records that
 * the native animation driver is dead in release builds of this app: a ported
 * animation on useNativeDriver:true came out flat on device while a false one
 * kept moving beside it in the same build. Anything set to true here would rise
 * perfectly in the simulator and sit frozen on a learner's phone, which is the
 * worst of both because nobody would catch it before TestFlight.
 *
 * Reduce Motion gets the chip without the journey: the reward is information,
 * the flight is decoration, and only the decoration is what that setting asks
 * to be spared.
 */
function ChaiFloat({ amount }: { amount: number }) {
  const reduceMotion = useReducedMotion();
  const rise = React.useRef(new Animated.Value(0)).current;
  const fade = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (amount <= 0) return;
    rise.setValue(0);
    fade.setValue(0);
    if (reduceMotion) {
      // Appear, hold, go. No travel.
      Animated.sequence([
        Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: false }),
        Animated.delay(1400),
        Animated.timing(fade, { toValue: 0, duration: 320, useNativeDriver: false }),
      ]).start();
      return;
    }
    Animated.parallel([
      Animated.timing(rise, { toValue: 1, duration: 1600, useNativeDriver: false }),
      Animated.sequence([
        Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: false }),
        Animated.delay(700),
        Animated.timing(fade, { toValue: 0, duration: 680, useNativeDriver: false }),
      ]),
    ]).start();
  }, [amount, reduceMotion, rise, fade]);

  if (amount <= 0) return null;
  return (
    <Animated.View
      pointerEvents="none"
      testID="call-chai-float"
      accessibilityLabel={`You earned ${amount} chai`}
      style={[
        styles.chaiFloat,
        {
          opacity: fade,
          transform: [
            { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [0, -90] }) },
          ],
        },
      ]}
    >
      {/* Cup, number and word together. Never colour alone. */}
      <Ionicons name="cafe" size={26} color="#FFD79A" />
      <Text style={styles.chaiFloatText}>+{amount}</Text>
    </Animated.View>
  );
}

export function InCall({
  backdrop,
  phase,
  text,
  romanized,
  chaiEarned,
  elapsedSeconds,
  level = 0,
  talking = false,
  onTalkStart,
  onTalkEnd,
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
            {speaking
              ? 'Chacha-ji is talking'
              : talking
                ? 'Listening, release to send'
                : 'Your turn, hold to talk'}
          </Text>
        </View>

        {/* Only on the learner's turn. During his line it would be drawing his
            voice, which it is not measuring. */}
        {!speaking && <LiveWaveform level={level} active={talking} />}
        <ChaiFloat amount={chaiEarned ?? 0} />

        <View style={styles.controlsRow}>
          <View style={styles.controlWrap}>
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
          {onTalkStart && onTalkEnd ? (
            <View style={styles.controlWrap}>
              {/* PRESS AND HOLD, not a toggle and not automatic. The automatic
                  version waited SILENCE_DURATION_MS of proven quiet before it
                  would send, which the owner summed up as "it waits too long",
                  and it could be tricked by a noisy room into sending on its
                  own. A finger has neither problem: release IS the end of the
                  turn.
                  It is also the gesture chat and practice already use, so a
                  learner arrives knowing how to talk to him. */}
              <Pressable
                testID="in-call-talk"
                accessibilityRole="button"
                accessibilityLabel={talking ? 'Release to send' : 'Hold to talk'}
                hitSlop={16}
                disabled={speaking}
                onPressIn={() => {
                  hapticMedium();
                  onTalkStart();
                }}
                onPressOut={onTalkEnd}
                style={[
                  styles.talkBtn,
                  {
                    backgroundColor: talking ? '#7CFFB2' : 'rgba(255,255,255,0.18)',
                    opacity: speaking ? 0.35 : 1,
                    transform: [{ scale: talking ? 0.94 : 1 }],
                  },
                ]}
              >
                {/* Word, glyph and fill move together. Never colour alone: the
                    owner is partially colour blind and this app's standing rule
                    is that state has to survive in greyscale. */}
                <Ionicons name="mic" size={30} color={talking ? '#08301C' : '#fff'} />
              </Pressable>
              <Text style={styles.hangUpLabel}>{talking ? 'Release' : 'Hold to talk'}</Text>
            </View>
          ) : null}
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
  /**
   * THE SAME GEOMETRY AS THE RINGING SCREEN'S IGNORE AND ANSWER, deliberately
   * (owner, 2026-08-28: "same positions as answer or end"). A learner taps
   * Answer on the right and a second later the control they need is Hold to
   * talk; putting it anywhere else moves the target out from under the thumb
   * that just arrived there. Copied from IncomingCall's `actions` and `action`:
   * row, space-evenly, 24 of horizontal padding, and fixed 132 columns so
   * neither label can shove the other off centre.
   */
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'flex-start',
    paddingHorizontal: 24,
  },
  controlWrap: { alignItems: 'center', width: 132 },
  talkBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4,
    height: 30,
    marginTop: 10,
    marginBottom: 4,
  },
  waveBar: { width: 4, borderRadius: 2 },
  chaiFloat: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 190,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  chaiFloatText: { color: '#FFD79A', fontFamily: AppFonts.extrabold, fontSize: 20 },
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
