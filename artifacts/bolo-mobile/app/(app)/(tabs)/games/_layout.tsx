import { Stack, useSegments } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeInsets } from '@/lib/useSafeInsets';
import { SessionStats } from '@/components/SessionStats';
import { useColors } from '@/hooks/useColors';
import { CONTENT_COLUMN } from '@/lib/contentWidth';

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
 *
 * ON THE HUB THE STRIP FLOATS OVER THE HERO (build 21, owner: "move the hero
 * all the way up to the top and overlay the Chai and XP over it, no white
 * space up top"). The hub's hero painting starts under the status bar and
 * the strip sits on it at the safe-area inset; every other screen in this
 * stack keeps the strip in flow above its content, exactly as before, since
 * those screens lay out under it rather than behind it.
 *
 * THIS VIEW OWNS THE SAFE-AREA INSET FOR THE WHOLE STACK, so every screen
 * inside it uses `<Screen padTop={false}>` (owner, 2026-09-03, off TestFlight
 * on an iPhone: "too much space up top"). Screen pads by insets.top of its
 * own accord, and a game screen sitting under this padding was getting the
 * notch cleared TWICE: about 59pt of dead air between the XP strip and the
 * screen's own title, on every game. The hub is the exception at both ends,
 * since it takes paddingTop 0 here and floats the strip over its hero.
 */
export default function GamesLayout() {
  const colors = useColors();
  const insets = useSafeInsets(); // zero without a provider, for the hub's tests
  const segments = useSegments();
  const onHub = segments[segments.length - 1] === 'games';
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: onHub ? 0 : insets.top }}>
      {/* The strip lives on the content column, not the window (build 25). */}
      {!onHub && (
        <View style={styles.column}>
          <SessionStats testID="games-session-stats" />
        </View>
      )}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      {onHub && (
        <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
          {/* A soft cream veil from the top edge. On its own it was not
              enough once the real hero landed (build 22, owner: "the xp and
              chai is hard to see since they are transparent"), so the strip
              below also floats each half on a cream plaque. The veil stays
              for the status bar's own text. */}
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(251,243,230,0.92)', 'rgba(251,243,230,0.55)', 'rgba(251,243,230,0)']}
            locations={[0, 0.6, 1]}
            style={[StyleSheet.absoluteFill, { height: insets.top + 64 }]}
          />
          <View style={[styles.column, { paddingTop: insets.top }]}>
            <SessionStats testID="games-session-stats" floating />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // The veil above stays full-bleed; the numbers sit where the cards do.
  column: CONTENT_COLUMN,
});
