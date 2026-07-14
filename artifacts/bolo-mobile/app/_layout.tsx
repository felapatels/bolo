import React, { useEffect } from 'react';
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

// Temporary crash-hunt breadcrumbs: printed to Metro so we can see exactly how
// far startup gets on a device before Expo Go dies. Dev-only; remove once the
// Expo Go crash is diagnosed.
export const crumb = (msg: string) => {
  if (__DEV__) console.log(`[startup] ${msg}`);
};
crumb('root layout module evaluated');

const queryClient = new QueryClient();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontMap);
  const colors = useColors();

  useEffect(() => {
    if (fontsLoaded || fontError) {
      crumb(`fonts ready (loaded=${fontsLoaded} error=${!!fontError}), hiding splash`);
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    crumb('waiting on fonts');
    return null;
  }
  crumb('rendering provider tree');

  return (
    <ThemeProvider>
      <ClerkProvider
        publishableKey={publishableKey}
        tokenCache={tokenCache}
        proxyUrl={proxyUrl}
      >
        <ClerkLoaded>
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
