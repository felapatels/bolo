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
import { getJourneyLine, getRailBrand } from '@/lib/journeyLines';
import { useJourneyProgress } from '@/lib/useJourneyProgress';
import { useLanguage } from '@/contexts/LanguageContext';
import { useColors } from '@/hooks/useColors';
import { AppFonts, isTallCascadingScript, nativeTextStyle } from '@/constants/fonts';
import { TrainEngine } from '@/components/journey/TrainEngine';
import {
  TicketPerforationV,
  TicketStripes,
  ZoneStamp,
  zoneStampExtent,
} from '@/components/journey/TicketParts';

export function JourneyPassCard({ onPress }: { onPress: () => void }) {
  const colors = useColors();
  const { activeLang, activeLanguage } = useLanguage();
  const line = getJourneyLine(activeLang);
  const journey = useJourneyProgress(activeLang, line.zones);
  const brand = getRailBrand(activeLang);
  // The rotated line name reserves real layout space: measure the slot the
  // column gives it and size the text to that extent (see stubLineSlot).
  const [nameExtent, setNameExtent] = React.useState(78);

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Ride the ${line.lineName} — open the journey map`}
      onPress={onPress}
      testID="journey-pass-card"
      style={[styles.pass, { backgroundColor: line.accent }]}
    >
      <TicketStripes ink="rgba(255,255,255,0.05)" />
      <View style={styles.row}>
        {/* main body */}
        <View style={styles.body}>
          <View style={styles.top}>
            <View style={styles.topText}>
              {/* The brand is native-script ("Bolo Rail" in the learner's own
                  script) — it MUST render with the language font or the Latin
                  UI font shows tofu. Same per-script handling as the picker. */}
              <Text
                style={[
                  styles.eyebrow,
                  brand.native && isTallCascadingScript(activeLanguage)
                    ? styles.eyebrowTall
                    : null,
                ]}
              >
                BOARDING PASS ·{' '}
                <Text
                  style={
                    brand.native
                      ? [styles.eyebrowNative, nativeTextStyle(activeLanguage, { bold: true })]
                      : null
                  }
                >
                  {brand.text}
                </Text>
              </Text>
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
        {/* tear-off stub: perforation with notches (edge bites), fare-zone
            stamp, vertical line name. No floating punch dot — cutout circles
            only ever straddle card edges (approved ruling; the web punch hole
            was dropped from the port for the same reason). */}
        <TicketPerforationV
          dashColor="rgba(255,255,255,0.4)"
          holeColor={colors.background}
        />
        <View style={styles.stub}>
          {/* Fixed slot so the rotated stamp's visual extent is part of the
              layout — it can't drift over the perforation or the line name. */}
          <View testID="home-stamp-slot" style={styles.stampSlot}>
            {journey.current && (
              <ZoneStamp
                ink="rgba(255,255,255,0.8)"
                zone={journey.current.zoneIndex + 1}
                name={journey.current.geoName}
                size={48}
              />
            )}
          </View>
          {/* Vertical line name, web's writing-mode:vertical-rl composition:
              the slot reserves the rotated text's true vertical extent (a bare
              rotated Text only reserves its unrotated ~10px box, which is what
              let it collide with the stamp). The text is ABSOLUTE inside the
              slot: as a flex child react-native-web clamps its width to the
              14px slot (measured empirically), truncating the name to one
              glyph. Sized `nameExtent` wide × 14 tall and offset so its center
              matches the slot's, the 90° rotation makes it fill the slot's
              vertical strip exactly — on native and web alike. */}
          <View
            style={styles.stubLineSlot}
            onLayout={(e) => {
              const h = Math.round(e.nativeEvent.layout.height);
              if (h > 20 && h !== nameExtent) setNameExtent(h);
            }}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.stubLine,
                {
                  // maxWidth too: react-native-web clamps text to the parent's
                  // width (measured: width:60 computed as 14px without it).
                  width: nameExtent,
                  maxWidth: nameExtent,
                  left: (STUB_LINE_SLOT_W - nameExtent) / 2,
                  top: (nameExtent - STUB_LINE_SLOT_W) / 2,
                },
              ]}
            >
              {line.lineName.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

// Width of the vertical line-name slot; also the rotated text's line height,
// so the offset math in the render centers it exactly.
const STUB_LINE_SLOT_W = 14;

const styles = StyleSheet.create({
  pass: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 12,
    position: 'relative',
    // Belt for the build-28 native regression (see TicketParts sizing
    // contract): the card's height must stay content-driven (~165-190px).
    // If any future child measures itself unbounded again, this cap stops a
    // full-screen ticket from ever shipping. Never remove it; raise it only
    // for real content growth.
    maxHeight: 240,
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
  // Nastaliq glyphs cascade above/below the baseline; give the one-line
  // eyebrow enough line height that the brand isn't clipped.
  eyebrowTall: { lineHeight: 24 },
  eyebrowNative: { fontSize: 11, letterSpacing: 0 },
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
    gap: 4,
  },
  // Centers the 48px stamp inside its full rotated visual extent (the -12
  // degree tilt makes the bounding box ~57px; the old 56px slot clipped the
  // corners). Still inside the 64px stub, clear of the perforation.
  stampSlot: {
    width: zoneStampExtent(48),
    height: zoneStampExtent(48),
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Reserves the vertical strip the rotated name occupies; grows to soak up
  // whatever height the body gives the stub so long names get maximum run.
  stubLineSlot: {
    flexGrow: 1,
    minHeight: 60,
    width: STUB_LINE_SLOT_W,
    position: 'relative',
  },
  stubLine: {
    position: 'absolute',
    fontFamily: AppFonts.extrabold,
    fontSize: 8,
    letterSpacing: 1.2,
    lineHeight: STUB_LINE_SLOT_W,
    color: 'rgba(255,255,255,0.7)',
    transform: [{ rotate: '90deg' }],
    textAlign: 'center',
  },
});
