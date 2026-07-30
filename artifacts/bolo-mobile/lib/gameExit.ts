/**
 * Confirm-before-discard helper for timed games. Exiting mid-run in a timed
 * game throws away the current attempt, so we ask first. Web (Expo web) has
 * no Alert support, so it falls back to window.confirm.
 */
import { Alert, Platform } from 'react-native';

export function confirmDiscardRun(onConfirm: () => void): void {
  if (Platform.OS === 'web') {
    if (window.confirm('Leave the game? Your progress in this round will be lost.')) {
      onConfirm();
    }
    return;
  }
  Alert.alert('Leave game?', 'Your progress in this round will be lost.', [
    { text: 'Keep playing', style: 'cancel' },
    { text: 'Leave', style: 'destructive', onPress: onConfirm },
  ]);
}
