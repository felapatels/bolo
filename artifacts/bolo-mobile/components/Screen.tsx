import React from 'react';
import { Platform, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

/**
 * Full-bleed screen container with the brand background and top safe-area
 * padding. On web (preview iframe) the proxied insets report 0, so we apply
 * the fixed 67px offset the scaffold recommends.
 */
export function Screen({
  children,
  style,
  padTop = true,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  padTop?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const paddingTop = !padTop
    ? 0
    : Platform.OS === 'web'
      ? 67
      : insets.top;

  return (
    <View
      style={[
        { flex: 1, backgroundColor: colors.background, paddingTop },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Bottom padding that clears the floating tab bar in scroll views. */
export const TAB_BAR_CLEARANCE = Platform.OS === 'web' ? 120 : 108;
