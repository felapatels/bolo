import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { appear } from '@/lib/entrance';
import {
  useListCategories,
  useListCategoryPhrases,
  useListCategorySentences,
  getListCategorySentencesQueryKey,
  type Phrase,
} from '@workspace/api-client-react';
import { Screen } from '@/components/Screen';
import { ChunkyButton } from '@/components/ChunkyButton';
import { LessonError } from '@/components/LessonError';
import { PressableScale } from '@/components/PressableScale';
import { LockedFeatureCard, LockedPhrasesCard } from '@/components/PlusUpsell';
import { UpgradeRequiredScreen } from '@/components/UpgradeRequiredScreen';
import { asUpgradeRequired, paywallHrefForDenial } from '@/lib/entitlements';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { useColors } from '@/hooks/useColors';
import { AppFonts, nativeTextStyle } from '@/constants/fonts';

export default function CategoryScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const categoryId = Number(id);
  const { activeLang, activeLanguage } = useLanguage();
  const { isPlus } = useEntitlements();

  const categories = useListCategories({ lang: activeLang });
  const phrases = useListCategoryPhrases(categoryId, activeLang);

  const category = (categories.data ?? []).find((c) => c.id === categoryId);
  const nativeProps = nativeTextStyle(activeLanguage);

  // The topic's final step: the Plus-only sentence stage. Only requested once
  // the server-reported category listing says this caller can open it —
  // `sentencesLocked` is server-authoritative, never a client-side guess.
  const canLoadSentences = !!category && !category.sentencesLocked;
  const sentences = useListCategorySentences(categoryId, activeLang, {
    query: {
      enabled: canLoadSentences,
      queryKey: getListCategorySentencesQueryKey(categoryId, activeLang),
    },
  });

  // A daily-lesson-limit / locked-language 402 means "upgrade", not "retry" —
  // route the learner to the paywall, mirroring the web UpgradeScreen. Any
  // other failure (e.g. a 502 when AI generation fails) is retry-able: nothing
  // broken was cached, so a later request can succeed.
  const upgrade = asUpgradeRequired(phrases.error);
  if (upgrade) {
    return (
      <UpgradeRequiredScreen
        title={
          upgrade.reason === 'daily_lesson_limit'
            ? "You've hit today's free lessons"
            : 'Unlock this language'
        }
        message={upgrade.message}
        onUpgrade={() => router.push(paywallHrefForDenial(upgrade, activeLang))}
        onBack={() => router.back()}
      />
    );
  }

  if (phrases.isError) {
    return (
      <LessonError
        onRetry={() => phrases.refetch()}
        isRetrying={phrases.isFetching}
        onBack={() => router.back()}
      />
    );
  }

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <PressableScale
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </PressableScale>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
            {category?.title ?? 'Topic'}
          </Text>
          {category?.titleNative ? (
            <Text
              style={[nativeProps, styles.titleNative, { color: colors.mutedForeground }]}
              numberOfLines={1}
            >
              {category.titleNative}
            </Text>
          ) : null}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 130 }}
        showsVerticalScrollIndicator={false}
      >
        {category?.description ? (
          <Animated.Text
            entering={appear(FadeInDown.duration(450))}
            style={[styles.desc, { color: colors.mutedForeground }]}
          >
            {category.description}
          </Animated.Text>
        ) : null}

        {phrases.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (phrases.data ?? []).length === 0 ? (
          <Text style={[styles.note, { color: colors.mutedForeground }]}>
            No phrases here yet.
          </Text>
        ) : (
          (phrases.data ?? []).map((p, i) => (
            <PhraseRow
              key={p.id}
              phrase={p}
              index={i}
              onPress={() =>
                router.push(`/(app)/practice/${categoryId}?phrase=${p.id}`)
              }
            />
          ))
        )}

        {/* Locked extended-library phrases (non-Plus learners). The count is
            reported by the server per topic; never render a hardcoded number. */}
        {!phrases.isLoading &&
        !isPlus &&
        (category?.lockedPhraseCount ?? 0) > 0 ? (
          <Animated.View entering={appear(FadeInDown.duration(450).delay(120))}>
            <LockedPhrasesCard
              count={category!.lockedPhraseCount}
              onPress={() => router.push('/(app)/paywall')}
            />
          </Animated.View>
        ) : null}

        {/* Final step: the Plus-only sentence stage. Locked learners see it
            exists and tap through to the paywall; Plus learners get the list. */}
        {!phrases.isLoading && category ? (
          category.sentencesLocked ? (
            <Animated.View
              entering={appear(FadeInDown.duration(450).delay(160))}
            >
              <Text
                style={[styles.sectionTitle, { color: colors.foreground }]}
              >
                Final step: Full sentences
              </Text>
              <LockedFeatureCard
                icon="message-circle"
                title={
                  category.sentenceCount > 0
                    ? `${category.sentenceCount} full sentences`
                    : 'Full sentences'
                }
                description="Graduate from phrases to real, natural sentences."
                onPress={() => router.push('/(app)/paywall')}
              />
            </Animated.View>
          ) : (sentences.data ?? []).length > 0 || sentences.isLoading ? (
            <Animated.View
              entering={appear(FadeInDown.duration(450).delay(160))}
            >
              <Text
                style={[styles.sectionTitle, { color: colors.foreground }]}
              >
                Final step: Full sentences
              </Text>
              {sentences.isLoading ? (
                <ActivityIndicator
                  color={colors.primary}
                  style={{ marginVertical: 20 }}
                />
              ) : (
                <>
                  {(sentences.data ?? []).map((s, i) => (
                    <PhraseRow
                      key={s.id}
                      phrase={s}
                      index={i}
                      onPress={() =>
                        router.push(
                          `/(app)/practice/${categoryId}?stage=sentences&phrase=${s.id}`,
                        )
                      }
                    />
                  ))}
                  <ChunkyButton
                    title="Practice sentences"
                    icon="mic"
                    onPress={() =>
                      router.push(
                        `/(app)/practice/${categoryId}?stage=sentences`,
                      )
                    }
                    style={{ marginTop: 4 }}
                  />
                </>
              )}
            </Animated.View>
          ) : null
        ) : null}
      </ScrollView>

      {/* Sticky CTA */}
      {(phrases.data ?? []).length > 0 ? (
        <Animated.View
          entering={appear(FadeInDown.duration(450).delay(120))}
          style={[styles.footer, { backgroundColor: colors.background }]}
        >
          <ChunkyButton
            title="Start practice"
            icon="mic"
            onPress={() => router.push(`/(app)/practice/${categoryId}`)}
          />
        </Animated.View>
      ) : null}
    </Screen>
  );
}

function PhraseRow({
  phrase,
  index,
  onPress,
}: {
  phrase: Phrase;
  index: number;
  onPress: () => void;
}) {
  const colors = useColors();
  const { activeLanguage } = useLanguage();
  return (
    <Animated.View
      entering={appear(FadeInDown.duration(380).delay(Math.min(index, 10) * 55))}
    >
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Practice ${phrase.english}`}
        accessibilityHint="Starts a practice session at this phrase"
        style={[
          styles.row,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
      <View style={{ flex: 1 }}>
        <Text
          style={[
            nativeTextStyle(activeLanguage, { bold: true }),
            styles.native,
            { color: colors.foreground },
          ]}
        >
          {phrase.nativeScript}
        </Text>
        <Text style={[styles.roman, { color: colors.secondary }]}>
          {phrase.romanized}
        </Text>
        <Text style={[styles.eng, { color: colors.mutedForeground }]}>
          {phrase.english}
        </Text>
      </View>
      {phrase.mastered ? (
        <View style={[styles.badge, { backgroundColor: `${colors.success}22` }]}>
          <Feather name="check" size={16} color={colors.success} />
        </View>
      ) : phrase.bestScore != null ? (
        <View style={[styles.badge, { backgroundColor: colors.muted }]}>
          <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>
            {phrase.bestScore}
          </Text>
        </View>
      ) : null}
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: AppFonts.extrabold, fontSize: 24 },
  titleNative: { fontSize: 15, marginTop: 1 },
  desc: { fontFamily: AppFonts.regular, fontSize: 15, lineHeight: 22, marginBottom: 18 },
  sectionTitle: {
    fontFamily: AppFonts.extrabold,
    fontSize: 18,
    marginTop: 16,
    marginBottom: 12,
  },
  note: { fontFamily: AppFonts.regular, fontSize: 15, textAlign: 'center', marginTop: 32 },
  row: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  native: { fontSize: 22 },
  roman: { fontFamily: AppFonts.semibold, fontSize: 14, marginTop: 4 },
  eng: { fontFamily: AppFonts.regular, fontSize: 14, marginTop: 2 },
  badge: {
    minWidth: 40,
    height: 40,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: AppFonts.extrabold, fontSize: 15 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 20,
    paddingBottom: 28,
  },
});
