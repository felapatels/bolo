/**
 * THE DOTTED PROGRESS ROW, ONCE.
 *
 * Born inline on the home boarding pass (build 17, the owner's hybrid
 * mockup): a row of stops, done ones filled in the app's violet, the current
 * one ringed, the rest hollow, joined by hairline links. Then: "for each cards
 * progress bar, i like the dotted bar you did with purple on the boarding
 * pass." So it is one component now, drawn on the pass (stops in the zone),
 * on every phrase card (phrases mastered), on the chalkboard (letters traced,
 * in chalk) and on the current-stop sheet. A second copy of these dots is the
 * defect, not the fix.
 *
 * Links flex, so any count from 4 to 14 fits the same width; above 14 the
 * dots shrink rather than the row overflowing, because a card is a fixed
 * width and a phrase count is not.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export interface StopDotsProps {
  /** How many stops (or phrases, or letters) the row counts. */
  total: number;
  /** How many are done: filled in the accent, counted from the left. */
  done: number;
  /** The 1-based position to ring as "here", if any. */
  current?: number | null;
  /** The fill and ring colour: the app's violet on a card, white in chalk. */
  accent: string;
  /** Hollow dots and the links ahead. */
  muted: string;
  /** A skyline at the end, the way the boarding pass draws the terminus. */
  terminus?: boolean;
  /** Chalk: white fill on the ring instead of paper. */
  ringFill?: string;
  testID?: string;
}

export function StopDots({
  total,
  done,
  current = null,
  accent,
  muted,
  terminus = false,
  ringFill = '#FFFFFF',
  testID,
}: StopDotsProps) {
  const count = Math.max(0, Math.floor(total));
  if (count === 0) return null;
  // Past fourteen the dots shrink so the row keeps its width.
  const dot = count > 14 ? 7 : 10;
  const here = current != null && current >= 1 && current <= count ? current : null;
  return (
    <View testID={testID} style={styles.row}>
      {Array.from({ length: count }).map((_, i) => {
        const n = i + 1;
        const isDone = n <= done && n !== here;
        const isHere = n === here;
        return (
          <React.Fragment key={n}>
            {i > 0 && (
              <View
                style={[
                  styles.link,
                  { backgroundColor: n <= done || isHere ? accent : `${muted}55` },
                ]}
              />
            )}
            <View
              testID={isHere ? 'stop-dot-here' : isDone ? 'stop-dot-done' : 'stop-dot-ahead'}
              style={[
                styles.dot,
                { width: dot, height: dot, borderRadius: dot / 2 },
                isDone ? { backgroundColor: accent, borderColor: accent } : null,
                isHere
                  ? { width: dot + 6, height: dot + 6, borderRadius: dot / 2 + 3, borderWidth: 3, borderColor: accent, backgroundColor: ringFill }
                  : null,
                !isDone && !isHere ? { borderColor: `${muted}88` } : null,
              ]}
            />
          </React.Fragment>
        );
      })}
      {terminus && (
        <MaterialCommunityIcons
          name="city-variant-outline"
          size={16}
          color={muted}
          style={styles.terminus}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 },
  link: { flex: 1, height: 2, minWidth: 2 },
  dot: { borderWidth: 2, backgroundColor: 'transparent' },
  terminus: { marginLeft: 6 },
});
