import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSignUp } from '@clerk/expo';
import { Link, useRouter } from 'expo-router';
import { AuthShell, Field, fieldError } from '@/components/AuthShell';
import { ChunkyButton } from '@/components/ChunkyButton';
import { AppleAuthButton } from '@/components/AppleAuthButton';
import { GoogleAuthButton } from '@/components/GoogleAuthButton';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

export default function SignUpScreen() {
  const { signUp, errors, fetchStatus } = useSignUp();
  const router = useRouter();
  const colors = useColors();

  const [emailAddress, setEmailAddress] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [code, setCode] = React.useState('');

  const busy = fetchStatus === 'fetching';
  const finishNavigate = () => router.replace('/(app)/(tabs)');

  const handleSubmit = async () => {
    const { error } = await signUp.password({ emailAddress, password });
    if (error) return;
    await signUp.verifications.sendEmailCode();
  };

  const handleVerify = async () => {
    await signUp.verifications.verifyEmailCode({ code });
    if (signUp.status === 'complete') {
      await signUp.finalize({ navigate: finishNavigate });
    }
  };

  const awaitingCode =
    signUp.status === 'missing_requirements' &&
    signUp.unverifiedFields.includes('email_address');

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
        {fieldError(errors.raw?.[0]) ? (
          <Text style={[styles.formError, { color: colors.destructive }]}>
            {fieldError(errors.raw?.[0])}
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
          onPress={() => signUp.verifications.sendEmailCode()}
        >
          <Text style={[styles.footerLink, { color: colors.secondary }]}>
            Send a new code
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

      {fieldError(errors.raw?.[0]) ? (
        <Text style={[styles.formError, { color: colors.destructive }]}>
          {fieldError(errors.raw?.[0])}
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
});
