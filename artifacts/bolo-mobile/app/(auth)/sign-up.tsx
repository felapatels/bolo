import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useClerk, useSignUp } from '@clerk/expo';
import { Link, useRouter } from 'expo-router';
import { AuthShell, Field, fieldError } from '@/components/AuthShell';
import { ChunkyButton } from '@/components/ChunkyButton';
import { AppleAuthButton } from '@/components/AppleAuthButton';
import { GoogleAuthButton } from '@/components/GoogleAuthButton';
import {
  authErrorMessage,
  incompleteStateMessage,
  isExpectedUserError,
  reportAuthError,
  reportAuthIncompleteState,
} from '@/lib/authErrors';
import { abandonSignUpAttempt } from '@/lib/abandonSignUp';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

// Every Clerk call here checks its result. A returned error or an
// unexpected status must end in a user-visible message (including the
// status itself) and a Sentry event — never a silent no-op (July 2026
// sign-in incident).

export default function SignUpScreen() {
  const { signUp, errors, fetchStatus } = useSignUp();
  const clerk = useClerk();
  const router = useRouter();
  const colors = useColors();

  const [emailAddress, setEmailAddress] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [code, setCode] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);
  // Local escape from the code step. The step is derived from server state,
  // so without this the screen re-renders itself on every launch and there is
  // no way back to the form (iOS build 34 trap).
  const [returnedToForm, setReturnedToForm] = React.useState(false);
  const [abandoning, setAbandoning] = React.useState(false);

  const busy = fetchStatus === 'fetching';
  const finishNavigate = () => router.replace('/(app)/(tabs)');

  const handleUnexpected = (context: string, error: unknown) => {
    if (isExpectedUserError(error)) return; // field UI already shows these
    reportAuthError(context, error);
    setFormError(authErrorMessage(error));
  };

  const sendCode = async (context: string) => {
    const { error } = await signUp.verifications.sendEmailCode();
    if (error) {
      reportAuthError(context, error);
      setFormError(authErrorMessage(error));
      return false;
    }
    return true;
  };

  const finalizeSignUp = async () => {
    try {
      const { error } = await signUp.finalize({ navigate: finishNavigate });
      if (error) {
        reportAuthError('signUp.finalize', error);
        setFormError(
          `Account created, but opening the app failed (${authErrorMessage(error)}). Please sign in.`,
        );
      }
    } catch (err) {
      reportAuthError('signUp.finalize', err);
      setFormError(
        `Account created, but opening the app failed (${authErrorMessage(err)}). Please sign in.`,
      );
    }
  };

  /** Surface + report any sign-up state we can't route to a next step. */
  const handleUnroutableState = (context: string) => {
    const status = signUp.status ?? 'unknown';
    const missing = signUp.missingFields ?? [];
    setFormError(incompleteStateMessage(status, missing));
    reportAuthIncompleteState(context, status, missing);
  };

  const handleSubmit = async () => {
    setFormError(null);
    // A fresh submit re-enters the code step if Clerk asks for one again.
    setReturnedToForm(false);
    const { error } = await signUp.password({ emailAddress, password });
    if (error) {
      handleUnexpected('signUp.password', error);
      return;
    }
    if (signUp.status === 'complete') {
      await finalizeSignUp();
      return;
    }
    if (
      signUp.status === 'missing_requirements' &&
      signUp.unverifiedFields.includes('email_address')
    ) {
      // Expected path: send the code; the awaiting-code render takes over.
      // If sending fails, sendCode surfaces + reports it.
      await sendCode('signUp.sendEmailCode');
      return;
    }
    // Any other state would leave the user stranded on the form — make the
    // status observable instead.
    handleUnroutableState('signUp.password');
  };

  const handleVerify = async () => {
    setFormError(null);
    const { error } = await signUp.verifications.verifyEmailCode({ code });
    if (error) {
      handleUnexpected('signUp.verifyEmailCode', error);
      return;
    }
    if (signUp.status === 'complete') {
      await finalizeSignUp();
      return;
    }
    // Verified but still not complete — surface the status, don't stall.
    handleUnroutableState('signUp.verifyEmailCode');
  };

  const awaitingCode =
    !returnedToForm &&
    signUp.status === 'missing_requirements' &&
    signUp.unverifiedFields.includes('email_address');

  /** Back out of the code step without touching Clerk state. */
  const backToForm = () => {
    setFormError(null);
    setCode('');
    setReturnedToForm(true);
  };

  /**
   * Abandon the stuck attempt, then return to the email form with the fields
   * cleared. On failure the user still lands on a usable form, with the
   * message the helper produced — never a dead button, never a blank screen.
   */
  const handleUseDifferentEmail = async () => {
    if (!awaitingCode) return; // constraint: pre-session code step only
    setFormError(null);
    setAbandoning(true);
    const result = await abandonSignUpAttempt(clerk);
    setEmailAddress('');
    setPassword('');
    setCode('');
    setReturnedToForm(true);
    setAbandoning(false);
    if (!result.ok) setFormError(result.message);
  };

  const formErrorLine = formError ?? fieldError(errors.raw?.[0]);

  if (awaitingCode) {
    return (
      <AuthShell
        title="Check your email"
        subtitle={`We sent a 6-digit code to ${emailAddress}. Enter it below to finish.`}
      >
        <Field
          label="Verification code"
          keyboardType="number-pad"
          placeholder="123456"
          value={code}
          onChangeText={setCode}
          error={fieldError(errors.fields.code)}
        />
        {formErrorLine ? (
          <Text
            accessibilityRole="alert"
            style={[styles.formError, { color: colors.destructive }]}
          >
            {formErrorLine}
          </Text>
        ) : null}
        <ChunkyButton
          title="Verify & continue"
          icon="check"
          onPress={handleVerify}
          loading={busy}
          disabled={code.length < 6}
          style={{ marginTop: 6 }}
        />
        <Pressable
          style={styles.resend}
          disabled={busy}
          onPress={() => {
            setFormError(null);
            void sendCode('signUp.resendEmailCode');
          }}
        >
          <Text style={[styles.footerLink, { color: colors.secondary }]}>
            Send a new code
          </Text>
        </Pressable>
        {/* Escape hatches. Rendered ONLY in this branch: the abandon helper
            destroys the Clerk client, which would be a silent sign-out if it
            were reachable from anywhere a session exists. */}
        <Pressable
          style={styles.escape}
          disabled={busy || abandoning}
          onPress={() => {
            void handleUseDifferentEmail();
          }}
        >
          <Text style={[styles.footerLink, { color: colors.primary }]}>
            Use a different email
          </Text>
        </Pressable>
        <Pressable style={styles.escape} disabled={abandoning} onPress={backToForm}>
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
            Back
          </Text>
        </Pressable>
        <View nativeID="clerk-captcha" />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Start speaking today"
      subtitle="Create a free account and find your way back to your family's language — all 22 Indian languages, any age welcome."
    >
      <Field
        label="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="you@example.com"
        value={emailAddress}
        onChangeText={setEmailAddress}
        error={fieldError(errors.fields.emailAddress)}
      />
      <Field
        label="Password"
        secureTextEntry
        placeholder="At least 8 characters"
        value={password}
        onChangeText={setPassword}
        error={fieldError(errors.fields.password)}
      />

      {formErrorLine ? (
        <Text
          accessibilityRole="alert"
          style={[styles.formError, { color: colors.destructive }]}
        >
          {formErrorLine}
        </Text>
      ) : null}

      <ChunkyButton
        title="Create account"
        icon="user-plus"
        onPress={handleSubmit}
        loading={busy}
        disabled={!emailAddress || !password}
        style={{ marginTop: 6 }}
      />

      <View style={styles.dividerRow}>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>
          or
        </Text>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
      </View>

      {/* Apple first on iOS per HIG guidance when Apple sign-in is offered
          alongside other providers; renders null (including its own spacing)
          on Android, leaving that layout unchanged. */}
      <AppleAuthButton />
      <GoogleAuthButton />

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
          Already have an account?{' '}
        </Text>
        <Link href="/(auth)/sign-in" asChild>
          <Pressable>
            <Text style={[styles.footerLink, { color: colors.primary }]}>
              Sign in
            </Text>
          </Pressable>
        </Link>
      </View>

      {/* Required for Clerk's bot sign-up protection. */}
      <View nativeID="clerk-captcha" />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  formError: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    marginBottom: 8,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 20,
  },
  divider: { flex: 1, height: 1 },
  dividerText: { fontFamily: AppFonts.semibold, fontSize: 13 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  footerText: { fontFamily: AppFonts.regular, fontSize: 15 },
  footerLink: { fontFamily: AppFonts.bold, fontSize: 15 },
  resend: { alignItems: 'center', marginTop: 18 },
  escape: { alignItems: 'center', marginTop: 14 },
});
