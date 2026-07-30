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
import { useLanguage } from '@/contexts/LanguageContext';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { PlusPill } from '@/components/PlusUpsell';
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

  // Route a tapped locked language to the paywall, pre-selecting it so the
  // learner lands on the right upgrade instead of a generic screen.
  const openPaywall = (code?: string) =>
    router.push(
      code
        ? { pathname: '/(app)/paywall', params: { lang: code } }
        : '/(app)/paywall',
    );

  return (
    <Screen padTop={false}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Choose a language
        </Text>
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
          contentContainerStyle={{ padding: 20, paddingTop: 4 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const locked = !isLanguageAllowed(item.code);
            return (
              <LanguageRow
                language={item}
                active={item.code === activeLang}
                locked={locked}
                onPress={() =>
                  locked ? openPaywall(item.code) : choose(item.code)
                }
              />
            );
          }}
        />
      )}
    </Screen>
  );
}

function LanguageRow({
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
      style={[
        styles.row,
        tall && styles.rowTall,
        {
          backgroundColor: active ? `${colors.primary}14` : colors.card,
          borderColor: active ? colors.primary : colors.border,
          opacity: locked ? 0.72 : 1,
        },
      ]}
    >
      <View style={{ flex: 1 }}>
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
        <Text style={[styles.name, { color: colors.mutedForeground }]}>
          {language.name} · {language.script}
        </Text>
      </View>
      {locked ? (
        <View style={styles.rowRight}>
          <PlusPill />
          <Feather name="lock" size={18} color={colors.mutedForeground} />
        </View>
      ) : active ? (
        <Feather name="check-circle" size={22} color={colors.primary} />
      ) : (
        <Feather name="circle" size={22} color={colors.border} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  title: { fontFamily: AppFonts.extrabold, fontSize: 24 },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    marginBottom: 10,
  },
  native: { fontSize: 22, textAlign: 'left' },
  // Nastaliq calligraphic glyphs cascade steeply above/below the baseline.
  // Extra lineHeight gives the cascade room; extra paddingVertical on the row
  // keeps the icon visually centered in the taller row.
  nativeTall: { lineHeight: 48 },
  rowTall: { paddingVertical: 20 },
  name: { fontFamily: AppFonts.semibold, fontSize: 13, marginTop: 3 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
