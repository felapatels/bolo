import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAppearSkip } from '@/lib/entrance';
import { useQueryClient } from '@tanstack/react-query';
import {
  useSearchFriendByEmail,
  getSearchFriendByEmailQueryKey,
  useSendFriendRequest,
  useSendFriendInvite,
  useListIncomingFriendRequests,
  getListIncomingFriendRequestsQueryKey,
  useListOutgoingFriendRequests,
  getListOutgoingFriendRequestsQueryKey,
  useAcceptFriendRequest,
  useDeclineFriendRequest,
  useListFriends,
  getListFriendsQueryKey,
  useRemoveFriend,
  useGetFriendsLeaderboard,
  getGetFriendsLeaderboardQueryKey,
  ApiError,
  type UserSummary,
  type FriendRequest,
  type Friend,
  type LeaderboardEntry,
} from '@workspace/api-client-react';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { Mascot } from '@/components/Mascot';
import { useIdleTimer } from '@/hooks/useIdleTimer';
import { ChunkyButton } from '@/components/ChunkyButton';
import { SkeletonCard } from '@/components/SkeletonCard';
import { PressableScale } from '@/components/PressableScale';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

type Tab = 'friends' | 'leaderboard';

/** Human-friendly label for a learner: their name, else email, else a fallback. */
function displayFor(u: {
  displayName?: string | null;
  email?: string | null;
}): string {
  return u.displayName?.trim() || u.email?.trim() || 'Learner';
}

/** First one or two initials from a name/email for the avatar. */
function initialsFor(u: {
  displayName?: string | null;
  email?: string | null;
}): string {
  const base = u.displayName?.trim() || u.email?.trim() || '?';
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return base.slice(0, 2).toUpperCase();
}

/** Pull a friendly message out of an ApiError, else a sensible default. */
function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const data = err.data as { detail?: string; message?: string } | null;
    const detail = data?.detail || data?.message;
    if (detail && detail.trim()) return detail.trim();
  }
  return fallback;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function FriendsScreen() {
  const colors = useColors();
  const skipEnter = useAppearSkip();
  const [tab, setTab] = React.useState<Tab>('friends');
  const { isIdle, onActivity } = useIdleTimer(10);

  return (
    <Screen>
      <Animated.View
        entering={skipEnter ? undefined : FadeInDown.duration(500)}
        style={styles.head}
        onTouchStart={onActivity}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.h1, { color: colors.foreground }]}>Friends</Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            Learn together, climb the ranks
          </Text>
        </View>
        <Mascot pose="wave" size={76} motion="sway" isIdle={isIdle} />
      </Animated.View>

      <View style={styles.segmentWrap} onTouchStart={onActivity}>
        <Segment
          label="Friends"
          icon="users"
          active={tab === 'friends'}
          onPress={() => setTab('friends')}
        />
        <Segment
          label="Leaderboard"
          icon="award"
          active={tab === 'leaderboard'}
          onPress={() => setTab('leaderboard')}
        />
      </View>

      {tab === 'friends' ? <FriendsTab /> : <LeaderboardTab />}
    </Screen>
  );
}

function Segment({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        styles.segment,
        {
          backgroundColor: active ? colors.primary : colors.card,
          borderColor: active ? colors.primary : colors.border,
        },
      ]}
    >
      <Feather
        name={icon}
        size={17}
        color={active ? colors.primaryForeground : colors.mutedForeground}
      />
      <Text
        style={[
          styles.segmentText,
          { color: active ? colors.primaryForeground : colors.mutedForeground },
        ]}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

// ---------------------------------------------------------------------------
// Friends tab: add-by-email, incoming/outgoing requests, and the friends list
// ---------------------------------------------------------------------------

function FriendsTab() {
  const colors = useColors();
  const queryClient = useQueryClient();

  const [email, setEmail] = React.useState('');
  const [searchedEmail, setSearchedEmail] = React.useState('');
  const [notice, setNotice] = React.useState<string | null>(null);
  const [invitedEmail, setInvitedEmail] = React.useState<string | null>(null);

  const incoming = useListIncomingFriendRequests();
  const outgoing = useListOutgoingFriendRequests();
  const friends = useListFriends();

  const search = useSearchFriendByEmail(
    { email: searchedEmail },
    {
      query: {
        enabled: !!searchedEmail,
        queryKey: getSearchFriendByEmailQueryKey({ email: searchedEmail }),
        retry: false,
      },
    },
  );

  const sendRequest = useSendFriendRequest();
  const sendInvite = useSendFriendInvite();
  const accept = useAcceptFriendRequest();
  const decline = useDeclineFriendRequest();
  const remove = useRemoveFriend();

  const refreshing =
    incoming.isRefetching || outgoing.isRefetching || friends.isRefetching;

  const onRefresh = () => {
    incoming.refetch();
    outgoing.refetch();
    friends.refetch();
  };

  const trimmed = email.trim().toLowerCase();
  const emailValid = EMAIL_RE.test(trimmed);

  const runSearch = () => {
    if (!emailValid) return;
    Keyboard.dismiss();
    setNotice(null);
    setSearchedEmail(trimmed);
  };

  const clearSearch = () => {
    setEmail('');
    setSearchedEmail('');
    setNotice(null);
    setInvitedEmail(null);
    queryClient.removeQueries({
      queryKey: ['/api/friends/search'],
      exact: false,
    });
  };

  const onInvite = (toEmail: string) => {
    sendInvite.mutate(
      { data: { email: toEmail } },
      {
        onSuccess: (result) => {
          setInvitedEmail(toEmail);
          setNotice(
            result.sendCount > 1
              ? `Invite resent to ${toEmail}!`
              : `Invite sent to ${toEmail}! They'll get an email with a download link.`,
          );
          setEmail('');
          setSearchedEmail('');
        },
        onError: (err) => {
          if (err instanceof ApiError && err.status === 429) {
            setNotice(
              errorMessage(
                err,
                "You've already invited this address recently. Try again in 24 hours.",
              ),
            );
          } else if (err instanceof ApiError && err.status === 400) {
            // Email found a real user — nudge to the regular search flow.
            setNotice(
              errorMessage(
                err,
                "That email already has an account. Use the search to add them.",
              ),
            );
          } else {
            setNotice(errorMessage(err, "Couldn't send the invite. Please try again."));
          }
        },
      },
    );
  };

  const onSend = (target: UserSummary) => {
    sendRequest.mutate(
      { data: { email: target.email ?? searchedEmail } },
      {
        onSuccess: () => {
          setNotice(`Request sent to ${displayFor(target)}.`);
          setEmail('');
          setSearchedEmail('');
          queryClient.invalidateQueries({
            queryKey: getListOutgoingFriendRequestsQueryKey(),
          });
        },
        onError: (err) => {
          setNotice(
            errorMessage(err, "Couldn't send the request. Please try again."),
          );
        },
      },
    );
  };

  const onAccept = (req: FriendRequest) => {
    accept.mutate(
      { id: req.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListIncomingFriendRequestsQueryKey(),
          });
          queryClient.invalidateQueries({ queryKey: getListFriendsQueryKey() });
          queryClient.invalidateQueries({
            queryKey: getGetFriendsLeaderboardQueryKey(),
          });
        },
        onError: (err) => {
          Alert.alert(
            'Something went wrong',
            errorMessage(err, "Couldn't accept the request."),
          );
        },
      },
    );
  };

  const onDecline = (req: FriendRequest) => {
    decline.mutate(
      { id: req.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListIncomingFriendRequestsQueryKey(),
          });
        },
        onError: (err) => {
          Alert.alert(
            'Something went wrong',
            errorMessage(err, "Couldn't decline the request."),
          );
        },
      },
    );
  };

  const onRemove = (friend: Friend) => {
    Alert.alert(
      'Remove friend',
      `Remove ${displayFor(friend)} from your friends?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () =>
            remove.mutate(
              { userId: friend.id },
              {
                onSuccess: () => {
                  queryClient.invalidateQueries({
                    queryKey: getListFriendsQueryKey(),
                  });
                  queryClient.invalidateQueries({
                    queryKey: getGetFriendsLeaderboardQueryKey(),
                  });
                },
                onError: (err) => {
                  Alert.alert(
                    'Something went wrong',
                    errorMessage(err, "Couldn't remove this friend."),
                  );
                },
              },
            ),
        },
      ],
    );
  };

  const searchNotFound =
    search.error instanceof ApiError && search.error.status === 404;
  const searchOtherError = search.isError && !searchNotFound;
  const alreadyInvited = invitedEmail === searchedEmail;

  const incomingList = incoming.data ?? [];
  const outgoingList = outgoing.data ?? [];
  const friendsList = friends.data ?? [];

  const removingId = remove.isPending
    ? (remove.variables?.userId ?? null)
    : null;

  return (
    <KeyboardAwareScrollViewCompat
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
      {/* Add a friend by email */}
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.cardHeading, { color: colors.mutedForeground }]}>
          ADD A FRIEND
        </Text>
        <View style={styles.searchRow}>
          <View
            style={[
              styles.input,
              { backgroundColor: colors.muted, borderColor: colors.border },
            ]}
          >
            <Feather name="mail" size={18} color={colors.mutedForeground} />
            <TextInput
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                if (notice) setNotice(null);
              }}
              placeholder="Friend's email"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="search"
              onSubmitEditing={runSearch}
              style={[styles.inputText, { color: colors.foreground }]}
            />
            {email.length > 0 ? (
              <PressableScale
                accessibilityLabel="Clear"
                onPress={clearSearch}
                hitSlop={8}
              >
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </PressableScale>
            ) : null}
          </View>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Search"
            disabled={!emailValid}
            onPress={runSearch}
            style={[
              styles.searchBtn,
              {
                backgroundColor: emailValid ? colors.primary : colors.muted,
              },
            ]}
          >
            <Feather
              name="search"
              size={20}
              color={emailValid ? colors.primaryForeground : colors.mutedForeground}
            />
          </PressableScale>
        </View>

        {notice ? (
          <Text style={[styles.notice, { color: colors.foreground }]}>
            {notice}
          </Text>
        ) : null}

        {searchedEmail ? (
          search.isLoading ? (
            <ActivityIndicator
              color={colors.primary}
              style={{ marginTop: 16 }}
            />
          ) : searchNotFound ? (
            // No Bolo! account found — offer to send a referral invite.
            <View
              style={[styles.inviteBox, { borderColor: colors.border, backgroundColor: `${colors.primary}0D` }]}
            >
              <Feather name="mail" size={20} color={colors.primary} style={{ marginBottom: 6 }} />
              <Text style={[styles.inviteTitle, { color: colors.foreground }]}>
                {searchedEmail} isn't on Bolo! yet
              </Text>
              <Text style={[styles.inviteText, { color: colors.mutedForeground }]}>
                Send them an invite with a link to download the app. When they
                join, you'll automatically get a friend request.
              </Text>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={`Invite ${searchedEmail} to Bolo!`}
                disabled={sendInvite.isPending || alreadyInvited}
                onPress={() => onInvite(searchedEmail)}
                style={[
                  styles.inviteBtn,
                  {
                    backgroundColor:
                      alreadyInvited ? colors.muted : colors.primary,
                  },
                ]}
              >
                {sendInvite.isPending ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <>
                    <Feather
                      name={alreadyInvited ? 'check' : 'send'}
                      size={15}
                      color={alreadyInvited ? colors.mutedForeground : colors.primaryForeground}
                    />
                    <Text
                      style={[
                        styles.inviteBtnText,
                        {
                          color: alreadyInvited
                            ? colors.mutedForeground
                            : colors.primaryForeground,
                        },
                      ]}
                    >
                      {alreadyInvited ? 'Invite sent!' : 'Send invite'}
                    </Text>
                  </>
                )}
              </PressableScale>
            </View>
          ) : searchOtherError ? (
            <Text style={[styles.searchMsg, { color: colors.destructive }]}>
              Couldn&apos;t search right now. Please try again.
            </Text>
          ) : search.data ? (
            <View style={[styles.resultRow, { borderColor: colors.border }]}>
              <Avatar user={search.data} />
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.resultName, { color: colors.foreground }]}
                  numberOfLines={1}
                >
                  {displayFor(search.data)}
                </Text>
                {search.data.email ? (
                  <Text
                    style={[styles.resultSub, { color: colors.mutedForeground }]}
                    numberOfLines={1}
                  >
                    {search.data.email}
                  </Text>
                ) : null}
              </View>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={`Send friend request to ${displayFor(search.data)}`}
                disabled={sendRequest.isPending}
                onPress={() => onSend(search.data!)}
                style={[styles.addBtn, { backgroundColor: colors.primary }]}
              >
                {sendRequest.isPending ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.primaryForeground}
                  />
                ) : (
                  <>
                    <Feather
                      name="user-plus"
                      size={16}
                      color={colors.primaryForeground}
                    />
                    <Text
                      style={[
                        styles.addBtnText,
                        { color: colors.primaryForeground },
                      ]}
                    >
                      Add
                    </Text>
                  </>
                )}
              </PressableScale>
            </View>
          ) : null
        ) : null}
      </View>

      {/* Incoming requests */}
      {incomingList.length > 0 ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Friend requests
          </Text>
          {incomingList.map((req) => {
            const busy =
              (accept.isPending && accept.variables?.id === req.id) ||
              (decline.isPending && decline.variables?.id === req.id);
            return (
              <View
                key={req.id}
                style={[
                  styles.personRow,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Avatar user={req.user} />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.personName, { color: colors.foreground }]}
                    numberOfLines={1}
                  >
                    {displayFor(req.user)}
                  </Text>
                  <Text
                    style={[styles.personSub, { color: colors.mutedForeground }]}
                    numberOfLines={1}
                  >
                    wants to be friends
                  </Text>
                </View>
                {busy ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <View style={styles.reqActions}>
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel={`Decline ${displayFor(req.user)}`}
                      onPress={() => onDecline(req)}
                      style={[
                        styles.iconBtn,
                        {
                          backgroundColor: colors.muted,
                        },
                      ]}
                    >
                      <Feather name="x" size={20} color={colors.mutedForeground} />
                    </PressableScale>
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel={`Accept ${displayFor(req.user)}`}
                      onPress={() => onAccept(req)}
                      style={[
                        styles.iconBtn,
                        { backgroundColor: colors.success },
                      ]}
                    >
                      <Feather
                        name="check"
                        size={20}
                        color={colors.successForeground}
                      />
                    </PressableScale>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Outgoing (pending) requests */}
      {outgoingList.length > 0 ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Pending
          </Text>
          {outgoingList.map((req) => (
            <View
              key={req.id}
              style={[
                styles.personRow,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Avatar user={req.user} muted />
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.personName, { color: colors.foreground }]}
                  numberOfLines={1}
                >
                  {displayFor(req.user)}
                </Text>
                <Text
                  style={[styles.personSub, { color: colors.mutedForeground }]}
                  numberOfLines={1}
                >
                  Request sent
                </Text>
              </View>
              <View
                style={[
                  styles.pendingPill,
                  { backgroundColor: `${colors.gold}26` },
                ]}
              >
                <Feather name="clock" size={13} color={colors.gold} />
                <Text style={[styles.pendingText, { color: colors.gold }]}>
                  Pending
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* Friends list */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          Your friends
          {friendsList.length > 0 ? ` · ${friendsList.length}` : ''}
        </Text>

        {friends.isLoading ? (
          <View style={{ gap: 10 }}>
            {[0, 1, 2].map((i) => (
              <SkeletonCard key={i} height={72} borderRadius={16} />
            ))}
          </View>
        ) : friends.isError ? (
          <ErrorState onRetry={() => friends.refetch()} />
        ) : friendsList.length === 0 ? (
          <EmptyFriends />
        ) : (
          friendsList.map((friend) => (
            <View
              key={friend.friendshipId}
              style={[
                styles.personRow,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Avatar user={friend} />
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.personName, { color: colors.foreground }]}
                  numberOfLines={1}
                >
                  {displayFor(friend)}
                </Text>
                {friend.email ? (
                  <Text
                    style={[styles.personSub, { color: colors.mutedForeground }]}
                    numberOfLines={1}
                  >
                    {friend.email}
                  </Text>
                ) : null}
              </View>
              {removingId === friend.id ? (
                <ActivityIndicator color={colors.mutedForeground} />
              ) : (
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${displayFor(friend)}`}
                  onPress={() => onRemove(friend)}
                  style={[styles.iconBtn, { backgroundColor: colors.muted }]}
                  hitSlop={6}
                >
                  <Feather
                    name="user-minus"
                    size={19}
                    color={colors.mutedForeground}
                  />
                </PressableScale>
              )}
            </View>
          ))
        )}
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

function EmptyFriends() {
  const colors = useColors();
  return (
    <View style={styles.emptyState}>
      <Mascot pose="thinking" size={92} motion="float" />
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
        No friends yet
      </Text>
      <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
        Add a friend by their email above to practice together and see who tops
        the leaderboard.
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Leaderboard tab
// ---------------------------------------------------------------------------

function LeaderboardTab() {
  const colors = useColors();
  const skipEnter = useAppearSkip();
  const leaderboard = useGetFriendsLeaderboard();

  const rows = leaderboard.data ?? [];
  const onlySelf = rows.length === 1 && rows[0]?.isSelf;

  return (
    <KeyboardAwareScrollViewCompat
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingBottom: TAB_BAR_CLEARANCE,
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={leaderboard.isRefetching}
          onRefresh={() => leaderboard.refetch()}
          tintColor={colors.primary}
        />
      }
    >
      {leaderboard.isLoading ? (
        <View style={{ gap: 10, marginTop: 8 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <SkeletonCard key={i} height={72} borderRadius={16} />
          ))}
        </View>
      ) : leaderboard.isError ? (
        <ErrorState onRetry={() => leaderboard.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyLeaderboard />
      ) : (
        <>
          {rows.map((entry, i) => (
            <Animated.View
              key={entry.userId}
              entering={skipEnter ? undefined : FadeInDown.duration(360).delay(Math.min(i, 8) * 45)}
            >
              <LeaderboardRow entry={entry} />
            </Animated.View>
          ))}
          {onlySelf ? (
            <Text style={[styles.lbHint, { color: colors.mutedForeground }]}>
              Add friends to see how you stack up. Your XP is the total across
              every language.
            </Text>
          ) : null}
        </>
      )}
    </KeyboardAwareScrollViewCompat>
  );
}

function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  const colors = useColors();
  const isSelf = entry.isSelf;
  const isPodium = entry.rank <= 3;
  const podiumColor =
    entry.rank === 1
      ? colors.gold
      : entry.rank === 2
        ? colors.mutedForeground
        : colors.secondary;

  return (
    <View
      style={[
        styles.lbRow,
        {
          backgroundColor: isSelf ? colors.primary : colors.card,
          borderColor: isSelf ? colors.primary : colors.border,
        },
      ]}
    >
      <View
        style={[
          styles.rankBadge,
          {
            backgroundColor: isSelf
              ? 'rgba(255,255,255,0.22)'
              : isPodium
                ? `${podiumColor}26`
                : colors.muted,
          },
        ]}
      >
        <Text
          style={[
            styles.rankText,
            {
              color: isSelf
                ? colors.primaryForeground
                : isPodium
                  ? podiumColor
                  : colors.mutedForeground,
            },
          ]}
        >
          {entry.rank}
        </Text>
      </View>

      <Avatar user={entry} onPrimary={isSelf} />

      <View style={{ flex: 1 }}>
        <Text
          style={[
            styles.lbName,
            { color: isSelf ? colors.primaryForeground : colors.foreground },
          ]}
          numberOfLines={1}
        >
          {isSelf ? 'You' : displayFor(entry)}
        </Text>
        <Text
          style={[
            styles.lbSub,
            {
              color: isSelf
                ? 'rgba(255,255,255,0.75)'
                : colors.mutedForeground,
            },
          ]}
        >
          {entry.xp.toLocaleString()} XP
        </Text>
      </View>

      <Feather
        name="zap"
        size={20}
        color={isSelf ? colors.primaryForeground : colors.gold}
      />
    </View>
  );
}

function EmptyLeaderboard() {
  const colors = useColors();
  return (
    <View style={styles.emptyState}>
      <Mascot pose="cheer" size={92} motion="float" />
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
        Nothing to rank yet
      </Text>
      <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
        Add friends and keep practicing — your XP across every language decides
        the standings.
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function Avatar({
  user,
  muted,
  onPrimary,
}: {
  user: { displayName?: string | null; email?: string | null };
  muted?: boolean;
  onPrimary?: boolean;
}) {
  const colors = useColors();
  const bg = onPrimary
    ? 'rgba(255,255,255,0.22)'
    : muted
      ? colors.muted
      : `${colors.primary}1F`;
  const fg = onPrimary
    ? colors.primaryForeground
    : muted
      ? colors.mutedForeground
      : colors.primary;
  return (
    <View style={[styles.avatar, { backgroundColor: bg }]}>
      <Text style={[styles.avatarText, { color: fg }]}>{initialsFor(user)}</Text>
    </View>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const colors = useColors();
  return (
    <View style={styles.centerState}>
      <Feather name="wifi-off" size={30} color={colors.mutedForeground} />
      <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
        We couldn&apos;t load this right now. Check your connection and try
        again.
      </Text>
      <ChunkyButton
        title="Retry"
        icon="refresh-cw"
        onPress={onRetry}
        style={{ marginTop: 4, alignSelf: 'stretch' }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  h1: { fontFamily: AppFonts.extrabold, fontSize: 30 },
  sub: { fontFamily: AppFonts.semibold, fontSize: 15, marginTop: 2 },
  segmentWrap: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  segmentText: { fontFamily: AppFonts.bold, fontSize: 14 },
  card: {
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 22,
  },
  cardHeading: {
    fontFamily: AppFonts.extrabold,
    fontSize: 12,
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  searchRow: { flexDirection: 'row', gap: 10 },
  input: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    height: 52,
  },
  inputText: {
    flex: 1,
    fontFamily: AppFonts.semibold,
    fontSize: 15,
    padding: 0,
  },
  searchBtn: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: {
    fontFamily: AppFonts.semibold,
    fontSize: 14,
    marginTop: 14,
  },
  searchMsg: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 14,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  resultName: { fontFamily: AppFonts.bold, fontSize: 16 },
  resultSub: { fontFamily: AppFonts.regular, fontSize: 13, marginTop: 2 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 12,
    minWidth: 72,
    justifyContent: 'center',
  },
  addBtnText: { fontFamily: AppFonts.bold, fontSize: 14 },
  section: { marginBottom: 22 },
  sectionTitle: {
    fontFamily: AppFonts.bold,
    fontSize: 18,
    marginBottom: 12,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
  },
  personName: { fontFamily: AppFonts.bold, fontSize: 15 },
  personSub: { fontFamily: AppFonts.regular, fontSize: 13, marginTop: 2 },
  reqActions: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  pendingText: { fontFamily: AppFonts.bold, fontSize: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: AppFonts.extrabold, fontSize: 15 },
  emptyState: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 28,
    paddingHorizontal: 12,
  },
  emptyTitle: {
    fontFamily: AppFonts.extrabold,
    fontSize: 19,
    marginTop: 4,
  },
  emptyText: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 300,
  },
  centerState: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: 40,
    paddingHorizontal: 8,
  },
  stateText: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },
  lbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
  },
  rankBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: { fontFamily: AppFonts.extrabold, fontSize: 15 },
  lbName: { fontFamily: AppFonts.bold, fontSize: 16 },
  lbSub: { fontFamily: AppFonts.semibold, fontSize: 13, marginTop: 2 },
  lbHint: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 16,
  },
  inviteBox: {
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    gap: 6,
  },
  inviteTitle: {
    fontFamily: AppFonts.bold,
    fontSize: 15,
    textAlign: 'center',
  },
  inviteText: {
    fontFamily: AppFonts.regular,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 4,
  },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 12,
    marginTop: 4,
  },
  inviteBtnText: {
    fontFamily: AppFonts.bold,
    fontSize: 14,
  },
});
