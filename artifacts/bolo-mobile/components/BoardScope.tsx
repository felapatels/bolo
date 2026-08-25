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
import {
  useGetAccount,
  useReportUsername,
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
 * Report someone's public name.
 *
 * THE OTHER HALF OF THE SCREEN. The write-time profanity check catches the
 * obvious and nothing else: it cannot read intent, it does not know every
 * language's slang, and it will never catch a name that is only offensive in
 * context or only offensive to the person being impersonated. Bolo teaches
 * children, so the two ship together or neither should.
 *
 * ALWAYS ACKNOWLEDGES, NEVER CONFIRMS AN OUTCOME. The server drops reports
 * silently past a rolling cap and nothing auto-hides a name, so "somebody will
 * look" is the only honest thing to say.
 */
export function ReportUsernameButton({
  userId,
  username,
}: {
  userId: string;
  username: string | null;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const report = useReportUsername();

  if (!username) return null;

  return (
    <>
      <Pressable
        testID={`report-username-${userId}`}
        accessibilityRole="button"
        accessibilityLabel={`Report ${username}`}
        hitSlop={8}
        onPress={() => {
          hapticLight();
          setOpen(true);
        }}
        style={styles.flagBtn}
      >
        <Feather name="flag" size={14} color={colors.mutedForeground} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {sent ? (
              <>
                <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Thanks</Text>
                <Text style={[styles.sheetBody, { color: colors.mutedForeground }]}>
                  Somebody will look at this name. Nothing changes on your screen
                  in the meantime.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setOpen(false);
                    setSent(false);
                  }}
                  style={[styles.cta, { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.ctaText, { color: colors.primaryForeground }]}>
                    Done
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                  Report {username}
                </Text>
                <Text style={[styles.sheetBody, { color: colors.mutedForeground }]}>
                  What is wrong with this name?
                </Text>
                {REPORT_REASONS.map((r) => (
                  <Pressable
                    key={r.value}
                    testID={`report-reason-${r.value}`}
                    accessibilityRole="button"
                    disabled={report.isPending}
                    onPress={async () => {
                      try {
                        await report.mutateAsync({ id: userId, data: { reason: r.value } });
                      } catch {
                        // Deliberately swallowed. A report that fails to send is
                        // not the reporter's problem, and an error here reads as
                        // "your report was wrong".
                      }
                      setSent(true);
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
                  onPress={() => setOpen(false)}
                  style={styles.cancel}
                >
                  <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>
                    Cancel
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
  cancel: { alignItems: 'center', paddingVertical: 10 },
  cancelText: { fontFamily: AppFonts.bold, fontSize: 14 },
});
