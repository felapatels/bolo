import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { setAiConsentRequiredListener } from '@workspace/api-client-react';

export function AiConsentNotice() {
  const router = useRouter();
  const showing = useRef(false);
  const lastShown = useRef(0);
  useEffect(() => {
    setAiConsentRequiredListener(() => {
      // A single tap can start a greeting and several audio prefetches.
      if (showing.current || Date.now() - lastShown.current < 3000) return;
      showing.current = true;
      lastShown.current = Date.now();
      const close = () => { showing.current = false; };
      Alert.alert('AI permission is off',
        'This feature needs AI permission. You can turn it on in Account.', [
          { text: 'Not now', style: 'cancel', onPress: close },
          { text: 'Open Account', onPress: () => { close(); router.push('/(app)/account'); } },
        ], { cancelable: true, onDismiss: close });
    });
    return () => setAiConsentRequiredListener(null);
  }, [router]);
  return null;
}
