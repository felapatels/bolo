import { useEffect } from 'react';
import { View } from 'react-native';
import { useAuth } from '@clerk/expo';
import { Redirect, Stack } from 'expo-router';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { ReminderScheduler } from '@/components/ReminderScheduler';
import { Mascot } from '@/components/Mascot';
import { EntitlementsProvider } from '@/contexts/EntitlementsContext';
import { PurchasesProvider } from '@/contexts/PurchasesContext';
import { EquippedOutfitProvider } from '@/contexts/OutfitContext';
import { useColors } from '@/hooks/useColors';

export default function AppLayout() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const colors = useColors();

  // Attach the Clerk bearer token to every API request. Set during render (not
  // only in an effect) so it's in place before child screens fire their first
  // queries — mobile has no cookie jar, so a missing token means a 401.
  setAuthTokenGetter(() => getToken());
  useEffect(() => {
    setAuthTokenGetter(() => getToken());
  }, [getToken]);

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
        {/* What Bolo is wearing, resolved once for every mascot on screen. */}
        <EquippedOutfitProvider>
        <LanguageProvider>
            <ReminderScheduler />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="phrasebook" />
              <Stack.Screen name="category/[id]" />
              <Stack.Screen name="practice/[id]" />
              <Stack.Screen name="practice/daily" />
              <Stack.Screen name="badges" />
              <Stack.Screen name="journey" />
              <Stack.Screen name="outfits" />
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
        </LanguageProvider>
        </EquippedOutfitProvider>
      </PurchasesProvider>
    </EntitlementsProvider>
  );
}

// Note: the B1 language-choice redirect gate (LanguageChoiceBootstrapper) was
// removed by product decision (July 30 2026): fresh accounts land directly on
// home with the seeded default language, and /choose-language remains a
// normal navigable route. The guided tour (and its TourBootstrapper) was
// removed entirely in Task #906; the server-side hasCompletedTour preference
// field still exists but nothing on the client reads or writes it anymore.
