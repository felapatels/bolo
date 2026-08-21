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

// Deliberately NOT imported from lib/splashFilm.ts. That module requires the
// poster JPEG at module scope, and a module-scope require bundles the asset
// whether or not anything reads it. Nothing on the launch path imports that
// module any more and it should stay that way. The numbers match its
// SPLASH_MIN_HOLD_MS / SPLASH_MAX_HOLD_MS / SPLASH_EXIT_MS.
const MIN_HOLD_MS = 1500;
const MAX_HOLD_MS = 8000;
const FADE_MS = 260;

// THE NATIVE SPLASH IS THE ONLY BOOT COVER, AND THAT IS NOT A STYLE CHOICE.
// A full-screen JS view mounted at the ROOT freezes every reanimated animation
// for the life of the app in RELEASE builds. Five store builds of the same
// commit say so, including build 190, which stripped the overlay to a bare
// static View with no animation, no image and no storage read and froze the app
// anyway. The overlay itself is the fault, not anything it does. The native
// splash cannot reproduce it because it is a native view, not a node in the
// React tree. See CLAUDE.md, THE ANIMATION BUG.
//
// So it holds through the whole boot now: fonts, Clerk resolving, and both
// redirect hops, which is the wait components/BrandSplash.tsx used to cover.
SplashScreen.preventAutoHideAsync();
// Fades out rather than cutting, which is what the overlay's exit used to do.
SplashScreen.setOptions({ duration: FADE_MS, fade: true });

// Stamped at module load, the closest thing JS has to "when the app started".
const bootAt = Date.now();
let splashHidden = false;

/** Idempotent: two callers race here by design, whichever arrives first wins. */
function hideNativeSplash(): void {
  if (splashHidden) return;
  splashHidden = true;
  void SplashScreen.hideAsync().catch(() => {});
}

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
 * Releases the native splash. Rendered INSIDE <ClerkLoaded>, so mounting is
 * itself the signal that Clerk has resolved; the timer only stops the splash
 * blinking away on a fast start.
 *
 * IT RENDERS null AND MUST KEEP RENDERING null. The moment this returns a view
 * it becomes the bug it replaced.
 */
function SplashGate() {
  useEffect(() => {
    const remaining = MIN_HOLD_MS - (Date.now() - bootAt);
    if (remaining <= 0) {
      hideNativeSplash();
      return;
    }
    const t = setTimeout(hideNativeSplash, remaining);
    return () => clearTimeout(t);
  }, []);

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

  // Failsafe, and load-bearing: SplashGate sits inside <ClerkLoaded>, so a Clerk
  // that never resolves would leave the native splash up forever. Fonts are no
  // longer the release signal, they are just one of the things being waited on.
  useEffect(() => {
    const t = setTimeout(
      hideNativeSplash,
      Math.max(0, MAX_HOLD_MS - (Date.now() - bootAt)),
    );
    return () => clearTimeout(t);
  }, []);

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
        <SplashGate />
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
