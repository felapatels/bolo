import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { Ionicons } from '@expo/vector-icons';
import { useSSO } from '@clerk/expo';
import { useRouter } from 'expo-router';
import {
  authErrorMessage,
  reportAuthError,
  reportAuthIncompleteState,
} from '@/lib/authErrors';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

// Completes any pending auth session (required by Clerk's OAuth flow).
WebBrowser.maybeCompleteAuthSession();

export function GoogleAuthButton() {
  const { startSSOFlow } = useSSO();
  const router = useRouter();
  const colors = useColors();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Warm up the browser on Android to speed up the OAuth handoff.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);

  const onPress = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { createdSessionId, setActive, signIn, signUp } =
        await startSSOFlow({
          strategy: 'oauth_google',
          redirectUrl: AuthSession.makeRedirectUri({ scheme: 'bolo-mobile' }),
        });

      if (createdSessionId && setActive) {
        await setActive({
          session: createdSessionId,
          navigate: async () => {
            router.replace('/(app)/(tabs)');
          },
        });
      } else {
        // OAuth returned without a session. If Clerk progressed to a
        // resource with a status, surface + report that status; a bare
        // return with no resources is most likely the user dismissing the
        // browser (visible message, no Sentry noise).
        const status = signIn?.status ?? signUp?.status ?? null;
        if (status) {
          const strategies = (signIn?.supportedFirstFactors ?? []).map(
            (f) => f.strategy,
          );
          setError(
            `Google sign-in did not complete (status: ${status}${
              strategies.length > 0
                ? `; available sign-in methods: ${strategies.join(', ')}`
                : ''
            }). Please try again.`,
          );
          reportAuthIncompleteState('sso.oauth_google', status, strategies);
        } else {
          setError('Google sign-in did not finish. Please try again.');
        }
      }
    } catch (err) {
      reportAuthError('sso.oauth_google', err);
      setError(`Google sign-in failed: ${authErrorMessage(err)}`);
    } finally {
      setLoading(false);
    }
  }, [startSSOFlow, router]);

  return (
    <>
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed || loading ? 0.7 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.foreground} />
      ) : (
        <>
          <Ionicons name="logo-google" size={20} color={colors.foreground} />
          <Text style={[styles.label, { color: colors.foreground }]}>
            Continue with Google
          </Text>
        </>
      )}
    </Pressable>
    {error ? (
      <Text
        accessibilityRole="alert"
        style={[styles.error, { color: colors.destructive }]}
      >
        {error}
      </Text>
    ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 15,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  label: {
    fontFamily: AppFonts.semibold,
    fontSize: 16,
  },
  error: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    marginTop: 8,
  },
});
