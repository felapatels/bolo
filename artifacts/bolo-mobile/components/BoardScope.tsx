// Whose numbers you are looking at, and the gate in front of the global view.
//
// Web twin: src/components/board-scope.tsx. Keep both in step.
//
// Added 2026-08-25 with the global feed: "what if we show all app users on
// feed leaderboard but then you can toggle between friends only or all users?
// this way the feed is always active."
//
// EVERYONE IS THE DEFAULT, which is what was asked for, and it is safe to
// default that way ONLY because of the gate below: the global view shows other
// learners immediately and shows nothing of YOURS until you have chosen a
// public name. Consent is an act, not a checkbox somebody has to find.
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetAccount,
  useReportUsername,
  useBlockUser,
  useUnblockUser,
  useListBlockedUsers,
  type UsernameReportInputReason,
} from '@workspace/api-client-react';
import { AppFonts } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';
import { hapticLight } from '@/lib/haptics';

export type BoardScope = 'friends' | 'all';

/** The learner's own public name, and whether they are on global surfaces. */
export function useMyPublicName(): {
  username: string | null;
  shareStats: boolean;
  /** True once the account has loaded, so callers do not flash the gate. */
  loaded: boolean;
} {
  const { data } = useGetAccount();
  const profile = data?.profile;
  return {
    username: profile?.username ?? null,
    shareStats: profile?.shareStats ?? true,
    loaded: !!profile,
  };
}

/**
 * The segmented Friends / Everyone control. Two buttons rather than a switch:
 * a switch has an implied "on", and neither of these is more on than the other.
 */
export function BoardScopeToggle({
  scope,
  onChange,
}: {
  scope: BoardScope;
  onChange: (next: BoardScope) => void;
}) {
  const colors = useColors();
  const options: { value: BoardScope; label: string; icon: 'users' | 'globe' }[] =
    [
      { value: 'friends', label: 'Friends', icon: 'users' },
      { value: 'all', label: 'Everyone', icon: 'globe' },
    ];
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel="Whose stats to show"
      style={[styles.toggle, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      {options.map((o) => {
        const on = scope === o.value;
        return (
          <Pressable
            key={o.value}
            testID={`board-scope-${o.value}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            onPress={() => {
              hapticLight();
              onChange(o.value);
            }}
            style={[
              styles.toggleBtn,
              on && { backgroundColor: colors.primary },
            ]}
          >
            <Feather
              name={o.icon}
              size={14}
              color={on ? colors.primaryForeground : colors.mutedForeground}
            />
            <Text
              style={[
                styles.toggleLabel,
                { color: on ? colors.primaryForeground : colors.mutedForeground },
              ]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The line shown on a global surface to a learner with no public name yet.
 *
 * IT DOES NOT BLOCK THE VIEW. They can read the global board and feed without
 * a username; what they cannot do is appear on it. Hiding other people's
 * progress behind a name prompt would be using the feature as leverage.
 */
export function PublicNamePrompt() {
  const colors = useColors();
  const router = useRouter();
  return (
    <View
      testID="public-name-prompt"
      style={[styles.prompt, { borderColor: colors.border, backgroundColor: colors.card }]}
    >
      <Text style={[styles.promptTitle, { color: colors.foreground }]}>
        You are not on this board yet
      </Text>
      <Text style={[styles.promptBody, { color: colors.mutedForeground }]}>
        Pick a username and your stats join everyone else's. Until then you can
        look, and nobody can see you.
      </Text>
      <Pressable
        accessibilityRole="button"
        testID="public-name-prompt-cta"
        onPress={() => {
          hapticLight();
          router.push('/(app)/account');
        }}
      >
        <Text style={[styles.promptLink, { color: colors.primary }]}>
          Pick a username
        </Text>
      </Pressable>
    </View>
  );
}

const REPORT_REASONS: { value: UsernameReportInputReason; label: string }[] = [
  { value: 'offensive', label: 'Offensive or hateful' },
  { value: 'impersonation', label: 'Pretending to be someone' },
  { value: 'personal_information', label: 'Contains personal information' },
  { value: 'other', label: 'Something else' },
];

/**
 * The safety control on another learner's row: report the name, or block them.
 *
 * ONE ENTRY POINT, TWO ACTIONS. App Store Review Guideline 1.2 asks for
 * filtering, reporting AND blocking on user-generated content. Bolo shipped
 * the first two on 2026-08-25 (the write-time profanity screen and the report
 * path) and this adds the third. They share a button because a leaderboard row
 * is a cramped place and two icons there read as clutter rather than as
 * safety, and because a learner upset enough to open this menu should find
 * both remedies in one place rather than guessing which icon is which.
 *
 * THE TWO ARE NOT THE SAME PROMISE and the copy says so. A report goes to a
 * queue somebody reads later and changes nothing on screen. A block takes
 * effect on the next read and is the only one of the two that gives the
 * learner relief now.
 *
 * ALWAYS AVAILABLE, even for a learner who never chose a username: they appear
 * under a stable pseudonym rather than not at all, so "you can block anybody
 * you can see" has to hold for them too.
 *
 * Web twin: src/components/board-scope.tsx LearnerSafetyButton. Keep in step.
 */
export function LearnerSafetyButton({
  userId,
  username,
}: {
  userId: string;
  username: string | null;
}) {
  type View = 'menu' | 'reasons' | 'sent' | 'confirmBlock' | 'blocked';
  const colors = useColors();
  const [view, setView] = useState<View | null>(null);
  const report = useReportUsername();
  const block = useBlockUser();
  const queryClient = useQueryClient();

  // The pseudonym arrives in `username` from the caller, so this fallback is
  // for a row with no name of any kind rather than for an unnamed learner.
  const name = username ?? 'this learner';
  const busy = report.isPending || block.isPending;

  return (
    <>
      <Pressable
        testID={`report-username-${userId}`}
        accessibilityRole="button"
        accessibilityLabel={`Report or block ${name}`}
        hitSlop={8}
        onPress={() => {
          hapticLight();
          setView('menu');
        }}
        style={styles.flagBtn}
      >
        <Feather name="flag" size={14} color={colors.mutedForeground} />
      </Pressable>
      <Modal
        visible={view !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setView(null)}
      >
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {view === 'menu' && (
              <>
                <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{name}</Text>
                <Text style={[styles.sheetBody, { color: colors.mutedForeground }]}>
                  What would you like to do?
                </Text>
                <Pressable
                  testID={`safety-report-${userId}`}
                  accessibilityRole="button"
                  onPress={() => setView('reasons')}
                  style={[styles.reason, { borderColor: colors.border }]}
                >
                  <Text style={[styles.reasonText, { color: colors.foreground }]}>
                    Report this name
                  </Text>
                  <Text style={[styles.reasonSub, { color: colors.mutedForeground }]}>
                    Somebody will look at it. Nothing changes on your screen.
                  </Text>
                </Pressable>
                <Pressable
                  testID={`safety-block-${userId}`}
                  accessibilityRole="button"
                  onPress={() => setView('confirmBlock')}
                  style={[styles.reason, { borderColor: colors.border }]}
                >
                  <Text style={[styles.reasonText, { color: colors.foreground }]}>
                    Block {name}
                  </Text>
                  <Text style={[styles.reasonSub, { color: colors.mutedForeground }]}>
                    You stop seeing each other straight away.
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setView(null)}
                  style={styles.cancel}
                >
                  <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>
                    Cancel
                  </Text>
                </Pressable>
              </>
            )}

            {view === 'confirmBlock' && (
              <>
                <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                  Block {name}?
                </Text>
                {/* Says what actually happens, including the part people are
                    surprised by: blocking removes the friendship. Burying that
                    is how a safety control turns into a support ticket. */}
                <Text style={[styles.sheetBody, { color: colors.mutedForeground }]}>
                  You will not see each other on the feed or the leaderboard, and
                  if you are friends that ends too. They are not told. You can
                  undo this in Account.
                </Text>
                <Pressable
                  testID={`safety-block-confirm-${userId}`}
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={async () => {
                    try {
                      await block.mutateAsync({ id: userId });
                    } catch {
                      // Swallowed like the report path. A block that failed to
                      // send is not the learner's problem to solve, and the
                      // list refresh below shows the truth either way.
                    }
                    // Everything that lists other learners has to re-read: the
                    // block is enforced in the server's where clause, so a
                    // stale cache would keep the row on screen and read as the
                    // control having done nothing.
                    await queryClient.invalidateQueries();
                    setView('blocked');
                  }}
                  style={[styles.cta, { backgroundColor: colors.destructive }]}
                >
                  <Text style={[styles.ctaText, { color: colors.destructiveForeground }]}>
                    {busy ? 'Blocking...' : `Block ${name}`}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setView('menu')}
                  style={styles.cancel}
                >
                  <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>
                    Back
                  </Text>
                </Pressable>
              </>
            )}

            {view === 'blocked' && (
              <>
                <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Blocked</Text>
                <Text style={[styles.sheetBody, { color: colors.mutedForeground }]}>
                  You will not see {name} any more. Account has the list if you
                  change your mind.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setView(null)}
                  style={[styles.cta, { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.ctaText, { color: colors.primaryForeground }]}>Done</Text>
                </Pressable>
              </>
            )}

            {view === 'sent' && (
              <>
                <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Thanks</Text>
                <Text style={[styles.sheetBody, { color: colors.mutedForeground }]}>
                  Somebody will look at this name. Nothing changes on your screen
                  in the meantime.
                </Text>
                {/* The offer to block sits here on purpose: a learner who just
                    reported somebody is exactly the learner who wants relief
                    now, and the report alone gives them none. */}
                <Pressable
                  testID={`safety-block-after-report-${userId}`}
                  accessibilityRole="button"
                  onPress={() => setView('confirmBlock')}
                  style={[styles.reason, { borderColor: colors.border }]}
                >
                  <Text style={[styles.reasonText, { color: colors.foreground }]}>
                    Block them as well
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setView(null)}
                  style={[styles.cta, { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.ctaText, { color: colors.primaryForeground }]}>Done</Text>
                </Pressable>
              </>
            )}

            {view === 'reasons' && (
              <>
                <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                  Report {name}
                </Text>
                <Text style={[styles.sheetBody, { color: colors.mutedForeground }]}>
                  What is wrong with this name?
                </Text>
                {REPORT_REASONS.map((r) => (
                  <Pressable
                    key={r.value}
                    testID={`report-reason-${r.value}`}
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={async () => {
                      try {
                        await report.mutateAsync({ id: userId, data: { reason: r.value } });
                      } catch {
                        // Deliberately swallowed. A report that fails to send is
                        // not the reporter's problem, and an error here reads as
                        // "your report was wrong".
                      }
                      setView('sent');
                    }}
                    style={[styles.reason, { borderColor: colors.border }]}
                  >
                    <Text style={[styles.reasonText, { color: colors.foreground }]}>
                      {r.label}
                    </Text>
                  </Pressable>
                ))}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setView('menu')}
                  style={styles.cancel}
                >
                  <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>
                    Back
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

/**
 * The blocked-learners list, and the only way back from a block.
 *
 * A BLOCK WITH NO WAY BACK IS A TRAP, NOT A CONTROL. Guideline 1.2 wants
 * blocking to be reachable; a learner who blocked somebody by accident, or who
 * has since made up with them, needs this list to exist or their only remedy
 * is deleting the account.
 *
 * RENDERS NOTHING WHEN THE LIST IS EMPTY, which is almost everybody. An empty
 * "Blocked" section on every account screen teaches learners that blocking is
 * expected, and the setting is only interesting once it has something in it.
 *
 * Web twin: src/components/board-scope.tsx BlockedLearnersList. Keep in step.
 */
export function BlockedLearnersList() {
  const colors = useColors();
  const { data, isLoading } = useListBlockedUsers();
  const unblock = useUnblockUser();
  const queryClient = useQueryClient();

  if (isLoading || !data || data.length === 0) return null;

  return (
    <View style={styles.blockedWrap} testID="blocked-learners">
      <Text style={[styles.blockedTitle, { color: colors.foreground }]}>
        Blocked learners
      </Text>
      <Text style={[styles.blockedBody, { color: colors.mutedForeground }]}>
        You do not see each other on the Everyone board or feed. Unblocking does
        not make you friends again.
      </Text>
      {data.map((row) => (
        <View
          key={row.userId}
          testID={`blocked-row-${row.userId}`}
          style={[styles.blockedRow, { borderColor: colors.border }]}
        >
          <Text
            numberOfLines={1}
            style={[styles.blockedName, { color: colors.foreground }]}
          >
            {row.displayName}
          </Text>
          <Pressable
            testID={`unblock-${row.userId}`}
            accessibilityRole="button"
            disabled={unblock.isPending}
            onPress={async () => {
              try {
                await unblock.mutateAsync({ id: row.userId });
              } catch {
                // Swallowed, same as the block path. The refetch below is what
                // tells the learner whether it worked.
              }
              await queryClient.invalidateQueries();
            }}
            style={[styles.unblockBtn, { borderColor: colors.border }]}
          >
            <Text style={[styles.unblockText, { color: colors.foreground }]}>
              Unblock
            </Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: {
    alignSelf: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
  toggleBtn: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  toggleLabel: { fontFamily: AppFonts.bold, fontSize: 13 },
  prompt: {
    borderRadius: 18,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: 4,
    padding: 14,
  },
  promptTitle: { fontFamily: AppFonts.bold, fontSize: 14 },
  promptBody: { fontFamily: AppFonts.regular, fontSize: 13, lineHeight: 18 },
  promptLink: { fontFamily: AppFonts.bold, fontSize: 13, marginTop: 4 },
  flagBtn: { marginLeft: 6, padding: 2 },
  backdrop: {
    alignItems: 'center',
    backgroundColor: '#00000088',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
    maxWidth: 380,
    padding: 20,
    width: '100%',
  },
  sheetTitle: { fontFamily: AppFonts.extrabold, fontSize: 19 },
  sheetBody: { fontFamily: AppFonts.regular, fontSize: 14, lineHeight: 20 },
  reason: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  reasonText: { fontFamily: AppFonts.bold, fontSize: 14 },
  cta: { alignItems: 'center', borderRadius: 14, marginTop: 4, paddingVertical: 13 },
  ctaText: { fontFamily: AppFonts.bold, fontSize: 15 },
  reasonSub: { fontFamily: AppFonts.regular, fontSize: 12, lineHeight: 16, marginTop: 2 },
  blockedWrap: { gap: 8 },
  blockedTitle: { fontFamily: AppFonts.bold, fontSize: 14 },
  blockedBody: { fontFamily: AppFonts.regular, fontSize: 12, lineHeight: 17 },
  blockedRow: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  blockedName: { flex: 1, fontFamily: AppFonts.bold, fontSize: 14 },
  unblockBtn: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  unblockText: { fontFamily: AppFonts.bold, fontSize: 12 },
  cancel: { alignItems: 'center', paddingVertical: 10 },
  cancelText: { fontFamily: AppFonts.bold, fontSize: 14 },
});
