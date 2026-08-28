/**
 * Chacha-ji's call: ringing, then connected.
 *
 * STILL NO SERVER. The turns below are a local script so the screen can be
 * driven on a simulator with nothing running behind it, which is how the
 * ringing screen was settled and is the fastest way to find out whether this
 * feels like a call. THE REAL CONTRACT ALREADY EXISTS AND MUST WIN when this is
 * wired up:
 *
 *   POST /openai/chacha-call/start          picks the backdrop AND the language
 *   POST /openai/chacha-call/:id/turn       learner audio in, his reply out
 *   POST /openai/chacha-call/:id/end        hang up
 *
 * The server decides the backdrop once per call and returns the same id every
 * turn; it decides the language from the learner's activeLanguage; and it
 * returns his line in the language's own script plus a romanization. The
 * FAKE_TURNS below imitate that shape deliberately, so wiring it up is a swap
 * rather than a rewrite.
 *
 * Drive it on the simulator with:
 *   xcrun simctl openurl booted "bolo-mobile://call"
 *   xcrun simctl openurl booted "bolo-mobile://call?phase=connected"
 *   xcrun simctl openurl booted "bolo-mobile://call?phase=connected&say=listening"
 */
import React from 'react';
import { BackHandler, Platform, StatusBar } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { IncomingCall } from '@/components/call/IncomingCall';
import { InCall, type CallPhase } from '@/components/call/InCall';
import { isCallBackdropId, type CallBackdropId } from '@/components/call/backdrops';

/**
 * SCAFFOLDING, NOT CONTENT. Gujarati, because that is the app's oldest journey
 * language, and unverified: nobody who speaks it has read these. They exist to
 * put real script and a real romanization on screen at real lengths so the
 * caption layout can be judged. They must NOT survive the server being wired
 * up, and nothing should ever be taught from them.
 */
const FAKE_TURNS: {
  text: string;
  romanized: string;
  chaiEarned?: number;
}[] = [
  { text: 'કેમ છો, બેટા? મજામાં?', romanized: 'Kem chho, beta? Majama?' },
  { text: 'વાહ! આજે શું ખાધું?', romanized: 'Waah! Aaje shu khadhu?', chaiEarned: 1 },
  { text: 'રોટલી અને દાળ? બહુ સરસ.', romanized: 'Rotli ane daal? Bahu saras.', chaiEarned: 1 },
];

export default function CallScreen() {
  const params = useLocalSearchParams<{
    backdrop?: string;
    phase?: string;
    say?: string;
  }>();

  const [backdrop] = React.useState<CallBackdropId>(() =>
    isCallBackdropId(params.backdrop)
      ? params.backdrop
      : Math.random() < 0.5
        ? 'driving'
        : 'backseat',
  );

  const [connected, setConnected] = React.useState(params.phase === 'connected');
  const [turn, setTurn] = React.useState(0);
  const [phase, setPhase] = React.useState<CallPhase>(
    params.say === 'listening' ? 'listening' : 'speaking',
  );
  const [elapsed, setElapsed] = React.useState(0);

  const leave = React.useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)');
  }, []);

  /**
   * Android has a hardware back button and iOS does not, so this is the one
   * behaviour that genuinely has to differ. While RINGING, back means ignore,
   * the same outcome as the Ignore button, so a learner who panics has not
   * taken a different path from one who chose it. While CONNECTED it hangs up,
   * because on a call in progress back is the only gesture available and
   * trapping someone in a call would be worse than ending it.
   */
  React.useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      leave();
      return true;
    });
    return () => sub.remove();
  }, [leave]);

  // The call clock, and the fake turn-taking that drives the two backdrop
  // states. Both die with the screen.
  React.useEffect(() => {
    if (!connected) return;
    const tick = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(tick);
  }, [connected]);

  React.useEffect(() => {
    if (!connected || params.say) return;
    const t = setTimeout(
      () => {
        if (phase === 'speaking') setPhase('listening');
        else {
          setPhase('speaking');
          setTurn((i) => Math.min(i + 1, FAKE_TURNS.length - 1));
        }
      },
      phase === 'speaking' ? 4200 : 3400,
    );
    return () => clearTimeout(t);
  }, [connected, phase, params.say]);

  const current = FAKE_TURNS[Math.min(turn, FAKE_TURNS.length - 1)];

  return (
    <>
      <StatusBar barStyle="light-content" />
      {connected ? (
        <InCall
          backdrop={backdrop}
          phase={phase}
          text={current.text}
          romanized={current.romanized}
          // Chai lands with his REACTION to the answer, not while he is still
          // asking, so it only shows on a speaking turn.
          chaiEarned={phase === 'speaking' ? current.chaiEarned : 0}
          elapsedSeconds={elapsed}
          onHangUp={leave}
        />
      ) : (
        <IncomingCall
          backdrop={backdrop}
          onAnswer={() => setConnected(true)}
          onIgnore={leave}
        />
      )}
    </>
  );
}
