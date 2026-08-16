/**
 * HomeSocialStrip — the single social card on mobile home.
 *
 * Mirrors web's home-social-strip.tsx. Two states:
 *   • Friends present  — learner's rank + up to 4 leaderboard rows.
 *   • No friends yet   — referral invite affordance (share behaviour intact).
 *
 * Replaces HomeReferralCard so there is exactly one invite affordance on home.
 * Links through to the Friends tab for both states.
 *
 * Loading: absent. Error: absent.
 */
import React from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  useGetFriendsLeaderboard,
  useGetFriendsFeed,
  getGetFriendsFeedQueryKey,
  useGetOutfits,
  useGetReferral,
  type LeaderboardEntry,
  type GetFriendsFeedParams,
} from '@workspace/api-client-react';
import { MascotAvatar } from '@/components/MascotAvatar';
import { FirstClassChip } from '@/components/GoldChip';
import { feedLineFor } from '@/lib/feedCopy';
import { REFERRAL_REWARD_CHAI } from '@workspace/referral-link';
import { PressableScale } from '@/components/PressableScale';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { hapticLight } from '@/lib/haptics';
import { referralLinkFor } from '@/lib/referral';

// ── helpers ──────────────────────────────────────────────────────────────────

function displayName(u: { displayName: string | null }): string {
  return u.displayName?.trim() || 'Fellow learner';
}

// ── mini leaderboard row ──────────────────────────────────────────────────────

function MiniRow({ entry, colors }: { entry: LeaderboardEntry; colors: ReturnType<typeof useColors> }) {
  const rankColor = (() => {
    if (entry.isSelf) return colors.primary;
    switch (entry.rank) {
      case 1: return '#f59e0b'; // amber-500
      case 2: return '#94a3b8'; // slate-400
      case 3: return '#fb923c'; // orange-400
      default: return colors.mutedForeground;
    }
  })();

  return (
    <View
      style={[
        styles.miniRow,
        {
          backgroundColor: entry.isSelf
            ? `${colors.primary}1A`
            : `${colors.mutedForeground}18`,
        },
      ]}
    >
      <Text style={[styles.rank, { color: rankColor }]}>#{entry.rank}</Text>
      <Text
        numberOfLines={1}
        style={[
          styles.name,
          {
            color: entry.isSelf ? colors.primary : colors.foreground,
            flex: 1,
          },
        ]}
      >
        {displayName(entry)}
        {entry.isSelf ? ' (You)' : ''}
      </Text>
      <View style={styles.xpBadge}>
        <Feather name="award" size={11} color="#f59e0b" />
        <Text style={[styles.xpText, { color: colors.mutedForeground }]}>
          {entry.xp}
        </Text>
      </View>
    </View>
  );
}

// ── latest friend moment ──────────────────────────────────────────────────────

const LATEST_PARAMS: GetFriendsFeedParams = { limit: 1 };

/**
 * The single most recent thing a friend did, above the rank rows.
 *
 * ONE event, not a feed: home is a launchpad, and the point of the line is to
 * be a door to the Feed tab rather than a second copy of it. It fetches limit=1
 * for the same reason — a card that shows one line has no business pulling
 * twenty.
 *
 * Absent while loading, on error, and when there is nothing to say. Never a
 * placeholder: an empty row here would push the ranks down for no information.
 */
function LatestFriendMoment({
  colors,
}: {
  colors: ReturnType<typeof useColors>;
}) {
  const router = useRouter();
  const feed = useGetFriendsFeed(LATEST_PARAMS, {
    query: {
      queryKey: getGetFriendsFeedQueryKey(LATEST_PARAMS),
      refetchOnMount: 'always',
    },
  });
  const outfits = useGetOutfits();

  const { refetch } = feed;
  useFocusEffect(
    React.useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const entry = feed.data?.[0];
  if (!entry) return null;

  const line = feedLineFor(entry, {
    itemName: (id) => outfits.data?.outfits.find((o) => o.id === id)?.name ?? null,
  });
  // An event this build cannot describe is not a reason to show an empty row.
  if (line === null) return null;

  return (
    <PressableScale
      testID="home-latest-moment"
      accessibilityRole="link"
      accessibilityLabel={line}
      onPress={() => {
        hapticLight();
        router.push('/(app)/leaderboard?tab=feed');
      }}
      style={[
        styles.momentRow,
        { backgroundColor: `${colors.mutedForeground}18` },
      ]}
    >
      <MascotAvatar user={entry.actor} size={28} />
      <Text
        numberOfLines={1}
        style={[styles.momentText, { color: colors.foreground }]}
      >
        {line}
      </Text>
      {entry.actor.firstClassActive ? <FirstClassChip /> : null}
    </PressableScale>
  );
}

// ── exported component ────────────────────────────────────────────────────────

export function HomeSocialStrip() {
  const colors = useColors();
  const router = useRouter();
  const leaderboard = useGetFriendsLeaderboard();
  const referral = useGetReferral();

  if (leaderboard.isLoading) return null;
  if (leaderboard.isError) return null;

  const entries = leaderboard.data ?? [];
  const hasFriends = entries.length > 1;

  // Build display set: top 4 by rank, always including the learner even when
  // they rank 5th or lower.
  const top4 = entries.slice(0, 4);
  const selfEntry = top4.some((e) => e.isSelf)
    ? undefined
    : entries.find((e) => e.isSelf);
  const displayEntries = selfEntry ? [...top4, selfEntry] : top4;

  const link = referralLinkFor(referral.data?.code);

  // Where the header link goes depends on what the card is showing, because the
  // two states want different surfaces: standing goes to the board, while a
  // learner with nobody to compare against needs the Friends tab, which is
  // where friends are actually added. Sending "Add friends" to an empty board
  // would be a dead end.
  const goToBoard = () => {
    hapticLight();
    if (hasFriends) {
      router.push('/(app)/leaderboard');
      return;
    }
    router.push('/(app)/(tabs)/friends');
  };

  const onShare = async () => {
    hapticLight();
    if (!link) return;
    try {
      await Share.share({
        message: `Learn your family's language with me on Bolo! Use my link and we both get ${REFERRAL_REWARD_CHAI} Chai. ${link}`,
        url: link,
      });
    } catch {
      // dismissed or unavailable — no-op.
    }
  };

  return (
    <View
      testID="home-social-strip"
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      {/* Header row */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Feather name="users" size={14} color={colors.primary} />
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            Friends
          </Text>
        </View>
        <PressableScale
          accessibilityRole="link"
          accessibilityLabel={hasFriends ? 'See all friends' : 'Add friends'}
          onPress={goToBoard}
        >
          <Text style={[styles.headerLink, { color: colors.primary }]}>
            {hasFriends ? 'See all →' : 'Add friends →'}
          </Text>
        </PressableScale>
      </View>

      {hasFriends ? (
        /* ── populated: latest moment, then the rank strip ── */
        <View style={styles.rows}>
          <LatestFriendMoment colors={colors} />
          {displayEntries.map((entry) => (
            <MiniRow key={entry.userId} entry={entry} colors={colors} />
          ))}
        </View>
      ) : (
        /* ── empty: single invite affordance ── */
        <View style={styles.inviteRow}>
          <View
            style={[
              styles.inviteIcon,
              { backgroundColor: `${colors.primary}1A` },
            ]}
          >
            <Feather name="gift" size={18} color={colors.primary} />
          </View>
          <View style={styles.inviteCopy}>
            <Text style={[styles.inviteTitle, { color: colors.foreground }]}>
              Invite a friend, earn Chai
            </Text>
            <Text style={[styles.inviteSub, { color: colors.mutedForeground }]}>
              You both get {REFERRAL_REWARD_CHAI} Chai when they finish their
              first practice.
            </Text>
          </View>
          {link ? (
            <PressableScale
              testID="home-referral-share"
              accessibilityRole="button"
              accessibilityLabel="Share invite"
              onPress={onShare}
              style={[
                styles.shareBtn,
                { backgroundColor: colors.primary },
              ]}
            >
              <Text
                style={[styles.shareBtnText, { color: colors.primaryForeground }]}
              >
                Share
              </Text>
            </PressableScale>
          ) : null}
        </View>
      )}
    </View>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontFamily: AppFonts.extrabold,
    fontSize: 13,
  },
  headerLink: {
    fontFamily: AppFonts.bold,
    fontSize: 12,
  },
  rows: {
    gap: 5,
  },
  momentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  momentText: {
    flex: 1,
    minWidth: 0,
    fontFamily: AppFonts.bold,
    fontSize: 13,
  },
  miniRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  rank: {
    fontFamily: AppFonts.extrabold,
    fontSize: 11,
    width: 22,
    textAlign: 'center',
  },
  name: {
    fontFamily: AppFonts.bold,
    fontSize: 13,
  },
  xpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  xpText: {
    fontFamily: AppFonts.extrabold,
    fontSize: 11,
  },
  // ── invite (no-friends) state ──
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inviteIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  inviteCopy: {
    flex: 1,
    minWidth: 0,
  },
  inviteTitle: {
    fontFamily: AppFonts.bold,
    fontSize: 13,
  },
  inviteSub: {
    fontFamily: AppFonts.regular,
    fontSize: 11,
    marginTop: 1,
  },
  shareBtn: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexShrink: 0,
  },
  shareBtnText: {
    fontFamily: AppFonts.extrabold,
    fontSize: 13,
  },
});
