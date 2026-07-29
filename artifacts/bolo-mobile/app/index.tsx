import { View } from 'react-native';
import { useAuth } from '@clerk/expo';
import { Redirect } from 'expo-router';
import { Mascot } from '@/components/Mascot';
import { useColors } from '@/hooks/useColors';

export default function Index() {
  const { isLoaded, isSignedIn } = useAuth();
  const colors = useColors();

  if (!isLoaded) {
    // Branded loading treatment instead of a raw spinner: the mascot's idle
    // float (reduced-motion aware inside Mascot) carries the wait.
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        }}
      >
        <Mascot pose="wave" size={120} motion="float" />
      </View>
    );
  }

  return (
    <Redirect href={isSignedIn ? '/(app)/(tabs)' : '/(auth)/sign-in'} />
  );
}
