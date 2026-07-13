import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useUser, useClerk } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  useListCategories,
  useGetProgressSummary,
  useListRecentAttempts,
  type Category,
} from '@workspace/api-client-react';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { UpgradeBanner } from '@/components/PlusUpsell';
import { useColors } from '@/hooks/useColors';
import { AppFonts, nativeTextStyle } from '@/constants/fonts';
import { categoryIcon } from '@/lib/ui';

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { activeLang, activeLanguage } = useLanguage();
  const { isPlus, dailyNewLessons } = useEntitlements();

  const summary = useGetProgressSummary({ lang: activeLang });
  const categories = useListCategories({ lang: activeLang });
  const recent = useListRecentAttempts({ lang: activeLang, limit: 5 });

  const refreshing =
    summary.isRefetching || categories.isRefetching || recent.isRefetching;

  const onRefresh = () => {
    summary.refetch();
    categories.refetch();
    recent.refetch();
  };

  const firstName = user?.firstName ?? 'friend';
  const nativeProps = nativeTextStyle(activeLanguage);

  const startDaily = () => {
    const list = categories.data ?? [];
    const target =
      list.find((c) => c.masteredCount < c.phraseCount) ?? list[0];
    if (target) router.push(`/(app)/practice/${target.id}`);
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: TAB_BAR_CLEARANCE,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Greeting */}
        <View style={styles.topRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.hello, { color: colors.mutedForeground }]}>
              Namaste,
            </Text>
            <Text style={[styles.name, { color: colors.foreground }]}>
              {firstName}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Sign out"
            onPress={() => signOut()}
            style={[styles.iconBtn, { backgroundColor: colors.card }]}
          >
            <Feather name="log-out" size={20} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {/* Language selector */}
        <Pressable
          onPress={() => router.push('/(app)/language')}
          style={[
            styles.langPill,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={[styles.langBadge, { backgroundColor: colors.primary }]}>
            <Feather name="globe" size={18} color={colors.primaryForeground} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.langLabel, { color: colors.mutedForeground }]}>
              Practicing
            </Text>
            <Text style={[styles.langName, { color: colors.foreground }]}>
              {activeLanguage?.name ?? '...'}
              {activeLanguage ? (
                <Text style={[nativeProps, { color: colors.mutedForeground }]}>
                  {'  '}
                  {activeLanguage.nativeName}
                </Text>
              ) : null}
            </Text>
          </View>
          <Feather name="chevron-right" size={22} color={colors.mutedForeground} />
        </Pressable>

        {/* Stats */}
        <View style={styles.statsRow}>
          <StatCard
            icon="zap"
            tint={colors.accent}
            value={summary.data?.currentStreakDays ?? 0}
            label="Day streak"
            loading={summary.isLoading}
          />
          <StatCard
            icon="award"
            tint={colors.success}
            value={summary.data?.phrasesMastered ?? 0}
            label="Mastered"
            loading={summary.isLoading}
          />
          <StatCard
            icon="target"
            tint={colors.secondary}
            value={
              summary.data?.averageScore != null
                ? `${summary.data.averageScore}`
                : '0'
            }
            label="Avg score"
            loading={summary.isLoading}
          />
        </View>

        {/* Daily practice CTA */}
        <Pressable
          onPress={startDaily}
          style={[styles.cta, { backgroundColor: colors.primary }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.ctaTitle, { color: colors.primaryForeground }]}>
              Start daily practice
            </Text>
            <Text
              style={[
                styles.ctaSub,
                { color: colors.primaryForeground, opacity: 0.9 },
              ]}
            >
              {summary.data?.attemptsToday
                ? `${summary.data.attemptsToday} done today — keep going!`
                : 'A few minutes a day builds fluency.'}
            </Text>
          </View>
          <View
            style={[
              styles.ctaIcon,
              { backgroundColor: colors.primaryForeground },
            ]}
          >
            <Feather name="mic" size={24} color={colors.primary} />
          </View>
        </Pressable>

        {/* Daily lesson allowance (Free plan) */}
        {!isPlus && dailyNewLessons?.limit != null ? (
          <DailyCapNote
            remaining={dailyNewLessons.remaining ?? 0}
            limit={dailyNewLessons.limit}
            onUpgrade={() => router.push('/(app)/paywall')}
          />
        ) : null}

        {/* Upgrade prompt (Free plan) */}
        {!isPlus ? (
          <UpgradeBanner onPress={() => router.push('/(app)/paywall')} />
        ) : null}

        {/* Topics */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          Topics
        </Text>

        {categories.isLoading ? (
          <ActivityIndicator
            color={colors.primary}
            style={{ marginVertical: 24 }}
          />
        ) : categories.isError ? (
          <ErrorNote
            message="Couldn't load topics. Pull to refresh."
            color={colors.destructive}
          />
        ) : (categories.data ?? []).length === 0 ? (
          <ErrorNote
            message="No topics available for this language yet."
            color={colors.mutedForeground}
          />
        ) : (
          (categories.data ?? []).map((cat) => (
            <CategoryCard
              key={cat.id}
              category={cat}
              onPress={() => router.push(`/(app)/category/${cat.id}`)}
            />
          ))
        )}

        {/* Recent plays */}
        {(recent.data ?? []).length > 0 ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Recent plays
            </Text>
            {(recent.data ?? []).map((a) => (
              <View
                key={a.id}
                style={[
                  styles.recentRow,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      nativeTextStyle(activeLanguage, { bold: true }),
                      styles.recentNative,
                      { color: colors.foreground },
                    ]}
                    numberOfLines={1}
                  >
                    {a.nativeScript}
                  </Text>
                  <Text
                    style={[styles.recentEng, { color: colors.mutedForeground }]}
                    numberOfLines={1}
                  >
                    {a.english}
                  </Text>
                </View>
                <View
                  style={[
                    styles.scorePill,
                    {
                      backgroundColor: a.passed
                        ? colors.success
                        : colors.muted,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.scoreText,
                      {
                        color: a.passed
                          ? colors.successForeground
                          : colors.mutedForeground,
                      },
                    ]}
                  >
                    {a.score}
                  </Text>
                </View>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function DailyCapNote({
  remaining,
  limit,
  onUpgrade,
}: {
  remaining: number;
  limit: number;
  onUpgrade: () => void;
}) {
  const colors = useColors();
  const done = remaining <= 0;
  return (
    <Pressable
      onPress={done ? onUpgrade : undefined}
      disabled={!done}
      style={[
        styles.capNote,
        {
          backgroundColor: done ? `${colors.gold}24` : colors.card,
          borderColor: done ? colors.gold : colors.border,
        },
      ]}
    >
      <Feather
        name={done ? 'sunrise' : 'battery-charging'}
        size={20}
        color={done ? colors.foreground : colors.success}
      />
      <View style={{ flex: 1 }}>
        <Text style={[styles.capTitle, { color: colors.foreground }]}>
          {done
            ? 'That’s all of today’s free lessons'
            : `${remaining} of ${limit} free lessons left today`}
        </Text>
        <Text style={[styles.capSub, { color: colors.mutedForeground }]}>
          {done
            ? 'Come back tomorrow, or go Plus for unlimited practice.'
            : 'New lessons refresh each day — Plus unlocks unlimited.'}
        </Text>
      </View>
      {done ? (
        <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
      ) : null}
    </Pressable>
  );
}

function StatCard({
  icon,
  tint,
  value,
  label,
  loading,
}: {
  icon: keyof typeof Feather.glyphMap;
  tint: string;
  value: number | string;
  label: string;
  loading?: boolean;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.statCard,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <Feather name={icon} size={20} color={tint} />
      {loading ? (
        <ActivityIndicator
          color={colors.mutedForeground}
          style={{ marginVertical: 6 }}
        />
      ) : (
        <Text style={[styles.statValue, { color: colors.foreground }]}>
          {value}
        </Text>
      )}
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
    </View>
  );
}

function CategoryCard({
  category,
  onPress,
}: {
  category: Category;
  onPress: () => void;
}) {
  const colors = useColors();
  const { activeLanguage } = useLanguage();
  const pct =
    category.phraseCount > 0
      ? Math.round((category.masteredCount / category.phraseCount) * 100)
      : 0;

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.catCard,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View
        style={[styles.catIcon, { backgroundColor: `${colors.primary}1A` }]}
      >
        <Feather
          name={categoryIcon(category.iconName)}
          size={22}
          color={colors.primary}
        />
      </View>
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
                backgroundColor: colors.success,
                borderRadius: 999,
              }}
            />
          </View>
          <Text style={[styles.progressText, { color: colors.mutedForeground }]}>
            {category.masteredCount}/{category.phraseCount}
          </Text>
        </View>
      </View>
      <Feather name="chevron-right" size={22} color={colors.mutedForeground} />
    </Pressable>
  );
}

function ErrorNote({ message, color }: { message: string; color: string }) {
  return <Text style={[styles.errorNote, { color }]}>{message}</Text>;
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  hello: { fontFamily: AppFonts.regular, fontSize: 15 },
  name: { fontFamily: AppFonts.extrabold, fontSize: 28, marginTop: 2 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 18,
  },
  langBadge: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langLabel: { fontFamily: AppFonts.semibold, fontSize: 12 },
  langName: { fontFamily: AppFonts.bold, fontSize: 18, marginTop: 1 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 4,
  },
  statValue: { fontFamily: AppFonts.extrabold, fontSize: 24 },
  statLabel: { fontFamily: AppFonts.regular, fontSize: 12 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 20,
    borderRadius: 24,
    marginBottom: 26,
  },
  ctaTitle: { fontFamily: AppFonts.extrabold, fontSize: 20 },
  ctaSub: { fontFamily: AppFonts.regular, fontSize: 14, marginTop: 4 },
  ctaIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 18,
  },
  capTitle: { fontFamily: AppFonts.bold, fontSize: 14 },
  capSub: { fontFamily: AppFonts.regular, fontSize: 12, marginTop: 2 },
  sectionTitle: {
    fontFamily: AppFonts.bold,
    fontSize: 20,
    marginBottom: 12,
    marginTop: 4,
  },
  catCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 12,
  },
  catIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catTitle: { fontFamily: AppFonts.bold, fontSize: 16 },
  catNative: { fontSize: 14, marginTop: 1 },
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
  progressText: { fontFamily: AppFonts.semibold, fontSize: 12 },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 10,
  },
  recentNative: { fontSize: 17 },
  recentEng: { fontFamily: AppFonts.regular, fontSize: 13, marginTop: 2 },
  scorePill: {
    minWidth: 40,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    alignItems: 'center',
  },
  scoreText: { fontFamily: AppFonts.extrabold, fontSize: 15 },
  errorNote: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    marginVertical: 16,
    textAlign: 'center',
  },
});
