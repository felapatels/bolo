import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@clerk/expo';
import { Redirect, Stack } from 'expo-router';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { ReminderScheduler } from '@/components/ReminderScheduler';
import { EntitlementsProvider } from '@/contexts/EntitlementsContext';
import { PurchasesProvider } from '@/contexts/PurchasesContext';
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
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;

  return (
    <EntitlementsProvider>
      <PurchasesProvider>
        <LanguageProvider>
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
            <Stack.Screen name="analytics" />
            <Stack.Screen name="account/index" />
            <Stack.Screen name="account/reminders" />
            <Stack.Screen name="account/subscription" />
            <Stack.Screen name="account/email" />
            <Stack.Screen name="account/password" />
            <Stack.Screen name="language" options={{ presentation: 'modal' }} />
            <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
          </Stack>
        </LanguageProvider>
      </PurchasesProvider>
    </EntitlementsProvider>
  );
}
