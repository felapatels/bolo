import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSignIn } from '@clerk/expo';
import { Link, useRouter } from 'expo-router';
import { AuthShell, Field, fieldError } from '@/components/AuthShell';
import { ChunkyButton } from '@/components/ChunkyButton';
import { AppleAuthButton } from '@/components/AppleAuthButton';
import { GoogleAuthButton } from '@/components/GoogleAuthButton';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

export default function SignInScreen() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const router = useRouter();
  const colors = useColors();

  const [emailAddress, setEmailAddress] = React.useState('');
  const [password, setPassword] = React.useState('');

  const busy = fetchStatus === 'fetching';

  const finishNavigate = () => router.replace('/(app)/(tabs)');

  const handleSubmit = async () => {
    const { error } = await signIn.password({ emailAddress, password });
    if (error) return;

    if (signIn.status === 'complete') {
      await signIn.finalize({ navigate: finishNavigate });
    }
  };

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

      {fieldError(errors.raw?.[0]) ? (
        <Text style={[styles.formError, { color: colors.destructive }]}>
          {fieldError(errors.raw?.[0])}
        </Text>
      ) : null}

      <ChunkyButton
        title="Sign in"
        icon="log-in"
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
});
