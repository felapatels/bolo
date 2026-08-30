import React from 'react';
import { AppState, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs } from 'expo-router';
// Inline the tab-button props shape so we don't depend on
// @react-navigation/bottom-tabs being a direct dep of this package.
// style is forwarded from the tab bar renderer and carries the correct slot width.
type BoloTabButtonProps = {
  onPress?: React.ComponentProps<typeof Pressable>['onPress'];
  onLongPress?: React.ComponentProps<typeof Pressable>['onLongPress'];
  accessibilityState?: { selected?: boolean; disabled?: boolean };
  // @react-navigation/bottom-tabs v7 passes the selected flag to custom
  // tabBarButton renderers as `aria-selected` on native and does NOT pass
  // accessibilityState. Both shapes are accepted so the button works with
  // either renderer contract.
  'aria-selected'?: boolean;
  style?: React.ComponentProps<typeof Pressable>['style'];
  children?: React.ReactNode;
};
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Path, Text as SvgText, TextPath } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { hapticLight } from '@/lib/haptics';
import { ChatRecordingProvider, useChatRecording } from '@/components/ChatRecordingContext';
import { accessoryOverlaySource, mascotSource } from '@/lib/mascotOutfits';
import { useEquippedOutfit } from '@/contexts/OutfitContext';

// ---------------------------------------------------------------------------
// Mascot pose assets + type
// ---------------------------------------------------------------------------
type MascotPose = 'wave' | 'cheer' | 'thumbsup' | 'thinking' | 'tryagain';

const POSES: MascotPose[] = ['wave', 'cheer', 'thumbsup', 'thinking', 'tryagain'];

function randomOtherPose(current: MascotPose): MascotPose {
  const others = POSES.filter((p) => p !== current);
  return others[Math.floor(Math.random() * others.length)];
}

// ---------------------------------------------------------------------------
// BoloNavParrot — animated parrot for the bottom nav bubble
// ---------------------------------------------------------------------------
function BoloNavParrot({
  focused,
  size,
}: {
  focused: boolean;
  size: number;
}) {
  const reduceMotion = useReducedMotion();
  /**
   * THE NAV BIRD DRESSES LIKE EVERY OTHER BOLO (owner, 2026-08-28: "bolo in the
   * nav bar doesn't respect the rule that it should be wearing whatever clothes
   * are equipped").
   *
   * It was the one mascot in the app still on a bare undressed pose map, so a
   * learner who had spent Chai on a kurta saw it everywhere except on the
   * button they press most. EquippedOutfitProvider wraps this whole tab group
   * from app/(app)/_layout.tsx, so the same hook the on-screen mascot uses
   * works here with nothing new to wire.
   *
   * A pose a client has not shipped falls back to canonical Bolo rather than
   * blanking her; that is mascotSource's own contract, not something added here.
   */
  const equipped = useEquippedOutfit();

  // Current pose state
  const [pose, setPose] = React.useState<MascotPose>('wave');

  // Shared values for transforms
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const rotate = useSharedValue(0);

  // Keep a ref to track pose for the interval callback (avoid stale closure)
  const poseRef = React.useRef<MascotPose>('wave');
  const intervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const burstTicksRef = React.useRef(0);

  // Helper to update pose via both state and ref
  const nextPose = React.useCallback(() => {
    const next = randomOtherPose(poseRef.current);
    poseRef.current = next;
    setPose(next);
  }, []);

  // Helper: start the appropriate pose-cycling interval for the current focused state
  const startInterval = React.useCallback(
    (isFocused: boolean) => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (isFocused) {
        // Burst: cycle fast for 6 ticks then slow down
        burstTicksRef.current = 0;
        intervalRef.current = setInterval(() => {
          nextPose();
          burstTicksRef.current += 1;
          if (burstTicksRef.current >= 6) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            intervalRef.current = setInterval(nextPose, 4000);
          }
        }, 1500);
      } else {
        // Normal slow cycling
        intervalRef.current = setInterval(nextPose, 4000);
      }
    },
    [nextPose],
  );

  // Pose cycling interval — restart whenever focused changes or app foregrounds
  React.useEffect(() => {
    const focusedAtMount = focused;
    startInterval(focusedAtMount);

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        // Resume interval when app returns to foreground
        startInterval(focusedAtMount);
      } else {
        // Clear interval when app is backgrounded / inactive
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    });

    return () => {
      subscription.remove();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [focused, startInterval]);

  // Helper: start the idle float loop
  const startFloat = React.useCallback(() => {
    if (reduceMotion) return;
    translateY.value = withRepeat(
      withTiming(-4, { duration: 1000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [reduceMotion, translateY]);

  // Idle float animation — continuous gentle bob, paused in background
  React.useEffect(() => {
    if (reduceMotion) {
      translateY.value = 0;
      return;
    }
    startFloat();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        // App returned to foreground — resume the float loop
        startFloat();
      } else {
        // App went to background / inactive — cancel the worklet to save battery
        cancelAnimation(translateY);
        translateY.value = 0;
      }
    });

    return () => {
      subscription.remove();
      cancelAnimation(translateY);
    };
  }, [reduceMotion, translateY, startFloat]);

  // Dance burst when focused becomes true
  React.useEffect(() => {
    if (reduceMotion) return;
    if (!focused) {
      // Return to gentle idle — reset rotate, let scale spring back to 1
      rotate.value = withTiming(0, { duration: 300 });
      scale.value = withSpring(1, { damping: 12, stiffness: 200 });
      return;
    }
    // Scale pop: 1 → 1.25 → 1
    scale.value = withSequence(
      withSpring(1.25, { damping: 6, stiffness: 300 }),
      withSpring(1, { damping: 10, stiffness: 200 }),
    );
    // Wiggle: ±15°
    rotate.value = withSequence(
      withTiming(15, { duration: 100 }),
      withTiming(-15, { duration: 140 }),
      withTiming(12, { duration: 120 }),
      withTiming(-12, { duration: 120 }),
      withTiming(0, { duration: 100 }),
    );
  }, [focused, reduceMotion, scale, rotate]);

  const overlay = accessoryOverlaySource(pose, equipped.accessory);

  const animatedStyle = useAnimatedStyle(() => {
    if (reduceMotion) return {};
    return {
      transform: [
        { translateY: translateY.value },
        { rotate: `${rotate.value}deg` },
        { scale: scale.value },
      ],
    };
  });

  // Wrap in Animated.View rather than using Animated.Image: Reanimated's
  // Animated.Image crashes on physical iOS devices running Expo Go with New
  // Architecture (Fabric) enabled — the animated wrapper's prop pipeline
  // diverges from the simulator's Old Arch path at render time. A plain Image
  // inside an Animated.View avoids the crash while keeping all the transforms.
  // The bird grows with its bubble on the chat tab, so the proportion inside
  // the circle is unchanged and only the whole control gets louder.
  const box = { width: size, height: size };
  return (
    <Animated.View style={[box, animatedStyle]}>
      <Image
        source={mascotSource(pose, equipped.garment)}
        style={box}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel="Bolo the parrot"
      />
      {/* Head slot over the garment base, same 1024 frame drawn at the same
          size so it lands where it belongs. Explicit width/height because a
          bare absoluteFill Image takes its INTRINSIC size on iOS, which is the
          render trap CLAUDE.md records from the blank-board saga. */}
      {overlay ? (
        <Image
          source={overlay}
          style={[box, { position: 'absolute', top: 0, left: 0 }]}
          resizeMode="contain"
          accessible={false}
        />
      ) : null}
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Elevated center Bolo tab button
// ---------------------------------------------------------------------------

/**
 * THE BUBBLE GROWS ON THE CHAT TAB (owner ruling 2026-08-28: "can we bloat the
 * nav button when we reach that screen?").
 *
 * This button IS the hold-to-talk control, and the owner's read is that the job
 * is making that obvious rather than rebuilding the chat screen around a second
 * microphone. It already changes on focus (the ring appears), so size is the
 * same switch carrying more weight.
 *
 * DELIBERATELY NOT ANIMATED, and that is not laziness. CLAUDE.md records that
 * the native animation driver is dead in release builds of this app and that
 * reanimated's frame loop never starts for the same reason, so an eased grow
 * would play in the simulator and be frozen in the store build. The size change
 * lands across a tab transition, which reads as deliberate rather than abrupt.
 * If this is ever animated, it must be RN Animated with useNativeDriver:false
 * (see lib/useLoopProgressRN.ts), never reanimated.
 */
const BUBBLE_SIZE = 58;
const BUBBLE_SIZE_FOCUSED = 68;
const PARROT_SIZE = 44;
const PARROT_SIZE_FOCUSED = 52;

/**
 * THE BORDER IS LOAD BEARING AND HAS TO BE NAMED, because the ring above is
 * positioned against it. React Native lays an absolutely positioned child out
 * against its parent's PADDING box, which is inset by the border, so an offset
 * computed from the bubble's outer size lands one border width off in both
 * axes. Measured on the simulator 2026-08-28: the ring sat +2.50pt right of the
 * bubble's centre, to the exact hundredth of the value below. That is what the
 * owner had been seeing as "off center", and it survived the 67cd22dd fix
 * because that commit corrected the arc arithmetic, which was never the fault.
 */
const BUBBLE_BORDER = 2.5;

// 1.62, was 1.34: at 1.34 the text baseline sat 2pt outside the 58pt bubble
// and the glyphs straddled its border, which read as cramped and half hidden
// (reported off build 516). The label clears the button entirely now.
// Sized off the FOCUSED bubble because the ring only ever renders when focused.
// Exported so the chat screen can hold its two flanking notes clear of it
// rather than guessing a gap, which is how the chip clearance went stale four
// times.
export const HOLD_RING_BOX = BUBBLE_SIZE_FOCUSED * 1.62;

/**
 * HOW FAR THE RING REACHES ABOVE THE BOTTOM OF ITS TAB SLOT, in points.
 *
 * Exported because the chat screen's chip row has to clear it, and twice now
 * that clearance has been a hand-tuned number that went stale: 8, then 26,
 * then 44, each raised after somebody saw the chips sitting on the words. 44
 * fails at a 64pt tab bar, which is exactly what Android with a gesture bar
 * gives you, and a device photo of build 520 shows precisely that: zero gap.
 *
 * The bubble is anchored 32 up from the slot's bottom and is BUBBLE_SIZE_FOCUSED
 * tall wherever the ring shows, and the ring box overhangs it by half the
 * difference. Anything that consumes this must subtract the REAL tab bar height,
 * because that is the part that varies per device and is the reason a constant
 * kept being wrong.
 *
 * IT GREW BY 10pt on 2026-08-28 when the focused bubble went 58 -> 68. Anything
 * clearing this recomputes itself, since every consumer reads the constant.
 */
export const HOLD_RING_REACH =
  32 + BUBBLE_SIZE_FOCUSED + (HOLD_RING_BOX - BUBBLE_SIZE_FOCUSED) / 2;

/**
 * WHERE THE LABEL STARTS ON THE RING, DERIVED RATHER THAN TUNED.
 *
 * This was a per-platform pair of magic numbers, 7% on iOS and 25% on Android,
 * on the theory that react-native-svg honours textAnchor="middle" on Android
 * (so the offset is the text's CENTRE) and ignores it on iOS (so it is the
 * START). A device photo of build 520 settles it: at 25% the label ran from 12
 * o'clock clockwise to about 4. That is a START, not a centre. Both platforms
 * behave the same way, and the split was chasing a difference that is not
 * there.
 *
 * So compute it. The label has to be CENTRED at 12 o'clock, which is 25% along
 * a path that begins at 9 and sweeps clockwise, so it starts half its own arc
 * before that.
 *
 * THE 0.6em ADVANCE IS CALIBRATED, NOT GUESSED, which is the only reason this
 * is trustworthy: the same photo shows the label spanning roughly 12 o'clock to
 * 4, about a third of the circle, and this arithmetic returns 33.97%. Re-measure
 * against a photo if the wording, the size or the tracking changes.
 */
/**
 * THE WHOLE INSTRUCTION LIVES HERE NOW (owner, 2026-08-28). The chat screen
 * used to say "Hold Bolo to start talking" and carry a "Hold to speak" pill
 * under the on-screen bird; both were removed, because both described THIS
 * button while sitting next to a different one.
 *
 * 8pt, was 9, and that is forced by the longer words rather than chosen. The
 * label's arc is its width over the ring's circumference: at 9pt with 1.4
 * tracking, twenty-one characters need 51.1% of the circle, which puts the
 * start at -0.54% — before the path begins, where a textPath has nothing to
 * sit on. 8pt with 1.2 tracking needs 45.1% and spans 2.5% to 47.5%, so it
 * stays inside the top half of the ring, which is the half that is empty.
 * Recompute this if the wording changes again; the numbers are printed by the
 * arithmetic below and were checked against the simulator.
 */
const HOLD_LABEL = 'PRESS & HOLD TO SPEAK';
const HOLD_FONT_SIZE = 8;
const HOLD_TRACKING = 1.2;
const HOLD_LABEL_WIDTH =
  HOLD_LABEL.length * (HOLD_FONT_SIZE * 0.6 + HOLD_TRACKING) - HOLD_TRACKING;
const HOLD_RING_CIRCUMFERENCE = 2 * Math.PI * (HOLD_RING_BOX * 0.4);
/** Percent along the path where the label begins, so its middle sits at 12. */
/**
 * TEXTANCHOR DOES NOT WORK HERE, AND THAT IS NOW MEASURED RATHER THAN BELIEVED.
 * Tried on 2026-08-28: startOffset="25%" plus textAnchor="middle" put the ink
 * centroid 48 degrees clockwise of 12 o'clock. react-native-svg treats the
 * offset as the START of the run whatever the anchor says, which is what commit
 * 67cd22dd concluded from a device photo. The estimate below is therefore the
 * only way to centre this, so it stays.
 *
 * HOLD_START_CORRECTION is the residual, and it exists because the 0.6em
 * advance is an average over a string that is mostly capitals plus an ampersand
 * and two spaces. With it at 0 the twelve-character label measured 6.0 degrees
 * anticlockwise of 12. RE-MEASURE IT WHENEVER THE WORDING CHANGES: crop the
 * ring out of a simulator screenshot and take the centroid of the label ink
 * around the bubble's centre.
 */
// +2.25 points of the path, which is +8.1 degrees, measured off a simulator
// screenshot of THIS twenty-one character label at 8pt: with the correction at
// 0 its ink centroid sat 8.1 degrees anticlockwise of 12 o'clock, about one
// letter left. The owner read that as needing to move right, and it did.
const HOLD_START_CORRECTION = 2.25;
const HOLD_START_OFFSET = `${(
  25 - ((HOLD_LABEL_WIDTH / HOLD_RING_CIRCUMFERENCE) * 100) / 2 + HOLD_START_CORRECTION
).toFixed(2)}%`;

/**
 * A FULL CIRCLE FROM 9 O'CLOCK, CLOCKWISE OVER THE TOP, carrying one label
 * centred at 12 o'clock.
 *
 * It sat UNDER the button first and both halves of that were wrong: below
 * the button is where the tab bar writes "Bolo Chat", so the label collided
 * with it, and a half-arc is shorter than the words, so "HOLD" ran off the
 * end of the path and rendered as "HO". Above the button is empty. A full
 * circle can never truncate whatever the font metrics do.
 */
function holdRingPath(box: number): string {
  const r = box * 0.4;
  const c = box / 2;
  // Sweep 1 from 9 o'clock is clockwise, so the first half runs left to right
  // OVER THE TOP and the glyphs stand upright there.
  return `M ${c - r} ${c} A ${r} ${r} 0 0 1 ${c + r} ${c} A ${r} ${r} 0 0 1 ${c - r} ${c}`;
}
function BoloTabButton({
  onPress,
  onLongPress,
  accessibilityState,
  'aria-selected': ariaSelected,
  style,
}: BoloTabButtonProps) {
  const colors = useColors();
  // Build 29 defect: only accessibilityState?.selected was read here, but the
  // installed @react-navigation/bottom-tabs v7 tab bar passes `aria-selected`
  // (and no accessibilityState) on native. `focused` was therefore always
  // false on device, so pressIn never fired the haptic or the registered
  // start handler (the press-scale animation is unconditional, which is why
  // the button still showed visual feedback). Read the v7 prop first and keep
  // the legacy accessibilityState shape as a fallback.
  const focused = ariaSelected ?? accessibilityState?.selected ?? false;
  const reduceMotion = useReducedMotion();

  // Hold-to-talk context — available when the chat screen is mounted.
  const { startRecordingRef, stopRecordingRef, isRecording } = useChatRecording();

  // Press-in squish shared value
  const pressScale = useSharedValue(1);

  const pressAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  function handlePressIn() {
    if (!reduceMotion) {
      pressScale.value = withTiming(0.88, { duration: 100 });
    }
    // When the chat tab is already focused, trigger hold-to-talk instead of
    // navigating. The start wrapper registered by chat.tsx sets isPressingRef
    // and guards against duplicate starts.
    if (focused) {
      // Immediate light haptic on pressIn gives instant tactile confirmation
      // that the gesture was registered, before the async recorder starts.
      hapticLight();
      startRecordingRef.current?.();
    }
  }

  function handlePressOut() {
    if (!reduceMotion) {
      pressScale.value = withSpring(1, { damping: 10, stiffness: 260 });
    }
    // When chat tab is focused, release sends the recording.
    if (focused) {
      stopRecordingRef.current?.();
    }
  }

  // Suppress navigation when the chat tab is already focused — the press
  // gesture is handled entirely by the recording callbacks above.
  function handlePress(e: Parameters<NonNullable<BoloTabButtonProps['onPress']>>[0]) {
    if (focused) return;
    onPress?.(e);
  }

  // Accessibility label reflects recording state when on the chat tab.
  const accessibilityLabel =
    focused && isRecording ? 'Release to send' : 'Bolo';

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      hitSlop={{ top: 22, bottom: 0, left: 8, right: 8 }}
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        styles.boloOuter,
      ]}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      accessibilityLabel={accessibilityLabel}
    >
      {/* PRESS & HOLD, WRAPPED ROUND THIS BUTTON (chat 11). It wrapped the
          on-screen mascot first and the owner moved it here: "i was talking
          about the button on the bottom. nav button." This button IS the
          hold-to-talk control when the chat tab is focused, so the ring only
          shows then, and hides while a hold is in progress. The box is the
          58pt bubble at the same 1.34 ratio the mascot ring used, centred on
          the bubble's own anchor (bottom: 32). */}

      {/* Circle — absolutely positioned so it overflows above the tab bar */}
      <Animated.View
        style={[
          styles.boloBubble,
          pressAnimStyle,
          {
            // Bigger on the chat tab, where this button IS the microphone.
            // A swap, not an animation: see BUBBLE_SIZE_FOCUSED.
            width: focused ? BUBBLE_SIZE_FOCUSED : BUBBLE_SIZE,
            height: focused ? BUBBLE_SIZE_FOCUSED : BUBBLE_SIZE,
            borderRadius: (focused ? BUBBLE_SIZE_FOCUSED : BUBBLE_SIZE) / 2,
          },
        ]}
      >
        {/* THE RING IS A GRADIENT, NOT A BORDER (build 22, the owner's home
            mockup: "multi coloring around bolo chat nav circle"). The bubble
            keeps its 2.5pt border for LAYOUT, since the hold ring's offset
            arithmetic below is measured against it, but the border is
            transparent and the colour comes from this disc: gold through
            coral to the primary indigo, corner to corner, drawn one border
            width outside the padding box so it fills the border's ring, with
            the card-coloured disc over its middle. The bubble's shadow moved
            here because a transparent box casts nothing. */}
        <LinearGradient
          pointerEvents="none"
          colors={[colors.gold, '#F0803C', colors.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            position: 'absolute',
            left: -BUBBLE_BORDER,
            top: -BUBBLE_BORDER,
            width: focused ? BUBBLE_SIZE_FOCUSED : BUBBLE_SIZE,
            height: focused ? BUBBLE_SIZE_FOCUSED : BUBBLE_SIZE,
            borderRadius: (focused ? BUBBLE_SIZE_FOCUSED : BUBBLE_SIZE) / 2,
            shadowColor: colors.primary,
            shadowOpacity: focused ? 0.35 : 0.12,
            shadowRadius: focused ? 12 : 7,
            shadowOffset: { width: 0, height: -4 },
            elevation: 8,
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: (focused ? BUBBLE_SIZE_FOCUSED : BUBBLE_SIZE) - BUBBLE_BORDER * 2,
            height: (focused ? BUBBLE_SIZE_FOCUSED : BUBBLE_SIZE) - BUBBLE_BORDER * 2,
            borderRadius: (focused ? BUBBLE_SIZE_FOCUSED : BUBBLE_SIZE) / 2,
            backgroundColor: colors.card,
          }}
        />

        <BoloNavParrot
          focused={focused}
          size={focused ? PARROT_SIZE_FOCUSED : PARROT_SIZE}
        />
        {focused && !isRecording ? (
        <Svg
          pointerEvents="none"
          accessible={false}
          width={HOLD_RING_BOX}
          height={HOLD_RING_BOX}
          style={{
            position: 'absolute',
            // MINUS THE BORDER. An absolute child is laid out against the
            // parent's PADDING box, so an offset derived from the bubble's
            // outer size lands one border width right and low. Measured at
            // exactly +2.50pt on the simulator before this was added.
            left: -(HOLD_RING_BOX - BUBBLE_SIZE_FOCUSED) / 2 - BUBBLE_BORDER,
            top: -(HOLD_RING_BOX - BUBBLE_SIZE_FOCUSED) / 2 - BUBBLE_BORDER,
          }}
        >
          <Defs>
            <Path id="bolo-nav-hold-ring" d={holdRingPath(HOLD_RING_BOX)} fill="none" />
          </Defs>
          <SvgText
            fill={colors.mutedForeground}
            fontSize={HOLD_FONT_SIZE}
            fontWeight="800"
            letterSpacing={HOLD_TRACKING}
          >
            {/* One offset, both platforms. See HOLD_START_OFFSET: the
                per-platform pair was built on textAnchor behaving differently
                on Android, and a photo of build 520 shows it does not. */}
            <TextPath
              href="#bolo-nav-hold-ring"
              startOffset={HOLD_START_OFFSET}
            >
              {HOLD_LABEL}
            </TextPath>
          </SvgText>
        </Svg>
        ) : null}
      </Animated.View>

      {/* Label at the bottom of the tab bar slot. Reads "Bolo Chat" in the
          brand colour whether or not the tab is focused, matching web's
          centre tab. ONE line, not web's two: the bar is 74 tall with the
          circle anchored at bottom 32 and the label block bottom-anchored
          10 above the slot floor, so a label may only occupy 22px before it
          runs into the circle — two 11px lines need ~26.6 (natural leading)
          and cannot be made to fit without moving the circle, the shared
          label baseline, or the bar height. One line does fit: "Bolo Chat"
          measures 51.3px in Inter SemiBold 11 against the centre slot's full
          58px at the narrowest supported 320pt width (see boloOuter's
          paddingHorizontal note). numberOfLines pins it to one line so it can
          never wrap onto the circle. The accessible name stays "Bolo" (see
          above), so VoiceOver announces the tab exactly as it does today. */}
      <Text
        numberOfLines={1}
        style={[styles.boloLabel, { color: colors.primary }]}
      >
        Bolo Chat
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Standard tab icon — a brand-filled pill sits behind the icon when the tab
// is active, matching the floating-pill bar's filled active treatment.
// ---------------------------------------------------------------------------
function TabIcon({
  name,
  color,
  focused,
}: {
  name: keyof typeof Feather.glyphMap;
  color: string;
  focused: boolean;
}) {
  const colors = useColors();
  return (
    <View style={[styles.iconPill, focused && { backgroundColor: colors.primary }]}>
      <Feather name={name} size={20} color={focused ? colors.primaryForeground : color} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// The Feed shortcut, the 5th slot. Pushes to the board rather than navigating
// to a tab screen, which is the same shape as the language switcher it
// replaced on 2026-08-25.
//
// IT TOOK THE LANGUAGE SLOT ON PURPOSE. The board was reachable only through
// the home social strip, which is a burial for the app's whole social surface.
// Language was the slot to give up because it is the only one that was never a
// destination: it keeps three other ways in on this platform, Home's language
// pill, the Account screen and GlobeButton, so nothing was stranded.
//
// Lands on ?tab=feed so the label names what appears. Weekly XP and Streak are
// the other two tabs on that screen, one tap away on its own strip.
// ---------------------------------------------------------------------------
function FeedTabButton({ style }: BoloTabButtonProps) {
  const colors = useColors();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => {
        hapticLight();
        router.push('/(app)/leaderboard?tab=feed');
      }}
      accessibilityRole="button"
      accessibilityLabel="Feed"
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        styles.pushTabItem,
      ]}
    >
      <View style={styles.iconPill}>
        <Feather name="activity" size={20} color={colors.mutedForeground} />
      </View>
      <Text style={[styles.pushTabLabel, { color: colors.mutedForeground }]}>
        Feed
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconPill: {
    width: 46,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pushTabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  // Matches tabBarLabelStyle rather than the uppercase language code it
  // replaced: this slot now reads as a word beside four other words.
  pushTabLabel: {
    fontFamily: AppFonts.semibold,
    fontSize: 12,
  },
  boloOuter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 10,
    // The tab bar forwards 5px of side padding to every slot, which clamps a
    // 58px slot's label to 48px — enough for one word, not for "Bolo Chat"
    // (51.3px at 11px) on a 320pt phone, where it ellipsised to "Bolo C…".
    // The centre slot has no icon row to protect, so it gives the padding
    // back to the label and uses its full 58px. This is a content-box change
    // only: the Pressable, its hit slop and every other slot are untouched.
    paddingHorizontal: 0,
    // overflow visible so the circle can poke above the tab bar
    overflow: 'visible',
  },
  boloBubble: {
    position: 'absolute',
    // Anchored from the BOTTOM of the tab slot so the circle always clears
    // the "Bolo" label regardless of device safe-area insets. (Anchoring from
    // the top with a negative offset overlapped the label on iPhones, where
    // the home-indicator inset shrinks the slot's usable height.)
    bottom: 32,
    width: 58,
    height: 58,
    borderRadius: 29,
    // Layout only since build 22: the ring's colour is the gradient disc
    // inside the bubble, and the shadow and elevation moved onto it.
    borderWidth: 2.5,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    // Stays below its own slot's text but above the tab bar background.
    zIndex: 1,
  },
  boloLabel: {
    fontFamily: AppFonts.semibold,
    // 11 (web's centre-tab size, and the floor agreed for this bar) so the
    // two-word label clears the 58px slot at 320pt. Line height is left to
    // the font's own metrics: the block is bottom-anchored, so the baseline
    // moves by only the descender delta (~0.25px) versus the old 12px label
    // and stays level with the other four tab labels.
    fontSize: 11,
  },
});

// GlobeButton lives in components/GlobeButton.tsx and is imported above.
// Each tab screen embeds it directly in its own header row so no system
// navigation header is needed on any tab.

export default function TabsLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <ChatRecordingProvider>
    <Tabs
      screenListeners={{
        tabPress: () => hapticLight(),
      }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarLabelStyle: { fontFamily: AppFonts.semibold, fontSize: 12 },
        // Floating pill — detached from the screen edges with a soft drop
        // shadow; sits above the home indicator via the safe-area inset.
        tabBarStyle: {
          position: 'absolute',
          left: 14,
          right: 14,
          bottom: Math.max(insets.bottom, 14),
          borderRadius: 32,
          height: 74,
          paddingTop: 6,
          paddingBottom: 8,
          backgroundColor: colors.card,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: '#0F172A',
          shadowOpacity: 0.16,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 10 },
          elevation: 16,
          // Required so the elevated Bolo bubble renders above the bar
          overflow: 'visible',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="home" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="games"
        options={{
          title: 'Games',
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="grid" color={color} focused={focused} />
          ),
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            // Always pop the nested games stack back to the list so tapping
            // the tab while inside a game (e.g. bolo-quiz) returns to the
            // games index rather than staying on the current game screen.
            e.preventDefault();
            navigation.navigate('games', { screen: 'index' });
          },
        })}
      />
      {/* Friends tab — hidden from the tab bar; accessible from Profile/Account */}
      <Tabs.Screen
        name="friends"
        options={{
          href: null,
        }}
      />
      {/* Center elevated tab — custom button handles all rendering; no header needed */}
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Bolo',
          tabBarButton: (props) => <BoloTabButton {...props} />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="bar-chart-2" color={color} focused={focused} />
          ),
        }}
      />
      {/* 5th slot: the Feed shortcut, swapped in for the language switcher on
          2026-08-25. The registration stays on `profile` because the slot needs
          a screen to hang off and that is the one already here; the button
          navigates elsewhere, exactly as the switcher it replaced did. Profile
          stays reachable from the top-right button on Home, which also carries
          the friend-request badge. */}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          headerShown: false,
          tabBarButton: (props) => <FeedTabButton {...props} />,
        }}
      />
    </Tabs>
    </ChatRecordingProvider>
  );
}
