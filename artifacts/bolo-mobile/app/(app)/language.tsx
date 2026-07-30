import React from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { useExplicitLanguageChoice } from '@/lib/language-step';
import { track, ANALYTICS_EVENTS } from '@/lib/analytics';
import { FunFactLoader } from '@/components/FunFactLoader';
import { useColors } from '@/hooks/useColors';
import { AppFonts, isTallCascadingScript, nativeTextStyle } from '@/constants/fonts';
import { hapticLight } from '@/lib/haptics';
import type { Language } from '@workspace/api-client-react';

export default function LanguageModal() {
  const colors = useColors();
  const router = useRouter();
  const { languages, activeLang, adoptLanguageLocally, isLoading } = useLanguage();
  const { isLanguageAllowed } = useEntitlements();
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
function LanguageTile({
  language,
  active,
  locked,
  onPress,
}: {
  language: Language;
  active: boolean;
  locked: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const tall = isTallCascadingScript(language);
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
          backgroundColor: active ? `${colors.primary}14` : colors.card,
          borderColor: active ? colors.primary : colors.border,
        },
      ]}
    >
      {locked ? (
        <MaterialCommunityIcons
          name="crown"
          size={18}
          color={colors.gold}
          style={styles.corner}
        />
      ) : active ? (
        <Feather
          name="check-circle"
          size={18}
          color={colors.primary}
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
  },
  corner: { position: 'absolute', top: 12, right: 12 },
  native: { fontSize: 24, textAlign: 'left' },
  // Nastaliq calligraphic glyphs cascade steeply above/below the baseline.
  // Extra lineHeight gives the cascade room; extra min-height on the tile
  // keeps the grid row from clipping the taller glyphs.
  nativeTall: { lineHeight: 52 },
  tileTall: { minHeight: 128 },
  name: { fontFamily: AppFonts.bold, fontSize: 14, marginTop: 6 },
});
