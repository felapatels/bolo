import React, { useCallback, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View, useColorScheme } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { useSSO } from '@clerk/expo';
import { useRouter } from 'expo-router';
import {
  authErrorMessage,
  reportAuthError,
  reportAuthIncompleteState,
} from '@/lib/authErrors';
import { hapticLight } from '@/lib/haptics';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

// Completes any pending auth session (required by Clerk's OAuth flow).
WebBrowser.maybeCompleteAuthSession();

/**
 * Sign in with Apple, via Clerk's oauth_apple SSO strategy — the same flow
 * shape as GoogleAuthButton.
 *
 * Rendered on iOS ONLY (App Store Review Guideline 4.8 requires Apple sign-in
 * when Google login is offered; Android has no such rule). The component owns
 * its own bottom spacing, so non-iOS layouts are byte-identical to before.
 *
 * The visual control is Apple's own AppleAuthenticationButton from
 * expo-apple-authentication — Apple's supplied artwork, wording ("Continue
 * with Apple"), and sanctioned black/white appearances, which is what App
 * Review checks. Corner radius matches the app's other auth buttons (HIG
 * permits custom corner radius on the supplied button).
 *
 * What Apple returns through Clerk:
 * - Email may be a private relay address (…@privaterelay.appleid.com). Clerk
 *   stores it as a normal verified email; nothing downstream may assume it is
 *   the user's real mailbox.
 * - Apple sends the user's name ONLY on the very first authorization; on
 *   later sign-ins user.firstName stays null. All app surfaces fall back
 *   ('friend' greeting, empty profile name).
 */
export function AppleAuthButton() {
  const { startSSOFlow } = useSSO();
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = useColors();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Re-entry guard: Apple's button has no disabled prop, so ignore taps
  // while an OAuth handoff is already in flight.
  const inFlight = useRef(false);

  const onPress = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    hapticLight();
    setLoading(true);
    setError(null);
    try {
      const { createdSessionId, setActive, signIn, signUp } =
        await startSSOFlow({
          strategy: 'oauth_apple',
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
        // No session created. If Clerk progressed to a resource with a
        // status, surface + report that status; a bare return with no
        // resources is most likely the user dismissing Apple's sheet
        // (visible message, no Sentry noise).
        const status = signIn?.status ?? signUp?.status ?? null;
        if (status) {
          const strategies = (signIn?.supportedFirstFactors ?? []).map(
            (f) => f.strategy,
          );
          setError(
            `Apple sign-in did not complete (status: ${status}${
              strategies.length > 0
                ? `; available sign-in methods: ${strategies.join(', ')}`
                : ''
            }). Please try again.`,
          );
          reportAuthIncompleteState('sso.oauth_apple', status, strategies);
        } else {
          setError('Apple sign-in did not finish. Please try again.');
        }
      }
    } catch (err) {
      reportAuthError('sso.oauth_apple', err);
      setError(`Apple sign-in failed: ${authErrorMessage(err)}`);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [startSSOFlow, router]);

  if (Platform.OS !== 'ios') return null;

  return (
    <View
      style={styles.container}
      accessible={false}
      accessibilityState={{ busy: loading }}
      pointerEvents={loading ? 'none' : 'auto'}
    >
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={
          scheme === 'dark'
            ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
            : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
        }
        cornerRadius={18}
        style={[styles.button, loading ? styles.buttonBusy : null]}
        onPress={onPress}
      />
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[styles.error, { color: colors.destructive }]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  button: {
    width: '100%',
    height: 50, // comfortably above Apple's 44pt minimum
  },
  buttonBusy: {
    opacity: 0.7,
  },
  error: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    marginTop: 8,
  },
});
