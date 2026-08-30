import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Feather } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import { appearDown, appearZoom, useAppearSkip } from '@/lib/entrance';
import { useQueryClient } from '@tanstack/react-query';
import {
  useSendFriendRequestByCode,
  useGetReferral,
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
  type FriendRequest,
  type Friend,
  type LeaderboardEntry,
  type GetFriendsLeaderboardParams,
} from '@workspace/api-client-react';
import { normalizeReferralCode } from '@workspace/referral-link';
import { referralLinkFor } from '@/lib/referral';
import { FriendQr } from '@/components/FriendQr';
import { QrScannerSheet } from '@/components/QrScannerSheet';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { Mascot } from '@/components/Mascot';
import { useIdleTimer } from '@/hooks/useIdleTimer';
import { ChunkyButton } from '@/components/ChunkyButton';
import { SkeletonCard } from '@/components/SkeletonCard';
import { PressableScale } from '@/components/PressableScale';
import { useColors } from '@/hooks/useColors';
import {
  BoardScopeToggle,
  PublicNamePrompt,
  useMyPublicName,
  type BoardScope,
} from '@/components/BoardScope';
import { MetricToggle } from '@/components/leaderboard/MetricToggle';
import { WeeklyRaceBar } from '@/components/leaderboard/WeeklyRaceBar';
import { LeaderboardBoard } from '@/components/leaderboard/LeaderboardBoard';
import { type BoardMetric, rankEntries, weekKey } from '@/lib/boardRanking';
import { useRankDeltas } from '@/lib/useRankDeltas';
import { AppFonts } from '@/constants/fonts';

type Tab = 'friends' | 'leaderboard';

/** Human-friendly label for a learner: their name, else a fallback. */
function displayFor(u: { displayName?: string | null }): string {
  return u.displayName?.trim() || 'Fellow learner';
}

/** First one or two initials from a name for the avatar. */
function initialsFor(u: { displayName?: string | null }): string {
  const base = u.displayName?.trim() || '?';
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return base.slice(0, 2).toUpperCase();
}

/** Pull a friendly message out of an ApiError, else a sensible default. */
function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    // `error` is the shape the friends router answers with (the by-code
    // endpoint included); `detail`/`message` cover the older handlers. Without
    // `error` here, server copy like "That's your own friend code." would be
    // silently replaced by the generic fallback.
    const data = err.data as {
      detail?: string;
      message?: string;
      error?: string;
    } | null;
    const detail = data?.detail || data?.message || data?.error;
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
        entering={skipEnter ? undefined : appearDown(0, 500)}
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

  const [code, setCode] = React.useState('');
  const [notice, setNotice] = React.useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = React.useState(false);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [invitedEmail, setInvitedEmail] = React.useState<string | null>(null);

  const incoming = useListIncomingFriendRequests();
  const outgoing = useListOutgoingFriendRequests();
  const friends = useListFriends();

  const sendRequest = useSendFriendRequestByCode();
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

  const normalizedCode = normalizeReferralCode(code);
  const alreadyInvited = invitedEmail === trimmed;

  // Adding a friend is code-only: there is no lookup by email, name or partial
  // match on this screen any more. The code someone types is their friend's
  // REFERRAL code — one code, two jobs — and that reuse is only safe because
  // this lands as a *pending* request the other learner has to accept. See the
  // note at the accept handler on the server before changing anything here.
  const submitCode = (raw: string) => {
    const value = normalizeReferralCode(raw);
    if (!value || sendRequest.isPending) return;
    Keyboard.dismiss();
    setNotice(null);
    sendRequest.mutate(
      { data: { code: value } },
      {
        onSuccess: (created) => {
          setCode('');
          setNotice(`Request sent to ${displayFor(created.user)}.`);
          queryClient.invalidateQueries({
            queryKey: getListOutgoingFriendRequestsQueryKey(),
          });
        },
        onError: (err) => {
          // The 404 wording is deliberately uniform with the server's: an
          // unknown code, a near-miss and a code you already share a friendship
          // with all read the same, so the box can't be used to probe which
          // codes exist.
          setNotice(
            errorMessage(
              err,
              err instanceof ApiError && err.status === 429
                ? 'Too many code attempts. Please try again later.'
                : "That code didn't match. Check it and try again.",
            ),
          );
        },
      },
    );
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
            // Email belongs to a real learner. There is no lookup by email any
            // more, so the only way forward is their friend code.
            setNotice(
              errorMessage(
                err,
                'That email already has an account. Ask them for their friend code to add them.',
              ),
            );
          } else {
            setNotice(errorMessage(err, "Couldn't send the invite. Please try again."));
          }
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
      {/* Add a friend by their code — typed, or scanned off their QR. */}
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
            <Feather name="hash" size={18} color={colors.mutedForeground} />
            <TextInput
              value={code}
              onChangeText={(t) => {
                setCode(t.toUpperCase());
                if (notice) setNotice(null);
              }}
              placeholder="Friend code"
              placeholderTextColor={colors.mutedForeground}
              accessibilityLabel="Friend code"
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              maxLength={12}
              returnKeyType="done"
              onSubmitEditing={() => submitCode(code)}
              style={[
                styles.inputText,
                { color: colors.foreground, letterSpacing: 2 },
              ]}
            />
            {code.length > 0 ? (
              <PressableScale
                accessibilityLabel="Clear"
                onPress={() => {
                  setCode('');
                  setNotice(null);
                }}
                hitSlop={8}
              >
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </PressableScale>
            ) : null}
          </View>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Send friend request"
            disabled={!normalizedCode || sendRequest.isPending}
            onPress={() => submitCode(code)}
            style={[
              styles.searchBtn,
              {
                backgroundColor: normalizedCode ? colors.primary : colors.muted,
              },
            ]}
          >
            {sendRequest.isPending ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Feather
                name="user-plus"
                size={20}
                color={
                  normalizedCode ? colors.primaryForeground : colors.mutedForeground
                }
              />
            )}
          </PressableScale>
        </View>

        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Scan a friend code"
          onPress={() => {
            setNotice(null);
            setScannerOpen(true);
          }}
          style={[
            styles.secondaryBtn,
            { borderColor: colors.border, backgroundColor: colors.muted },
          ]}
        >
          <Feather name="maximize" size={17} color={colors.foreground} />
          <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>
            Scan their QR
          </Text>
        </PressableScale>

        {notice ? (
          <Text style={[styles.notice, { color: colors.foreground }]}>
            {notice}
          </Text>
        ) : null}

        {/* Someone who isn't on Bolo! yet can't have a code, so the email
            invite stays — it mails a download link and turns into a pending
            request when they sign up. It is NOT a lookup: nothing here reveals
            whether an address belongs to a learner beyond what the invite
            endpoint already refuses to do. */}
        {inviteOpen ? (
          <View
            style={[
              styles.inviteBox,
              { borderColor: colors.border, backgroundColor: `${colors.primary}0D` },
            ]}
          >
            <Text style={[styles.inviteTitle, { color: colors.foreground }]}>
              Not on Bolo! yet?
            </Text>
            <Text style={[styles.inviteText, { color: colors.mutedForeground }]}>
              Send them an invite with a link to download the app. When they
              join, you&apos;ll automatically get a friend request.
            </Text>
            <View
              style={[
                styles.input,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  alignSelf: 'stretch',
                },
              ]}
            >
              <Feather name="mail" size={18} color={colors.mutedForeground} />
              <TextInput
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  if (notice) setNotice(null);
                }}
                placeholder="Their email"
                placeholderTextColor={colors.mutedForeground}
                accessibilityLabel="Their email"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                returnKeyType="send"
                onSubmitEditing={() => emailValid && onInvite(trimmed)}
                style={[styles.inputText, { color: colors.foreground }]}
              />
            </View>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Send invite"
              disabled={!emailValid || sendInvite.isPending || alreadyInvited}
              onPress={() => onInvite(trimmed)}
              style={[
                styles.inviteBtn,
                {
                  backgroundColor:
                    emailValid && !alreadyInvited ? colors.primary : colors.muted,
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
                    color={
                      emailValid && !alreadyInvited
                        ? colors.primaryForeground
                        : colors.mutedForeground
                    }
                  />
                  <Text
                    style={[
                      styles.inviteBtnText,
                      {
                        color:
                          emailValid && !alreadyInvited
                            ? colors.primaryForeground
                            : colors.mutedForeground,
                      },
                    ]}
                  >
                    {alreadyInvited ? 'Invite sent!' : 'Send invite'}
                  </Text>
                </>
              )}
            </PressableScale>
          </View>
        ) : (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Invite someone who is not on Bolo yet"
            onPress={() => setInviteOpen(true)}
            hitSlop={6}
            style={{ marginTop: 14, alignSelf: 'flex-start' }}
          >
            <Text style={[styles.linkText, { color: colors.primary }]}>
              Not on Bolo! yet? Invite by email
            </Text>
          </PressableScale>
        )}
      </View>

      <YourFriendCode />

      <QrScannerSheet
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanned={(scanned) => {
          setScannerOpen(false);
          setCode(scanned);
          submitCode(scanned);
        }}
      />

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
              <MascotAvatar user={friend} />
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.personName, { color: colors.foreground }]}
                  numberOfLines={1}
                >
                  {displayFor(friend)}
                </Text>
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

/**
 * The other half of adding a friend: the code the learner hands out.
 *
 * This is the learner's REFERRAL code — one code, two jobs. Someone who scans
 * the square (or taps the shared link) also lands on the referral flow, so the
 * Chai reward and the friendship both follow from a single act.
 */
function YourFriendCode() {
  const colors = useColors();
  const referral = useGetReferral();
  const [copied, setCopied] = React.useState(false);

  const code = referral.data?.code;
  const link = referralLinkFor(code);
  if (!code) return null;

  const onCopy = async () => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const onShare = () => {
    if (!link) return;
    // A FRIEND invite, not a referral: it sells the leaderboard, not
    // the Chai. The link is the same /join/<CODE> either way, so the
    // reward still lands; it is simply not the pitch here. The
    // referral copy lives on the two home surfaces.
    void Share.share({
      message: `I'm learning my family's language on Bolo! Add me as a friend and let's see who keeps the better streak. ${link}`,
      url: link,
    });
  };

  return (
    <View
      testID="your-friend-code"
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.cardHeading, { color: colors.mutedForeground }]}>
        YOUR FRIEND CODE
      </Text>

      <View style={{ alignItems: 'center', gap: 12 }}>
        {/* Only render the square when there is a link to encode — a QR of a
            bare code would not open the app for whoever scans it. */}
        {link ? <FriendQr value={link} size={148} /> : null}
        <Text
          testID="friend-code"
          selectable
          style={[styles.codeText, { color: colors.foreground }]}
        >
          {code}
        </Text>
        <Text style={[styles.inviteText, { color: colors.mutedForeground }]}>
          Share it or let a friend scan the square. They&apos;ll send you a
          request to accept.
        </Text>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Copy friend code"
            onPress={() => void onCopy()}
            style={[
              styles.secondaryBtn,
              {
                borderColor: colors.border,
                backgroundColor: colors.muted,
                marginTop: 0,
              },
            ]}
          >
            <Feather
              name={copied ? 'check' : 'copy'}
              size={16}
              color={colors.foreground}
            />
            <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>
              {copied ? 'Copied!' : 'Copy code'}
            </Text>
          </PressableScale>

          {link ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Share friend code"
              onPress={onShare}
              style={[
                styles.secondaryBtn,
                {
                  borderColor: colors.primary,
                  backgroundColor: `${colors.primary}14`,
                  marginTop: 0,
                },
              ]}
            >
              <Feather name="share-2" size={16} color={colors.primary} />
              <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>
                Share link
              </Text>
            </PressableScale>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/**
 * The board, before there is anyone on it.
 *
 * The empty state used to explain the MECHANISM ("add a friend by their code")
 * and never the reward. Nobody adds friends in order to add friends; they add
 * friends to beat them, and the leaderboard was invisible until you already had
 * someone on it. So the pitch is now the thing itself: the learner sitting at
 * rank one on a board with two empty seats.
 *
 * The self row is REAL, pulled from the same leaderboard query the populated
 * tab uses, which already returns the learner alone when they have no friends.
 * A fake number here would be a lie the app tells about the learner's own XP.
 *
 * Owner ruling 2026-08-19, chosen over asking for the contacts permission.
 */
function GhostLeaderboard() {
  const colors = useColors();
  const leaderboard = useGetFriendsLeaderboard();
  const self = (leaderboard.data ?? []).find((r) => r.isSelf);

  return (
    <View testID="friends-ghost-leaderboard" style={styles.ghostBoard}>
      <View
        style={[
          styles.lbRow,
          { backgroundColor: colors.primary, borderColor: colors.primary },
        ]}
      >
        <View
          style={[styles.rankBadge, { backgroundColor: 'rgba(255,255,255,0.22)' }]}
        >
          <Text style={[styles.rankText, { color: colors.primaryForeground }]}>1</Text>
        </View>
        {self ? <MascotAvatar user={self} onPrimary /> : null}
        <View style={{ flex: 1 }}>
          <Text style={[styles.lbName, { color: colors.primaryForeground }]}>You</Text>
          <Text style={[styles.lbSub, { color: 'rgba(255,255,255,0.75)' }]}>
            {(self?.xp ?? 0).toLocaleString()} XP
          </Text>
        </View>
        <Feather name="zap" size={20} color={colors.primaryForeground} />
      </View>

      {/* Two empty seats. Bars rather than fake names: a placeholder that reads
          as a real person is a lie, and it would also be the funniest possible
          thing to screenshot. */}
      {[2, 3].map((rank) => (
        <View
          key={rank}
          testID={`friends-ghost-seat-${rank}`}
          style={[
            styles.lbRow,
            { backgroundColor: colors.card, borderColor: colors.border, opacity: 0.55 },
          ]}
        >
          <View style={[styles.rankBadge, { backgroundColor: colors.muted }]}>
            <Text style={[styles.rankText, { color: colors.mutedForeground }]}>
              {rank}
            </Text>
          </View>
          <View style={[styles.ghostAvatar, { backgroundColor: colors.muted }]} />
          <View style={{ flex: 1, gap: 6 }}>
            <View style={[styles.ghostBar, { backgroundColor: colors.muted, width: '55%' }]} />
            <View style={[styles.ghostBar, { backgroundColor: colors.muted, width: '30%' }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

function EmptyFriends() {
  const colors = useColors();
  // Gentle entrance (mount-only, so it never replays on re-renders); the
  // shared appear guard drops it in Expo Go / reduced motion.
  const skipEnter = useAppearSkip();
  return (
    <View style={styles.emptyState}>
      <Animated.View entering={skipEnter ? undefined : appearZoom(0)}>
        <Mascot pose="thinking" size={92} motion="float" />
      </Animated.View>
      <Animated.Text
        entering={skipEnter ? undefined : appearDown(80, 350)}
        style={[styles.emptyTitle, { color: colors.foreground }]}
      >
        You are winning
      </Animated.Text>
      <Animated.Text
        entering={skipEnter ? undefined : appearDown(160, 350)}
        style={[styles.emptyText, { color: colors.mutedForeground }]}
      >
        Nobody has turned up to challenge you yet.
      </Animated.Text>

      <Animated.View
        entering={skipEnter ? undefined : appearDown(240, 350)}
        style={styles.ghostBoardWrap}
      >
        <GhostLeaderboard />
      </Animated.View>

      <Animated.Text
        entering={skipEnter ? undefined : appearDown(320, 350)}
        style={[styles.emptyText, { color: colors.mutedForeground }]}
      >
        Add a friend by their code above, or share yours and let them add you.
      </Animated.Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Leaderboard tab
// ---------------------------------------------------------------------------

function LeaderboardTab() {
  const colors = useColors();
  const skipEnter = useAppearSkip();
  // TWO LEADERBOARDS DISAGREEING IS THE BUG, reported that way on 2026-08-25:
  // "looks like we have 2 leaderboards, one when you click the add friends
  // button on homescreen". This tab has always had its own board, and when the
  // Friends/Everyone toggle landed on the leaderboard screen and the home card
  // this one silently stayed friends-only, so the same learner saw different
  // standings depending on which door they came through. Same control, same
  // default, same gate as the other two now.
  const [scope, setScope] = React.useState<BoardScope>('all');
  const { username, loaded: nameLoaded } = useMyPublicName();
  // THE WEEK, LIKE THE LEADERBOARD SCREEN (build 22). This tab fetched
  // all-time XP while the screen home links to fetched the week, so the same
  // learner was #4 here and #7 there, and the "since you last looked" arrows
  // compared one board's snapshot with the other's. Seen on the simulator the
  // first time both drew the shared board; one window ends it.
  const boardParams: GetFriendsLeaderboardParams = { scope, window: 'week' };
  const leaderboard = useGetFriendsLeaderboard(boardParams, {
    query: { queryKey: getGetFriendsLeaderboardQueryKey(boardParams) },
  });

  const rows = leaderboard.data ?? [];
  const onlySelf = rows.length === 1 && rows[0]?.isSelf;
  // THE SAME BOARD AS THE LEADERBOARD SCREEN (build 22): the podium, the
  // rows, the XP or Streak pills and the weekly race bar are shared
  // components over shared arithmetic, so this tab cannot drift from the
  // screen home links to. It used to draw its own rows.
  const [metric, setMetric] = React.useState<BoardMetric>('xp');
  const ranked = React.useMemo(() => rankEntries(rows, metric), [rows, metric]);
  const selfIndex = ranked.findIndex((e) => e.isSelf);
  const selfRank = selfIndex >= 0 ? selfIndex + 1 : null;
  const deltas = useRankDeltas(
    leaderboard.data ? `${scope}:${metric}:${weekKey(new Date())}` : null,
    ranked,
  );

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
      <View style={{ marginBottom: 12, marginTop: 4 }}>
        <BoardScopeToggle scope={scope} onChange={setScope} />
      </View>

      {scope === 'all' && nameLoaded && !username ? (
        <View style={{ marginBottom: 12 }}>
          <PublicNamePrompt />
        </View>
      ) : null}

      <View style={{ gap: 12, marginBottom: 14 }}>
        <MetricToggle metric={metric} onChange={setMetric} />
        <WeeklyRaceBar
          rank={leaderboard.data ? selfRank : null}
          delta={selfIndex >= 0 ? deltas[ranked[selfIndex].userId] : undefined}
          metricLabel={metric === 'xp' ? 'XP' : 'streak'}
        />
      </View>

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
          <LeaderboardBoard ranked={ranked} metric={metric} deltas={deltas} scope={scope} />
          {onlySelf && scope === 'friends' ? (
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

function EmptyLeaderboard() {
  const colors = useColors();
  // Same mount-only entrance + appear-guard pattern as EmptyFriends.
  const skipEnter = useAppearSkip();
  return (
    <View style={styles.emptyState}>
      <Animated.View
        entering={skipEnter ? undefined : appearZoom(0)}
      >
        <Mascot pose="cheer" size={92} motion="float" />
      </Animated.View>
      <Animated.Text
        entering={skipEnter ? undefined : appearDown(80, 350)}
        style={[styles.emptyTitle, { color: colors.foreground }]}
      >
        Nothing to rank yet
      </Animated.Text>
      <Animated.Text
        entering={skipEnter ? undefined : appearDown(160, 350)}
        style={[styles.emptyText, { color: colors.mutedForeground }]}
      >
        Add friends and keep practicing — your XP across every language decides
        the standings.
      </Animated.Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Row mascots
//
// An outfit costs 40 Chai and, until now, only the learner who bought it could
// see it. Friend and leaderboard rows are the one place anybody else does, so
// a row shows that learner's Bolo wearing what they have on — mobile rows used
// to show initials and no mascot at all.
//
// The numbers were settled by LOOKING at rendered thumbnails, not by reasoning
// about them. At the old 44px circle, with the whole 1024 frame contained
// inside it, a kurta and a sherwani are two coloured smudges. Two changes fix
// that: the circle grows to 56px, and the frame is cropped to the bird MINUS
// HER FEET — a 745px window at (125, 55) of the 1024 frame — which magnifies
// her ~1.37x inside the same circle. The crop deliberately stops short of the
// "upper body": the garments hang on her belly and the hem and placket are
// exactly what separate the two cream ones.
//
// Kept in step with the web row (gujarati-coach/src/pages/friends.tsx).
// ---------------------------------------------------------------------------
const ROW_AVATAR_PX = 56;
const ROW_CROP = { frame: 1024, window: 745, x: 125, y: 55 } as const;
const ROW_MASCOT_PX = Math.round(
  (ROW_AVATAR_PX * ROW_CROP.frame) / ROW_CROP.window,
);
const ROW_MASCOT_LEFT = -Math.round(
  (ROW_CROP.x / ROW_CROP.frame) * ROW_MASCOT_PX,
);
const ROW_MASCOT_TOP = -Math.round(
  (ROW_CROP.y / ROW_CROP.frame) * ROW_MASCOT_PX,
);

// One pose on every row: "wave". Front-facing and friendly, and — unlike
// thumbsup or thinking, where a wing crosses the chest — nothing covers the
// garment. (tryagain is the most neutral stance but wears a worried face,
// which is not what you want beside a friend's name.)
const ROW_MASCOT_POSE = 'wave' as const;

/**
 * A row avatar: the learner's mascot, dressed, cropped into a circle.
 *
 * `outfit`/`accessory` are passed EXPLICITLY (null included). Left undefined,
 * <Mascot> falls back to the *viewer's* equipped outfit, which would paint
 * every friend in the reader's own clothes.
 */
function MascotAvatar({
  user,
  onPrimary,
}: {
  user: {
    equippedOutfit?: string | null;
    equippedAccessory?: string | null;
  };
  onPrimary?: boolean;
}) {
  const colors = useColors();
  return (
    <View
      testID="row-mascot"
      accessible={false}
      style={[
        styles.rowMascot,
        {
          backgroundColor: onPrimary
            ? 'rgba(255,255,255,0.22)'
            : `${colors.primary}1F`,
        },
      ]}
    >
      <View style={styles.rowMascotInner}>
        <Mascot
          pose={ROW_MASCOT_POSE}
          size={ROW_MASCOT_PX}
          motion="none"
          entering={false}
          outfit={user.equippedOutfit ?? null}
          accessory={user.equippedAccessory ?? null}
        />
      </View>
    </View>
  );
}

function Avatar({
  user,
  muted,
  onPrimary,
}: {
  user: { displayName?: string | null };
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
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 16,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
  },
  secondaryBtnText: { fontFamily: AppFonts.bold, fontSize: 14 },
  linkText: { fontFamily: AppFonts.bold, fontSize: 14 },
  codeText: {
    fontFamily: AppFonts.extrabold,
    fontSize: 28,
    letterSpacing: 6,
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
  rowMascot: {
    width: ROW_AVATAR_PX,
    height: ROW_AVATAR_PX,
    borderRadius: ROW_AVATAR_PX / 2,
    overflow: 'hidden',
  },
  // Absolutely positioned so the oversized mascot is CROPPED by the circle
  // above rather than laying out at its own size and shoving the row wider.
  rowMascotInner: {
    position: 'absolute',
    left: ROW_MASCOT_LEFT,
    top: ROW_MASCOT_TOP,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: AppFonts.extrabold, fontSize: 15 },
  ghostBoardWrap: { alignSelf: 'stretch', marginTop: 6 },
  ghostBoard: { gap: 10 },
  ghostAvatar: { width: 40, height: 40, borderRadius: 20 },
  ghostBar: { height: 10, borderRadius: 5 },
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
