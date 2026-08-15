import React from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { GoldChip } from '@/components/GoldChip';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { useExplicitLanguageChoice } from '@/lib/language-step';
import { track, ANALYTICS_EVENTS } from '@/lib/analytics';
import { FunFactLoader } from '@/components/FunFactLoader';
import { useColors } from '@/hooks/useColors';
import { AppFonts, isTallCascadingScript, nativeTextStyle } from '@/constants/fonts';
import { getJourneyLine } from '@/lib/journeyLines';
import { hapticLight } from '@/lib/haptics';
import type { Language } from '@workspace/api-client-react';

export default function LanguageModal() {
  const colors = useColors();
  const router = useRouter();
  const { languages, activeLang, adoptLanguageLocally, isLoading } = useLanguage();
  const { isLanguageAllowed, freeLanguage } = useEntitlements();
  // Explicit pick: the shared helper PATCHes activeLanguage AND
  // hasChosenLanguage together, so a pick here also retires the first-time
  // language step for good.
  const { choose: chooseRemote } = useExplicitLanguageChoice();

  const choose = (code: string) => {
    adoptLanguageLocally(code);
    chooseRemote(code);
    track(ANALYTICS_EVENTS.LANGUAGE_SELECTED, { language: code });
    router.back();
  };

  // Spec D1b-M (mirrors the web picker): a tapped locked language opens its
  // journey map in showroom mode — a browsable teaser with an upgrade path —
  // instead of bouncing straight to the paywall. The pick is a real language
  // selection (server-side activeLanguage PATCHes just like an allowed pick).
  const openShowroom = (code: string) => {
    adoptLanguageLocally(code);
    chooseRemote(code);
    track(ANALYTICS_EVENTS.LANGUAGE_SELECTED, { language: code });
    router.replace('/(app)/journey');
  };

  const anyLocked = languages.some((l) => !isLanguageAllowed(l.code));

  return (
    <Screen padTop={false}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Choose a language
          </Text>
          {anyLocked ? (
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Locked languages need All-Access — tap one to preview its journey.
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityLabel="Close"
          onPress={() => {
            hapticLight();
            router.back();
          }}
          style={[styles.closeBtn, { backgroundColor: colors.muted }]}
        >
          <Feather name="x" size={20} color={colors.foreground} />
        </Pressable>
      </View>

      {isLoading ? (
        <FunFactLoader color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={languages}
          keyExtractor={(l) => l.code}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const locked = !isLanguageAllowed(item.code);
            return (
              <LanguageTile
                language={item}
                active={item.code === activeLang}
                locked={locked}
                free={item.code === freeLanguage}
                onPress={() =>
                  locked ? openShowroom(item.code) : choose(item.code)
                }
              />
            );
          }}
        />
      )}
    </Screen>
  );
}

// Rounded tile matching the web picker: prominent native script on top, the
// full English name below (wrapping, never truncated), and a single corner
// glyph — gold crown when the language needs All-Access, check when active.
//
// Each tile also wears its language's RAIL LINE ACCENT (lib/journeyLines.ts —
// the same colour its boarding pass and journey map use), as a stub stripe
// down the left edge. Picking a language is picking a line, so the colour a
// learner chooses here is the colour they then travel on. The accent replaces
// the theme primary for the selected border, tint and check too; it never
// touches text, so contrast is unchanged in both themes. An unknown code
// falls back to the generic indigo line inside getJourneyLine.
function LanguageTile({
  language,
  active,
  locked,
  free,
  onPress,
}: {
  language: Language;
  active: boolean;
  locked: boolean;
  /**
   * This is the language every tier gets for free, per the server's
   * entitlements.freeLanguage. It describes the language, not the viewer, so
   * it is true on every plan.
   */
  free: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const tall = isTallCascadingScript(language);
  const accent = getJourneyLine(language.code).accent;
  return (
    <Pressable
      onPress={() => {
        hapticLight();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={
        locked ? `${language.name} — locked, preview its journey` : language.name
      }
      style={[
        styles.tile,
        tall && styles.tileTall,
        {
          backgroundColor: active ? `${accent}14` : colors.card,
          borderColor: active ? accent : colors.border,
        },
      ]}
    >
      <View
        testID={`lang-rail-${language.code}`}
        style={[styles.rail, { backgroundColor: accent }]}
      />
      {active ? (
        <Feather
          name="check-circle"
          size={18}
          color={accent}
          style={styles.corner}
        />
      ) : null}
      <Text
        style={[
          nativeTextStyle(language, { bold: true }),
          styles.native,
          tall && styles.nativeTall,
          { color: colors.foreground },
        ]}
      >
        {language.nativeName}
      </Text>
      <Text style={[styles.name, { color: colors.foreground }]}>
        {language.name}
      </Text>
      {locked ? (
        <View
          testID={`picker-locked-${language.code}`}
          accessibilityLabel="Free taste, then All-Access"
          style={styles.chipRow}
        >
          <View style={[styles.chip, styles.chipFree]}>
            <Text style={[styles.chipText, { color: '#FFFFFF' }]}>
              Free taste
            </Text>
          </View>
          {/* The gold pill lives in components/GoldChip.tsx now that friend
              rows wear the same one for First Class. Same shape, one place. */}
          <GoldChip label="All-Access" />
        </View>
      ) : free ? (
        // Explicit branch: the free language is never locked, but say so in
        // the code rather than leaning on that.
        <View
          testID={`picker-free-${language.code}`}
          accessibilityLabel="Included free"
          style={styles.chipRow}
        >
          <View style={[styles.chip, styles.chipFree]}>
            <Text style={[styles.chipText, { color: '#FFFFFF' }]}>
              Included free
            </Text>
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  title: { fontFamily: AppFonts.extrabold, fontSize: 24 },
  subtitle: { fontFamily: AppFonts.semibold, fontSize: 13, marginTop: 4 },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridContent: { padding: 20, paddingTop: 8 },
  gridRow: { gap: 12 },
  tile: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1.5,
    padding: 16,
    paddingTop: 18,
    paddingRight: 30,
    minHeight: 104,
    marginBottom: 12,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  corner: { position: 'absolute', top: 12, right: 12 },
  // The ticket stub edge. The tile clips (overflow: 'hidden'), so
  // the stripe follows the card's own corner instead of carrying
  // its own radius. A 5pt-wide box cannot trace a 20.5pt arc
  // anyway: RN clamps radii to the edge length, so the corners
  // came out square and overhung the card.
  rail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
  },
  native: { fontSize: 24, textAlign: 'left' },
  // Nastaliq calligraphic glyphs cascade steeply above/below the baseline.
  // Extra lineHeight gives the cascade room; extra min-height on the tile
  // keeps the grid row from clipping the taller glyphs.
  nativeTall: { lineHeight: 52 },
  tileTall: { minHeight: 128 },
  name: { fontFamily: AppFonts.bold, fontSize: 14, marginTop: 6 },
  // The two chips on a locked card, borrowed from the games hub at a
  // smaller size. They render only when the language is locked TO THIS
  // LEARNER: 21 of 22 languages are All-Access, so labelling the content
  // the way the games hub does would gild almost every card. flexWrap is
  // load-bearing at two columns, where the pair is close to the card's
  // width and a narrow handset must be allowed to stack them.
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
  },
  chipFree: { backgroundColor: '#22C55E' },
  chipAllAccess: { backgroundColor: '#F5B31B' },
  chipText: {
    fontFamily: AppFonts.extrabold,
    fontSize: 9,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
