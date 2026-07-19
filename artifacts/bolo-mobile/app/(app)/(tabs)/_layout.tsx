import React from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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
  style?: React.ComponentProps<typeof Pressable>['style'];
  children?: React.ReactNode;
};
import { useListIncomingFriendRequests } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { hapticLight } from '@/lib/haptics';

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

  return (
    <Animated.Image
      source={POSE_SOURCES[pose]}
      style={[styles.boloImage, animatedStyle]}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="Bolo the parrot"
    />
  );
}

// ---------------------------------------------------------------------------
// Elevated center Bolo tab button
// ---------------------------------------------------------------------------
function BoloTabButton({ onPress, onLongPress, accessibilityState, style }: BoloTabButtonProps) {
  const colors = useColors();
  const focused = accessibilityState?.selected ?? false;
  const reduceMotion = useReducedMotion();

  // Press-in squish shared value
  const pressScale = useSharedValue(1);

  const pressAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  function handlePressIn() {
    if (!reduceMotion) {
      pressScale.value = withTiming(0.88, { duration: 100 });
    }
  }

  function handlePressOut() {
    if (!reduceMotion) {
      pressScale.value = withSpring(1, { damping: 10, stiffness: 260 });
    }
  }

  return (
    <Pressable
      onPress={onPress}
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
      accessibilityLabel="Bolo"
    >
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
      </Animated.View>

      {/* Label at the bottom of the tab bar slot */}
      <Text
        style={[
          styles.boloLabel,
          { color: focused ? colors.primary : colors.mutedForeground },
        ]}
      >
        Bolo
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  boloOuter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 10,
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
    fontSize: 12,
  },
});

// Globe icon button for tab headers — navigates to the language selector modal.
function GlobeHeaderButton() {
  const router = useRouter();
  const colors = useColors();
  return (
    <Pressable
      onPress={() => {
        hapticLight();
        router.push('/(app)/language');
      }}
      accessibilityLabel="Change language"
      accessibilityRole="button"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 16 }}
      style={{ marginRight: 12 }}
    >
      <Feather name="globe" size={22} color={colors.mutedForeground} />
    </Pressable>
  );
}

export default function TabsLayout() {
  const colors = useColors();

  // Shares the react-query cache with the Friends screen so the badge updates
  // live when requests are accepted or declined there.
  const { data: incoming } = useListIncomingFriendRequests();
  const pendingCount = incoming?.length ?? 0;

  return (
    <Tabs
      screenListeners={{
        tabPress: () => hapticLight(),
      }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarLabelStyle: { fontFamily: AppFonts.semibold, fontSize: 12 },
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          height: Platform.OS === 'web' ? 88 : 92,
          paddingTop: 8,
          // Required so the elevated Bolo bubble renders above the bar
          overflow: 'visible',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          headerShown: true,
          headerRight: () => <GlobeHeaderButton />,
          headerStyle: { backgroundColor: colors.card },
          headerShadowVisible: false,
          headerTitleStyle: { fontFamily: AppFonts.extrabold, color: colors.foreground },
          tabBarIcon: ({ color }) => (
            <Feather name="home" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="games"
        options={{
          title: 'Games',
          headerShown: true,
          headerRight: () => <GlobeHeaderButton />,
          headerStyle: { backgroundColor: colors.card },
          headerShadowVisible: false,
          headerTitleStyle: { fontFamily: AppFonts.extrabold, color: colors.foreground },
          tabBarIcon: ({ color }) => (
            <Feather name="grid" size={22} color={color} />
          ),
        }}
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
          headerShown: true,
          headerRight: () => <GlobeHeaderButton />,
          headerStyle: { backgroundColor: colors.card },
          headerShadowVisible: false,
          headerTitleStyle: { fontFamily: AppFonts.extrabold, color: colors.foreground },
          tabBarIcon: ({ color }) => (
            <Feather name="bar-chart-2" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          headerShown: true,
          headerRight: () => <GlobeHeaderButton />,
          headerStyle: { backgroundColor: colors.card },
          headerShadowVisible: false,
          headerTitleStyle: { fontFamily: AppFonts.extrabold, color: colors.foreground },
          tabBarIcon: ({ color }) => (
            <Feather name="user" size={22} color={color} />
          ),
          // Friend-request badge surfaces on the Profile tab now that Friends
          // lives inside the Account/Profile screen.
          tabBarBadge:
            pendingCount > 0
              ? pendingCount > 9
                ? '9+'
                : pendingCount
              : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.primary,
            color: colors.primaryForeground,
            fontFamily: AppFonts.bold,
            fontSize: 11,
          },
        }}
      />
    </Tabs>
  );
}
