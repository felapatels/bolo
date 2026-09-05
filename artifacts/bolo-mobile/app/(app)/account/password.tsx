import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useUser, isClerkAPIResponseError } from '@clerk/expo';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { ChunkyButton } from '@/components/ChunkyButton';
import { Field } from '@/components/AuthShell';
import { PasswordChecklist } from '@/components/PasswordChecklist';
import { passwordProblem, PASSWORD_MIN_LENGTH } from '@/lib/passwordRules';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

/**
 * Change (or set) the account password via Clerk's client flow. Learners who
 * signed up with a social provider have no password yet, so we only ask for the
 * current one when Clerk reports the account already has a password.
 */
export default function ChangePasswordScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useUser();

  const hasPassword = user?.passwordEnabled ?? false;

  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    setError(undefined);
    if (hasPassword && !current) {
      setError('Enter your current password.');
      return;
    }
    // Build 19: the same rules the checklist under the field ticks live.
    const problem = passwordProblem(next);
    if (problem) {
      setError(problem);
      return;
    }
    if (next !== confirm) {
      setError('The new passwords don’t match.');
      return;
    }
    setBusy(true);
    try {
      await user?.updatePassword({
        newPassword: next,
        ...(hasPassword ? { currentPassword: current } : {}),
        signOutOfOtherSessions: true,
      });
      Alert.alert(
        hasPassword ? 'Password changed' : 'Password set',
        'Your password has been updated.',
      );
      router.back();
    } catch (err) {
      setError(clerkMessage(err, 'We couldn’t update your password. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

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
          {hasPassword ? 'Change password' : 'Set password'}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: TAB_BAR_CLEARANCE }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!hasPassword ? (
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            You signed in with a social account. Set a password to also sign in
            with your email.
          </Text>
        ) : null}

        {hasPassword ? (
          <Field
            label="Current password"
            value={current}
            onChangeText={setCurrent}
            placeholder="Your current password"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
          />
        ) : null}
        <Field
          label="New password"
          value={next}
          onChangeText={setNext}
          placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
        />
        <PasswordChecklist password={next} />
        <Field
          label="Confirm new password"
          value={confirm}
          onChangeText={setConfirm}
          placeholder="Re-enter new password"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          error={error}
        />
        <ChunkyButton
          title={hasPassword ? 'Update password' : 'Set password'}
          icon="lock"
          onPress={submit}
          loading={busy}
          style={{ marginTop: 8, alignSelf: 'stretch' }}
        />
      </ScrollView>
    </Screen>
  );
}

function clerkMessage(err: unknown, fallback: string): string {
  if (isClerkAPIResponseError(err)) {
    return err.errors[0]?.longMessage ?? err.errors[0]?.message ?? fallback;
  }
  return fallback;
}

const styles = StyleSheet.create({
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
  hint: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 20,
  },
});
