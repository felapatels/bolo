import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PressableScale } from '@/components/PressableScale';
import { SkeletonCard } from '@/components/SkeletonCard';
import { Landmark } from '@/components/journey/Landmark';
import type { JourneyProgress, JourneyZoneProgress } from '@/lib/useJourneyProgress';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { TICKET } from '@/lib/ticketStock';

/**
 * THE JOURNEY ON THE PROGRESS TAB (build 22, the owner's Progress mockup:
 * "Journey 1 / Ganga Line / New Delhi / 19 of 64 phrases mastered", a bar
 * per zone with its percentage, the painted train over the city's landmark,
 * and "View all stops" into the map).
 *
 * Every number here comes from useJourneyProgress, the same six payloads the
 * home pass and the map read, so the three surfaces cannot disagree about
 * where the learner is. The rows are the LINE'S ZONES (Greetings & Manners,
 * Family, ...), each a city on the map, which is what the mockup lists; a
 * row's bar is the zone's mastered phrases over its phrases on offer.
 *
 * The full train is required here directly rather than through TrainEngine:
 * this card wants the still picture with the carriages, and TrainEngine's
 * module carries the engine's motion loop, which is nothing this card runs.
 */
const TRAIN_FULL = require('../../assets/journey/train-full.png') as number;
/** The painting is 1200 by 760. Drawn in points, never a percentage. */
const ART_W = 150;
const ART_H = Math.round((ART_W * 760) / 1200);
/** The mockup shows four zones and a "View all stops" door for the rest. */
const ZONE_ROWS_SHOWN = 4;

function zonePct(z: Pick<JourneyZoneProgress, 'masteredCount' | 'phraseCount'>): number {
  return z.phraseCount > 0 ? Math.round((100 * z.masteredCount) / z.phraseCount) : 0;
}

export function JourneyProgressCard({
  lineName,
  fallbackCity,
  journey,
  onViewAll,
}: {
  /** The line's name from the naming table, e.g. "Ganga Line". */
  lineName: string;
  /** The first zone's city, for the heading while the zones are unknown. */
  fallbackCity: string;
  journey: JourneyProgress;
  /** Opens the journey map. */
  onViewAll: () => void;
}) {
  const colors = useColors();
  const { current, zones, isLoading } = journey;
  // The zone the learner is in: the current stop's, else the first zone not
  // finished and not locked (the pass shows the same city), else the first.
  const zone: JourneyZoneProgress | undefined = current
    ? zones[current.zoneIndex]
    : (zones.find((z) => !z.allDone && !z.locked) ?? zones[0]);
  const city = current?.geoName || zone?.geoName || fallbackCity;
  const mastered = zone?.masteredCount ?? 0;
  const total = zone?.phraseCount ?? 0;
  const pct = zone ? zonePct(zone) : 0;

  return (
    <View
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      testID="journey-progress-card"
    >
      <View style={styles.eyebrowRow}>
        <Feather name="map" size={15} color={colors.primary} />
        <Text style={[styles.eyebrow, { color: colors.primary }]}>JOURNEY PROGRESS</Text>
      </View>
      {isLoading ? (
        <SkeletonCard height={150} borderRadius={14} />
      ) : (
        <>
          <View style={styles.top}>
            <View style={styles.words}>
              <Text style={[styles.line, { color: colors.mutedForeground }]} numberOfLines={1}>
                {`Journey 1  •  ${lineName}`}
              </Text>
              <Text style={[styles.city, { color: colors.foreground }]} numberOfLines={1}>
                {city}
              </Text>
              <Text style={[styles.count, { color: colors.mutedForeground }]}>
                {`${mastered} of ${total} phrases mastered`}
              </Text>
              <View style={[styles.track, { backgroundColor: colors.muted }]}>
                <View
                  style={[styles.fill, { backgroundColor: colors.primary, width: `${pct}%` }]}
                />
              </View>
            </View>
            <View style={styles.artCol}>
              {current ? (
                <View style={[styles.pill, { backgroundColor: `${colors.primary}14`, borderColor: `${colors.primary}33` }]}>
                  <Text style={[styles.pillText, { color: colors.primary }]}>
                    {`Stop ${current.stopNumber} of ${current.stopCount}`}
                  </Text>
                </View>
              ) : null}
              <View style={styles.art}>
                {/* The city's landmark at a whisper behind the train, the
                    same silhouette the home pass seeps through its paper. */}
                <View style={styles.landmark} pointerEvents="none">
                  <Landmark
                    city={city}
                    width={ART_W}
                    height={Math.round(ART_W * 0.6)}
                    ink={TICKET.ink}
                    paper={colors.card}
                    opacity={0.12}
                  />
                </View>
                <Image
                  source={TRAIN_FULL}
                  resizeMode="contain"
                  accessibilityIgnoresInvertColors
                  style={{ width: ART_W, height: ART_H }}
                />
              </View>
            </View>
          </View>

          {zones.length > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}

          {zones.slice(0, ZONE_ROWS_SHOWN).map((z) => {
            const p = zonePct(z);
            return (
              <PressableScale
                key={z.zoneIndex}
                onPress={onViewAll}
                accessibilityRole="button"
                accessibilityLabel={`${z.title}, ${p} percent mastered`}
                accessibilityHint="Opens the journey map"
                style={styles.zoneRow}
                testID={`journey-zone-row-${z.zoneIndex}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.zoneTitle, { color: colors.foreground }]} numberOfLines={1}>
                    {z.title}
                  </Text>
                  <View style={[styles.zoneTrack, { backgroundColor: colors.muted }]}>
                    <View style={[styles.fill, { backgroundColor: colors.success, width: `${p}%` }]} />
                  </View>
                </View>
                <Text style={[styles.zonePct, { color: p > 0 ? colors.success : colors.foreground }]}>
                  {`${p}%`}
                </Text>
                <Feather name="chevron-right" size={18} color={colors.primary} />
              </PressableScale>
            );
          })}

          <PressableScale
            onPress={onViewAll}
            accessibilityRole="button"
            accessibilityLabel="View all stops"
            accessibilityHint="Opens the journey map"
            style={styles.viewAll}
            testID="journey-view-all"
          >
            <Text style={[styles.viewAllText, { color: colors.primary }]}>View all stops</Text>
            <Feather name="chevron-right" size={18} color={colors.primary} />
          </PressableScale>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    marginBottom: 24,
  },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  eyebrow: {
    fontFamily: AppFonts.extrabold,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  words: { flex: 1, minWidth: 0 },
  line: { fontFamily: AppFonts.semibold, fontSize: 13 },
  city: { fontFamily: AppFonts.extrabold, fontSize: 24, marginTop: 4 },
  count: { fontFamily: AppFonts.regular, fontSize: 13, marginTop: 6 },
  track: { height: 8, borderRadius: 999, overflow: 'hidden', marginTop: 8 },
  fill: { height: '100%', borderRadius: 999 },
  artCol: { alignItems: 'flex-end', width: ART_W },
  pill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 5 },
  pillText: { fontFamily: AppFonts.bold, fontSize: 12 },
  art: { width: ART_W, height: ART_H, marginTop: 2, justifyContent: 'flex-end' },
  landmark: { position: 'absolute', left: 0, bottom: 8 },
  divider: { height: 1, marginVertical: 14 },
  zoneRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  zoneTitle: { fontFamily: AppFonts.semibold, fontSize: 14, marginBottom: 6 },
  zoneTrack: { height: 6, borderRadius: 999, overflow: 'hidden' },
  zonePct: { fontFamily: AppFonts.extrabold, fontSize: 14, minWidth: 40, textAlign: 'right' },
  viewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingTop: 12,
    paddingBottom: 2,
  },
  viewAllText: { fontFamily: AppFonts.bold, fontSize: 14 },
});
