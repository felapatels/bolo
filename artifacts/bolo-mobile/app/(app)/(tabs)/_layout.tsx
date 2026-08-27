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

// ---------------------------------------------------------------------------
// Mascot pose assets + type
// ---------------------------------------------------------------------------
type MascotPose = 'wave' | 'cheer' | 'thumbsup' | 'thinking' | 'tryagain';

const POSE_SOURCES: Record<MascotPose, number> = {
  wave: require('../../../assets/images/mascot/mascot-wave.png'),
  cheer: require('../../../assets/images/mascot/mascot-cheer.png'),
  thumbsup: require('../../../assets/images/mascot/mascot-thumbsup.png'),
  thinking: require('../../../assets/images/mascot/mascot-thinking.png'),
  tryagain: require('../../../assets/images/mascot/mascot-tryagain.png'),
};

const POSES: MascotPose[] = ['wave', 'cheer', 'thumbsup', 'thinking', 'tryagain'];

function randomOtherPose(current: MascotPose): MascotPose {
  const others = POSES.filter((p) => p !== current);
  return others[Math.floor(Math.random() * others.length)];
}

// ---------------------------------------------------------------------------
// BoloNavParrot — animated parrot for the bottom nav bubble
// ---------------------------------------------------------------------------
function BoloNavParrot({ focused }: { focused: boolean }) {
  const reduceMotion = useReducedMotion();

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
  return (
    <Animated.View style={[styles.boloImage, animatedStyle]}>
      <Image
        source={POSE_SOURCES[pose]}
        style={styles.boloImage}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel="Bolo the parrot"
      />
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Elevated center Bolo tab button
// ---------------------------------------------------------------------------

// 1.62, was 1.34: at 1.34 the text baseline sat 2pt outside the 58pt bubble
// and the glyphs straddled its border, which read as cramped and half hidden
// (reported off build 516). The label clears the button entirely now.
const HOLD_RING_BOX = 58 * 1.62;

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
            backgroundColor: colors.card,
            borderColor: colors.primary,
            shadowColor: colors.primary,
            shadowOpacity: focused ? 0.35 : 0.12,
            shadowRadius: focused ? 12 : 7,
          },
        ]}
      >

        <BoloNavParrot focused={focused} />
        {focused && !isRecording ? (
        <Svg
          pointerEvents="none"
          accessible={false}
          width={HOLD_RING_BOX}
          height={HOLD_RING_BOX}
          style={{
            position: 'absolute',
            left: -(HOLD_RING_BOX - 58) / 2,
            top: -(HOLD_RING_BOX - 58) / 2,
          }}
        >
          <Defs>
            <Path id="bolo-nav-hold-ring" d={holdRingPath(HOLD_RING_BOX)} fill="none" />
          </Defs>
          <SvgText
            fill={colors.mutedForeground}
            fontSize={9}
            fontWeight="800"
            letterSpacing={1.4}
          >
            {/* 7%, AND IT IS TUNED ON A DEVICE RATHER THAN DERIVED.
                react-native-svg's TextPath does NOT honour textAnchor here:
                startOffset behaves as the text's START, not its centre, so
                the arithmetic answer (25% of a full circle from 9 o'clock is
                12 o'clock) put the label a quarter turn clockwise of centre.
                Measured on the simulator at 25, 4 and 7 percent; 7 seats
                "PRESS & HOLD" dead centre above the button. Re-measure if
                the wording or the font size changes. */}
            <TextPath href="#bolo-nav-hold-ring" startOffset="7%" textAnchor="middle">
              PRESS &amp; HOLD
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
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
    // Stays below its own slot's text but above the tab bar background.
    zIndex: 1,
  },
  boloImage: {
    width: 44,
    height: 44,
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
