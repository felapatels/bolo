import QRCode from 'react-native-qrcode-svg';
import { View } from 'react-native';

/**
 * The learner's friend code as a scannable square.
 *
 * Encodes the join LINK rather than the bare code, so a phone's ordinary camera
 * app opens Bolo! straight away instead of showing letters the reader then has
 * to type. The in-app scanner understands both shapes (see `parseReferralScan`
 * in @workspace/referral-link).
 *
 * Pure JS on top of react-native-svg, which the app already ships — no native
 * module, so this renders in every existing build.
 */
export function FriendQr({ value, size = 148 }: { value: string; size?: number }) {
  return (
    <View
      testID="friend-qr"
      accessible
      accessibilityRole="image"
      accessibilityLabel="QR code for your friend code"
      // White plate regardless of theme: scanners want maximum contrast, and a
      // dark-mode QR in brand teal is measurably harder to read.
      style={{ backgroundColor: '#ffffff', padding: 10, borderRadius: 16 }}
    >
      <QRCode value={value} size={size} backgroundColor="#ffffff" color="#000000" />
    </View>
  );
}
