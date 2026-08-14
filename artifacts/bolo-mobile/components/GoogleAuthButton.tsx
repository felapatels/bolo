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
import { useClerk, useSSO } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { authErrorMessage } from '@/lib/authErrors';
import { completeSsoFlow, reportSsoError } from '@/lib/ssoAuth';
import { hapticLight } from '@/lib/haptics';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

// Completes any pending auth session (required by Clerk's OAuth flow).
WebBrowser.maybeCompleteAuthSession();

export function GoogleAuthButton() {
  const { startSSOFlow } = useSSO();
  const { setActive, client } = useClerk();
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
    hapticLight();
    setLoading(true);
    setError(null);
    try {
      // Every outcome is decided in lib/ssoAuth: an active session (including
      // a first-time user transferred into a sign-up, and a session the
      // handshake left on the Clerk client), a dismissal, or a described stop.
      const outcome = await completeSsoFlow({
        strategy: 'oauth_google',
        redirectUrl: AuthSession.makeRedirectUri({ path: 'sso-callback' }),
        startSSOFlow,
        clerkSetActive: setActive,
        client,
        navigate: async () => {
          router.replace('/(app)/(tabs)');
        },
      });

      if (outcome.kind === 'incomplete') {
        setError(outcome.message);
      } else if (outcome.kind === 'dismissed') {
        setError('Google sign-in did not finish. Please try again.');
      }
    } catch (err) {
      reportSsoError('oauth_google', err);
      setError(`Google sign-in failed: ${authErrorMessage(err)}`);
    } finally {
      setLoading(false);
    }
  }, [startSSOFlow, setActive, client, router]);

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
