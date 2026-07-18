import { Stack } from 'expo-router';
import { useColors } from '@/hooks/useColors';

/**
 * Nested stack inside the Games tab.
 * Using a Stack here keeps the bottom tab bar visible on every game screen
 * because the stack is a child of the (tabs) layout, not a sibling to it.
 */
export default function GamesLayout() {
  const colors = useColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
