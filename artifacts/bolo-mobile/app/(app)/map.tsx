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
  View } from 'react-native';
import { useContentWidth } from '@/lib/contentWidth';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  getListCategoryPhrasesQueryKey,
  useListCategoryPhrases,
  type Language,
} from '@workspace/api-client-react';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { PressableScale } from '@/components/PressableScale';
import { StopDots } from '@/components/journey/StopDots';
import { useLanguage } from '@/contexts/LanguageContext';
import { useColors } from '@/hooks/useColors';
import { AppFonts, nativeTextStyle } from '@/constants/fonts';
import { BADGE, TICKET } from '@/lib/ticketStock';
import { JOURNEY_ZONES, getJourneyLine, type JourneyLine } from '@/lib/journeyLines';
import {
  JOURNEY_MAP_POSTER_ASPECT,
  journeyMapPosterUrl,
  journeyMapTagline,
  journeyMapWelcome,
  journeyMapZoneBlurb,
  useJourneyMapBoards,
  type JourneyMapBoards,
  type JourneyMapBox,
} from '@/lib/journeyMap';
import { useJourneyProgress, type JourneyZoneProgress } from '@/lib/useJourneyProgress';
import { hapticLight } from '@/lib/haptics';

const H_PAD = 20;

/**
 * The zone icons the app draws into a text-free poster's empty medallions,
 * one per zone in journey order. Drawn by the app rather than painted so
 * they can never sit beside the wrong word (the painted ones did).
 */
const ZONE_MEDALLION_ICONS: readonly (keyof typeof MaterialCommunityIcons.glyphMap)[] = [
  'hands-pray',
  'account-group',
  'numeric',
  'food-variant',
  'message-text',
  'heart',
];

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
  const width = useContentWidth();
  const { activeLang, activeLanguage } = useLanguage();
  const line = getJourneyLine(activeLang);
  const progress = useJourneyProgress(activeLang, line.zones);
  const [posterFailed, setPosterFailed] = useState(false);
  // THE WORDS ON THE POSTER come from here, not from the paint: the boards
  // file says where, and the greeting is the language's own first phrase
  // from the API, so its script can never be wrong (lib/journeyMap.ts).
  const boards = useJourneyMapBoards(activeLang);
  const greetingPhrases = useListCategoryPhrases(JOURNEY_ZONES[0].id, activeLang, {
    query: {
      enabled: !!activeLang && boards !== null,
      queryKey: getListCategoryPhrasesQueryKey(JOURNEY_ZONES[0].id, activeLang),
    },
  });
  const greeting = greetingPhrases.data?.[0] ?? null;

  // EXPLICIT POINTS, never a percentage: an Image sized by width:'100%' plus
  // aspectRatio can resolve to its intrinsic pixel size on device (the
  // blank-board saga, CLAUDE.md render trap 1). The boards file carries the
  // poster's own size, so the frame matches the image exactly and the boxes
  // land where they were measured.
  const posterW = Math.max(0, width - H_PAD * 2);
  const aspect = boards ? boards.size[0] / boards.size[1] : JOURNEY_MAP_POSTER_ASPECT;
  const posterH = Math.round(posterW / aspect);

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
            <>
              <Image
                testID="map-poster"
                accessibilityLabel={`${line.lineName} journey map`}
                source={{ uri: journeyMapPosterUrl(activeLang) }}
                style={{ width: posterW, height: posterH }}
                resizeMode="cover"
                onError={() => setPosterFailed(true)}
              />
              {boards ? (
                <PosterWords
                  boards={boards}
                  W={posterW}
                  H={posterH}
                  languageName={activeLanguage?.name ?? ''}
                  language={activeLanguage}
                  line={line}
                  greeting={greeting}
                  accent={colors.primary}
                />
              ) : null}
            </>
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
 * THE WORDS, WRITTEN OVER THE BLANK BOARDS. Every box is a fraction of the
 * poster, scaled to the frame; every size is a fraction of the width, so a
 * small phone and a tablet read the same poster. Text never spills a board:
 * it shrinks to fit rather than overflowing the paint.
 */
function PosterWords({
  boards,
  W,
  H,
  languageName,
  language,
  line,
  greeting,
  accent,
}: {
  boards: JourneyMapBoards;
  W: number;
  H: number;
  languageName: string;
  language: Language | undefined;
  line: JourneyLine;
  greeting: { nativeScript: string; romanized: string } | null;
  accent: string;
}) {
  const u = W / 100;
  const at = (b: JourneyMapBox) => ({
    position: 'absolute' as const,
    left: Math.round(b.x * W),
    top: Math.round(b.y * H),
    width: Math.round(b.w * W),
    height: Math.round(b.h * H),
  });
  const native = nativeTextStyle(language, { bold: true });
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="map-words">
      {boards.title ? (
        <View style={[at(boards.title), styles.wordsCenter, { paddingHorizontal: 3 * u, paddingVertical: 1.5 * u }]}>
          <Text
            testID="map-word-title"
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ fontFamily: AppFonts.extrabold, fontSize: 7.5 * u, color: TICKET.ink, letterSpacing: 0.5 * u }}
          >
            {languageName.toUpperCase()}
          </Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ fontFamily: AppFonts.bold, fontSize: 2.3 * u, color: BADGE.brassBg, letterSpacing: 0.15 * u, marginTop: 0.6 * u }}
          >
            {`${line.lineName.toUpperCase()}  ·  JOURNEY 1`}
          </Text>
        </View>
      ) : null}
      {boards.greeting ? (
        <View style={[at(boards.greeting), { padding: 2.6 * u, paddingBottom: boards.greeting.h * H * 0.42 }]}>
          {/* The parrot stands over the board's lower half, so the words stay
              in the top of it: that is the paddingBottom. */}
          {greeting ? (
            <>
              <Text testID="map-word-greeting" numberOfLines={1} adjustsFontSizeToFit style={[native, { fontSize: 4.6 * u, color: accent }]}>
                {greeting.nativeScript}
              </Text>
              <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: AppFonts.regular, fontSize: 2.4 * u, color: TICKET.inkMuted, marginBottom: 1.2 * u }}>
                {`(${greeting.romanized})`}
              </Text>
            </>
          ) : null}
          <Text numberOfLines={4} adjustsFontSizeToFit style={{ fontFamily: AppFonts.regular, fontSize: 2.3 * u, lineHeight: 3.1 * u, color: TICKET.ink }}>
            {journeyMapWelcome(languageName)}
          </Text>
        </View>
      ) : null}
      {boards.zones.map((z, i) =>
        z ? (
          <View key={`zone-${i}`} style={[at(z), { paddingHorizontal: 2.6 * u, paddingVertical: 2.2 * u, width: Math.round(z.w * W * 0.66) }]}>
            {/* ONE line that shrinks, never two: React Native breaks a word
                before it shrinks the font, and on the narrowest panel that
                printed "Everyda / y Words" on device. */}
            <Text testID={`map-word-zone-${i}`} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontFamily: AppFonts.extrabold, fontSize: 2.6 * u, lineHeight: 3.1 * u, color: accent }}>
              {JOURNEY_ZONES[i]?.title ?? ''}
            </Text>
            <Text numberOfLines={3} adjustsFontSizeToFit style={{ fontFamily: AppFonts.regular, fontSize: 2 * u, lineHeight: 2.7 * u, color: TICKET.ink, marginTop: 0.6 * u }}>
              {journeyMapZoneBlurb(i, languageName)}
            </Text>
          </View>
        ) : null,
      )}
      {boards.numbers.map((n, i) =>
        n ? (
          <View key={`number-${i}`} style={[at(n), styles.wordsCenter]}>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: AppFonts.extrabold, fontSize: 3.2 * u, color: '#FFFFFF' }}>
              {i + 1}
            </Text>
          </View>
        ) : null,
      )}
      {boards.signs.map((s, i) => {
        if (!s) return null;
        const nativeName = line.zonesNative[i] ?? null;
        return (
          <View key={`sign-${i}`} style={[at(s), styles.wordsCenter, { paddingHorizontal: 1.5 * u }]}>
            {nativeName ? (
              <Text
                testID={`map-word-sign-native-${i}`}
                numberOfLines={1}
                adjustsFontSizeToFit
                style={[native, { fontSize: 2.9 * u, color: '#FFFFFF', textAlign: 'center' }]}
              >
                {nativeName}
              </Text>
            ) : null}
            <Text
              testID={`map-word-sign-${i}`}
              numberOfLines={nativeName ? 1 : 2}
              adjustsFontSizeToFit
              style={{
                fontFamily: AppFonts.bold,
                fontSize: nativeName ? 1.55 * u : 2.6 * u,
                color: nativeName ? '#F2DDC2' : '#FFFFFF',
                textAlign: 'center',
                letterSpacing: nativeName ? 0.08 * u : 0.2 * u,
              }}
            >
              {(line.zones[i] ?? '').toUpperCase()}
            </Text>
          </View>
        );
      })}
      {!boards.iconsPainted
        ? boards.medallions.map((m, i) =>
            m ? (
              <View key={`icon-${i}`} testID={`map-icon-${i}`} style={[at(m), styles.wordsCenter]}>
                <MaterialCommunityIcons
                  name={ZONE_MEDALLION_ICONS[i] ?? 'star'}
                  size={Math.round(m.w * W * 0.55)}
                  color={accent}
                />
              </View>
            ) : null,
          )
        : null}
      {boards.bottom ? (
        <View style={[at(boards.bottom), styles.wordsCenter, { paddingLeft: boards.bottom.w * W * 0.13, paddingRight: 3 * u }]}>
          <Text numberOfLines={3} adjustsFontSizeToFit style={{ fontFamily: AppFonts.semibold, fontSize: 2.5 * u, lineHeight: 3.4 * u, color: TICKET.ink }}>
            {journeyMapTagline(languageName)}
          </Text>
        </View>
      ) : null}
    </View>
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
  wordsCenter: {
    alignItems: 'center',
    justifyContent: 'center',
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
