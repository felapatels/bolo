import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useUser, isClerkAPIResponseError } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import { getGetAccountQueryKey } from '@workspace/api-client-react';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { ChunkyButton } from '@/components/ChunkyButton';
import { Field } from '@/components/AuthShell';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

// The email resource returned by user.createEmailAddress, typed off the User
// resource so we don't need to import Clerk's internal types directly.
type PendingEmail = NonNullable<
  Awaited<ReturnType<NonNullable<ReturnType<typeof useUser>['user']>['createEmailAddress']>>
>;

/**
 * Change email via Clerk's client flow: add the new address, verify it with a
 * code, then promote it to primary. We go through Clerk (not the backend admin
 * endpoints) so the address is properly verified before it takes effect.
 */
export default function ChangeEmailScreen() {
  const colors = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useUser();

  const [step, setStep] = React.useState<'enter' | 'verify'>('enter');
  const [email, setEmail] = React.useState('');
  const [code, setCode] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();
  const [busy, setBusy] = React.useState(false);
  const pending = React.useRef<PendingEmail | null>(null);

  const currentEmail = user?.primaryEmailAddress?.emailAddress ?? '—';

  const sendCode = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError('Enter an email address.');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const created = await user?.createEmailAddress({ email: trimmed });
      if (!created) throw new Error('no-user');
      await created.prepareVerification({ strategy: 'email_code' });
      pending.current = created;
      setStep('verify');
    } catch (err) {
      setError(clerkMessage(err, 'We couldn’t start the change. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async () => {
    if (!code.trim()) {
      setError('Enter the code we emailed you.');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const verified = await pending.current?.attemptVerification({ code: code.trim() });
      if (!verified) throw new Error('no-pending');
      await user?.update({ primaryEmailAddressId: verified.id });
      // Remove any other addresses so the new one is unambiguously the account
      // email; ignore failures (Clerk config may disallow it).
      await Promise.all(
        (user?.emailAddresses ?? [])
          .filter((e) => e.id !== verified.id)
          .map((e) => e.destroy().catch(() => {})),
      );
      await user?.reload();
      qc.invalidateQueries({ queryKey: getGetAccountQueryKey() });
      Alert.alert('Email updated', 'Your account email has been changed.');
      router.back();
    } catch (err) {
      setError(clerkMessage(err, 'That code didn’t work. Please try again.'));
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
        <Text style={[styles.headerLabel, { color: colors.foreground }]}>Change email</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: TAB_BAR_CLEARANCE }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.current, { color: colors.mutedForeground }]}>
          Current email{'\n'}
          <Text style={{ color: colors.foreground, fontFamily: AppFonts.semibold }}>
            {currentEmail}
          </Text>
        </Text>

        {step === 'enter' ? (
          <>
            <Field
              label="New email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              error={error}
            />
            <ChunkyButton
              title="Send verification code"
              icon="mail"
              onPress={sendCode}
              loading={busy}
              style={{ marginTop: 8, alignSelf: 'stretch' }}
            />
          </>
        ) : (
          <>
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              Enter the 6-digit code we sent to {email.trim().toLowerCase()}.
            </Text>
            <Field
              label="Verification code"
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              keyboardType="number-pad"
              autoComplete="one-time-code"
              error={error}
            />
            <ChunkyButton
              title="Confirm new email"
              icon="check"
              onPress={confirmCode}
              loading={busy}
              style={{ marginTop: 8, alignSelf: 'stretch' }}
            />
            <Pressable
              onPress={() => {
                setStep('enter');
                setCode('');
                setError(undefined);
              }}
              style={styles.linkBtn}
            >
              <Text style={[styles.linkText, { color: colors.primary }]}>
                Use a different email
              </Text>
            </Pressable>
          </>
        )}
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
  current: {
    fontFamily: AppFonts.regular,
    fontSize: 13,
    lineHeight: 22,
    marginTop: 8,
    marginBottom: 24,
  },
  hint: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  linkBtn: { alignItems: 'center', paddingVertical: 18 },
  linkText: { fontFamily: AppFonts.semibold, fontSize: 14 },
});
