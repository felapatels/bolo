import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSignIn } from '@clerk/expo';
import { Link, useRouter } from 'expo-router';
import { AuthShell, Field, fieldError } from '@/components/AuthShell';
import { ChunkyButton } from '@/components/ChunkyButton';
import { AppleAuthButton } from '@/components/AppleAuthButton';
import { GoogleAuthButton } from '@/components/GoogleAuthButton';
import { PasswordChecklist } from '@/components/PasswordChecklist';
import { passwordMeetsAll, PASSWORD_MIN_LENGTH } from '@/lib/passwordRules';
import {
  authErrorCode,
  authErrorMessage,
  incompleteStateMessage,
  isExpectedUserError,
  reportAuthError,
  reportAuthIncompleteState,
} from '@/lib/authErrors';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

// Sign-in supports the factors the account ACTUALLY has, discovered from
// Clerk's sign-in response — never assumed:
// - password,
// - a password reset by emailed code (signIn.resetPasswordEmailCode.*), for a
//   forgotten password or one Clerk refuses as breached,
// - Apple / Google SSO.
//
// NO EMAILED SIGN-IN CODE, FROM 2026-09-15. The owner switched the email-code
// first factor off in all six Bolo Clerk instances ("only emails a code on
// signup not every login"; the live /v1/environment reads
// email_address.first_factors: []). This header used to list "email code (web
// sign-ups are passwordless)", and the screen still offered that code twice:
// "Email me a sign-in code instead", and behind "Forgot your password?". Both
// ran signIn.emailCode.sendCode, which can now only fail with
// factor_not_found: 163 Sentry events across the six apps in the 30 days to
// 2026-09-15 (45 on India), every one tagged
// signIn.emailCodeRequest.sendEmailCode. That left mobile with no working
// password recovery at all (ledger X109). An emailed code is now a sign-up
// verification, a password reset, or the new-device check below, and never
// a way in on its own.
//
// July 2026 production incident: `signIn.password()` is a ONE-SHOT create
// call in this SDK — there is no separate attemptFirstFactor. The old code
// assumed it either throws or completes; any other status fell through with
// no UI change and no Sentry event. Every branch below therefore ends in
// exactly one of: navigation, a user-visible error (including the Clerk
// status + offered factors when a flow stops early), or the next step (a
// code, or since 2026-09-15 a new password).

/**
 * The line that opens the reset code step when Clerk refused a password that
 * has to be REPLACED rather than retyped, or null for every other error.
 *
 * Added 2026-09-15. A breached password does NOT come back as status
 * needs_first_factor, which is what this flow was first specified against:
 * Clerk's own sign-in card (clerk/javascript, packages/ui
 * SignInFactorOnePasswordCard) receives both of these codes as ERRORS and
 * sends the learner to its reset screen, so this screen does the same where
 * the error actually arrives.
 */
function refusedPasswordReason(code: string | undefined): string | null {
  if (code === 'form_password_pwned') {
    return 'That password has appeared in a data breach, so it can no longer be used to sign in.';
  }
  if (code === 'form_password_compromised') {
    return 'That password has been flagged as unsafe, so it can no longer be used to sign in.';
  }
  return null;
}

/**
 * AN ACCOUNT WITH NO PASSWORD TO RESET (2026-09-15): the fresh sign-in offers
 * no reset_password_email_code factor. An account created with Apple or
 * Google is the expected case, not yet confirmed against a live account.
 * Expected routing, so never Sentry. The copy names only buttons that are
 * really on screen: AppleAuthButton renders nothing off iOS, so Android
 * cannot be pointed at it.
 */
function noPasswordToResetLine(): string {
  return Platform.OS === 'ios'
    ? 'This account has no password to reset. If you created it with Apple or Google, use Continue with Apple or Continue with Google below.'
    : 'This account has no password to reset. If you created it with Google, use Continue with Google below. If you created it with Apple, sign in on an iPhone or iPad.';
}

export default function SignInScreen() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const router = useRouter();
  const colors = useColors();

  const [emailAddress, setEmailAddress] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [code, setCode] = React.useState('');
  // The reset flow's last step (2026-09-15). Its own state, so a password
  // Clerk has just refused is never carried into the box for its replacement.
  const [newPassword, setNewPassword] = React.useState('');
  const [mode, setMode] = React.useState<
    'credentials' | 'emailCode' | 'newPassword'
  >('credentials');
  // Which verification path the code step is serving. 'resetPassword' is the
  // forgot-password code (signIn.resetPasswordEmailCode.*). It replaced
  // 'firstFactor', the emailed sign-in code (signIn.emailCode.*), when Clerk's
  // email-code sign-in was switched off on 2026-09-15. 'clientTrust' is
  // the new-device second factor Clerk requires at status
  // 'needs_client_trust' (signIn.mfa.* — a DIFFERENT API surface). The step
  // UI is shared; the send/verify calls, the field label and the button
  // differ.
  const [verifyPath, setVerifyPath] = React.useState<
    'resetPassword' | 'clientTrust'
  >('resetPassword');
  // Non-field error line. Clerk's expected field errors (wrong password, bad
  // code) render under their inputs via `errors`; this covers everything
  // else so no failure is ever invisible.
  const [formError, setFormError] = React.useState<string | null>(null);
  // Context line for the code step ("we just sent a code to ...").
  const [codeNotice, setCodeNotice] = React.useState<string | null>(null);

  const busy = fetchStatus === 'fetching';
  const finishNavigate = () => router.replace('/(app)/(tabs)');

  /** Strategy names only — factor objects carry PII (safeIdentifier). */
  const factorStrategies = (): string[] =>
    (signIn.supportedFirstFactors ?? []).map((f) => f.strategy);

  /** Second-factor strategy names only — same PII rule as above. */
  const secondFactorStrategies = (): string[] =>
    (signIn.supportedSecondFactors ?? []).map((f) => f.strategy);

  const finalizeSession = async (context: string): Promise<void> => {
    try {
      // finalize both returns { error } and can throw (e.g. no created
      // session) — cover both so neither path is silent.
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
   * Route a successful-but-not-complete sign-in response. Every branch ends in
   * a code step or an observable error (on screen and in Sentry).
   *
   * `fromPasswordSubmit` gates the reset route (2026-09-15). Only a password
   * sign-in that stopped short can mean "this account needs a new password".
   * The code steps land here too, and routing one of them into a fresh reset
   * would loop a learner through emailed codes under copy about a password
   * sign-in they never attempted, so they get the observable error instead.
   */
  const handleNonCompleteState = async (
    context: string,
    { fromPasswordSubmit = false }: { fromPasswordSubmit?: boolean } = {},
  ): Promise<void> => {
    const status = signIn.status ?? 'unknown';
    const strategies = factorStrategies();
    if (
      fromPasswordSubmit &&
      status === 'needs_first_factor' &&
      strategies.includes('reset_password_email_code')
    ) {
      // THIS BRANCH USED TO EMAIL A SIGN-IN CODE, keyed on an 'email_code'
      // factor Clerk stopped offering on 2026-09-15, so the send could only
      // fail with factor_not_found. A reset code is the one code this account
      // can still receive. The status and offered factors stay in the copy so
      // the state is observable from a screenshot.
      const detail = `status: ${status}; available sign-in methods: ${strategies.join(', ')}`;
      if (strategies.includes('password')) {
        // A password-holding account should have completed in one shot;
        // this is the production-incident shape, so it also goes to Sentry.
        // Without a password factor it was the old passwordless routing,
        // expected, and it stays out of Sentry as it did before.
        reportAuthIncompleteState(context, status, strategies);
      }
      await sendResetCodeAndShowStep(
        `Password sign-in did not complete (${detail}), so we emailed a 6-digit code to ${emailAddress}. Enter it to choose a new password.`,
        context,
      );
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
      // second-factor strategies (strings only — factor objects carry PII).
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

  /**
   * Email the password-reset code for the sign-in in hand, then open the code
   * step. Replaced sendCodeAndShowStep (signIn.emailCode.sendCode) on
   * 2026-09-15.
   */
  const sendResetCodeAndShowStep = async (
    notice: string,
    context: string,
  ): Promise<void> => {
    let error: unknown = null;
    try {
      ({ error } = await signIn.resetPasswordEmailCode.sendCode());
    } catch (err) {
      // clerk-js 6.29.3 checks for a sign-in BEFORE the wrapper that turns
      // failures into { error }, so with none it throws "Cannot reset password
      // without a sign in." instead of returning. That must not be silent.
      error = err;
    }
    if (error) {
      reportAuthError(`${context}.resetPasswordEmailCode.sendCode`, error, {
        factorStrategies: factorStrategies(),
      });
      setFormError(authErrorMessage(error));
      return;
    }
    setCode('');
    setCodeNotice(notice);
    setVerifyPath('resetPassword');
    setMode('emailCode');
  };

  /**
   * Start a password reset for the typed email: a fresh sign-in for that
   * identifier, then the emailed reset code.
   *
   * `refused` is true when Clerk refused the learner's password, rather than
   * the learner tapping "Forgot your password?", and it changes what a
   * missing reset factor means.
   */
  const startPasswordReset = async (
    context: string,
    notice: string,
    refused: boolean,
  ): Promise<void> => {
    // A FRESH SIGN-IN EVERY TIME. resetPasswordEmailCode.sendCode() takes no
    // email address: it resets "the first email address on the account"
    // (signInFuture.d.ts, @clerk/shared 4.29.3), so the sign-in must already
    // carry the identifier, and create() is also what fills
    // supportedFirstFactors for the check below. Clerk's forgot-password
    // guide opens with the same call.
    const { error: createError } = await signIn.create({
      identifier: emailAddress,
    });
    if (createError) {
      // An unknown or malformed email is the learner's to fix and renders
      // under the Email field (errors.fields.identifier).
      if (!isExpectedUserError(createError)) {
        reportAuthError(`${context}.create`, createError);
        setFormError(authErrorMessage(createError));
      }
      return;
    }
    const strategies = factorStrategies();
    if (!strategies.includes('reset_password_email_code')) {
      if (refused) {
        // Clerk refused a password it offers no way to replace. No step can
        // route that, so it is the observable kind of stop.
        const status = signIn.status ?? 'unknown';
        setFormError(incompleteStateMessage(status, strategies));
        reportAuthIncompleteState(
          `${context}.noResetFactor`,
          status,
          strategies,
        );
        return;
      }
      setFormError(noPasswordToResetLine());
      return;
    }
    await sendResetCodeAndShowStep(notice, context);
  };

  const handlePasswordSubmit = async () => {
    setFormError(null);
    const { error } = await signIn.password({ emailAddress, password });
    if (error) {
      const refusal = refusedPasswordReason(authErrorCode(error));
      if (refusal) {
        // BREACHED OR COMPROMISED, NOT MISTYPED (2026-09-15). Every Bolo
        // Clerk instance runs enforce_hibp_on_sign_in, and Clerk's password
        // protection guide says the breach refusal comes "When the user
        // provides the correct password", so the learner has shown they hold
        // it and the reset code goes out at once. Expected, so no Sentry.
        await startPasswordReset(
          'signIn.password.refused',
          `${refusal} We emailed a 6-digit code to ${emailAddress}. Enter it to choose a new password.`,
          true,
        );
        return;
      }
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
    await handleNonCompleteState('signIn.password', {
      fromPasswordSubmit: true,
    });
  };

  const handleForgotPassword = async () => {
    setFormError(null);
    if (!emailAddress) {
      setFormError('Enter your email above first, then request a code.');
      return;
    }
    await startPasswordReset(
      'signIn.forgotPassword',
      `We sent a 6-digit code to ${emailAddress}. Enter it to choose a new password.`,
      false,
    );
  };

  const handleVerifyCode = async () => {
    setFormError(null);
    const clientTrust = verifyPath === 'clientTrust';
    const { error } = clientTrust
      ? await signIn.mfa.verifyEmailCode({ code })
      : await signIn.resetPasswordEmailCode.verifyCode({ code });
    const context = clientTrust
      ? 'signIn.mfa.verifyEmailCode'
      : 'signIn.resetPasswordEmailCode.verifyCode';
    if (error) {
      if (!isExpectedUserError(error)) {
        reportAuthError(context, error);
        setFormError(authErrorMessage(error));
      }
      return;
    }
    if (clientTrust) {
      if (signIn.status === 'complete') {
        await finalizeSession('signIn.mfa.emailCode');
        return;
      }
      await handleNonCompleteState(context);
      return;
    }
    // A verified reset code moves the sign-in to 'needs_new_password'
    // (signInFuture.d.ts, @clerk/shared 4.29.3). No other call on this screen
    // produces that status, so this is the only place it is handled; any
    // other status is the observable kind of stop.
    if (signIn.status === 'needs_new_password') {
      setNewPassword('');
      setMode('newPassword');
      return;
    }
    await handleNonCompleteState(context);
  };

  const handleSubmitNewPassword = async () => {
    setFormError(null);
    const { error } = await signIn.resetPasswordEmailCode.submitPassword({
      password: newPassword,
      // Passed rather than left to the default. clerk-js 6.29.3 defaults it to
      // true, Clerk's forgot-password guide passes true, and
      // account/password.tsx passes true for a changed password; naming it
      // here means a default that moves cannot quietly keep a stolen session
      // alive on another device.
      signOutOfOtherSessions: true,
    });
    if (error) {
      // Every refusal renders under the field via errors.fields.password; the
      // expected ones (isExpectedUserError) stop there, and the rest also
      // show below and reach Sentry. Clerk's strength refusal, "Given password
      // is not strong enough.", is one of the rest today: sign-up reported it
      // twice on 2026-08-29.
      if (!isExpectedUserError(error)) {
        reportAuthError('signIn.resetPasswordEmailCode.submitPassword', error);
        setFormError(authErrorMessage(error));
      }
      return;
    }
    if (signIn.status === 'complete') {
      await finalizeSession('signIn.resetPassword');
      return;
    }
    // Clerk's guide names needs_second_factor as the other outcome. It, and
    // anything else, lands on the observable error; a new-device check still
    // takes the client-trust branch.
    await handleNonCompleteState('signIn.resetPasswordEmailCode.submitPassword');
  };

  /** Out of any step and back to the email and password form. */
  const backToCredentials = () => {
    setFormError(null);
    setVerifyPath('resetPassword');
    setMode('credentials');
  };

  const formErrorLine = formError ?? fieldError(errors.raw?.[0]);

  if (mode === 'emailCode') {
    const resetting = verifyPath === 'resetPassword';
    return (
      <AuthShell
        title="Enter your code"
        subtitle={codeNotice ?? 'Enter the 6-digit code we emailed you.'}
      >
        <Field
          label={resetting ? 'Reset code' : 'Sign-in code'}
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
          /** A reset code signs nobody in: the new password does, one step
           *  later, so that button cannot promise "sign in". */
          title={resetting ? 'Verify code' : 'Verify & sign in'}
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
              : sendResetCodeAndShowStep(
                  `We sent a new code to ${emailAddress || 'your email'}.`,
                  'signIn.resetPasswordResend',
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
          onPress={backToCredentials}
        >
          <Text style={[styles.footerLink, { color: colors.mutedForeground }]}>
            Back to password sign-in
          </Text>
        </Pressable>
      </AuthShell>
    );
  }

  if (mode === 'newPassword') {
    return (
      <AuthShell
        title="Choose a new password"
        subtitle={`Code accepted. Choose a new password for ${emailAddress}. Saving it signs you out on your other devices.`}
      >
        {/* The reset's last step (2026-09-15), drawn the way sign-up draws a
            password: the same Field with its eye, the same live checklist
            (lib/passwordRules.ts), the button waiting for all three rules.
            No second "confirm" box, as on sign-up; the eye is how a learner
            checks what they typed.

            THE CHECKLIST CAN GO ALL GREEN AND CLERK CAN STILL SAY NO. India's
            instance scores strength with zxcvbn rather than a length floor,
            which the checklist cannot see, so the refusal has to render
            under this field through errors.fields.password. */}
        <Field
          label="New password"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
          value={newPassword}
          onChangeText={setNewPassword}
          error={fieldError(errors.fields.password)}
        />
        <PasswordChecklist password={newPassword} />
        {formErrorLine ? (
          <Text
            accessibilityRole="alert"
            style={[styles.formError, { color: colors.destructive }]}
          >
            {formErrorLine}
          </Text>
        ) : null}
        <ChunkyButton
          title="Save password & sign in"
          icon="lock"
          onPress={handleSubmitNewPassword}
          loading={busy}
          disabled={!passwordMeetsAll(newPassword)}
          style={{ marginTop: 6 }}
        />
        <Pressable
          style={styles.inlineLink}
          disabled={busy}
          onPress={backToCredentials}
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

      {/* THE WORDS "FORGOT" AND "PASSWORD" (owner, 2026-09-05), AND SINCE
          2026-09-15 A REAL RESET BEHIND THEM. On 09-05 the label was the
          missing piece: a learner who cannot get in scans for "forgot
          password" and does not read "Email me a sign-in code instead" as
          recovery, so this link was added and pointed at that same handler,
          with account/password.tsx to set a new password once in.

          THAT HANDLER DIED ON 2026-09-15. The owner switched email-code
          sign-in off in Clerk, so signIn.emailCode.sendCode could only fail
          with factor_not_found, and this link, the line under the button and
          with them all of mobile's password recovery went dead together
          (ledger X109). The link now runs Clerk's reset flow: an emailed code,
          a new password, straight into the app. "Email me a sign-in code
          instead" is gone rather than repointed: an emailed code is no longer
          a way to sign in, so that line had nothing true left to offer.

          IT MATTERS MORE ON THIS FORK THAN THE OTHERS. India's Clerk instance
          runs min_length 0 with min_zxcvbn_strength 2, so a refused password
          has no length rule to reason about, and the client checklist knows
          nothing about zxcvbn. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Forgot your password? Email yourself a code to reset it"
        style={styles.forgotRow}
        disabled={busy}
        onPress={handleForgotPassword}
        testID="sign-in-forgot-password"
      >
        <Text style={[styles.forgotLink, { color: colors.secondary }]}>
          Forgot your password?
        </Text>
      </Pressable>

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
  /** Right under the password box, right aligned, the way every sign-in
   *  screen puts it. Not disabled without an email: the handler already says
   *  "Enter your email above first, then request a code", which teaches more
   *  than a dead grey line does. */
  forgotRow: { alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 2 },
  forgotLink: { fontFamily: AppFonts.semibold, fontSize: 13 },
  inlineLink: { alignItems: 'center', marginTop: 14 },
});
