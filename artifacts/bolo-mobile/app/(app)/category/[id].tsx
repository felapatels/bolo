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
import {
  useListCategories,
  useListCategoryPhrases,
  type Phrase,
} from '@workspace/api-client-react';
import { Screen } from '@/components/Screen';
import { ChunkyButton } from '@/components/ChunkyButton';
import { PressableScale } from '@/components/PressableScale';
import { useLanguage } from '@/contexts/LanguageContext';
import { useColors } from '@/hooks/useColors';
import { AppFonts, nativeTextStyle } from '@/constants/fonts';

export default function CategoryScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const categoryId = Number(id);
  const { activeLang, activeLanguage } = useLanguage();

  const categories = useListCategories({ lang: activeLang });
  const phrases = useListCategoryPhrases(categoryId, activeLang);

  const category = (categories.data ?? []).find((c) => c.id === categoryId);
  const nativeProps = nativeTextStyle(activeLanguage);

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
            entering={FadeInDown.duration(450)}
            style={[styles.desc, { color: colors.mutedForeground }]}
          >
            {category.description}
          </Animated.Text>
        ) : null}

        {phrases.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : phrases.isError ? (
          <Text style={[styles.note, { color: colors.destructive }]}>
            Couldn't load phrases. Please try again.
          </Text>
        ) : (phrases.data ?? []).length === 0 ? (
          <Text style={[styles.note, { color: colors.mutedForeground }]}>
            No phrases here yet.
          </Text>
        ) : (
          (phrases.data ?? []).map((p, i) => (
            <PhraseRow key={p.id} phrase={p} index={i} />
          ))
        )}
      </ScrollView>

      {/* Sticky CTA */}
      {(phrases.data ?? []).length > 0 ? (
        <Animated.View
          entering={FadeInDown.duration(450).delay(120)}
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

function PhraseRow({ phrase, index }: { phrase: Phrase; index: number }) {
  const colors = useColors();
  const { activeLanguage } = useLanguage();
  return (
    <Animated.View
      entering={FadeInDown.duration(380).delay(Math.min(index, 10) * 55)}
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
