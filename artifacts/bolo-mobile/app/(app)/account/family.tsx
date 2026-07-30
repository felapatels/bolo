import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetFamily,
  getGetFamilyQueryKey,
  useCreateFamilyInvite,
  useRevokeFamilyInvite,
  useRemoveFamilyMember,
  useLeaveFamily,
  useRegenerateFamilyCode,
  useJoinFamily,
  getGetEntitlementsQueryKey,
  ApiError,
  type FamilyStatus,
  type FamilySeat,
  type JoinFamily200,
} from '@workspace/api-client-react';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { ChunkyButton } from '@/components/ChunkyButton';
import { FunFactLoader } from '@/components/FunFactLoader';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

/** Server-provided error string when present, otherwise a fallback. */
function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const data = err.data as { error?: unknown } | undefined;
    if (data && typeof data.error === 'string') return data.error;
  }
  return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * Family plan management — the mobile counterpart of the web /family page.
 *
 * Renders by the caller's server-resolved role: an owner sees seats, invites
 * (email + shareable join code via the native share sheet) and member removal;
 * a member sees whose plan they're on and can leave; everyone else gets the
 * Family upsell plus a join-code entry so an invited learner can claim a seat
 * right from the phone. All state changes go through the existing family
 * endpoints; after any change we re-read the family status and entitlements —
 * the server stays the sole authority on who has Plus.
 */
export default function FamilyScreen() {
  const colors = useColors();
  const router = useRouter();
  const family = useGetFamily();
  const params = useLocalSearchParams<{ invite?: string }>();
  const inviteToken = typeof params.invite === 'string' ? params.invite : null;

  const data = family.data;

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.card }]}
        >
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerLabel, { color: colors.foreground }]}>
          Family plan
        </Text>
        <View style={{ width: 44 }} />
      </View>

      {family.isLoading ? (
        <FunFactLoader color={colors.primary} style={{ marginTop: 48 }} />
      ) : family.isError || !data ? (
        <View style={styles.centerState}>
          <Feather name="alert-circle" size={32} color={colors.mutedForeground} />
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
            Bolo couldn't load your family plan right now 🥭 — check your
            connection and try again.
          </Text>
          <ChunkyButton
            title="Retry"
            icon="refresh-cw"
            onPress={() => family.refetch()}
            style={{ marginTop: 6, alignSelf: 'stretch' }}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: TAB_BAR_CLEARANCE,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {data.role === 'owner' ? (
            <OwnerView family={data} />
          ) : data.role === 'member' ? (
            <MemberView family={data} />
          ) : (
            <JoinView inviteToken={inviteToken} />
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

// ------------------------------- owner view -------------------------------

function OwnerView({ family }: { family: FamilyStatus }) {
  const colors = useColors();
  const qc = useQueryClient();
  const [email, setEmail] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = React.useState<FamilySeat | null>(
    null,
  );

  const invite = useCreateFamilyInvite();
  const revoke = useRevokeFamilyInvite();
  const remove = useRemoveFamilyMember();
  const regenerate = useRegenerateFamilyCode();

  const seats = family.seats ?? [];
  const capacity = family.capacity ?? 4;
  // The owner occupies one seat; the rest are invitable.
  const openSeats = Math.max(0, capacity - 1 - seats.length);
  const seatsInUse = seats.filter((s) => s.status === 'active').length + 1;

  const refresh = React.useCallback(async () => {
    await qc.invalidateQueries({ queryKey: getGetFamilyQueryKey() });
  }, [qc]);

  const clearMessages = () => {
    setError(null);
    setNotice(null);
  };

  const onInvite = async () => {
    clearMessages();
    const target = email.trim();
    if (!target) return;
    try {
      await invite.mutateAsync({ data: { email: target } });
      setNotice(`Invite sent to ${target}.`);
      setEmail('');
      await refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't send the invite. Please try again."));
    }
  };

  const onRevoke = async (seatId: number) => {
    clearMessages();
    try {
      await revoke.mutateAsync({ seatId });
      await refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't revoke the invite."));
    }
  };

  const onRemove = async (seat: FamilySeat) => {
    clearMessages();
    try {
      await remove.mutateAsync({ memberUserId: seat.memberUserId! });
      setConfirmRemove(null);
      // The removed member's entitlements change server-side; the owner's
      // don't, but the seat list does.
      await refresh();
      qc.invalidateQueries({ queryKey: getGetEntitlementsQueryKey() });
    } catch (err) {
      setError(errorMessage(err, "Couldn't remove this member."));
    }
  };

  const onRegenerate = async () => {
    clearMessages();
    try {
      await regenerate.mutateAsync();
      setNotice('New join code generated — the old one no longer works.');
      await refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't generate a new code."));
    }
  };

  // Native share sheet — the mobile-first way to hand the code to family.
  const onShareCode = async () => {
    if (!family.joinCode) return;
    try {
      await Share.share({
        message: `Join my Bolo! family plan and get full All-Access — open Bolo!, go to Account → Family plan, and enter this join code: ${family.joinCode}`,
      });
    } catch {
      // The learner dismissed the sheet or sharing is unavailable — no-op.
    }
  };

  return (
    <>
      {/* Hero */}
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={styles.heroRow}>
          <View style={[styles.heroIcon, { backgroundColor: colors.primary }]}>
            <Feather name="users" size={26} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroTitle, { color: colors.foreground }]}>
              Your family
            </Text>
            <Text style={[styles.heroSub, { color: colors.mutedForeground }]}>
              {seatsInUse} of {capacity} seats in use
            </Text>
          </View>
        </View>
        {family.active === false ? (
          <View style={[styles.warnBox, { backgroundColor: `${colors.gold}24` }]}>
            <Text style={[styles.warnText, { color: colors.foreground }]}>
              Your family subscription isn't active right now, so family members
              are on the Free plan until it resumes.
            </Text>
          </View>
        ) : null}
      </View>

      {/* Seats */}
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
        Seats
      </Text>
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <SeatRow
          icon="award"
          iconColor={colors.primary}
          title="You"
          subtitle="Plan owner · billing & seats"
        />
        {seats.map((seat) => (
          <SeatRow
            key={seat.id}
            icon={seat.status === 'active' ? 'user' : 'mail'}
            iconColor={
              seat.status === 'active' ? colors.success : colors.gold
            }
            title={
              seat.status === 'active'
                ? seat.displayName ?? 'Member'
                : seat.email ?? 'Invited'
            }
            subtitle={seat.status === 'active' ? 'Member' : 'Invite pending'}
            action={
              seat.status === 'pending' ? (
                <SeatActionButton
                  label="Revoke"
                  icon="trash-2"
                  disabled={revoke.isPending}
                  onPress={() => onRevoke(seat.id)}
                />
              ) : (
                <SeatActionButton
                  label="Remove"
                  icon="user-minus"
                  disabled={remove.isPending}
                  onPress={() => setConfirmRemove(seat)}
                />
              )
            }
          />
        ))}
        {Array.from({ length: openSeats }).map((_, i) => (
          <SeatRow
            key={`empty-${i}`}
            icon="user-plus"
            iconColor={colors.mutedForeground}
            title="Open seat"
            subtitle="Invite someone below"
            dim
          />
        ))}
      </View>

      {/* Invite by email */}
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
        Invite by email
      </Text>
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.helpText, { color: colors.mutedForeground }]}>
          They'll get a personal link to claim a seat. Each person's progress
          stays their own.
        </Text>
        <View style={styles.inviteRow}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="their@email.com"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={openSeats > 0 && !invite.isPending}
            style={[
              styles.input,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                color: colors.foreground,
              },
            ]}
          />
          <ChunkyButton
            title="Invite"
            icon="mail"
            onPress={onInvite}
            disabled={openSeats === 0 || invite.isPending || !email.trim()}
            loading={invite.isPending}
          />
        </View>
        {openSeats === 0 ? (
          <Text style={[styles.fullText, { color: colors.mutedForeground }]}>
            Your family plan is full — all {capacity} seats are taken (including
            pending invites).
          </Text>
        ) : null}
      </View>

      {/* Join code */}
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
        Or share your join code
      </Text>
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.helpText, { color: colors.mutedForeground }]}>
          Anyone with this code can claim an open seat from their Family plan
          page.
        </Text>
        <View
          style={[
            styles.codeBox,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.codeText, { color: colors.foreground }]}>
            {family.joinCode}
          </Text>
        </View>
        <ChunkyButton
          title="Share join code"
          icon="share-2"
          variant="secondary"
          onPress={onShareCode}
          style={{ marginTop: 12, alignSelf: 'stretch' }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Generate a new join code"
          onPress={onRegenerate}
          disabled={regenerate.isPending}
          style={styles.regenBtn}
        >
          {regenerate.isPending ? (
            <ActivityIndicator size="small" color={colors.mutedForeground} />
          ) : (
            <Feather name="refresh-cw" size={14} color={colors.mutedForeground} />
          )}
          <Text style={[styles.regenText, { color: colors.mutedForeground }]}>
            Generate a new code (the old one stops working)
          </Text>
        </Pressable>
      </View>

      {notice ? (
        <Text style={[styles.notice, { color: colors.success }]}>{notice}</Text>
      ) : null}
      {error ? (
        <Text style={[styles.errorText, { color: colors.destructive }]}>
          {error}
        </Text>
      ) : null}

      {/* Remove-member confirmation */}
      <Modal
        visible={confirmRemove != null}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmRemove(null)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Remove {confirmRemove?.displayName ?? 'this member'}?
            </Text>
            <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
              They'll drop to the Free plan right away. None of their progress
              or streaks are deleted, and you can invite them back anytime.
            </Text>
            <View style={styles.modalActions}>
              <ChunkyButton
                title="Keep them"
                variant="secondary"
                onPress={() => setConfirmRemove(null)}
                style={{ flex: 1 }}
              />
              <DangerButton
                title={remove.isPending ? 'Removing…' : 'Remove'}
                disabled={remove.isPending}
                onPress={() => confirmRemove && onRemove(confirmRemove)}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function SeatRow({
  icon,
  iconColor,
  title,
  subtitle,
  action,
  dim,
}: {
  icon: keyof typeof Feather.glyphMap;
  iconColor: string;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  dim?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={[styles.seatRow, dim && { opacity: 0.55 }]}>
      <View style={[styles.seatIcon, { backgroundColor: `${iconColor}1A` }]}>
        <Feather name={icon} size={18} color={iconColor} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={[styles.seatTitle, { color: colors.foreground }]}
        >
          {title}
        </Text>
        <Text style={[styles.seatSub, { color: colors.mutedForeground }]}>
          {subtitle}
        </Text>
      </View>
      {action}
    </View>
  );
}

function SeatActionButton({
  label,
  icon,
  onPress,
  disabled,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  disabled?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.seatAction,
        { borderColor: colors.border, opacity: disabled ? 0.6 : 1 },
      ]}
    >
      <Feather name={icon} size={13} color={colors.mutedForeground} />
      <Text style={[styles.seatActionText, { color: colors.mutedForeground }]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ------------------------------- member view ------------------------------

function MemberView({ family }: { family: FamilyStatus }) {
  const colors = useColors();
  const qc = useQueryClient();
  const leave = useLeaveFamily();
  const [error, setError] = React.useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = React.useState(false);

  const ownerName = family.ownerName ?? 'the plan owner';

  const onLeave = async () => {
    setError(null);
    try {
      await leave.mutateAsync();
      setConfirmLeave(false);
      // Leaving changes the caller's own entitlements — re-pull everything
      // server-derived so gates re-lock immediately.
      await qc.invalidateQueries();
    } catch (err) {
      setError(errorMessage(err, "Couldn't leave the plan."));
    }
  };

  return (
    <>
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={styles.heroRow}>
          <View style={[styles.heroIcon, { backgroundColor: colors.primary }]}>
            <Feather name="users" size={26} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroTitle, { color: colors.foreground }]}>
              You're on a family plan
            </Text>
            <Text style={[styles.heroSub, { color: colors.mutedForeground }]}>
              Shared by {ownerName}
            </Text>
          </View>
        </View>
        <Text style={[styles.memberBody, { color: colors.mutedForeground }]}>
          You have full All-Access through this plan — every language, the
          complete phrase library, review, and analytics. Your progress and streaks
          are completely your own; only the plan is shared. Billing is handled
          by {ownerName}, so there's nothing for you to pay or manage.
        </Text>
        {family.active === false ? (
          <View style={[styles.warnBox, { backgroundColor: `${colors.gold}24` }]}>
            <Text style={[styles.warnText, { color: colors.foreground }]}>
              The family subscription isn't active right now, so you're on the
              Free plan until it resumes.
            </Text>
          </View>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Leave this family plan"
        onPress={() => setConfirmLeave(true)}
        style={styles.leaveBtn}
      >
        <Text style={[styles.leaveText, { color: colors.destructive }]}>
          Leave this family plan
        </Text>
      </Pressable>
      {error ? (
        <Text style={[styles.errorText, { color: colors.destructive }]}>
          {error}
        </Text>
      ) : null}

      <Modal
        visible={confirmLeave}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmLeave(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Leave the family plan?
            </Text>
            <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
              You'll drop to the Free plan right away. Your progress and streaks
              are kept.
            </Text>
            <View style={styles.modalActions}>
              <ChunkyButton
                title="Stay"
                variant="secondary"
                onPress={() => setConfirmLeave(false)}
                style={{ flex: 1 }}
              />
              <DangerButton
                title={leave.isPending ? 'Leaving…' : 'Leave'}
                disabled={leave.isPending}
                onPress={onLeave}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ------------------------ join / upsell (role: none) -----------------------

function JoinView({ inviteToken }: { inviteToken: string | null }) {
  const colors = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const join = useJoinFamily();

  const [code, setCode] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [joined, setJoined] = React.useState<JoinFamily200 | null>(null);

  const doJoin = async (body: { code?: string; inviteToken?: string }) => {
    setError(null);
    try {
      const result = await join.mutateAsync({ data: body });
      setJoined(result);
      // Plus should unlock immediately — re-pull everything server-derived.
      await qc.refetchQueries({ queryKey: getGetEntitlementsQueryKey() });
      await qc.invalidateQueries();
    } catch (err) {
      setError(errorMessage(err, "Couldn't join the family plan."));
    }
  };

  if (joined) {
    return (
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={[styles.joinedIcon, { backgroundColor: colors.primary }]}>
          <Feather name="gift" size={28} color="#fff" />
        </View>
        <Text style={[styles.joinedTitle, { color: colors.foreground }]}>
          Welcome to {joined.ownerName}'s family plan!
        </Text>
        <Text style={[styles.helpText, { color: colors.mutedForeground }]}>
          {joined.active
            ? 'You now have full All-Access — every language, the complete phrase library, review, and analytics. Your progress stays completely your own.'
            : "Your seat is saved. The family subscription isn't active right now, so All-Access will unlock as soon as it resumes."}
        </Text>
        {joined.previousSubscriptionCanceled ? (
          <View style={[styles.warnBox, { backgroundColor: `${colors.primary}12` }]}>
            <Text style={[styles.warnText, { color: colors.foreground }]}>
              Your own subscription has ended — you're covered by the family
              plan now, and the unused time was credited back. No double
              billing.
            </Text>
          </View>
        ) : null}
        <ChunkyButton
          title="Start learning"
          icon="arrow-right"
          onPress={() => router.back()}
          style={{ marginTop: 16, alignSelf: 'stretch' }}
        />
      </View>
    );
  }

  return (
    <>
      {inviteToken ? (
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.heroRow}>
            <View style={[styles.heroIcon, { backgroundColor: colors.primary }]}>
              <Feather name="users" size={26} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroTitle, { color: colors.foreground }]}>
                You've been invited!
              </Text>
            </View>
          </View>
          <Text style={[styles.helpText, { color: colors.mutedForeground }]}>
            Accept your seat to get full All-Access through this family plan.
            Your progress and streaks stay completely your own.
          </Text>
          <ChunkyButton
            title="Accept my seat"
            icon="check"
            onPress={() => doJoin({ inviteToken })}
            disabled={join.isPending}
            loading={join.isPending}
            style={{ marginTop: 14, alignSelf: 'stretch' }}
          />
        </View>
      ) : (
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.heroRow}>
            <View style={[styles.heroIcon, { backgroundColor: colors.primary }]}>
              <Feather name="users" size={26} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroTitle, { color: colors.foreground }]}>
                Bolo! Family
              </Text>
              <Text style={[styles.heroSub, { color: colors.mutedForeground }]}>
                All-Access for up to 4 people
              </Text>
            </View>
          </View>
          <Text style={[styles.helpText, { color: colors.mutedForeground }]}>
            Get full All-Access for up to 4 people with one $19.99/mo
            subscription, or join someone else's plan with their code below.
          </Text>
          <ChunkyButton
            title="See plans"
            icon="star"
            onPress={() => router.push('/(app)/paywall')}
            style={{ marginTop: 14, alignSelf: 'stretch' }}
          />
        </View>
      )}

      {/* Join by code — always available so an invited learner can claim a
          seat even without opening the emailed link. */}
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
        Have a join code?
      </Text>
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.helpText, { color: colors.mutedForeground }]}>
          Enter the code the plan owner shared with you to claim an open seat.
        </Text>
        <TextInput
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          placeholder="E.G. K7XM2PWQ"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="characters"
          autoCorrect={false}
          style={[
            styles.input,
            styles.codeInput,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              color: colors.foreground,
            },
          ]}
        />
        <ChunkyButton
          title="Join family plan"
          icon="users"
          onPress={() => code.trim() && doJoin({ code: code.trim() })}
          disabled={join.isPending || !code.trim()}
          loading={join.isPending}
          style={{ marginTop: 12, alignSelf: 'stretch' }}
        />
      </View>

      {error ? (
        <Text style={[styles.errorText, { color: colors.destructive }]}>
          {error}
        </Text>
      ) : null}
    </>
  );
}

/** A destructive confirm button (ChunkyButton has no destructive variant). */
function DangerButton({
  title,
  onPress,
  disabled,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.dangerBtn,
        { backgroundColor: colors.destructive, opacity: disabled ? 0.6 : 1 },
      ]}
    >
      <Text style={[styles.dangerText, { color: '#fff' }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dangerBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    paddingVertical: 15,
  },
  dangerText: { fontFamily: AppFonts.bold, fontSize: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLabel: { fontFamily: AppFonts.bold, fontSize: 18 },
  centerState: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: 40,
    paddingHorizontal: 28,
  },
  stateText: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 20,
  },
  card: {
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontFamily: AppFonts.extrabold, fontSize: 20 },
  heroSub: { fontFamily: AppFonts.semibold, fontSize: 13, marginTop: 3 },
  warnBox: {
    marginTop: 14,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  warnText: { fontFamily: AppFonts.semibold, fontSize: 13, lineHeight: 19 },
  sectionTitle: {
    fontFamily: AppFonts.extrabold,
    fontSize: 16,
    marginTop: 22,
    marginBottom: 10,
    marginLeft: 2,
  },
  helpText: {
    fontFamily: AppFonts.regular,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },
  seatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  seatIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatTitle: { fontFamily: AppFonts.bold, fontSize: 14 },
  seatSub: { fontFamily: AppFonts.regular, fontSize: 12, marginTop: 2 },
  seatAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  seatActionText: { fontFamily: AppFonts.bold, fontSize: 12 },
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: AppFonts.semibold,
    fontSize: 14,
  },
  codeInput: {
    flex: 0,
    marginTop: 12,
    textAlign: 'center',
    fontFamily: AppFonts.extrabold,
    fontSize: 18,
    letterSpacing: 4,
  },
  codeBox: {
    marginTop: 12,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  codeText: {
    fontFamily: AppFonts.extrabold,
    fontSize: 20,
    letterSpacing: 5,
  },
  fullText: {
    fontFamily: AppFonts.semibold,
    fontSize: 12,
    marginTop: 10,
    lineHeight: 17,
  },
  regenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 12,
    paddingVertical: 4,
  },
  regenText: { fontFamily: AppFonts.semibold, fontSize: 12, flex: 1 },
  notice: {
    fontFamily: AppFonts.semibold,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 14,
  },
  errorText: {
    fontFamily: AppFonts.semibold,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 14,
  },
  memberBody: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 14,
  },
  leaveBtn: { alignItems: 'center', paddingVertical: 18, marginTop: 14 },
  leaveText: { fontFamily: AppFonts.bold, fontSize: 15 },
  joinedIcon: {
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
  joinedTitle: {
    fontFamily: AppFonts.extrabold,
    fontSize: 20,
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
  },
  modalTitle: { fontFamily: AppFonts.extrabold, fontSize: 19 },
  modalSub: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
});
