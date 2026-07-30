// Spec D1b-M: the journey map, ported from the shipped web page
// (gujarati-coach/src/pages/journey.tsx — the source of truth; this is a
// translation, not a redesign). One themed rail line per language (structured
// content in lib/journeyLines.ts), six fare zones in authoritative category
// order, one station per lesson group (phrase-stage stops before
// sentence-stage), states straight from the unlock API. For plan-locked
// languages the map renders in teaser/exhausted "showroom" mode per the API's
// access envelope: full structure, everything locked except the marked teaser
// station. tested_out = express stamp, sentence stage = first-class diamond +
// All-Access chip, locked showroom zones = grayscale postcards.
//
// The rail is the web's PRONOUNCED serpentine railway track — stations
// alternate left/right, twin rails with sleeper ties curve between them,
// completed segments solid, locked segments faded and dashed. Rendering
// approach (approved): react-native-svg with the web's exact path geometry,
// split into per-zone Svg blocks inside the ScrollView for scroll perf.
import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Svg, { Path, G } from 'react-native-svg';
import {
  useListCategories,
  useListCategoryLessonGroups,
  type LessonGroupList,
  type LessonGroupSummary,
} from '@workspace/api-client-react';
import { Screen } from '@/components/Screen';
import { Mascot } from '@/components/Mascot';
import { LessonError } from '@/components/LessonError';
import { UpgradeRequiredScreen } from '@/components/UpgradeRequiredScreen';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { asUpgradeRequired } from '@/lib/entitlements';
import { JOURNEY_ZONES, getJourneyLine } from '@/lib/journeyLines';
import { TrainEngine } from '@/components/journey/TrainEngine';
import { TicketPerforationV, TicketStripes, ZoneStamp } from '@/components/journey/TicketParts';
import { Bunting, TracksideDoodad, ZoneVista, SCENERY_GRAY } from '@/components/journey/Scenery';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { hapticLight } from '@/lib/haptics';

const GRAY = SCENERY_GRAY; // rail/marker color for locked showroom zones

// Serpentine layout rhythm — identical to the web map (which is itself
// mobile-width, max 390px).
const MAP_MAX_W = 390;
const STATION_H = 100; // vertical rhythm per station row
const PC_H = 152; // vertical rhythm per fare-zone postcard (incl. picture side)
const TERM_H = 92; // terminus row
const TOP_PAD = 10;
const LEFT_X = 92; // marker x for even-index stations

type Station = LessonGroupSummary & {
  zoneId: number;
  zoneIndex: number;
  stopNumber: number; // 1-based within the zone
  stopCount: number; // stations in the zone
};

type LockInfo = {
  kind: 'progression' | 'sentence' | 'language';
  stopLabel: string;
  zoneTitle: string;
};

function stageRank(g: LessonGroupSummary): number {
  return g.stage === 'sentence' ? 1 : 0;
}

function isStatusAccessible(status: LessonGroupSummary['status']): boolean {
  return (
    status === 'unlocked' ||
    status === 'in_progress' ||
    status === 'completed' ||
    status === 'tested_out'
  );
}

/** Marker sitting on the rail: circle for phrase stops, diamond for the
 *  first-class sentence stops, train for the current stop. */
function StationMarker({
  station,
  color,
  isCurrent,
  accessible,
  background,
  border,
}: {
  station: Station;
  color: string;
  isCurrent: boolean;
  accessible: boolean;
  background: string;
  border: string;
}) {
  if (isCurrent) {
    // White pill + accent ring + soft outer ring (web: box-shadow rings).
    return (
      <View style={[styles.markerCurrentOuter, { backgroundColor: `${color}33` }]}>
        <View style={[styles.markerCurrentRing, { backgroundColor: color }]}>
          <View style={styles.markerCurrentPill}>
            <TrainEngine color={color} width={32} height={22} />
          </View>
        </View>
      </View>
    );
  }
  const done = station.status === 'completed' || station.status === 'tested_out';
  const diamond = station.stage === 'sentence';
  if (done) {
    // Filled marker: accent fill, white border, thin accent outer ring.
    return (
      <View
        style={[
          styles.markerDoneRing,
          { backgroundColor: color },
          diamond && styles.diamond,
        ]}
      >
        <View
          style={[
            styles.markerDone,
            { backgroundColor: color, borderColor: '#ffffff' },
            diamond && styles.diamondInner,
          ]}
        />
      </View>
    );
  }
  return (
    <View
      style={[
        styles.markerOpen,
        {
          backgroundColor: background,
          borderColor: accessible ? color : border,
        },
        diamond && styles.diamond,
      ]}
    />
  );
}

export default function JourneyScreen() {
  const colors = useColors();
  const router = useRouter();
  const { width: windowW } = useWindowDimensions();
  const { activeLang, activeLanguage } = useLanguage();
  const { isPlus } = useEntitlements();
  const line = getJourneyLine(activeLang);
  const [lock, setLock] = useState<LockInfo | null>(null);
  // Web measures the map column with a ResizeObserver; on native the window
  // width is authoritative (map column = screen width capped at 390, with the
  // same 0 side padding the web column has inside its centering wrapper).
  const mapW = Math.min(MAP_MAX_W, windowW);

  // One language's map never fetches another language's data: exactly six
  // fixed zone queries for the active language.
  const categoriesQuery = useListCategories({ lang: activeLang });
  const q1 = useListCategoryLessonGroups(JOURNEY_ZONES[0].id, activeLang);
  const q2 = useListCategoryLessonGroups(JOURNEY_ZONES[1].id, activeLang);
  const q3 = useListCategoryLessonGroups(JOURNEY_ZONES[2].id, activeLang);
  const q4 = useListCategoryLessonGroups(JOURNEY_ZONES[3].id, activeLang);
  const q5 = useListCategoryLessonGroups(JOURNEY_ZONES[4].id, activeLang);
  const q6 = useListCategoryLessonGroups(JOURNEY_ZONES[5].id, activeLang);
  const zoneQueries = [q1, q2, q3, q4, q5, q6];

  const languageName = activeLanguage?.name ?? 'this language';

  // Plain-locked language (no teaser set): the API keeps its pre-M1 402 and
  // the map defers to the standard upgrade screen.
  const upgrade = zoneQueries
    .map((q) => asUpgradeRequired(q.error))
    .find((u) => u !== null);
  if (upgrade) {
    return (
      <UpgradeRequiredScreen
        title={
          upgrade.reason === 'teaser_exhausted'
            ? "You've tried this language!"
            : 'Unlock this language'
        }
        message={upgrade.message}
        onUpgrade={() =>
          router.push({
            pathname: '/(app)/paywall',
            params: {
              lang: activeLang,
              ...(upgrade.reason ? { reason: upgrade.reason } : {}),
            },
          })
        }
        onBack={() => router.back()}
      />
    );
  }
  if (zoneQueries.some((q) => q.isError)) {
    return (
      <Screen>
        <LessonError
          onRetry={() => {
            zoneQueries.forEach((q) => void q.refetch());
          }}
          isRetrying={zoneQueries.some((q) => q.isFetching)}
          onBack={() => router.back()}
        />
      </Screen>
    );
  }
  if (zoneQueries.some((q) => q.isLoading)) {
    return (
      <Screen>
        <View style={styles.loading}>
          <Mascot pose="wave" size={88} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
            Laying the tracks…
          </Text>
        </View>
      </Screen>
    );
  }

  // The embedded zone table is authoritative; a live mismatch is a hard stop,
  // never a silent remap.
  const categories = categoriesQuery.data;
  const zoneMismatch =
    categories !== undefined &&
    JOURNEY_ZONES.some(
      (z) => !categories.some((c) => c.id === z.id && c.title === z.title),
    );
  if (zoneMismatch) {
    return (
      <Screen>
        <LessonError
          onRetry={() => void categoriesQuery.refetch()}
          isRetrying={categoriesQuery.isFetching}
          onBack={() => router.back()}
        />
      </Screen>
    );
  }

  // M1 access envelope: present only in showroom (teaser/exhausted) mode.
  const access =
    zoneQueries.map((q) => (q.data as LessonGroupList | undefined)?.access).find(Boolean) ??
    null;
  const teaserProgress =
    zoneQueries.map((q) => (q.data as LessonGroupList | undefined)?.teaser).find(Boolean) ??
    null;
  const showroom = access !== null;

  const zones = JOURNEY_ZONES.map((z, i) => {
    const groups = [...((zoneQueries[i]!.data as LessonGroupList | undefined)?.lessonGroups ?? [])]
      // Phrase-stage stops before sentence-stage, then position order.
      .sort((a, b) => stageRank(a) - stageRank(b) || (a.position ?? 0) - (b.position ?? 0));
    const stations: Station[] = groups.map((g, gi) => ({
      ...g,
      zoneId: z.id,
      zoneIndex: i,
      stopNumber: gi + 1,
      stopCount: groups.length,
    }));
    return { ...z, geoName: line.zones[i]!, stations };
  });

  const allStations = zones.flatMap((z) => z.stations);
  const doneCount = allStations.filter(
    (s) => s.status === 'completed' || s.status === 'tested_out',
  ).length;
  const totalCount = allStations.length;
  const currentId = allStations.find(
    (s) =>
      (s.status === 'unlocked' || s.status === 'in_progress') &&
      !(s.stage === 'sentence' && !isPlus),
  )?.id;
  const currentStation = allStations.find((s) => s.id === currentId) ?? null;
  const currentZone = currentStation ? zones[currentStation.zoneIndex]! : null;

  const openPaywallForLanguage = () => {
    setLock(null);
    router.push({
      pathname: '/(app)/paywall',
      params: {
        lang: activeLang,
        reason: access === 'exhausted' ? 'teaser_exhausted' : 'language_locked',
      },
    });
  };

  // --- Serpentine geometry (identical math to the web map): stations
  // alternate left/right down the map column; the track curves between them.
  const rightX = mapW - 94; // mirror of LEFT_X within the column
  const stationX = (k: number) => (k % 2 === 0 ? LEFT_X : rightX);
  type Pt = {
    x: number;
    y: number;
    kind: 'station' | 'postcard' | 'terminus';
    lit: boolean;
    station?: Station;
    zoneIndex?: number;
  };
  const pts: Pt[] = [];
  const postcardYs: { y: number; zoneIndex: number }[] = [];
  let layoutY = TOP_PAD;
  let k = 0; // global station index (drives the serpentine phase)
  for (let zi = 0; zi < zones.length; zi++) {
    const zone = zones[zi]!;
    const zoneLit = zone.stations.some(
      (s) => isStatusAccessible(s.status) || s.teaserStation,
    );
    postcardYs.push({ y: layoutY, zoneIndex: zi });
    // Path point mid-postcard, x interpolated between neighbor stations.
    const xPrev = k === 0 ? stationX(0) : stationX(k - 1);
    const xNext = stationX(k);
    pts.push({
      x: (xPrev + xNext) / 2,
      y: layoutY + PC_H / 2,
      kind: 'postcard',
      lit: !showroom || zoneLit,
      zoneIndex: zi,
    });
    layoutY += PC_H;
    for (const s of zone.stations) {
      const sentenceGated = s.stage === 'sentence' && !isPlus;
      const lit =
        s.status === 'completed' ||
        s.status === 'tested_out' ||
        s.status === 'in_progress' ||
        (s.status === 'unlocked' && !sentenceGated);
      pts.push({ x: stationX(k), y: layoutY + STATION_H / 2, kind: 'station', lit, station: s });
      layoutY += STATION_H;
      k++;
    }
  }
  const allDone = doneCount === totalCount && totalCount > 0;
  const termX = k > 0 ? stationX(k - 1) : LEFT_X;
  const termY = layoutY + TERM_H / 2;
  pts.push({ x: termX, y: termY, kind: 'terminus', lit: allDone });
  const totalH = layoutY + TERM_H + 8;

  const segs = pts.slice(1).map((p, i) => {
    const a = pts[i]!;
    const dy = (p.y - a.y) / 2;
    return {
      d: `M ${a.x} ${a.y} C ${a.x} ${a.y + dy}, ${p.x} ${p.y - dy}, ${p.x} ${p.y}`,
      lit: p.lit,
      y0: a.y,
      y1: p.y,
    };
  });

  // Per-zone Svg slices (approved perf treatment): each zone owns the strip
  // from its postcard top to the next postcard top; the last zone's slice
  // runs to the bottom and carries the bunting + terminus row.
  const slices = postcardYs.map(({ y }, i) => {
    const start = y;
    const end = i + 1 < postcardYs.length ? postcardYs[i + 1]!.y : totalH;
    return { start, end };
  });

  const stationPts = pts.filter((p) => p.kind === 'station');

  return (
    <Screen padTop={false}>
      {/* Boarding-pass header — full-ticket treatment */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Pressable
          accessibilityLabel="Back to home"
          onPress={() => {
            hapticLight();
            router.back();
          }}
          style={[styles.backBtn, { backgroundColor: colors.muted }]}
        >
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <View style={[styles.headerTicket, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <TicketStripes ink={`${line.accent}08`} />
          <View style={styles.headerTicketRow}>
            <View style={styles.headerTicketBody}>
              <Text style={[styles.ticketEyebrow, { color: colors.mutedForeground }]}>
                BOARDING PASS · બોલો રેલ
              </Text>
              <Text numberOfLines={1} style={[styles.ticketLine, { color: colors.foreground }]}>
                {line.lineName}
              </Text>
              <Text numberOfLines={1} style={[styles.ticketRoute, { color: colors.mutedForeground }]}>
                {line.zones[0]} → {line.zones[5]} · {doneCount}/{totalCount} stations
              </Text>
              {access === 'teaser' && teaserProgress && (
                <Text style={[styles.ticketTeaser, { color: line.accent }]}>
                  Free taste {teaserProgress.consumed}/{teaserProgress.limit}
                </Text>
              )}
            </View>
            {/* tear-off stub */}
            <TicketPerforationV dashColor={colors.border} holeColor={colors.background} />
            <View style={styles.headerStub}>
              <View style={[styles.stubNotch, { backgroundColor: colors.background }]} />
              <Text style={styles.stubEmoji}>🎫</Text>
              {currentZone && currentStation && (
                <ZoneStamp
                  ink={line.accent}
                  zone={currentStation.zoneIndex + 1}
                  name={currentZone.geoName}
                  size={44}
                />
              )}
            </View>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {access === 'exhausted' && (
          <View style={[styles.exhaustedCard, { borderColor: line.accent, backgroundColor: colors.card }]}>
            <Text style={[styles.exhaustedTitle, { color: colors.foreground }]}>
              You've tried the {line.lineName}! All {teaserProgress?.limit ?? 3} free
              phrases are used.
            </Text>
            <Text style={[styles.exhaustedBody, { color: colors.mutedForeground }]}>
              Unlock {languageName} to board every stop on the line.
            </Text>
            <Pressable
              onPress={() => {
                hapticLight();
                openPaywallForLanguage();
              }}
              style={[styles.exhaustedCta, { backgroundColor: line.accent }]}
            >
              <Feather name="star" size={16} color="#ffffff" />
              <Text style={styles.exhaustedCtaText}>Get your ticket</Text>
            </Pressable>
          </View>
        )}

        {/* Serpentine railway: track + zone postcards + stations. */}
        <View style={[styles.map, { width: mapW, height: totalH }]}>
          {/* Track + scenery, one Svg block per fare zone */}
          {slices.map(({ start, end }, si) => (
            <Svg
              key={si}
              pointerEvents="none"
              style={{ position: 'absolute', left: 0, top: start }}
              width={mapW}
              height={end - start}
              viewBox={`0 ${start} ${mapW} ${end - start}`}
            >
              {segs
                .filter((s) => s.y1 > start && s.y0 < end)
                .map((s, i) => {
                  const railColor = s.lit ? line.accent : GRAY;
                  return (
                    <G key={i} opacity={s.lit ? 1 : 0.5}>
                      <Path d={s.d} stroke={railColor} strokeWidth={15} strokeDasharray="3 11" opacity={0.3} fill="none" />
                      <Path d={s.d} stroke={railColor} strokeWidth={8.5} fill="none" strokeDasharray={s.lit ? undefined : '9 7'} />
                      <Path d={s.d} stroke={colors.background} strokeWidth={4} fill="none" strokeDasharray={s.lit ? undefined : '9 7'} />
                    </G>
                  );
                })}
              {/* Trackside scenery: one small scene in the free strip beside
                  each station (opposite its card), cycling by station index. */}
              {stationPts.map((p, i) => {
                if (p.y < start || p.y >= end) return null;
                const s = p.station!;
                const zone = zones[s.zoneIndex]!;
                const zoneAccessible = zone.stations.some(
                  (st) => isStatusAccessible(st.status) || st.teaserStation,
                );
                return (
                  <TracksideDoodad
                    key={s.id}
                    variant={i}
                    x={i % 2 === 0 ? 42 : mapW - 42}
                    y={p.y + 22}
                    accent={line.accent}
                    gray={showroom && !zoneAccessible}
                  />
                );
              })}
              {/* Festival bunting over the terminus (last slice only) */}
              {si === slices.length - 1 && (
                <Bunting x1={20} x2={mapW - 20} y={termY - 34} accent={line.accent} />
              )}
            </Svg>
          ))}

          {/* Zone postcards (full width; interchange diamond rides the track) */}
          {postcardYs.map(({ y: py, zoneIndex }) => {
            const zone = zones[zoneIndex]!;
            const pt = pts.find((p) => p.kind === 'postcard' && p.zoneIndex === zoneIndex)!;
            const zoneAccessible = zone.stations.some(
              (s) => isStatusAccessible(s.status) || s.teaserStation,
            );
            const grayed = showroom && !zoneAccessible;
            const cardColor = grayed ? GRAY : line.accent;
            return (
              <View key={zone.id}>
                <View style={[styles.postcardWrap, { top: py + 10 }]}>
                  <View style={[styles.postcard, { borderColor: cardColor, opacity: grayed ? 0.8 : 1 }]}>
                    <View style={[styles.postcardInner, { borderColor: `${cardColor}66` }]}>
                      {/* picture side: the zone's landmark vista */}
                      <ZoneVista zoneIndex={zoneIndex} accent={line.accent} grayed={grayed} />
                      {/* address side */}
                      <View style={styles.postcardAddress}>
                        <View style={styles.postcardLeft}>
                          <Text style={[styles.postcardZoneLabel, { color: cardColor }]}>
                            FARE ZONE {zoneIndex + 1} · {zone.title.toUpperCase()}
                          </Text>
                          <Text numberOfLines={1} style={styles.postcardGeoName}>
                            {zone.geoName}
                          </Text>
                          <Text style={styles.postcardStops}>
                            {zone.stations.length} {zone.stations.length === 1 ? 'stop' : 'stops'} in this zone
                          </Text>
                        </View>
                        {/* divided-back vertical rule */}
                        <View style={[styles.postcardRule, { backgroundColor: `${cardColor}44` }]} />
                        {/* stamp + postmark, side by side */}
                        <View style={styles.postcardRight}>
                          <View style={[styles.postmark, { borderColor: `${cardColor}88` }]}>
                            <View style={[styles.postmarkInner, { borderColor: cardColor }]}>
                              <View style={[styles.postmarkDot, { backgroundColor: cardColor }]} />
                            </View>
                          </View>
                          <View style={[styles.postageStamp, { borderColor: cardColor, backgroundColor: `${cardColor}14` }]}>
                            <Text style={[styles.postageStampLabel, { color: cardColor }]}>ZONE</Text>
                            <Text style={[styles.postageStampNum, { color: cardColor }]}>{zoneIndex + 1}</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  </View>
                </View>
                {/* interchange diamond pinned where the track meets the zone
                    card (top border) so it never collides with the card text */}
                <View
                  style={[
                    styles.interchange,
                    {
                      left: pt.x - 8,
                      top: py + 10 - 8,
                      backgroundColor: cardColor,
                    },
                  ]}
                >
                  <View style={styles.interchangeInner} />
                </View>
              </View>
            );
          })}

          {/* Stations */}
          {stationPts.map((p, k2) => {
            const s = p.station!;
            const zone = zones[s.zoneIndex]!;
            const zoneAccessible = zone.stations.some(
              (st) => isStatusAccessible(st.status) || st.teaserStation,
            );
            const grayed = showroom && !zoneAccessible;
            const zoneColor = grayed ? GRAY : line.accent;
            const side: 'left' | 'right' = k2 % 2 === 0 ? 'right' : 'left';
            const boxLeft = side === 'right' ? p.x + 28 : 16;
            const boxWidth =
              side === 'right' ? mapW - 16 - (p.x + 28) : p.x - 28 - 16;
            const stopLabel = `Stop ${s.stopNumber} of ${s.stopCount}`;
            // A Free learner's sentence stop always routes through the
            // entitlement presentation, even when progression says unlocked —
            // its phrases are Plus content server-side.
            const sentenceGated = s.stage === 'sentence' && !isPlus;
            const accessible = isStatusAccessible(s.status) && !sentenceGated;
            const isCurrent = s.id === currentId;
            const statusCopy =
              s.status === 'completed'
                ? 'Completed'
                : s.status === 'tested_out'
                  ? 'Tested out'
                  : s.status === 'in_progress'
                    ? 'In progress'
                    : accessible
                      ? 'Now boarding'
                      : 'Locked';
            const aria = `${stopLabel} — ${statusCopy}${s.stage === 'sentence' ? ' (sentence stop)' : ''}`;
            const onPress = () => {
              hapticLight();
              if (accessible) {
                router.push({
                  pathname: '/(app)/practice/[id]',
                  params: { id: String(zone.id), group: String(s.id) },
                });
                return;
              }
              setLock({
                kind: showroom
                  ? 'language'
                  : sentenceGated
                    ? 'sentence'
                    : 'progression',
                stopLabel: `${stopLabel} · ${zone.geoName}`,
                zoneTitle: zone.title,
              });
            };
            return (
              <View key={s.id}>
                {/* rail marker (drawn above the track, non-interactive) */}
                <View pointerEvents="none" style={[styles.markerWrap, { left: p.x - 28, top: p.y - 28 }]}>
                  <StationMarker
                    station={s}
                    color={zoneColor}
                    isCurrent={isCurrent}
                    accessible={accessible}
                    background={colors.background}
                    border={colors.border}
                  />
                </View>
                {/* stop card */}
                <View
                  style={[
                    styles.cardSlot,
                    {
                      left: boxLeft,
                      width: boxWidth,
                      top: p.y - STATION_H / 2,
                      alignItems: side === 'left' ? 'flex-end' : 'flex-start',
                    },
                  ]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={aria}
                    onPress={onPress}
                    style={styles.cardRow}
                  >
                    {side === 'left' && isCurrent && <Mascot pose="cheer" size={44} motion="none" />}
                    <View
                      style={[
                        styles.card,
                        isCurrent && {
                          backgroundColor: colors.card,
                          borderWidth: 1,
                          borderColor: zoneColor,
                        },
                      ]}
                    >
                      <View style={styles.cardTitleRow}>
                        <Text
                          style={[
                            styles.cardTitle,
                            { color: accessible ? colors.foreground : colors.mutedForeground },
                          ]}
                        >
                          {stopLabel}
                        </Text>
                        {s.stage === 'sentence' && (
                          <View style={[styles.allAccessChip, { backgroundColor: `${colors.secondary}1a` }]}>
                            <Feather name="star" size={9} color={colors.secondary} />
                            <Text style={[styles.allAccessChipText, { color: colors.secondary }]}>
                              ALL-ACCESS
                            </Text>
                          </View>
                        )}
                        {s.status === 'tested_out' && (
                          <View style={[styles.expressStamp, { borderColor: zoneColor }]}>
                            <Text style={[styles.expressStampText, { color: zoneColor }]}>EXPRESS</Text>
                          </View>
                        )}
                        {s.teaserStation === true && (
                          <View style={[styles.teaserChip, { backgroundColor: zoneColor }]}>
                            <Text style={styles.teaserChipText}>FREE TASTE</Text>
                          </View>
                        )}
                        {!accessible && (
                          <Feather name="lock" size={12} color={colors.mutedForeground} />
                        )}
                      </View>
                      <Text
                        style={[
                          styles.cardStatus,
                          isCurrent
                            ? { color: zoneColor, fontFamily: AppFonts.bold }
                            : { color: colors.mutedForeground },
                        ]}
                      >
                        {statusCopy}
                        {s.attemptedCount
                          ? ` · ${s.masteredCount}/${s.phraseCount} mastered`
                          : ` · ${s.phraseCount} phrases`}
                        {isCurrent && ' · Bolo is waiting here'}
                      </Text>
                    </View>
                    {side === 'right' && isCurrent && <Mascot pose="cheer" size={44} motion="none" />}
                  </Pressable>
                </View>
              </View>
            );
          })}

          {/* terminus */}
          <View
            style={[
              styles.terminusOuter,
              {
                left: termX - 14,
                top: termY - 14,
                backgroundColor: allDone ? line.accent : GRAY,
              },
            ]}
          >
            <View
              style={[
                styles.terminusInner,
                { backgroundColor: allDone ? line.accent : GRAY },
              ]}
            />
          </View>
          <View
            style={[
              styles.terminusLabelWrap,
              termX > mapW / 2
                ? { left: 12, width: termX - 36, top: termY - 20, alignItems: 'flex-end' }
                : { left: termX + 24, right: 12, top: termY - 20 },
            ]}
          >
            <Text
              style={[
                styles.terminusLabel,
                { color: colors.mutedForeground, textAlign: termX > mapW / 2 ? 'right' : 'left' },
              ]}
            >
              Terminus: {line.zones[5]} —{' '}
              {allDone ? 'journey complete!' : 'the festival finale awaits'}
            </Text>
          </View>
        </View>

        <Text style={[styles.footerHint, { color: colors.mutedForeground }]}>
          Tap any lit station to practice it. The {line.lineName} only stops at
          the next station once you finish the one before it.
        </Text>
      </ScrollView>

      {/* Lock dialogs: entitlement locks and progression locks read
          differently — a true mirror of the shipped web dialogs (web deferred
          test-out, so there is no test-out path here either). */}
      <Modal
        visible={lock !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setLock(null)}
      >
        <Pressable style={styles.dialogBackdrop} onPress={() => setLock(null)}>
          <Pressable
            style={[styles.dialogCard, { backgroundColor: colors.card }]}
            onPress={(e) => e.stopPropagation()}
          >
            {lock?.kind === 'progression' && (
              <>
                <Text style={[styles.dialogTitle, { color: colors.foreground }]}>
                  This stop is still locked
                </Text>
                <Text style={[styles.dialogBody, { color: colors.mutedForeground }]}>
                  {lock.stopLabel}: finish the stop before it to board here. The{' '}
                  {line.lineName} runs station by station.
                </Text>
                <Pressable
                  onPress={() => setLock(null)}
                  style={[styles.dialogCta, { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.dialogCtaText, { color: colors.primaryForeground }]}>
                    Keep practicing
                  </Text>
                </Pressable>
              </>
            )}
            {lock?.kind === 'sentence' && (
              <>
                <View style={styles.dialogTitleRow}>
                  <View style={[styles.dialogDiamond, { backgroundColor: line.accent }]} />
                  <Text style={[styles.dialogTitle, { color: colors.foreground }]}>
                    First-class coach: full sentences
                  </Text>
                </View>
                <Text style={[styles.dialogBody, { color: colors.mutedForeground }]}>
                  {lock.stopLabel} is a sentence stop — graduate from phrases to
                  real, natural sentences. First-class seats are an All-Access perk.
                </Text>
                <Pressable
                  onPress={() => {
                    setLock(null);
                    router.push('/(app)/paywall');
                  }}
                  style={[styles.dialogCta, { backgroundColor: colors.secondary }]}
                >
                  <Feather name="star" size={16} color="#ffffff" />
                  <Text style={[styles.dialogCtaText, { color: '#ffffff' }]}>
                    Unlock with All-Access
                  </Text>
                </Pressable>
              </>
            )}
            {lock?.kind === 'language' && (
              <>
                <Text style={[styles.dialogTitle, { color: colors.foreground }]}>
                  {access === 'exhausted'
                    ? "You've tried this line!"
                    : 'This line needs a ticket'}
                </Text>
                <Text style={[styles.dialogBody, { color: colors.mutedForeground }]}>
                  {access === 'exhausted'
                    ? `All ${teaserProgress?.limit ?? 3} free phrases on the ${line.lineName} are used. Unlock ${languageName} to keep riding.`
                    : `Your free taste covers the marked station (${teaserProgress?.consumed ?? 0}/${teaserProgress?.limit ?? 3} tried). Unlock ${languageName} to board every stop.`}
                </Text>
                <Pressable
                  onPress={openPaywallForLanguage}
                  style={[styles.dialogCta, { backgroundColor: colors.primary }]}
                >
                  <Feather name="star" size={16} color={colors.primaryForeground} />
                  <Text style={[styles.dialogCtaText, { color: colors.primaryForeground }]}>
                    Get your ticket
                  </Text>
                </Pressable>
              </>
            )}
            <Pressable
              accessibilityLabel="Close"
              onPress={() => setLock(null)}
              style={[styles.dialogClose, { backgroundColor: colors.muted }]}
            >
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: { fontFamily: AppFonts.bold, fontSize: 14 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerTicket: {
    flex: 1,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  headerTicketRow: { flexDirection: 'row', alignItems: 'stretch' },
  headerTicketBody: { flex: 1, minWidth: 0, paddingHorizontal: 14, paddingVertical: 9 },
  ticketEyebrow: { fontFamily: AppFonts.bold, fontSize: 9, letterSpacing: 1.5 },
  ticketLine: { fontFamily: AppFonts.extrabold, fontSize: 16, lineHeight: 20 },
  ticketRoute: { fontFamily: AppFonts.semibold, fontSize: 11 },
  ticketTeaser: { fontFamily: AppFonts.bold, fontSize: 10 },
  headerStub: {
    width: 76,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 6,
    position: 'relative',
  },
  stubNotch: {
    position: 'absolute',
    top: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    alignSelf: 'center',
  },
  stubEmoji: { fontSize: 16, marginTop: 8 },
  scrollContent: { paddingBottom: 48 },
  exhaustedCard: {
    marginHorizontal: 12,
    marginTop: 16,
    borderWidth: 2,
    borderRadius: 16,
    padding: 16,
  },
  exhaustedTitle: { fontFamily: AppFonts.bold, fontSize: 14 },
  exhaustedBody: { fontFamily: AppFonts.semibold, fontSize: 12, marginTop: 4 },
  exhaustedCta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 12,
  },
  exhaustedCtaText: { fontFamily: AppFonts.extrabold, fontSize: 14, color: '#ffffff' },
  map: {
    alignSelf: 'center',
    marginTop: 8,
    position: 'relative',
  },
  markerWrap: {
    position: 'absolute',
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
  },
  markerCurrentOuter: { borderRadius: 26, padding: 4 },
  markerCurrentRing: { borderRadius: 22, padding: 4 },
  markerCurrentPill: {
    width: 40,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  markerDoneRing: { borderRadius: 12, padding: 2 },
  markerDone: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 4,
  },
  markerOpen: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
  },
  diamond: { transform: [{ rotate: '45deg' }], borderRadius: 4 },
  diamondInner: { borderRadius: 3 },
  postcardWrap: { position: 'absolute', left: 16, right: 16 },
  postcard: {
    borderRadius: 10,
    borderWidth: 2,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  postcardInner: {
    margin: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  postcardAddress: { flexDirection: 'row', alignItems: 'stretch' },
  postcardLeft: { flex: 1, minWidth: 0, paddingHorizontal: 12, paddingVertical: 6 },
  postcardZoneLabel: { fontFamily: AppFonts.bold, fontSize: 9, letterSpacing: 1.5 },
  postcardGeoName: { fontFamily: AppFonts.extrabold, fontSize: 14, lineHeight: 17, color: '#1f2937' },
  postcardStops: { fontFamily: AppFonts.semibold, fontSize: 10, color: '#6b7280' },
  postcardRule: { width: 1, alignSelf: 'stretch', marginVertical: 6 },
  postcardRight: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  postmark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  postmarkInner: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postmarkDot: { width: 4, height: 4, borderRadius: 2 },
  postageStamp: {
    width: 36,
    height: 36,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postageStampLabel: { fontFamily: AppFonts.extrabold, fontSize: 8, letterSpacing: 0.5, lineHeight: 9 },
  postageStampNum: { fontFamily: AppFonts.extrabold, fontSize: 16, lineHeight: 18 },
  interchange: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 3,
    transform: [{ rotate: '45deg' }],
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  interchangeInner: {
    width: 14,
    height: 14,
    borderRadius: 2,
    borderWidth: 3,
    borderColor: '#ffffff',
    backgroundColor: 'transparent',
  },
  cardSlot: {
    position: 'absolute',
    height: STATION_H,
    justifyContent: 'center',
    zIndex: 4,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  card: {
    minWidth: 0,
    flexShrink: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  cardTitle: { fontFamily: AppFonts.semibold, fontSize: 14 },
  allAccessChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  allAccessChipText: { fontFamily: AppFonts.extrabold, fontSize: 8, letterSpacing: 0.8 },
  expressStamp: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    transform: [{ rotate: '-6deg' }],
  },
  expressStampText: { fontFamily: AppFonts.extrabold, fontSize: 7, letterSpacing: 1.5 },
  teaserChip: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  teaserChipText: { fontFamily: AppFonts.extrabold, fontSize: 8, letterSpacing: 0.8, color: '#ffffff' },
  cardStatus: { fontFamily: AppFonts.semibold, fontSize: 11, marginTop: 2 },
  terminusOuter: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  terminusInner: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 4,
    borderColor: '#ffffff',
  },
  terminusLabelWrap: { position: 'absolute', height: 40, justifyContent: 'center' },
  terminusLabel: { fontFamily: AppFonts.bold, fontSize: 12 },
  footerHint: {
    fontFamily: AppFonts.semibold,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 24,
  },
  dialogBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    padding: 24,
    position: 'relative',
  },
  dialogTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 28 },
  dialogDiamond: {
    width: 12,
    height: 12,
    borderRadius: 2,
    transform: [{ rotate: '45deg' }],
  },
  dialogTitle: { fontFamily: AppFonts.extrabold, fontSize: 18, paddingRight: 28 },
  dialogBody: { fontFamily: AppFonts.semibold, fontSize: 13, lineHeight: 19, marginTop: 8 },
  dialogCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 16,
  },
  dialogCtaText: { fontFamily: AppFonts.extrabold, fontSize: 14 },
  dialogClose: {
    position: 'absolute',
    right: 14,
    top: 14,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
