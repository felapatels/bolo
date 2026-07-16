import React from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
// Inline the tab-button props shape so we don't depend on
// @react-navigation/bottom-tabs being a direct dep of this package.
type BoloTabButtonProps = {
  onPress?: React.ComponentProps<typeof Pressable>['onPress'];
  accessibilityState?: { selected?: boolean; disabled?: boolean };
};
import { useListIncomingFriendRequests } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { hapticLight } from '@/lib/haptics';

// Elevated center Bolo tab button — the parrot bubble floats 22 px above the
// tab bar top edge, visually signalling it is the app's primary action.
// hitSlop extends the touch area upward to cover the overflowing circle.
function BoloTabButton({ onPress, accessibilityState }: BoloTabButtonProps) {
  const colors = useColors();
  const focused = accessibilityState?.selected ?? false;

  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 30, bottom: 0, left: 10, right: 10 }}
      style={styles.boloOuter}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      accessibilityLabel="Bolo"
    >
      {/* Circle — absolutely positioned so it overflows above the tab bar */}
      <View
        style={[
          styles.boloBubble,
          {
            backgroundColor: colors.card,
            borderColor: colors.primary,
            shadowColor: colors.primary,
            shadowOpacity: focused ? 0.35 : 0.12,
            shadowRadius: focused ? 12 : 7,
          },
        ]}
      >
        <Image
          source={require('../../../assets/images/mascot/mascot-wave.png')}
          style={[styles.boloImage, { opacity: focused ? 1 : 0.7 }]}
          resizeMode="contain"
        />
      </View>

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
    // 30 px above the tab bar's top edge — keeps the circle clear of the
    // "Bolo" label even when the tab slot is shortened by safe-area insets.
    top: -30,
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  boloImage: {
    width: 52,
    height: 52,
  },
  boloLabel: {
    fontFamily: AppFonts.semibold,
    fontSize: 12,
  },
});

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
          tabBarIcon: ({ color }) => (
            <Feather name="home" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: 'Friends',
          tabBarIcon: ({ color }) => (
            <Feather name="users" size={22} color={color} />
          ),
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
      {/* Center elevated tab — custom button handles all rendering */}
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
          tabBarIcon: ({ color }) => (
            <Feather name="bar-chart-2" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => (
            <Feather name="user" size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
