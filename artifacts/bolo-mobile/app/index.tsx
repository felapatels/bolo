import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '@clerk/expo';
import { Redirect } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { crumb } from './_layout';

export default function Index() {
  const { isLoaded, isSignedIn } = useAuth();
  const colors = useColors();
  crumb(`index route render (authLoaded=${isLoaded} signedIn=${isSignedIn})`);

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

  return (
    <Redirect href={isSignedIn ? '/(app)/(tabs)' : '/(auth)/sign-in'} />
  );
}
