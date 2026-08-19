import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSignIn } from '@clerk/expo';
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
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

// Sign-in supports the factors the account ACTUALLY has, discovered from
// Clerk's sign-in response, never assumed:
// - password (accounts created with one),
// - email code (web sign-ups are passwordless; without this path those users
//   cannot sign in on mobile at all),
// - Apple / Google SSO.
//
// July 2026 production incident: `signIn.password()` is a ONE-SHOT create
// call in this SDK, there is no separate attemptFirstFactor. The old code
// assumed it either throws or completes; any other status fell through with
// no UI change and no Sentry event. Every branch below therefore ends in
// exactly one of: navigation, a user-visible error (including the Clerk
// status + offered factors when a flow stops early), or a code-entry step.

export default function SignInScreen() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const router = useRouter();
  const colors = useColors();

  const [emailAddress, setEmailAddress] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [code, setCode] = React.useState('');
  const [mode, setMode] = React.useState<'credentials' | 'emailCode'>(
    'credentials',
  );
  // Which verification path the code step is serving. 'firstFactor' is the
  // passwordless email-code sign-in (signIn.emailCode.*); 'clientTrust' is
  // the new-device second factor Clerk requires at status
  // 'needs_client_trust' (signIn.mfa.*, a DIFFERENT API surface). The step
  // UI is shared; only the send/verify calls differ.
  const [verifyPath, setVerifyPath] = React.useState<
    'firstFactor' | 'clientTrust'
  >('firstFactor');
  // Non-field error line. Clerk's expected field errors (wrong password, bad
  // code) render under their inputs via `errors`; this covers everything
  // else so no failure is ever invisible.
  const [formError, setFormError] = React.useState<string | null>(null);
  // Context line for the code step ("we just sent a code to ...").
  const [codeNotice, setCodeNotice] = React.useState<string | null>(null);

  const busy = fetchStatus === 'fetching';
  const finishNavigate = () => router.replace('/(app)/(tabs)');

  /** Strategy names only, factor objects carry PII (safeIdentifier). */
  const factorStrategies = (): string[] =>
    (signIn.supportedFirstFactors ?? []).map((f) => f.strategy);

  /** Second-factor strategy names only, same PII rule as above. */
  const secondFactorStrategies = (): string[] =>
    (signIn.supportedSecondFactors ?? []).map((f) => f.strategy);

  const finalizeSession = async (context: string): Promise<void> => {
    try {
      // finalize both returns { error } and can throw (e.g. no created
      // session), cover both so neither path is silent.
      const { error } = await signIn.finalize({ navigate: finishNavigate });
      if (error) {
        reportAuthError(`${context}.finalize`, error);
        setFormError(
          `Signed in, but opening the app failed (${authErrorMessage(error)}). Please try again.`,
        );
      }
    } catch (err) {
      reportAuthError(`${context}.finalize`, err);
      setFormError(
        `Signed in, but opening the app failed (${authErrorMessage(err)}). Please try again.`,
      );
    }
  };

  /**
   * Route a successful-but-not-complete sign-in response. Returns true if it
   * handled the state (navigated, switched to the code step, or surfaced an
   * observable error).
   */
  const handleNonCompleteState = async (context: string): Promise<void> => {
    const status = signIn.status ?? 'unknown';
    const strategies = factorStrategies();
    if (status === 'needs_first_factor' && strategies.includes('email_code')) {
      // Route to the factor the account actually supports, but keep the
      // encountered status + factors observable in the on-screen copy.
      const detail = `status: ${status}; available sign-in methods: ${strategies.join(', ')}`;
      if (strategies.includes('password')) {
        // A password-holding account should have completed in one shot, this is the production-incident shape, so it also goes to Sentry.
        reportAuthIncompleteState(context, status, strategies);
        await sendCodeAndShowStep(
          `Password sign-in did not complete (${detail}), so we emailed you a sign-in code instead.`,
          context,
        );
      } else {
        // Genuinely passwordless account: expected routing, no Sentry noise.
        await sendCodeAndShowStep(
          `This account signs in with an emailed code (${detail}), we just sent you one.`,
          context,
        );
      }
      return;
    }
    if (status === 'needs_client_trust') {
      // Clerk Client Trust: signing in from a new device requires a second
      // factor even after the password verified. Route to the email-code
      // second factor when the account offers it (signIn.mfa.*, NOT the
      // first-factor emailCode API).
      const secondStrategies = secondFactorStrategies();
      if (secondStrategies.includes('email_code')) {
        await sendClientTrustCodeAndShowStep(context);
        return;
      }
      // No email_code second factor: surface the status + offered
      // second-factor strategies (strings only, factor objects carry PII).
      setFormError(incompleteStateMessage(status, secondStrategies));
      reportAuthIncompleteState(context, status, secondStrategies);
      return;
    }
    // Unexpected state: make the status and offered factors observable in
    // both the UI and Sentry (never a generic error).
    setFormError(incompleteStateMessage(status, strategies));
    reportAuthIncompleteState(context, status, strategies);
  };

  /** Send the client-trust (second factor) email code and open the code step. */
  const sendClientTrustCodeAndShowStep = async (
    context: string,
  ): Promise<void> => {
    const { error } = await signIn.mfa.sendEmailCode();
    if (error) {
      reportAuthError(`${context}.mfa.sendEmailCode`, error, {
        secondFactorStrategies: secondFactorStrategies(),
      });
      setFormError(authErrorMessage(error));
      return;
    }
    setCode('');
    setCodeNotice(
      "You're signing in from a new device, so we emailed you a 6-digit verification code. Enter it to finish signing in.",
    );
    setVerifyPath('clientTrust');
    setMode('emailCode');
  };

  const sendCodeAndShowStep = async (
    notice: string | null,
    context: string,
  ): Promise<void> => {
    const { error } = await (signIn.id
      ? signIn.emailCode.sendCode({})
      : signIn.emailCode.sendCode({ emailAddress }));
    if (error) {
      reportAuthError(`${context}.sendEmailCode`, error, {
        factorStrategies: factorStrategies(),
      });
      setFormError(authErrorMessage(error));
      return;
    }
    setCode('');
    setCodeNotice(notice);
    setVerifyPath('firstFactor');
    setMode('emailCode');
  };

  const handlePasswordSubmit = async () => {
    setFormError(null);
    const { error } = await signIn.password({ emailAddress, password });
    if (error) {
      // Expected user mistakes render via `errors` under the fields; anything
      // else gets a visible line + Sentry.
      if (!isExpectedUserError(error)) {
        reportAuthError('signIn.password', error);
        setFormError(authErrorMessage(error));
      }
      return;
    }
    if (signIn.status === 'complete') {
      await finalizeSession('signIn.password');
      return;
    }
    await handleNonCompleteState('signIn.password');
  };

  const handleEmailCodeRequest = async () => {
    setFormError(null);
    if (!emailAddress) {
      setFormError('Enter your email above first, then request a code.');
      return;
    }
    await sendCodeAndShowStep(
      `We sent a 6-digit sign-in code to ${emailAddress}.`,
      'signIn.emailCodeRequest',
    );
  };

  const handleVerifyCode = async () => {
    setFormError(null);
    const clientTrust = verifyPath === 'clientTrust';
    const { error } = clientTrust
      ? await signIn.mfa.verifyEmailCode({ code })
      : await signIn.emailCode.verifyCode({ code });
    const context = clientTrust
      ? 'signIn.mfa.verifyEmailCode'
      : 'signIn.emailCode.verifyCode';
    if (error) {
      if (!isExpectedUserError(error)) {
        reportAuthError(context, error);
        setFormError(authErrorMessage(error));
      }
      return;
    }
    if (signIn.status === 'complete') {
      await finalizeSession(
        clientTrust ? 'signIn.mfa.emailCode' : 'signIn.emailCode',
      );
      return;
    }
    await handleNonCompleteState(context);
  };

  const formErrorLine = formError ?? fieldError(errors.raw?.[0]);

  if (mode === 'emailCode') {
    return (
      <AuthShell
        title="Enter your code"
        subtitle={codeNotice ?? 'Enter the 6-digit code we emailed you.'}
      >
        <Field
          label="Sign-in code"
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
          title="Verify & sign in"
          icon="check"
          onPress={handleVerifyCode}
          loading={busy}
          disabled={code.length < 6}
          style={{ marginTop: 6 }}
        />
        <Pressable
          style={styles.inlineLink}
          disabled={busy}
          onPress={() =>
            verifyPath === 'clientTrust'
              ? sendClientTrustCodeAndShowStep('signIn.mfaEmailCodeResend')
              : sendCodeAndShowStep(
                  `We sent a new code to ${emailAddress || 'your email'}.`,
                  'signIn.emailCodeResend',
                )
          }
        >
          <Text style={[styles.footerLink, { color: colors.secondary }]}>
            Send a new code
          </Text>
        </Pressable>
        <Pressable
          style={styles.inlineLink}
          disabled={busy}
          onPress={() => {
            setFormError(null);
            setVerifyPath('firstFactor');
            setMode('credentials');
          }}
        >
          <Text style={[styles.footerLink, { color: colors.mutedForeground }]}>
            Back to password sign-in
          </Text>
        </Pressable>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to keep your streak going and practice speaking."
    >
      <Field
        label="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="you@example.com"
        value={emailAddress}
        onChangeText={setEmailAddress}
        error={fieldError(errors.fields.identifier)}
      />
      <Field
        label="Password"
        secureTextEntry
        placeholder="Your password"
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
        title="Sign in"
        icon="log-in"
        onPress={handlePasswordSubmit}
        loading={busy}
        disabled={!emailAddress || !password}
        style={{ marginTop: 6 }}
      />

      {/* Web sign-ups are passwordless; this is their explicit entry point
          (the password path also falls over here automatically). */}
      <Pressable
        style={styles.inlineLink}
        disabled={busy || !emailAddress}
        onPress={handleEmailCodeRequest}
      >
        <Text
          style={[
            styles.footerLink,
            { color: emailAddress ? colors.secondary : colors.mutedForeground },
          ]}
        >
          Email me a sign-in code instead
        </Text>
      </Pressable>

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
          New to Bolo?{' '}
        </Text>
        <Link href="/(auth)/sign-up" asChild>
          <Pressable>
            <Text style={[styles.footerLink, { color: colors.primary }]}>
              Create an account
            </Text>
          </Pressable>
        </Link>
      </View>
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
  inlineLink: { alignItems: 'center', marginTop: 14 },
});
