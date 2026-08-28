/**
 * Chacha-ji's call. THE RINGING STATE ONLY, so far.
 *
 * Answering is not built yet and this screen says so rather than pretending:
 * onAnswer leaves a marker and returns. The question this screen exists to
 * answer first is whether a fake call FEELS like a call, and that is worth
 * settling before a single real turn is wired to it.
 *
 * NO SERVER IS INVOLVED HERE YET. The backdrop is picked locally so the screen
 * can be driven on a simulator with nothing running behind it. THE REAL
 * CONTRACT IS ALREADY DIFFERENT AND MUST WIN when this is wired up: the API
 * picks ONE backdrop when the call is created and returns the same one on every
 * turn, because the two clips are different scenes and swapping mid-call would
 * move him into another car in the middle of a sentence. The `backdrop` search
 * param below is the seam that server value will arrive through.
 *
 * Drive it on the simulator with:
 *   xcrun simctl openurl booted "bolo-mobile://call"
 *   xcrun simctl openurl booted "bolo-mobile://call?backdrop=backseat"
 */
import React from 'react';
import { BackHandler, Platform, StatusBar } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { IncomingCall, type CallBackdropId } from '@/components/call/IncomingCall';

function isBackdropId(v: unknown): v is CallBackdropId {
  return v === 'driving' || v === 'backseat';
}

export default function CallScreen() {
  const params = useLocalSearchParams<{ backdrop?: string }>();

  // Chosen ONCE for the life of this screen. Re-picking on a re-render would
  // change cars mid-call, which is the one thing the backdrop rule forbids.
  const [backdrop] = React.useState<CallBackdropId>(() =>
    isBackdropId(params.backdrop)
      ? params.backdrop
      : Math.random() < 0.5
        ? 'driving'
        : 'backseat',
  );

  const leave = React.useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)');
  }, []);

  /**
   * ANDROID HAS A HARDWARE BACK BUTTON AND iOS DOES NOT, so this is the one
   * behaviour that genuinely has to differ rather than merely look different.
   *
   * Back is treated as IGNORING the call, not as dismissing a screen. That is
   * the same outcome as the Ignore button on purpose: he rings again later,
   * nothing is lost, and a learner who panics and hits back has not
   * accidentally taken a different path from one who chose to ignore it.
   */
  React.useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      leave();
      return true;
    });
    return () => sub.remove();
  }, [leave]);

  return (
    <>
      {/* Light content over his face, on both platforms: the scrim behind the
          type is dark whichever theme the learner runs. */}
      <StatusBar barStyle="light-content" />
      <IncomingCall
        backdrop={backdrop}
        onAnswer={() => {
          // NOT BUILT YET, AND THIS MUST NOT PRETEND IT IS. The in-call screen
          // is the next piece of work; until it exists, answering logs and
          // leaves rather than dropping the learner somewhere blank.
          console.log('[chacha-call] answered', { backdrop });
          leave();
        }}
        onIgnore={() => {
          console.log('[chacha-call] ignored', { backdrop });
          leave();
        }}
      />
    </>
  );
}
