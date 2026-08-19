import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  useExplicitLanguageChoice,
  markLanguageStepSkipped,
} from '@/lib/language-step';
import { track, ANALYTICS_EVENTS } from '@/lib/analytics';
import { FunFactLoader } from '@/components/FunFactLoader';
import { useColors } from '@/hooks/useColors';
import { AppFonts, isTallCascadingScript, nativeTextStyle } from '@/constants/fonts';
import { hapticLight } from '@/lib/haptics';
import type { Language } from '@workspace/api-client-react';

// B1 parity: the full-screen language-selection step a first-time account sees
// before the home tabs. Shows all 22 languages with NO free/locked marking, the choice is aspirational; gating happens downstream exactly as it does for
// any locked language today. Confirming writes activeLanguage +
// hasChosenLanguage server-side in one PATCH so the step never returns;
// skipping only sets the in-memory session marker so it comes back next launch.
export default function ChooseLanguageScreen() {
  const colors = useColors();
  const router = useRouter();
  const { languages, adoptLanguageLocally, isLoading } = useLanguage();
  const { choose } = useExplicitLanguageChoice();
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const confirm = (code: string) => {
    if (pendingCode) return;
    setError(false);
    setPendingCode(code);
    choose(code, {
      onSuccess: () => {
        // Reflect the pick in the running app immediately, the provider's
        // one-time reconcile has already settled, so it won't adopt it for us.
        adoptLanguageLocally(code);
        track(ANALYTICS_EVENTS.LANGUAGE_SELECTED, { language: code });
        router.replace('/(app)/(tabs)');
      },
      onError: () => {
        setPendingCode(null);
        setError(true);
      },
    });
  };

  const skip = () => {
    hapticLight();
    markLanguageStepSkipped();
    router.replace('/(app)/(tabs)');
  };

  const showCommunityNote = languages.some((l) => l.communityReviewed);

  return (
    <Screen padTop={false}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Choose your language
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          All 22 official Indian languages, ready to learn. You can switch
          anytime.
        </Text>
      </View>

      {error ? (
        <Text
          accessibilityRole="alert"
          style={[styles.error, { color: colors.destructive }]}
        >
          Couldn't save that. Check your connection and tap your language
          again.
        </Text>
      ) : null}

      {isLoading ? (
        <FunFactLoader color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={languages}
          keyExtractor={(l) => l.code}
          contentContainerStyle={{ padding: 20, paddingTop: 4 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <ChoiceRow
              language={item}
              pending={pendingCode === item.code}
              disabled={pendingCode !== null}
              onPress={() => confirm(item.code)}
            />
          )}
          ListFooterComponent={
            <View style={styles.footer}>
              <Pressable
                accessibilityRole="button"
                testID="skip-language-step"
                onPress={skip}
                disabled={pendingCode !== null}
              >
                <Text style={[styles.skip, { color: colors.mutedForeground }]}>
                  Skip for now
                </Text>
              </Pressable>
              {showCommunityNote ? (
                <Text
                  testID="community-note"
                  style={[styles.note, { color: colors.mutedForeground }]}
                >
                  Bolo's lessons are AI-assisted and reviewed with community
                  help. Spot something off? You can flag any phrase in the app.
                </Text>
              ) : null}
            </View>
          }
        />
      )}
    </Screen>
  );
}

function ChoiceRow({
  language,
  pending,
  disabled,
  onPress,
}: {
  language: Language;
  pending: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const tall = isTallCascadingScript(language);
  // Speech-capability honesty (web parity): only verifiably unsupported
  // languages carry the listening-and-reading badge. Degraded languages
  // practice with scoring, so they render like supported ones here.
  const listeningOnly = language.speechCapability === 'unsupported';
  return (
    <Pressable
      testID={`choose-lang-${language.code}`}
      disabled={disabled}
      onPress={() => {
        hapticLight();
        onPress();
      }}
      style={[
        styles.row,
        tall && styles.rowTall,
        {
          backgroundColor: pending ? `${colors.primary}14` : colors.card,
          borderColor: pending ? colors.primary : colors.border,
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
        {listeningOnly ? (
          <View
            testID={`listening-badge-${language.code}`}
            style={[styles.badge, { backgroundColor: colors.muted }]}
          >
            <Feather
              name="headphones"
              size={11}
              color={colors.mutedForeground}
            />
            <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>
              Listening & reading practice
            </Text>
          </View>
        ) : null}
      </View>
      {pending ? <ActivityIndicator size="small" color={colors.primary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  title: { fontFamily: AppFonts.extrabold, fontSize: 28 },
  subtitle: { fontFamily: AppFonts.regular, fontSize: 15, marginTop: 6 },
  error: {
    fontFamily: AppFonts.semibold,
    fontSize: 13,
    paddingHorizontal: 20,
    paddingBottom: 4,
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
  // keeps the layout visually centered in the taller row.
  nativeTall: { lineHeight: 48 },
  rowTall: { paddingVertical: 20 },
  name: { fontFamily: AppFonts.semibold, fontSize: 13, marginTop: 3 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 8,
  },
  badgeText: { fontFamily: AppFonts.semibold, fontSize: 11 },
  footer: { alignItems: 'center', gap: 16, paddingVertical: 12 },
  skip: {
    fontFamily: AppFonts.semibold,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  note: {
    fontFamily: AppFonts.regular,
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 320,
  },
});
