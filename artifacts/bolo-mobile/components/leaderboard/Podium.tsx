import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import type { LeaderboardEntry } from '@workspace/api-client-react';
import { MascotAvatar } from '@/components/MascotAvatar';
import { FirstClassChip } from '@/components/GoldChip';
import { Landmark } from '@/components/journey/Landmark';
import { RankDelta } from '@/components/leaderboard/RankDelta';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { type BoardMetric, metricUnit, metricValue } from '@/lib/boardRanking';
import { TICKET } from '@/lib/ticketStock';

/**
 * TOP TRAVELERS (build 22, the owner's Leaderboard mockup): the first three
 * on a cream stage, the leader raised in the middle in a gold ring, second
 * in silver to the left, third in bronze to the right, each with a
 * medallion carrying the place, the name, the number and its unit, and the
 * places moved. Behind them, at a whisper, the station: two of the journey's
 * landmark silhouettes and a curve of rails along the bottom.
 *
 * The rings are the podium's own: gold here is a place somebody EARNED this
 * week, and the FirstClassChip stays the only gold that was bought.
 */
const RINGS: Record<1 | 2 | 3, readonly [string, string]> = {
  1: ['#F8DC7A', '#D4A017'],
  2: ['#EEF0F3', '#A3A9B4'],
  3: ['#F0BE93', '#B5651D'],
};

const BIG = 88;
const SMALL = 72;
const RING = 6;

function displayFor(u: { displayName?: string | null }): string {
  return u.displayName?.trim() || 'Fellow learner';
}

function Seat({
  entry,
  place,
  metric,
  delta,
}: {
  entry: LeaderboardEntry | undefined;
  place: 1 | 2 | 3;
  metric: BoardMetric;
  delta: number | undefined;
}) {
  const colors = useColors();
  const size = place === 1 ? BIG : SMALL;
  const [ringTop, ringBottom] = RINGS[place];
  if (!entry) return <View style={[styles.seat, { flexBasis: size + 40 }]} />;
  const value = metricValue(entry, metric);
  return (
    <View
      style={[styles.seat, { flexBasis: size + 40, marginTop: place === 1 ? 0 : 26 }]}
      testID={`podium-${place}`}
    >
      <View style={{ width: size + RING * 2, height: size + RING * 2 }}>
        <LinearGradient
          colors={[ringTop, ringBottom]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={{ ...StyleSheet.absoluteFillObject, borderRadius: (size + RING * 2) / 2 }}
        />
        <View
          style={{
            position: 'absolute',
            left: RING,
            top: RING,
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors.card,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MascotAvatar user={entry} size={size - 6} />
        </View>
        {place === 1 ? (
          <View style={[styles.crown, { backgroundColor: colors.card }]}>
            <Feather name="star" size={14} color={ringBottom} />
          </View>
        ) : null}
        <View style={[styles.medal, { backgroundColor: ringBottom, borderColor: colors.card }]}>
          <Text style={styles.medalText}>{place}</Text>
        </View>
      </View>
      <View style={styles.nameRow}>
        <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
          {entry.isSelf ? 'You' : displayFor(entry)}
        </Text>
        {entry.firstClassActive ? <FirstClassChip /> : null}
      </View>
      <Text style={[styles.value, { color: colors.foreground, fontSize: place === 1 ? 24 : 20 }]}>
        {value.toLocaleString()}
        <Text style={[styles.unit, { color: colors.mutedForeground }]}>{` ${metricUnit(metric, value)}`}</Text>
      </Text>
      <RankDelta delta={delta} size={14} />
    </View>
  );
}

export function Podium({
  top,
  metric,
  deltas,
}: {
  /** The first three, best first; fewer is fine and the seats stay empty. */
  top: readonly LeaderboardEntry[];
  metric: BoardMetric;
  deltas: Record<string, number>;
}) {
  const colors = useColors();
  const [first, second, third] = top;
  return (
    <View style={[styles.stage, { backgroundColor: `${colors.gold}12`, borderColor: `${colors.gold}33` }]} testID="podium">
      {/* The station behind, at a whisper. */}
      <View pointerEvents="none" style={[styles.backdrop, { left: 6 }]}>
        <Landmark city="Kanpur Central" width={120} height={72} ink={TICKET.ink} paper="transparent" opacity={0.08} />
      </View>
      <View pointerEvents="none" style={[styles.backdrop, { right: 6 }]}>
        <Landmark city="Aligarh" width={110} height={66} ink={TICKET.ink} paper="transparent" opacity={0.08} />
      </View>
      <Text style={[styles.eyebrow, { color: colors.primary }]}>◆  TOP TRAVELERS  ◆</Text>
      <View style={styles.seats}>
        <Seat entry={second} place={2} metric={metric} delta={second ? deltas[second.userId] : undefined} />
        <Seat entry={first} place={1} metric={metric} delta={first ? deltas[first.userId] : undefined} />
        <Seat entry={third} place={3} metric={metric} delta={third ? deltas[third.userId] : undefined} />
      </View>
      {/* The rails, curving under the seats. */}
      <Svg pointerEvents="none" width="100%" height={34} viewBox="0 0 360 34" preserveAspectRatio="none" style={styles.rails}>
        <Path d="M0 6 Q180 44 360 6" stroke={TICKET.ink} strokeOpacity={0.16} strokeWidth={3} fill="none" />
        <Path d="M0 14 Q180 52 360 14" stroke={TICKET.ink} strokeOpacity={0.16} strokeWidth={3} fill="none" />
        {Array.from({ length: 13 }, (_, i) => {
          const x = 10 + i * 28;
          const t = x / 360;
          const y = 6 + 19 * 4 * t * (1 - t);
          return (
            <Path key={i} d={`M${x} ${y - 1} L${x} ${y + 11}`} stroke={TICKET.ink} strokeOpacity={0.12} strokeWidth={4} />
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    borderRadius: 22,
    borderWidth: 1,
    paddingTop: 14,
    paddingBottom: 6,
    overflow: 'hidden',
  },
  backdrop: { position: 'absolute', top: 40 },
  eyebrow: {
    fontFamily: AppFonts.extrabold,
    fontSize: 13,
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 12,
  },
  /**
   * THE SEATS SHRINK (owner, 2026-09-03, on a 10-inch iPad: "looks like
   * leaderboard is clipped on the left side").
   *
   * They were three FIXED widths, 128 + 112 + 112, which with the gaps and the
   * stage's own padding needs 372pt. Home is two columns on an iPad, so the
   * card holding this is narrower than that on a 10-inch and the row simply
   * overflowed: the outer names and their numbers were cut off at BOTH edges,
   * which is why the left one read "earner 7521".
   *
   * flexBasis keeps the three at their designed proportions wherever there is
   * room and lets them give ground proportionally where there is not. Each
   * avatar is size + RING * 2, so the row can come down to 268pt of art before
   * anything is clipped, and the names ellipsise long before that.
   */
  seats: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 4,
    paddingHorizontal: 6,
    alignSelf: 'stretch',
  },
  seat: { alignItems: 'center', gap: 4, flexShrink: 1, minWidth: 0 },
  crown: {
    position: 'absolute',
    top: -8,
    alignSelf: 'center',
    left: '50%',
    marginLeft: -12,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medal: {
    position: 'absolute',
    bottom: -6,
    left: '50%',
    marginLeft: -14,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalText: { fontFamily: AppFonts.extrabold, fontSize: 13, color: '#1a1200' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, maxWidth: '100%' },
  name: { fontFamily: AppFonts.bold, fontSize: 14, flexShrink: 1 },
  value: { fontFamily: AppFonts.extrabold },
  unit: { fontFamily: AppFonts.semibold, fontSize: 13 },
  rails: { marginTop: 4 },
});
