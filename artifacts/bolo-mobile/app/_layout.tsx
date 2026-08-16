import React, { useEffect } from 'react';
import { useUser } from '@clerk/expo';
import { initSentry, setSentryUser, Sentry } from '@/lib/sentry';
import { installApiFailureBreadcrumbs } from '@/lib/apiErrors';
import { initAnalytics, identifyUser, trackOnce, ANALYTICS_EVENTS } from '@/lib/analytics';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ClerkLoaded, ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { setBaseUrl, ApiError } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { BrandSplash } from '@/components/BrandSplash';
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
// Every non-2xx API response leaves a breadcrumb (endpoint + status + Clerk's
// auth reason), so a visible error arrives in Sentry with the request sequence
// that led to it — the evidence that was missing when App Review rejected
// build 34 over a Settings error nobody could attribute to a status code.
installApiFailureBreadcrumbs();

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

/**
 * Never retry ANY 4xx - a client error is deterministic: the same request
 * cannot succeed without something else changing first (credentials, plan,
 * input), so retrying only delays settling. Mirrors the web queryClient
 * policy; background retries of 4xx also kept refetch flags flapping, which
 * fed the home pull-to-refresh spinner misbehavior. Network failures and
 * 5xx keep the TanStack Query default of up to 3 retries.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    return false;
  }
  return failureCount < 3;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetry,
    },
  },
});

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
                {/* The boot film, over the Stack. The native splash still
                    runs first and still hides on fonts; this picks up from
                    there and covers Clerk plus both redirect hops. */}
                <BrandSplash />
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
