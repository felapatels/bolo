// Phrasebook: the full topic library (Task #906). The home topic grid moved
// here behind a single quiet "Phrasebook" door card on the home screen; this
// is the browse-anything surface while the journey stays the guided path.
// Cards open the existing /(app)/category/[id] screen unchanged, so gating
// (free caps, locked phrases, Plus sentences) behaves exactly as it did on
// the home grid.
import React, { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated from 'react-native-reanimated';
import { appearDown, appearPlain, useAppearSkip } from '@/lib/entrance';
import { useListCategories, type Category } from '@workspace/api-client-react';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { SkeletonCard } from '@/components/SkeletonCard';
import { PressableScale } from '@/components/PressableScale';
import { useLanguage } from '@/contexts/LanguageContext';
import { useColors } from '@/hooks/useColors';
import { AppFonts, nativeTextStyle } from '@/constants/fonts';
import { categoryIcon } from '@/lib/ui';
import { track } from '@/lib/analytics';
import { ANALYTICS_EVENTS } from '@/lib/analyticsEvents';
import { LessonError } from '@/components/LessonError';

export default function PhrasebookScreen() {
  const colors = useColors();
  const router = useRouter();
  const { activeLang, activeLanguage } = useLanguage();
  const categories = useListCategories({ lang: activeLang });

  const openedTracked = useRef(false);
  useEffect(() => {
    // Fire once per open of the surface; a language switch while the screen
    // is up is not a fresh open. The ref keeps the event single even if the
    // mount effect re-runs (e.g. React Strict Mode).
    if (openedTracked.current) return;
    openedTracked.current = true;
    track(ANALYTICS_EVENTS.PHRASEBOOK_OPENED, { language: activeLang });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: TAB_BAR_CLEARANCE }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <PressableScale
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={[
              styles.backBtn,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </PressableScale>
          <View
            style={[styles.headerIcon, { backgroundColor: `${colors.primary}1A` }]}
          >
            <Feather name="book-open" size={22} color={colors.primary} />
          </View>
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>Phrasebook</Text>
        {/* NOT "in any order", which is what this said until 2026-08-26.
            learning.ts:617 filters served phrases to UNLOCKED LESSON GROUPS,
            and journey stops ARE lesson groups, so the Phrasebook has never
            been a way round the Journey and was never built to be. Owner's
            call: it is a library of what the Journey has opened, and the copy
            now says that instead of promising the opposite. */}
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Every {activeLanguage?.name ?? ''} topic in your library. Each one
          opens as your Journey reaches it.
        </Text>

        {categories.isLoading ? (
          <View style={{ gap: 12, marginTop: 20 }}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <SkeletonCard key={i} height={80} borderRadius={14} />
            ))}
          </View>
        ) : categories.isError ? (
          <LessonError
            onRetry={() => void categories.refetch()}
            isRetrying={categories.isFetching}
            onBack={() => router.back()}
          />
        ) : (categories.data ?? []).length === 0 ? (
          <ErrorNote
            message="No topics available for this language yet."
            color={colors.mutedForeground}
          />
        ) : (
          <View style={{ marginTop: 20 }}>
            {(categories.data ?? []).map((cat, i) => (
              <CategoryCard
                key={cat.id}
                index={i}
                category={cat}
                onPress={() => {
                  track(ANALYTICS_EVENTS.TOPIC_OPENED, {
                    categoryId: cat.id,
                    language: activeLang,
                    source: 'phrasebook',
                  });
                  router.push(`/(app)/category/${cat.id}`);
                }}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

// Moved verbatim from the home screen's topic grid (Task #906): same visual
// treatment, same destination, only the surface changed.
function CategoryCard({
  category,
  onPress,
  index,
}: {
  category: Category;
  onPress: () => void;
  index: number;
}) {
  const colors = useColors();
  const { activeLanguage } = useLanguage();
  const pct =
    category.phraseCount > 0
      ? Math.round((category.masteredCount / category.phraseCount) * 100)
      : 0;

  const accent = category.accent || colors.primary;

  const skipEnter = useAppearSkip();
  return (
    <Animated.View entering={skipEnter ? undefined : appearDown(120 + index * 70, 420)}>
      <PressableScale
        testID={`phrasebook-topic-${category.id}`}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Open the ${category.title} topic`}
        style={[
          styles.catCard,
          {
            backgroundColor: colors.card,
            borderColor: accent,
            // 3-D tile shadow matching web's shadow-[0_6px_0_var(--tile)]
            shadowColor: accent,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 1,
            shadowRadius: 0,
            elevation: 6,
          },
        ]}
      >
        <LinearGradient
          colors={[`${accent}4D`, `${accent}1A`]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.catIcon}
        >
          <Feather
            name={categoryIcon(category.iconName)}
            size={22}
            color={accent}
          />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={[styles.catTitle, { color: colors.foreground }]}>
            {category.title}
          </Text>
          {category.titleNative ? (
            <Text
              style={[
                nativeTextStyle(activeLanguage),
                styles.catNative,
                { color: colors.mutedForeground },
              ]}
            >
              {category.titleNative}
            </Text>
          ) : null}
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressBar,
                { backgroundColor: colors.muted },
              ]}
            >
              <View
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  backgroundColor: accent,
                  borderRadius: 999,
                }}
              />
            </View>
            <View style={[styles.pctPill, { backgroundColor: accent }]}>
              <Text style={styles.pctPillText}>{pct}%</Text>
            </View>
          </View>
        </View>
        {/* Circular play button replacing the plain chevron */}
        <View style={[styles.catPlayBtn, { backgroundColor: accent }]}>
          <Feather name="play" size={15} color="#ffffff" />
        </View>
      </PressableScale>
    </Animated.View>
  );
}

function ErrorNote({ message, color }: { message: string; color: string }) {
  const skipEnter = useAppearSkip();
  return (
    <Animated.Text entering={skipEnter ? undefined : appearPlain()} style={[styles.errorNote, { color }]}>
      {message}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: AppFonts.extrabold, fontSize: 28 },
  subtitle: { fontFamily: AppFonts.regular, fontSize: 14, marginTop: 4 },
  catCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  catIcon: {
    width: 46,
    height: 46,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catTitle: { fontFamily: AppFonts.bold, fontSize: 16 },
  catNative: { fontSize: 13, marginTop: 1 },
  progressTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  progressBar: {
    flex: 1,
    height: 7,
    borderRadius: 999,
    overflow: 'hidden',
  },
  pctPill: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pctPillText: {
    fontFamily: AppFonts.bold,
    fontSize: 11,
    color: '#ffffff',
  },
  catPlayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorNote: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    textAlign: 'center',
    marginVertical: 20,
  },
});
