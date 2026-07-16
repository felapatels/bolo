import React from 'react';
import { Image, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useListIncomingFriendRequests } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { hapticLight } from '@/lib/haptics';

export default function TabsLayout() {
  const colors = useColors();

  // Shares the react-query cache with the Friends screen, so accepting or
  // declining a request there invalidates this and the badge updates live.
  const { data: incoming } = useListIncomingFriendRequests();
  const pendingCount = incoming?.length ?? 0;

  return (
    <Tabs
      // Selection-strength feedback on every tab switch, matching other
      // navigation taps. Fires on the press itself (even re-selecting the
      // active tab), which is the platform-native feel.
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
          height: Platform.OS === 'web' ? 84 : 88,
          paddingTop: 8,
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
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ focused }) => (
            <Image
              source={require('../../../../assets/images/mascot/mascot-wave.png')}
              style={{ width: 26, height: 26, opacity: focused ? 1 : 0.4 }}
              resizeMode="contain"
            />
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
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarIcon: ({ color }) => (
            <Feather name="bar-chart-2" size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
