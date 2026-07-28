import React, { useEffect } from 'react';
import { useUser } from '@clerk/expo';
import { initSentry, setSentryUser, Sentry } from '@/lib/sentry';
import { initAnalytics, identifyUser, trackOnce, ANALYTICS_EVENTS } from '@/lib/analytics';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ClerkLoaded, ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { setBaseUrl } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { fontMap } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';

// Point the shared API client at the Replit-hosted api-server. Runs at module
// load, before any hook fires a request.
const domain = process.env.EXPO_PUBLIC_DOMAIN;
if (domain) setBaseUrl(`https://${domain}`);

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;
const proxyUrl = process.env.EXPO_PUBLIC_CLERK_PROXY_URL || undefined;

// Prevent the splash screen from auto-hiding before fonts finish loading.
SplashScreen.preventAutoHideAsync();

// Both are no-ops unless their env keys (EXPO_PUBLIC_SENTRY_DSN /
// EXPO_PUBLIC_POSTHOG_KEY) are present. Initialize at module load so early
// errors are captured.
initSentry();
initAnalytics();

// Keeps PostHog + Sentry identity in sync with the Clerk session (user id
// only, never email), and fires sign_up_completed exactly once for a freshly
// created account (created within the last two minutes). Detection lives here,
// outside the auth screens, so all three sign-up paths (email, Google, Apple)
// are covered without touching auth flow code.
function AnalyticsIdentitySync() {
  const { user, isLoaded } = useUser();

  useEffect(() => {
    if (!isLoaded) return;
    identifyUser(user?.id ?? null);
    setSentryUser(user?.id ?? null);
    if (user?.createdAt && Date.now() - user.createdAt.getTime() < 2 * 60 * 1000) {
      void trackOnce(ANALYTICS_EVENTS.SIGN_UP_COMPLETED);
    }
  }, [isLoaded, user?.id, user?.createdAt]);

  return null;
}

const queryClient = new QueryClient();

// Wrapped with Sentry at the export so navigation/errors are instrumented
// when a DSN is configured; wrap is a pass-through otherwise.
function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontMap);
  const colors = useColors();

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ThemeProvider>
      <ClerkProvider
        publishableKey={publishableKey}
        tokenCache={tokenCache}
        proxyUrl={proxyUrl}
      >
        <ClerkLoaded>
        <AnalyticsIdentitySync />
        <SafeAreaProvider>
          <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <KeyboardProvider>
                  <StatusBar style="auto" />
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      contentStyle: { backgroundColor: colors.background },
                    }}
                  >
                    <Stack.Screen name="index" />
                    <Stack.Screen name="(auth)" />
                    <Stack.Screen name="(app)" />
                  </Stack>
                </KeyboardProvider>
              </GestureHandlerRootView>
            </QueryClientProvider>
          </ErrorBoundary>
        </SafeAreaProvider>
        </ClerkLoaded>
      </ClerkProvider>
    </ThemeProvider>
  );
}

export default Sentry.wrap(RootLayout);
