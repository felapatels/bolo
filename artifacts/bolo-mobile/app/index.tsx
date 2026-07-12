import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '@clerk/expo';
import { Redirect } from 'expo-router';
import { useColors } from '@/hooks/useColors';

export default function Index() {
  const { isLoaded, isSignedIn } = useAuth();
  const colors = useColors();

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
