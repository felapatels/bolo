/**
 * THE ONE-PAGER MAP (build 20): the whole line at once.
 *
 * Home's View Map pill was kept, even though the boarding pass already opens
 * the journey, as the door to exactly this ("later we can create a onepager
 * map view that shows the full journey", chat 17; asked again in build 20).
 * The language's painted poster fills the top; the legend beneath it is the
 * live part: six zones with the same dots and "Stop N of M" the boarding pass
 * uses, from the same six payloads, so this screen can never disagree with
 * the journey about where the learner is. Tapping a zone opens the journey.
 *
 * Web twin: src/pages/map.tsx.
 */
import React, { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { PressableScale } from '@/components/PressableScale';
import { StopDots } from '@/components/journey/StopDots';
import { useLanguage } from '@/contexts/LanguageContext';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { BADGE, TICKET } from '@/lib/ticketStock';
import { JOURNEY_ZONES, getJourneyLine } from '@/lib/journeyLines';
import { JOURNEY_MAP_POSTER_ASPECT, journeyMapPosterUrl } from '@/lib/journeyMap';
import { useJourneyProgress, type JourneyZoneProgress } from '@/lib/useJourneyProgress';
import { hapticLight } from '@/lib/haptics';

const H_PAD = 20;

/** The status line under a zone's name, worded rather than coloured. */
export function zoneStatusCopy(z: JourneyZoneProgress): string {
  if (z.stopCount === 0) return 'Not open yet';
  if (z.currentStopNumber !== null) return `Stop ${z.currentStopNumber} of ${z.stopCount}`;
  if (z.allDone) return `All ${z.stopCount} stops done`;
  if (z.locked) return `${z.stopCount} stops, locked`;
  return `${z.stopCount} stops`;
}

/** Dots filled from the left: everything before the current stop, or all of a finished zone. */
export function zoneDotsDone(z: JourneyZoneProgress): number {
  if (z.allDone) return z.stopCount;
  if (z.currentStopNumber !== null) return z.currentStopNumber - 1;
  return 0;
}

export default function JourneyMapScreen() {
  const colors = useColors();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { activeLang } = useLanguage();
  const line = getJourneyLine(activeLang);
  const progress = useJourneyProgress(activeLang, line.zones);
  const [posterFailed, setPosterFailed] = useState(false);

  // EXPLICIT POINTS, never a percentage: an Image sized by width:'100%' plus
  // aspectRatio can resolve to its intrinsic pixel size on device (the
  // blank-board saga, CLAUDE.md render trap 1).
  const posterW = Math.max(0, width - H_PAD * 2);
  const posterH = Math.round(posterW / JOURNEY_MAP_POSTER_ASPECT);

  const openJourney = () => {
    hapticLight();
    router.push('/(app)/journey' as Parameters<typeof router.push>[0]);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <PressableScale
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </PressableScale>
        <Text style={[styles.headerLabel, { color: colors.foreground }]} numberOfLines={1}>
          {line.lineName}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: H_PAD, paddingBottom: TAB_BAR_CLEARANCE }}
        showsVerticalScrollIndicator={false}
      >
        <View
          testID="map-poster-frame"
          style={[
            styles.posterFrame,
            { width: posterW, height: posterH, borderColor: BADGE.brassEdge, backgroundColor: TICKET.stockTop },
          ]}
        >
          {posterFailed ? (
            <PosterPlaceholder lineName={line.lineName} cities={line.zones} />
          ) : (
            <Image
              testID="map-poster"
              accessibilityLabel={`${line.lineName} journey map`}
              source={{ uri: journeyMapPosterUrl(activeLang) }}
              style={{ width: posterW, height: posterH }}
              resizeMode="cover"
              onError={() => setPosterFailed(true)}
            />
          )}
        </View>

        <View style={styles.legendHeader}>
          <Text style={[styles.legendKicker, { color: colors.primary }]}>WHERE YOU ARE</Text>
          {progress.totalCount > 0 ? (
            <Text style={[styles.legendSummary, { color: colors.mutedForeground }]}>
              {progress.doneCount} of {progress.totalCount} lessons done
            </Text>
          ) : null}
        </View>

        {progress.zones.length === 0 ? (
          <Text style={[styles.legendEmpty, { color: colors.mutedForeground }]}>
            {progress.isLoading ? 'Finding your train...' : 'Open the journey to board your first stop.'}
          </Text>
        ) : (
          progress.zones.map((z) => (
            <Pressable
              key={z.zoneIndex}
              testID={`map-zone-${z.zoneIndex}`}
              accessibilityRole="button"
              accessibilityLabel={`Zone ${z.zoneIndex + 1}, ${JOURNEY_ZONES[z.zoneIndex]?.title ?? ''}, ${z.geoName}, ${zoneStatusCopy(z)}`}
              onPress={openJourney}
              style={[
                styles.zoneRow,
                {
                  backgroundColor: colors.card,
                  borderColor: z.currentStopNumber !== null ? colors.primary : colors.border,
                },
              ]}
            >
              <View style={[styles.zoneBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.zoneBadgeText}>{z.zoneIndex + 1}</Text>
              </View>
              <View style={styles.zoneBody}>
                <View style={styles.zoneTitleRow}>
                  <Text style={[styles.zoneTitle, { color: colors.foreground }]} numberOfLines={1}>
                    {JOURNEY_ZONES[z.zoneIndex]?.title ?? `Zone ${z.zoneIndex + 1}`}
                  </Text>
                  {z.locked ? <Feather name="lock" size={13} color={colors.mutedForeground} /> : null}
                  {z.allDone ? <Feather name="check-circle" size={14} color={colors.primary} /> : null}
                </View>
                <Text style={[styles.zoneCity, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {z.geoName}
                </Text>
                <Text
                  testID={`map-zone-${z.zoneIndex}-status`}
                  style={[
                    styles.zoneStatus,
                    { color: z.currentStopNumber !== null ? colors.primary : colors.mutedForeground },
                  ]}
                >
                  {zoneStatusCopy(z)}
                </Text>
                {z.stopCount > 0 ? (
                  <View style={styles.zoneDots}>
                    <StopDots
                      total={z.stopCount}
                      done={zoneDotsDone(z)}
                      current={z.currentStopNumber}
                      accent={colors.primary}
                      muted={colors.border}
                      terminus={z.zoneIndex === 5}
                      testID={`map-zone-${z.zoneIndex}-dots`}
                    />
                  </View>
                ) : null}
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </Pressable>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

/**
 * What stands in for a poster that is not there yet: the line and its six
 * cities on ticket stock, so every language has a map today and the art can
 * land one language at a time.
 */
function PosterPlaceholder({ lineName, cities }: { lineName: string; cities: readonly string[] }) {
  return (
    <View testID="map-poster-fallback" style={styles.placeholder}>
      <Text style={styles.placeholderKicker}>JOURNEY 1</Text>
      <Text style={styles.placeholderTitle}>{lineName}</Text>
      <View style={styles.placeholderRail}>
        {cities.map((city, i) => (
          <View key={city} style={styles.placeholderStop}>
            <View style={styles.placeholderDot} />
            <Text style={styles.placeholderCity} numberOfLines={1}>
              {i + 1}. {city}
            </Text>
          </View>
        ))}
      </View>
      <Text style={styles.placeholderNote}>Poster on its way</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 4,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontFamily: AppFonts.extrabold,
    marginHorizontal: 8,
  },
  posterFrame: {
    marginTop: 8,
    borderRadius: 18,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  legendHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 22,
    marginBottom: 10,
  },
  legendKicker: {
    fontSize: 12,
    letterSpacing: 1.6,
    fontFamily: AppFonts.extrabold,
  },
  legendSummary: {
    fontSize: 13,
    fontFamily: AppFonts.semibold,
  },
  legendEmpty: {
    fontSize: 14,
    fontFamily: AppFonts.regular,
    paddingVertical: 12,
  },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  zoneBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneBadgeText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: AppFonts.extrabold,
  },
  zoneBody: {
    flex: 1,
    minWidth: 0,
  },
  zoneTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  zoneTitle: {
    fontSize: 16,
    fontFamily: AppFonts.bold,
    flexShrink: 1,
  },
  zoneCity: {
    fontSize: 12,
    fontFamily: AppFonts.regular,
    marginTop: 1,
  },
  zoneStatus: {
    fontSize: 13,
    fontFamily: AppFonts.semibold,
    marginTop: 4,
  },
  zoneDots: {
    marginTop: 8,
  },
  placeholder: {
    flex: 1,
    padding: 22,
    justifyContent: 'center',
    gap: 8,
  },
  placeholderKicker: {
    fontSize: 12,
    letterSpacing: 1.6,
    color: BADGE.brassBg,
    fontFamily: AppFonts.extrabold,
  },
  placeholderTitle: {
    fontSize: 26,
    color: TICKET.ink,
    fontFamily: AppFonts.extrabold,
    marginBottom: 10,
  },
  placeholderRail: {
    gap: 14,
  },
  placeholderStop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  placeholderDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: BADGE.brassEdge,
    backgroundColor: TICKET.stockBottom,
  },
  placeholderCity: {
    fontSize: 15,
    color: TICKET.ink,
    fontFamily: AppFonts.semibold,
    flexShrink: 1,
  },
  placeholderNote: {
    marginTop: 14,
    fontSize: 12,
    color: TICKET.inkMuted,
    fontFamily: AppFonts.regular,
  },
});
