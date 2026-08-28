/**
 * The little window of the learner's own face, the way a video call shows you
 * yourself in the corner.
 *
 * IT IS DECORATION AND MUST NEVER BE LOAD-BEARING. Nothing is recorded, nothing
 * is uploaded, nothing is analysed: the front camera is previewed on the device
 * and that is the whole of it. If permission is refused, or the camera is
 * unavailable, or the learner turns it off, THE CALL CARRIES ON UNCHANGED. A
 * language call that cannot happen because a camera said no would be a bad
 * trade for a nicety.
 *
 * WHICH IS ALSO WHY IT CAN BE TURNED OFF. These learners are often shy, and the
 * feature already bends over backwards not to add pressure. Watching your own
 * face while struggling for a word in a new language is pressure. Tapping the
 * window hides it, and hiding it releases the camera rather than just covering
 * it.
 *
 * ONE THING TO FIX BEFORE THIS SHIPS: app.json's camera permission string still
 * says the camera is for "a profile picture or scan a friend's QR code", which
 * no longer describes this use. Apple expects that string to be accurate. That
 * file belongs to another session, so it is flagged rather than edited here.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { hapticLight } from '@/lib/haptics';

const W = 96;
const H = 132;

export function SelfView({ testID = 'call-self-view' }: { testID?: string }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [hidden, setHidden] = React.useState(false);

  // Asked once, when the call is already up. Deliberately NOT on the ringing
  // screen: a permission sheet on top of a ringing phone is the worst possible
  // moment to interrupt someone.
  React.useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  const granted = permission?.granted === true;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={hidden ? 'Show your camera' : 'Hide your camera'}
      onPress={() => {
        hapticLight();
        setHidden((h) => !h);
      }}
      style={styles.frame}
    >
      {granted && !hidden ? (
        <CameraView
          testID="call-self-view-camera"
          style={StyleSheet.absoluteFill}
          facing="front"
          // No audio: the call's own recorder owns the microphone, and two
          // things holding it is how you lose a turn.
          mode="picture"
          mute
        />
      ) : (
        <View testID="call-self-view-off" style={styles.off}>
          <Ionicons
            name={hidden ? 'eye-off' : 'videocam-off'}
            size={20}
            color="rgba(255,255,255,0.85)"
          />
          <Text style={styles.offText}>{hidden ? 'Hidden' : 'No camera'}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: 'absolute',
    top: 64,
    right: 16,
    width: W,
    height: H,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  off: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  offText: { fontSize: 11, color: 'rgba(255,255,255,0.85)' },
});
