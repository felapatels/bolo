import React, { useEffect, useState } from 'react';
import { useUser } from '@clerk/expo';
import { initSentry, setSentryUser, Sentry } from '@/lib/sentry';
import { installApiFailureBreadcrumbs } from '@/lib/apiErrors';
import { initAnalytics, identifyUser, trackOnce, ANALYTICS_EVENTS } from '@/lib/analytics';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ClerkLoaded, ClerkProvider } from '@clerk/expo';
import { clerkTokenCache } from '@/lib/clerkTokenCache';
import { setBaseUrl, ApiError } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { BrandSplash } from '@/components/BrandSplash';
import { StopSplash } from '@/components/StopSplash';
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

/**
 * How long the native splash may wait for the boot film before giving up.
 *
 * 600ms. Long enough for the RN tree to paint on a cold start on a slow
 * device, short enough that a learner on a path with no film does not notice
 * they waited. It is a backstop, not a delay: on the normal path the film
 * reports in well under this and the splash hides immediately.
 */
const NATIVE_SPLASH_HANDOVER_FAILSAFE_MS = 600;

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

  // THE NATIVE SPLASH HANDS OVER TO THE BOOT FILM, IT DOES NOT JUST VANISH.
  //
  // It used to hide the moment the FONTS resolved, and the RN tree needs a
  // frame or two after that to paint: the gap showed the app background as a
  // white flash between the native Bolo and the film. Reported 2026-08-27,
  // "i see bolo with the brown background, then i see a white page flash then
  // i see the video splash."
  //
  // THE OVERLAY'S TOP LAYER IS THE NATIVE SPLASH'S TWIN (build 18): the same
  // bird on the same white (app.json's splash.backgroundColor and
  // SPLASH_HANDOVER_GROUND are held equal by a test), so once it HAS painted
  // the handover is invisible, plate for plate. It then fades over the film,
  // which is the crossfade the owner asked for: "Bolo bird has a brown
  // background when you first launch. instead i want it with a white
  // background and crossfade with intro animation." The fade waits for
  // `nativeGone`, reported here once hideAsync settles, so the bird never
  // starts fading while the native copy still covers it.
  //
  // THE FAILSAFE IS NOT OPTIONAL. The film does not always mount: it is off on
  // some paths, its error boundary can drop it, and it renders null once the
  // day's play is spent. Without the timer any of those would leave the native
  // splash up forever, which is a far worse bug than the flash.
  const [filmPainted, setFilmPainted] = useState(false);
  const [nativeGone, setNativeGone] = useState(false);
  useEffect(() => {
    if (!(fontsLoaded || fontError)) return;
    // finally, not then: a hide that rejects (already hidden, no native
    // module) must still release the plate, or the bird sits on the film.
    const hide = () => {
      SplashScreen.hideAsync().finally(() => setNativeGone(true));
    };
    if (filmPainted) {
      hide();
      return;
    }
    const t = setTimeout(hide, NATIVE_SPLASH_HANDOVER_FAILSAFE_MS);
    return () => clearTimeout(t);
  }, [fontsLoaded, fontError, filmPainted]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ThemeProvider>
      <ClerkProvider
        publishableKey={publishableKey}
        tokenCache={clerkTokenCache}
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
                {/* The boot film, over the Stack. The native splash hides on
                    fonts; this picks up from there and covers Clerk plus both
                    redirect hops. (This comment was here twice; one copy.) */}
                <BrandSplash onReady={() => setFilmPainted(true)} nativeGone={nativeGone} />
                {/* The stop transition, also over the Stack and one zIndex
                    below the boot film, so the two can never fight. It has to
                    live here rather than in journey.tsx because it covers the
                    navigation AWAY from journey: anything mounted inside the
                    navigator unmounts the moment the push lands. */}
                <StopSplash />
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
