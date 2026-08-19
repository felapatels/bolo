import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Feather } from '@expo/vector-icons';
import { parseReferralScan } from '@workspace/referral-link';
import { PressableScale } from '@/components/PressableScale';
import { ChunkyButton } from '@/components/ChunkyButton';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

/**
 * Full-screen camera sheet for scanning another learner's friend-code QR.
 *
 * Mobile only. Web shows, shares and types codes instead, there is no camera
 * scan path a browser can be relied on for.
 *
 * A scan produces exactly the same outcome as typing the code by hand: a
 * PENDING friend request the other learner has to accept. Scanning is a faster
 * way to enter a code, never a shortcut past the accept step.
 *
 * expo-camera is a NATIVE module, so this feature does not exist in any build
 * shipped before it was added, a new store build is required. The camera
 * permission strings already come from the expo-image-picker plugin, so
 * app.json needed no change (verified with a prebuild dry run).
 */
export function QrScannerSheet({
  visible,
  onClose,
  onScanned,
}: {
  visible: boolean;
  onClose: () => void;
  onScanned: (code: string) => void;
}) {
  const colors = useColors();
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = React.useState<string | null>(null);
  // The camera fires onBarcodeScanned on every frame that holds a code, so the
  // first accepted read has to latch or a single QR sends a burst of requests
  // straight into the rate limiter.
  const handled = React.useRef(false);

  React.useEffect(() => {
    if (visible) {
      handled.current = false;
      setError(null);
    }
  }, [visible]);

  const granted = permission?.granted === true;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Scan a friend code
          </Text>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Close scanner"
            onPress={onClose}
            hitSlop={10}
            style={[styles.close, { backgroundColor: colors.muted }]}
          >
            <Feather name="x" size={22} color={colors.foreground} />
          </PressableScale>
        </View>

        {granted ? (
          <View style={styles.viewfinder}>
            <CameraView
              testID="qr-camera"
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => {
                if (handled.current) return;
                const code = parseReferralScan(data ?? '');
                if (!code) {
                  // Not one of ours. Keep scanning rather than burning an
                  // attempt on a poster or a wifi QR.
                  setError("That doesn't look like a Bolo! friend code.");
                  return;
                }
                handled.current = true;
                onScanned(code);
              }}
            />
            <View pointerEvents="none" style={styles.reticle} />
          </View>
        ) : (
          <View style={styles.permission}>
            <Feather name="camera-off" size={34} color={colors.mutedForeground} />
            <Text style={[styles.permText, { color: colors.mutedForeground }]}>
              {permission?.canAskAgain === false
                ? 'Camera access is off for Bolo!. Turn it on in Settings to scan a friend code, or type the code instead.'
                : 'Bolo! needs your camera to scan a friend code.'}
            </Text>
            {permission?.canAskAgain !== false ? (
              <ChunkyButton
                title="Allow camera"
                icon="camera"
                onPress={() => void requestPermission()}
                style={{ alignSelf: 'stretch' }}
              />
            ) : null}
          </View>
        )}

        {error ? (
          <Text style={[styles.error, { color: colors.mutedForeground }]}>
            {error}
          </Text>
        ) : (
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Point the camera at your friend&apos;s QR. They&apos;ll get a request
            to accept.
          </Text>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 56, paddingHorizontal: 20, paddingBottom: 32 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  title: { fontFamily: AppFonts.extrabold, fontSize: 22 },
  close: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewfinder: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  reticle: {
    position: 'absolute',
    top: '18%',
    left: '12%',
    right: '12%',
    bottom: '18%',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: 24,
  },
  permission: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  permText: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 300,
  },
  hint: {
    fontFamily: AppFonts.regular,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 18,
  },
  error: {
    fontFamily: AppFonts.semibold,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 18,
  },
});
