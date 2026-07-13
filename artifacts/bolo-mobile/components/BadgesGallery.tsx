import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useListBadges, type Badge } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { badgeIcon } from '@/lib/badge-icons';

// A locked badge is "close" when the learner is at least this far toward it, so
// we can highlight the goals within realistic reach — mirrors the web gallery.
const NEAR_THRESHOLD = 0.6;

function progressRatio(badge: Badge): number {
  if (badge.progressTarget <= 0) return 0;
  return Math.min(1, badge.progressCurrent / badge.progressTarget);
}

function formatEarnedDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * The per-language badges gallery. Earned badges render in full color with the
 * date earned; locked badges are dimmed and show a progress bar toward their
 * unlock criteria, with the nearest goal emphasized. Information mirrors the web
 * badges gallery so the numbers match across platforms for the same account.
 */
export function BadgesGallery({ lang }: { lang: string }) {
  const colors = useColors();
  const { data: badges, isLoading } = useListBadges({ lang });

  const earnedCount = badges?.filter((b) => b.earned).length ?? 0;
  const total = badges?.length ?? 0;

  // The highest progress ratio among still-locked badges — used to emphasize the
  // goal the learner is closest to unlocking.
  const nearestRatio = badges
    ? badges
        .filter((b) => !b.earned)
        .reduce((max, b) => Math.max(max, progressRatio(b)), 0)
    : 0;

  return (
    <View>
      <View style={styles.headerRow}>
        <Text style={[styles.heading, { color: colors.foreground }]}>
          Badges
        </Text>
        {total > 0 ? (
          <Text style={[styles.count, { color: colors.mutedForeground }]}>
            {earnedCount}/{total} earned
          </Text>
        ) : null}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
      ) : badges && badges.length > 0 ? (
        <View style={styles.grid}>
          {badges.map((badge) => {
            const ratio = progressRatio(badge);
            const isNearest =
              !badge.earned &&
              ratio >= NEAR_THRESHOLD &&
              ratio === nearestRatio &&
              ratio < 1;
            return (
              <View
                key={badge.key}
                style={[
                  styles.card,
                  badge.earned
                    ? { backgroundColor: colors.card, borderColor: colors.border }
                    : isNearest
                      ? {
                          backgroundColor: `${colors.secondary}0D`,
                          borderColor: colors.secondary,
                        }
                      : {
                          backgroundColor: `${colors.muted}80`,
                          borderColor: colors.border,
                          borderStyle: 'dashed',
                        },
                ]}
              >
                {isNearest ? (
                  <View
                    style={[
                      styles.nearPill,
                      { backgroundColor: colors.secondary },
                    ]}
                  >
                    <Text style={styles.nearText}>Almost there</Text>
                  </View>
                ) : null}

                <View
                  style={[
                    styles.iconWrap,
                    badge.earned
                      ? { backgroundColor: colors.secondary }
                      : isNearest
                        ? { backgroundColor: `${colors.secondary}26` }
                        : { backgroundColor: colors.muted },
                  ]}
                >
                  {badge.earned ? (
                    <MaterialCommunityIcons
                      name={badgeIcon(badge.iconName)}
                      size={26}
                      color={colors.secondaryForeground}
                    />
                  ) : (
                    <Feather
                      name="lock"
                      size={20}
                      color={
                        isNearest ? colors.secondary : colors.mutedForeground
                      }
                    />
                  )}
                </View>

                <Text
                  style={[
                    styles.title,
                    {
                      color: badge.earned
                        ? colors.foreground
                        : colors.mutedForeground,
                    },
                  ]}
                  numberOfLines={2}
                >
                  {badge.title}
                </Text>

                {badge.earned && badge.earnedAt ? (
                  <Text
                    style={[styles.date, { color: colors.mutedForeground }]}
                    numberOfLines={1}
                  >
                    {formatEarnedDate(badge.earnedAt)}
                  </Text>
                ) : (
                  <View style={styles.progressWrap}>
                    <View
                      style={[styles.track, { backgroundColor: colors.muted }]}
                    >
                      <View
                        style={{
                          width: `${ratio * 100}%`,
                          height: '100%',
                          borderRadius: 999,
                          backgroundColor: isNearest
                            ? colors.secondary
                            : `${colors.secondary}80`,
                        }}
                      />
                    </View>
                    <Text
                      style={[
                        styles.progressText,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {badge.progressCurrent} / {badge.progressTarget}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      ) : (
        <View
          style={[
            styles.empty,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            No badges available yet.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  heading: { fontFamily: AppFonts.bold, fontSize: 20 },
  count: { fontFamily: AppFonts.bold, fontSize: 14 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
  card: {
    width: '31.5%',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  nearPill: {
    position: 'absolute',
    top: -8,
    alignSelf: 'center',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  nearText: {
    fontFamily: AppFonts.extrabold,
    fontSize: 8,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: '#ffffff',
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontFamily: AppFonts.bold,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 15,
  },
  date: {
    fontFamily: AppFonts.regular,
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
  },
  progressWrap: { width: '100%', marginTop: 8 },
  track: {
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
    width: '100%',
  },
  progressText: {
    fontFamily: AppFonts.bold,
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 32,
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  emptyText: { fontFamily: AppFonts.regular, fontSize: 14 },
});
