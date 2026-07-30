// Spec D1b-M: the home boarding-pass hero — a react-native port of the web
// home hero (gujarati-coach/src/pages/home.tsx, P1 v2 item 2: "the journey IS
// the home hero"). A full-width boarding pass in the line's accent, visually
// continuous with the journey screen's ticket-stub header. Carries live state
// (next stop, Stop N of M, progress at the stop) when the zone queries have
// it, and degrades to the generic line blurb when loading, locked, or
// errored. (The web pass also carries streak/goal chips; on mobile those
// already live in the stats banner directly below, so they are not
// duplicated here.)
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PressableScale } from '@/components/PressableScale';
import { getJourneyLine } from '@/lib/journeyLines';
import { useJourneyProgress } from '@/lib/useJourneyProgress';
import { useLanguage } from '@/contexts/LanguageContext';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { TrainEngine } from '@/components/journey/TrainEngine';
import {
  PunchHole,
  TicketPerforationV,
  TicketStripes,
  ZoneStamp,
} from '@/components/journey/TicketParts';

export function JourneyPassCard({ onPress }: { onPress: () => void }) {
  const colors = useColors();
  const { activeLang } = useLanguage();
  const line = getJourneyLine(activeLang);
  const journey = useJourneyProgress(activeLang, line.zones);

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Ride the ${line.lineName} — open the journey map`}
      onPress={onPress}
      style={[styles.pass, { backgroundColor: line.accent }]}
    >
      <TicketStripes ink="rgba(255,255,255,0.05)" />
      <View style={styles.row}>
        {/* main body */}
        <View style={styles.body}>
          <View style={styles.top}>
            <View style={styles.topText}>
              <Text style={styles.eyebrow}>BOARDING PASS · બોલો રેલ</Text>
              <Text style={styles.title}>Ride the {line.lineName}</Text>
              <Text numberOfLines={1} style={styles.subtitle}>
                {journey.current
                  ? `Next stop: ${journey.current.geoName} · Stop ${journey.current.stopNumber} of ${journey.current.stopCount}`
                  : `${line.zones[0]} to ${line.zones[5]}, station by station`}
              </Text>
            </View>
            <TrainEngine color="#ffffff" width={56} height={37} />
          </View>
          {journey.current && journey.current.phraseCount > 0 && (
            <View style={styles.progressRow}>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.round(
                        (journey.current.masteredCount / journey.current.phraseCount) * 100,
                      )}%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>
                {journey.current.masteredCount}/{journey.current.phraseCount} at this stop
              </Text>
            </View>
          )}
          {/* ticket perforation (dashed line + edge notch) */}
          <View style={styles.perfRow}>
            <View style={[styles.perfNotch, { backgroundColor: colors.background }]} />
            <View style={styles.perfLine} />
          </View>
          <View style={styles.ctaRow}>
            <Text style={styles.ctaText}>
              {journey.current?.started || journey.doneCount > 0
                ? 'Continue your journey'
                : 'Begin your journey'}
            </Text>
            <Feather name="arrow-right" size={16} color="#ffffff" />
          </View>
        </View>
        {/* tear-off stub: perforation with notches, punched hole, fare-zone
            stamp, vertical line name */}
        <TicketPerforationV
          dashColor="rgba(255,255,255,0.4)"
          holeColor={colors.background}
        />
        <View style={styles.stub}>
          <PunchHole color={colors.background} />
          {journey.current && (
            <ZoneStamp
              ink="rgba(255,255,255,0.8)"
              zone={journey.current.zoneIndex + 1}
              name={journey.current.geoName}
              size={48}
            />
          )}
          <Text numberOfLines={1} style={styles.stubLine}>
            {line.lineName.toUpperCase()}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  pass: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 12,
    position: 'relative',
  },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  body: { flex: 1, minWidth: 0 },
  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  topText: { flex: 1, minWidth: 0 },
  eyebrow: {
    fontFamily: AppFonts.extrabold,
    fontSize: 10,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.8)',
  },
  title: {
    fontFamily: AppFonts.extrabold,
    fontSize: 18,
    lineHeight: 22,
    color: '#ffffff',
    marginTop: 2,
  },
  subtitle: {
    fontFamily: AppFonts.semibold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 3,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    marginTop: 10,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#ffffff',
  },
  progressText: {
    fontFamily: AppFonts.bold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.9)',
    flexShrink: 0,
  },
  perfRow: {
    position: 'relative',
    marginTop: 12,
    justifyContent: 'center',
  },
  perfNotch: {
    position: 'absolute',
    left: -10,
    width: 20,
    height: 20,
    borderRadius: 10,
    top: -9,
  },
  perfLine: {
    marginHorizontal: 18,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.4)',
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 16,
  },
  ctaText: { fontFamily: AppFonts.extrabold, fontSize: 14, color: '#ffffff' },
  stub: {
    width: 64,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  stubLine: {
    fontFamily: AppFonts.extrabold,
    fontSize: 8,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.7)',
    transform: [{ rotate: '90deg' }],
    width: 70,
    textAlign: 'center',
    marginBottom: 20,
  },
});
