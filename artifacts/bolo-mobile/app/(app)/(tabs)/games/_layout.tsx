import { Stack } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SessionStats } from '@/components/SessionStats';
import { useColors } from '@/hooks/useColors';

/**
 * Nested stack inside the Games tab.
 * Using a Stack here keeps the bottom tab bar visible on every game screen
 * because the stack is a child of the (tabs) layout, not a sibling to it.
 *
 * IT ALSO CARRIES XP AND CHAI FOR ALL THIRTEEN GAMES FROM ONE PLACE. The owner
 * asked for both on every game screen; mounting the strip here rather than in
 * each screen means a new game gets it for free and cannot be the one that
 * forgets. That matters because the gap this fixes was created exactly that
 * way: XP was added screen by screen and the games were simply never done.
 */
export default function GamesLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <SessionStats testID="games-session-stats" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </View>
  );
}
