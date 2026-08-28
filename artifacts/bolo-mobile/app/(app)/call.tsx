/**
 * Chacha-ji's call, wired to the server.
 *
 * THE WHOLE CALL LIVES IN useLiveCall. This screen picks which of the two
 * faces to show and gets out of the way: ringing until it is answered, then
 * the connected screen until it ends.
 *
 * `?fake=1` keeps the old scripted turns for looking at layout without a
 * network, which is how both screens were designed. It is scaffolding and is
 * deliberately opt-in, so a real deep link always hits the real call.
 *
 * Drive it on the simulator with:
 *   xcrun simctl openurl booted "bolo-mobile://call"
 *   xcrun simctl openurl booted "bolo-mobile://call?fake=1&phase=connected"
 */
import React from 'react';
import { BackHandler, Platform, StatusBar } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { IncomingCall } from '@/components/call/IncomingCall';
import { InCall, type CallPhase } from '@/components/call/InCall';
import { isCallBackdropId, type CallBackdropId } from '@/components/call/backdrops';
import { useLiveCall } from '@/components/call/useLiveCall';

/**
 * SCAFFOLDING, NOT CONTENT, and only reachable with ?fake=1. Gujarati, and
 * unverified: nobody who speaks it has read these. They exist to put real
 * script and a real romanization on screen at real lengths so the caption
 * layout can be judged without a network. Nothing should ever be taught from
 * them.
 */
const FAKE_TURNS = [
  { text: 'કેમ છો, બેટા? મજામાં?', romanized: 'Kem chho, beta? Majama?' },
  { text: 'વાહ! આજે શું ખાધું?', romanized: 'Waah! Aaje shu khadhu?' },
  { text: 'રોટલી અને દાળ? બહુ સરસ.', romanized: 'Rotli ane daal? Bahu saras.' },
];

export default function CallScreen() {
  const params = useLocalSearchParams<{
    backdrop?: string;
    fake?: string;
    phase?: string;
    say?: string;
  }>();
  const fake = params.fake === '1';

  const [initialBackdrop] = React.useState<CallBackdropId>(() =>
    isCallBackdropId(params.backdrop)
      ? params.backdrop
      : Math.random() < 0.5
        ? 'driving'
        : 'backseat',
  );

  const leave = React.useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)');
  }, []);

  const { state, answer, hangUp } = useLiveCall({
    initialBackdrop,
    onFinished: leave,
  });

  /**
   * Android has a hardware back button and iOS does not, so this is the one
   * behaviour that genuinely has to differ. While RINGING, back means ignore,
   * the same outcome as the Ignore button, so a learner who panics has not
   * taken a different path from one who chose it. Once CONNECTED it hangs up
   * properly, telling the server, rather than abandoning a live call.
   */
  React.useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (state.status === 'ringing') leave();
      else void hangUp();
      return true;
    });
    return () => sub.remove();
  }, [state.status, leave, hangUp]);

  // ---- scaffolding path, ?fake=1 only -----------------------------------
  const [fakeConnected, setFakeConnected] = React.useState(
    fake && params.phase === 'connected',
  );
  const [fakeTurn, setFakeTurn] = React.useState(0);
  const [fakePhase, setFakePhase] = React.useState<CallPhase>(
    params.say === 'listening' ? 'listening' : 'speaking',
  );
  const [fakeElapsed, setFakeElapsed] = React.useState(0);

  React.useEffect(() => {
    if (!fake || !fakeConnected) return;
    const tick = setInterval(() => setFakeElapsed((s) => s + 1), 1000);
    return () => clearInterval(tick);
  }, [fake, fakeConnected]);

  React.useEffect(() => {
    if (!fake || !fakeConnected || params.say) return;
    const t = setTimeout(
      () => {
        if (fakePhase === 'speaking') setFakePhase('listening');
        else {
          setFakePhase('speaking');
          setFakeTurn((i) => Math.min(i + 1, FAKE_TURNS.length - 1));
        }
      },
      fakePhase === 'speaking' ? 4200 : 3400,
    );
    return () => clearTimeout(t);
  }, [fake, fakeConnected, fakePhase, params.say]);

  if (fake) {
    const current = FAKE_TURNS[Math.min(fakeTurn, FAKE_TURNS.length - 1)];
    return (
      <>
        <StatusBar barStyle="light-content" />
        {fakeConnected ? (
          <InCall
            backdrop={initialBackdrop}
            phase={fakePhase}
            text={current.text}
            romanized={current.romanized}
            elapsedSeconds={fakeElapsed}
            onHangUp={leave}
          />
        ) : (
          <IncomingCall
            backdrop={initialBackdrop}
            onAnswer={() => setFakeConnected(true)}
            onIgnore={leave}
          />
        )}
      </>
    );
  }

  // ---- the real call ----------------------------------------------------
  const ringing = state.status === 'ringing';

  return (
    <>
      <StatusBar barStyle="light-content" />
      {ringing ? (
        <IncomingCall
          backdrop={state.backdrop}
          onAnswer={() => void answer()}
          onIgnore={leave}
        />
      ) : (
        <InCall
          backdrop={state.backdrop}
          // Anything that is not his turn to talk is the learner's, including
          // connecting and ending: the still is the safe face to hold.
          phase={state.status === 'speaking' ? 'speaking' : 'listening'}
          text={state.text}
          romanized={state.romanized}
          elapsedSeconds={state.elapsedSeconds}
          onHangUp={() => void hangUp()}
        />
      )}
    </>
  );
}
