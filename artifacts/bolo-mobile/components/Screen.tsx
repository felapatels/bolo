import React from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { CONTENT_COLUMN } from '@/lib/contentWidth';

/**
 * Full-bleed screen container with the brand background and top safe-area
 * padding. On web (preview iframe) the proxied insets report 0, so we apply
 * the fixed 67px offset the scaffold recommends.
 *
 * THE CONTENT COLUMN (build 25, the iPad ruling). The background is the
 * screen; the children are a centred column no wider than CONTENT_MAX_W. On
 * every phone the column is the full width and this is a no-op, which is why
 * it lives here rather than in fifty screens: one wrapper turns every phone
 * column into an iPad column. Absolute children (confetti, toasts, the home
 * bottom fade) now position against the column, which is where they belong.
 * `column={false}` is for a screen that draws its own full-bleed art and
 * wants the whole window, and then owes its own column (lib/contentWidth).
 */
export function Screen({
  children,
  style,
  padTop = true,
  column = true,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  padTop?: boolean;
  column?: boolean;
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
      {column ? (
        <View testID="screen-column" style={styles.column}>
          {children}
        </View>
      ) : (
        children
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { flex: 1, ...CONTENT_COLUMN },
});

/**
 * Bottom padding that clears the floating pill tab bar in scroll views.
 * The bar is absolutely positioned (bottom inset + 74px height + margins),
 * so scrollable content needs this much room to clear it plus a breathing gap.
 */
export const TAB_BAR_CLEARANCE = Platform.OS === 'web' ? 124 : 132;

/**
 * Extra bottom clearance for tab-screen content whose LAST element sits flush
 * against the tab bar (e.g. the chat greeting bubble / newest message). The
 * raised Bolo parrot button pokes above the tab bar's top edge — its circle
 * nearly reaches the top of the bar, and the idle float (-4), focus scale pop
 * (×1.25) and 22px top hit-slop all extend above it — so bottom-flush content
 * needs this much room to stay fully visible and tappable.
 *
 * 66, was 56, on 2026-08-28: the bubble grows from 58 to 68 on the chat tab
 * (BUBBLE_SIZE_FOCUSED) and is anchored from its BOTTOM, so it now pokes ten
 * points higher. Raised for every tab rather than only the focused one, because
 * ten points of extra padding at the foot of a scroll view costs nothing
 * visible, while a per-tab value here would have to be threaded through Screen
 * to callers that have no reason to know which tab they are on.
 */
export const RAISED_PARROT_CLEARANCE = 66;
