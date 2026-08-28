/**
 * THE RINGING SCREEN. Chacha-ji is calling and the learner has not answered yet.
 *
 * A CALL IS AN EVENT, NOT A LESSON. Every other speaking surface in Bolo is
 * framed as practice; this one is deliberately not. There is no score here, no
 * rubric, no "get ready" coaching, and nothing that suggests they are about to
 * be assessed. It is a phone ringing.
 *
 * IGNORING IS A FIRST-CLASS CHOICE, WHICH IS WHY THE SECOND BUTTON SAYS SO.
 * "Ignore" rather than "Decline" or "Reject": he rings again later, nothing is
 * lost, and the word should not imply the learner has shut a door. That is the
 * retention shape, and it is deliberately gentler than a streak.
 *
 * WHY THE POSTER AND NOT THE VIDEO. The backdrop clip starts when the call is
 * ANSWERED, the way a video call actually behaves: you see a still of the
 * caller while it rings. It also keeps a video decode off this screen entirely,
 * which is worth having given what expo-video on the launch path once cost this
 * app.
 *
 * FOUR REPO SCARS ARE DESIGNED AROUND HERE, all from CLAUDE.md:
 *   1. useNativeDriver: false on every animation. The native driver does not
 *      tick in release builds of this app (build 270 measured a value on `true`
 *      dead flat beside the same value on `false` still moving). A ringing
 *      screen is nothing but motion, so this decides the whole approach.
 *   2. The poster is sized in EXPLICIT POINTS from Dimensions. An Image sized
 *      by width:'100%' + aspectRatio or by absoluteFill in this tree can
 *      resolve to its intrinsic pixel size on device. That was the whole
 *      blank-board saga of builds 511 to 515.
 *   3. NO react-native-svg ANYWHERE ON THIS SCREEN. An Svg overlay eats every
 *      touch beneath it even with pointerEvents="none", and it killed every
 *      stop-card tap once already. The two most important touch targets in the
 *      feature live here, so there is no Svg to get it wrong with.
 *   4. NO expo-image. Banned app-wide, five cold-start crashes out of five,
 *      twice. React Native's own Image renders the poster.
 *
 * MOTION IS UNVERIFIED UNTIL A STORE BUILD. The simulator animates where a
 * release build is frozen, so a green screenshot here proves layout and touch
 * and says nothing about whether the pulse ticks on a device.
 */
import React from 'react';
import {
  Animated,
  Dimensions,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useReducedMotion } from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { hapticHeavy, hapticLight, hapticMedium } from '@/lib/haptics';

/** One breath of the ring, in and out. Slow: he is patient, not urgent. */
const RING_HALF_MS = 900;

/**
 * ONE DESIGN ON BOTH PLATFORMS, and that is the owner's call, 2026-08-28.
 *
 * This was briefly branched into an iOS idiom and an Android idiom. It is not
 * any more: the owner looked at the iOS rendering and said keep it, one generic
 * type for both. That is the better trade here. A two-button incoming call
 * already looks broadly the same on the two platforms, so the split was buying
 * a few points of metrics and costing a second thing to keep in step, which is
 * the hand-maintained twin problem this codebase already has enough of.
 *
 * WHAT IS STILL BRANCHED IS BEHAVIOUR, NOT LOOK, and it stays branched because
 * it is not a style choice:
 *   - Android gets a ripple and does NOT dim on press, because a dim fights the
 *     ripple already answering the touch. iOS has no ripple, so it dims.
 *   - Android has a hardware back button and iOS does not. See app/(app)/call.tsx.
 */
const METRICS = {
  buttonSize: 76,
  bottomInset: 76,
  labelWeight: '600' as const,
  labelSpacing: 0,
  nameSize: 38,
  statusSize: 17,
};

/**
 * THE RING, IN HAPTICS. Owner's instruction, 2026-08-28: it should buzz while
 * it rings, and the buttons should click.
 *
 * Two buzzes then a rest, the cadence a real phone uses, rather than a
 * continuous rumble that reads as an error. The pause is most of the cycle on
 * purpose: a phone that never stops vibrating is a phone you want to silence.
 *
 * IT IS NOT VERIFIABLE ON A SIMULATOR. The iOS Simulator has no Taptic Engine
 * and expo-haptics is a silent no-op there, so a green screenshot says nothing
 * about this. It needs a device, and until then it is written and unproven.
 *
 * The OS honours its own accessibility switches underneath us (iOS Settings >
 * Accessibility > Touch > Vibration), so there is deliberately no second
 * in-app toggle to keep in step with it.
 */
const RING_BUZZ_GAP_MS = 380;
const RING_CYCLE_MS = 2400;

export function useRingingHaptics(active: boolean) {
  React.useEffect(() => {
    if (!active) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const buzz = () => {
      hapticHeavy();
      timers.push(setTimeout(hapticHeavy, RING_BUZZ_GAP_MS));
    };
    buzz();
    const interval = setInterval(buzz, RING_CYCLE_MS);
    return () => {
      clearInterval(interval);
      // Every pending second buzz has to die with the screen, or a learner who
      // answers on the first ring feels one more buzz after picking up.
      timers.forEach(clearTimeout);
    };
  }, [active]);
}

export type CallBackdropId = 'driving' | 'backseat';

/**
 * The posters, keyed the way the SERVER names its backdrops. The API picks one
 * per call and returns the same one on every turn, so a call never changes car
 * mid-sentence; this map is only how the client resolves that id to a bundled
 * asset. Keep the keys in step with CALL_BACKDROPS in the api-server's
 * chachaCallScript.ts.
 */
export const CALL_POSTERS: Record<CallBackdropId, ImageSourcePropType> = {
  driving: require('@/assets/call/chacha-call-driving-poster.jpg'),
  backseat: require('@/assets/call/chacha-call-backseat-poster.jpg'),
};

export interface IncomingCallProps {
  /** Which backdrop this call uses. The server decides; the client obeys. */
  backdrop: CallBackdropId;
  onAnswer: () => void;
  onIgnore: () => void;
  /** Escape hatch for tests and screenshots; defaults to the real hook. */
  reduceMotionOverride?: boolean;
}

export function IncomingCall({
  backdrop,
  onAnswer,
  onIgnore,
  reduceMotionOverride,
}: IncomingCallProps) {
  const colors = useColors();
  const systemReduceMotion = useReducedMotion();
  const reduceMotion = reduceMotionOverride ?? systemReduceMotion;

  // Explicit points, not percentages. See scar 2 above.
  const { width, height } = Dimensions.get('window');

  const ring = React.useRef(new Animated.Value(0)).current;

  // Buzzing is not motion, so it is deliberately NOT gated on reduce motion.
  // The OS has its own vibration switch and that is the one that should win.
  useRingingHaptics(true);

  React.useEffect(() => {
    // Reduce Motion still gets a ringing screen, just a still one. The
    // information is that he is calling, and that survives without motion.
    if (reduceMotion) {
      ring.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ring, {
          toValue: 1,
          duration: RING_HALF_MS,
          useNativeDriver: false,
        }),
        Animated.timing(ring, {
          toValue: 0,
          duration: RING_HALF_MS,
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, ring]);

  return (
    <View
      testID="incoming-call"
      style={[styles.root, { backgroundColor: '#000' }]}
    >
      <Image
        testID="incoming-call-poster"
        source={CALL_POSTERS[backdrop]}
        style={{ position: 'absolute', top: 0, left: 0, width, height }}
        resizeMode="cover"
      />
      {/* A plain dim, so his face reads behind the type without a blur that
          costs a frame budget this app cannot spare. */}
      <View style={[styles.scrim, { width, height }]} />

      <View style={styles.top}>
        <Text testID="incoming-call-name" style={styles.name}>
          Chacha-ji
        </Text>
        <Animated.Text
          testID="incoming-call-status"
          style={[
            styles.status,
            // The words carry it; the fade is decoration on top of them.
            { opacity: reduceMotion ? 1 : ring.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) },
          ]}
        >
          calling you
        </Animated.Text>
      </View>

      <View style={styles.actions}>
        <CallAction
          testID="incoming-call-ignore"
          label="Ignore"
          hint="He will ring again later"
          icon="call"
          iconRotated
          filled={false}
          tint={colors.destructive}
          // Light, not medium: ignoring is the gentler of the two choices and
          // should not feel like a slammed door. He rings again later.
          onPress={() => {
            hapticLight();
            onIgnore();
          }}
          ring={null}
        />
        <CallAction
          testID="incoming-call-answer"
          label="Answer"
          hint="Say hello"
          icon="call"
          filled
          tint={colors.success}
          // Medium, the weight this codebase already gives a confirming action.
          onPress={() => {
            hapticMedium();
            onAnswer();
          }}
          ring={reduceMotion ? null : ring}
        />
      </View>
    </View>
  );
}

/**
 * One of the two controls.
 *
 * THE STATE IS NEVER CARRIED BY COLOUR ALONE, and that is a hard requirement
 * rather than a preference. Answer and Ignore are the textbook green-circle /
 * red-circle pair, which is precisely the pair a red-green colourblind learner
 * cannot separate. Four signals distinguish them here and colour is only the
 * last of them:
 *
 *   the WORD      "Answer" / "Ignore", always visible, never an icon alone
 *   the SHAPE     filled disc / hollow ring with a heavy border
 *   the GLYPH     handset upright / handset turned down
 *   the POSITION  answer sits right, ignore left, and does not move
 *
 * Remove any one of those and it still reads. Remove the colour and it still
 * reads, which is the actual test.
 */
function CallAction({
  testID,
  label,
  hint,
  icon,
  iconRotated = false,
  filled,
  tint,
  onPress,
  ring,
}: {
  testID: string;
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconRotated?: boolean;
  filled: boolean;
  tint: string;
  onPress: () => void;
  ring: Animated.Value | null;
}) {
  const size = METRICS.buttonSize;
  return (
    <View style={styles.action}>
      {/* The pulse is a sibling BEHIND the button, never a parent wrapping it:
          an animated ancestor that grows would move the touch target under the
          learner's thumb while they are reaching for it. */}
      {ring ? (
        <Animated.View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 2,
            borderColor: tint,
            opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
            transform: [
              { scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] }) },
            ],
          }}
        />
      ) : null}

      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${hint}.`}
        onPress={onPress}
        hitSlop={12}
        android_ripple={{ color: 'rgba(255,255,255,0.24)', borderless: true, radius: size / 2 }}
        style={({ pressed }) => [
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: filled ? tint : 'transparent',
            borderWidth: filled ? 0 : 3,
            borderColor: tint,
            // iOS dims the control on press. Android must NOT, or the dim
            // fights the ripple that is already answering the touch.
            opacity: Platform.OS === 'ios' && pressed ? 0.7 : 1,
          },
        ]}
      >
        <Ionicons
          name={icon}
          size={Math.round(size * 0.42)}
          color={filled ? '#fff' : tint}
          style={iconRotated ? { transform: [{ rotate: '135deg' }] } : undefined}
        />
      </Pressable>

      <Text testID={`${testID}-label`} style={styles.actionLabel}>
        {label}
      </Text>
      <Text style={styles.actionHint}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'space-between' },
  scrim: { position: 'absolute', top: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.42)' },
  top: { marginTop: 96, alignItems: 'center', paddingHorizontal: 24 },
  name: {
    fontSize: METRICS.nameSize,
    fontWeight: '700',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  status: {
    marginTop: 8,
    fontSize: METRICS.statusSize,
    color: '#fff',
    letterSpacing: 0.4,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'flex-start',
    marginBottom: METRICS.bottomInset,
    paddingHorizontal: 24,
  },
  action: { alignItems: 'center', width: 132 },
  actionLabel: {
    marginTop: 14,
    fontSize: 17,
    fontWeight: METRICS.labelWeight,
    letterSpacing: METRICS.labelSpacing,
    color: '#fff',
    // These sit over his arm, which is bright and busy. Every other piece of
    // type on this screen already had a shadow; these two were the ones a
    // learner actually has to read before pressing something.
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  actionHint: {
    marginTop: 3,
    fontSize: 12,
    color: 'rgba(255,255,255,0.86)',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
});
