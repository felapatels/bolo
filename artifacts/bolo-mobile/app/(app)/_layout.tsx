import { useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useAuth } from '@clerk/expo';
import { Redirect, Stack } from 'expo-router';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import { useGetAccount, useUpdateAccountPreferences } from '@workspace/api-client-react';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { TourProvider } from '@/contexts/TourContext';
import { ReminderScheduler } from '@/components/ReminderScheduler';
import { GuidedTour } from '@/components/GuidedTour';
import { Mascot } from '@/components/Mascot';
import { EntitlementsProvider } from '@/contexts/EntitlementsContext';
import { PurchasesProvider } from '@/contexts/PurchasesContext';
import { useColors } from '@/hooks/useColors';
import { useTour } from '@/contexts/TourContext';

export default function AppLayout() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const colors = useColors();
  const updatePrefs = useUpdateAccountPreferences();

  // Attach the Clerk bearer token to every API request. Set during render (not
  // only in an effect) so it's in place before child screens fire their first
  // queries — mobile has no cookie jar, so a missing token means a 401.
  setAuthTokenGetter(() => getToken());
  useEffect(() => {
    setAuthTokenGetter(() => getToken());
  }, [getToken]);

  // Mark the tour completed (or skipped) in the server-side account preferences
  // so the tour never auto-launches again. Best-effort: a failure just means the
  // tour may reopen on the next cold start.
  const handleTourDone = useCallback(async () => {
    try {
      await updatePrefs.mutateAsync({ data: { hasCompletedTour: true } });
    } catch {
      // Intentionally swallowed — failing to save this flag isn't fatal.
    }
  }, [updatePrefs]);

  if (!isLoaded) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        }}
      >
        {/* Branded loading treatment instead of a raw spinner (Mascot is
            reduced-motion aware internally). */}
        <Mascot pose="wave" size={120} motion="float" />
      </View>
    );
  }

  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;

  return (
    <EntitlementsProvider>
      <PurchasesProvider>
        <LanguageProvider>
          <TourProvider onDone={handleTourDone}>
            {/* Watches account preferences and auto-opens the tour for first-time users */}
            <TourBootstrapper />
            <GuidedTour />
            <ReminderScheduler />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="category/[id]" />
              <Stack.Screen name="practice/[id]" />
              <Stack.Screen name="practice/daily" />
              <Stack.Screen name="badges" />
              <Stack.Screen name="journey" />
              <Stack.Screen name="analytics" />
              <Stack.Screen name="account/index" />
              <Stack.Screen name="account/reminders" />
              <Stack.Screen name="account/subscription" />
              <Stack.Screen name="account/email" />
              <Stack.Screen name="account/password" />
              <Stack.Screen name="choose-language" />
              <Stack.Screen name="language" options={{ presentation: 'modal' }} />
              <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
            </Stack>
          </TourProvider>
        </LanguageProvider>
      </PurchasesProvider>
    </EntitlementsProvider>
  );
}

/**
 * Invisible component that lives inside TourProvider. Fetches the account
 * preferences once and auto-opens the tour when `hasCompletedTour` is false.
 * Using a child component lets us call useTour() inside the same provider tree.
 *
 * The B1 language-choice redirect gate (LanguageChoiceBootstrapper) and its
 * tour hold were removed by product decision (July 30 2026): fresh accounts
 * land directly on home with the seeded default language, and the tour fires
 * on first home load. /choose-language remains a normal navigable route.
 */
function TourBootstrapper() {
  const account = useGetAccount();
  const { openTour } = useTour();
  const launched = useRef(false);

  useEffect(() => {
    if (
      !launched.current &&
      account.data &&
      !account.data.preferences.learning.hasCompletedTour
    ) {
      launched.current = true;
      openTour();
    }
  }, [account.data, openTour]);

  return null;
}
