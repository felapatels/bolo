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
import { useRouter } from 'expo-router';
import {
  useGetProgressSummary,
  useListRecentAttempts,
  useListBadges,
} from '@workspace/api-client-react';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { useLanguage } from '@/contexts/LanguageContext';
import { useColors } from '@/hooks/useColors';
import { AppFonts, nativeTextStyle } from '@/constants/fonts';
import { scoreColor } from '@/lib/ui';

export default function ProgressScreen() {
  const colors = useColors();
  const router = useRouter();
  const { activeLang, activeLanguage } = useLanguage();

  const summary = useGetProgressSummary({ lang: activeLang });
  const history = useListRecentAttempts({ lang: activeLang, limit: 30 });
  const badges = useListBadges({ lang: activeLang });

  const refreshing =
    summary.isRefetching || history.isRefetching || badges.isRefetching;
  const onRefresh = () => {
    summary.refetch();
    history.refetch();
    badges.refetch();
  };

  const earnedBadges = (badges.data ?? []).filter((b) => b.earned).length;
  const totalBadges = (badges.data ?? []).length;

  const s = summary.data;
  const masteryPct =
    s && s.totalPhrases > 0
      ? Math.round((s.phrasesMastered / s.totalPhrases) * 100)
      : 0;

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
        <Text style={[styles.h1, { color: colors.foreground }]}>
          Your progress
        </Text>
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>
          {activeLanguage?.name ?? 'Loading...'}
        </Text>

        {summary.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            <View style={styles.grid}>
              <Stat
                icon="award"
                tint={colors.success}
                value={s?.phrasesMastered ?? 0}
                label="Phrases mastered"
              />
              <Stat
                icon="mic"
                tint={colors.primary}
                value={s?.totalAttempts ?? 0}
                label="Total practices"
              />
              <Stat
                icon="star"
                tint={colors.gold}
                value={s?.bestScore ?? 0}
                label="Best score"
              />
              <Stat
                icon="zap"
                tint={colors.accent}
                value={s?.currentStreakDays ?? 0}
                label="Day streak"
              />
            </View>

            {/* Overall mastery */}
            <View
              style={[
                styles.masteryCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.masteryTop}>
                <Text
                  style={[styles.masteryLabel, { color: colors.foreground }]}
                >
                  Overall mastery
                </Text>
                <Text style={[styles.masteryPct, { color: colors.success }]}>
                  {masteryPct}%
                </Text>
              </View>
              <View style={[styles.track, { backgroundColor: colors.muted }]}>
                <View
                  style={{
                    width: `${masteryPct}%`,
                    height: '100%',
                    backgroundColor: colors.success,
                    borderRadius: 999,
                  }}
                />
              </View>
              <Text style={[styles.masteryHint, { color: colors.mutedForeground }]}>
                {s?.phrasesMastered ?? 0} of {s?.totalPhrases ?? 0} phrases
              </Text>
            </View>

            {/* Badges entry */}
            <Pressable
              onPress={() => router.push('/(app)/badges')}
              style={[
                styles.badgeEntry,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View
                style={[
                  styles.badgeEntryIcon,
                  { backgroundColor: `${colors.secondary}1F` },
                ]}
              >
                <Feather name="award" size={22} color={colors.secondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.badgeEntryTitle, { color: colors.foreground }]}
                >
                  Badges
                </Text>
                <Text
                  style={[
                    styles.badgeEntrySub,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {totalBadges > 0
                    ? `${earnedBadges} of ${totalBadges} earned`
                    : 'View your achievements'}
                </Text>
              </View>
              <Feather
                name="chevron-right"
                size={22}
                color={colors.mutedForeground}
              />
            </Pressable>

            <Text style={[styles.section, { color: colors.foreground }]}>
              Practice history
            </Text>

            {(history.data ?? []).length === 0 ? (
              <View style={styles.empty}>
                <Feather
                  name="mic-off"
                  size={32}
                  color={colors.mutedForeground}
                />
                <Text
                  style={[styles.emptyText, { color: colors.mutedForeground }]}
                >
                  No practice yet. Record your first phrase to see it here.
                </Text>
              </View>
            ) : (
              (history.data ?? []).map((a) => (
                <View
                  key={a.id}
                  style={[
                    styles.histRow,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        nativeTextStyle(activeLanguage, { bold: true }),
                        styles.histNative,
                        { color: colors.foreground },
                      ]}
                      numberOfLines={1}
                    >
                      {a.nativeScript}
                    </Text>
                    <Text
                      style={[styles.histEng, { color: colors.mutedForeground }]}
                      numberOfLines={1}
                    >
                      {a.english}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.scoreBadge,
                      {
                        backgroundColor: `${scoreColor(a.score, colors)}22`,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.scoreVal,
                        { color: scoreColor(a.score, colors) },
                      ]}
                    >
                      {a.score}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Stat({
  icon,
  tint,
  value,
  label,
}: {
  icon: keyof typeof Feather.glyphMap;
  tint: string;
  value: number;
  label: string;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.statCard,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={[styles.statIcon, { backgroundColor: `${tint}1F` }]}>
        <Feather name={icon} size={20} color={tint} />
      </View>
      <Text style={[styles.statValue, { color: colors.foreground }]}>
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: AppFonts.extrabold, fontSize: 30, marginTop: 8 },
  sub: { fontFamily: AppFonts.semibold, fontSize: 15, marginTop: 2, marginBottom: 20 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 18,
  },
  statCard: {
    width: '47%',
    flexGrow: 1,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: { fontFamily: AppFonts.extrabold, fontSize: 26 },
  statLabel: { fontFamily: AppFonts.regular, fontSize: 13 },
  masteryCard: {
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 26,
  },
  masteryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  masteryLabel: { fontFamily: AppFonts.bold, fontSize: 16 },
  masteryPct: { fontFamily: AppFonts.extrabold, fontSize: 20 },
  track: { height: 10, borderRadius: 999, overflow: 'hidden' },
  masteryHint: { fontFamily: AppFonts.regular, fontSize: 13, marginTop: 10 },
  badgeEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 26,
  },
  badgeEntryIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeEntryTitle: { fontFamily: AppFonts.bold, fontSize: 16 },
  badgeEntrySub: { fontFamily: AppFonts.regular, fontSize: 13, marginTop: 2 },
  section: { fontFamily: AppFonts.bold, fontSize: 20, marginBottom: 12 },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 32 },
  emptyText: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 240,
    lineHeight: 20,
  },
  histRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
  },
  histNative: { fontSize: 17 },
  histEng: { fontFamily: AppFonts.regular, fontSize: 13, marginTop: 2 },
  scoreBadge: {
    minWidth: 44,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    alignItems: 'center',
  },
  scoreVal: { fontFamily: AppFonts.extrabold, fontSize: 16 },
});
