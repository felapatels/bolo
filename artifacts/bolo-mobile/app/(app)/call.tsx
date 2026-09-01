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
 * ITS THREE TURNS NOW COVER THE THREE OUTCOMES, chai, a miss and XP, because
 * the glow at the screen edge and the pill under the caption are exactly the
 * things that cannot be judged from a test. Cycling them is how the whole set
 * is seen on a simulator with no server behind it.
 *
 * Drive it on the simulator with:
 *   xcrun simctl openurl booted "bolo-mobile://call"                     the real journey call
 *   xcrun simctl openurl booted "bolo-mobile://call?mode=game"           the real games call
 *   xcrun simctl openurl booted "bolo-mobile://call?fake=1&phase=connected"
 */
import React from 'react';
import { Alert, BackHandler, Platform, StatusBar } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { IncomingCall } from '@/components/call/IncomingCall';
import { InCall, type CallPhase } from '@/components/call/InCall';
import { isCallBackdropId, type CallBackdropId } from '@/components/call/backdrops';
import { useLiveCall } from '@/components/call/useLiveCall';
import { warmCallServer } from '@/lib/chachaCallApi';
import type { CallMode } from '@/lib/chachaCallApi';

/**
 * SCAFFOLDING, NOT CONTENT, and only reachable with ?fake=1. Gujarati, and
 * unverified: nobody who speaks it has read these. They exist to put real
 * script and a real romanization on screen at real lengths so the caption
 * layout can be judged without a network. Nothing should ever be taught from
 * them.
 */
const FAKE_TURNS = [
  { text: 'કેમ છો, બેટા? મજામાં?', romanized: 'Kem chho, beta? Majama?', chai: 1, xp: 0, heard: true },
  { text: 'વાહ! આજે શું ખાધું?', romanized: 'Waah! Aaje shu khadhu?', chai: 0, xp: 0, heard: false },
  { text: 'રોટલી અને દાળ? બહુ સરસ.', romanized: 'Rotli ane daal? Bahu saras.', chai: 0, xp: 5, heard: true },
];

export default function CallScreen() {
  const params = useLocalSearchParams<{
    backdrop?: string;
    fake?: string;
    mode?: string;
    phase?: string;
    say?: string;
  }>();
  // The games hub opens this with ?mode=game; the journey's interruption does
  // not pass one, and the default is deliberately the shorter call.
  const mode: CallMode = params.mode === 'game' ? 'game' : 'journey';
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

  /**
   * A FAILED CALL SAYS WHY BEFORE IT GOES.
   *
   * Every failure in useLiveCall funnels through one finish(message), which
   * stored the message and then navigated straight out. Nothing rendered it, so
   * a missing microphone, an undeployed route and a dropped turn all produced
   * the SAME symptom: answer, instant hang-up, silence.
   *
   * That cost a real afternoon on 2026-08-28. The owner reported "when i answer,
   * it hangs up", two of us guessed at causes off identical screenshots, I put
   * the microphone first and it was the server: a publish had failed at the
   * database diff step and the routes were never deployed. The message the app
   * already had, "Chacha-ji could not get through", would have said so in five
   * seconds.
   *
   * The strings are already written and already in a learner's voice. They only
   * ever needed somewhere to go. An Alert rather than a designed panel on
   * purpose: it needs no layout on a full-bleed video screen, it cannot be
   * missed, and the learner has to acknowledge it before they land back where
   * they started wondering what happened.
   */
  const reportedRef = React.useRef<string | null>(null);
  const leaveWithReason = React.useCallback(
    (reason?: string | null) => {
      if (reason && reportedRef.current !== reason) {
        reportedRef.current = reason;
        Alert.alert('The call ended', reason, [{ text: 'OK', onPress: leave }]);
        return;
      }
      leave();
    },
    [leave],
  );

  const { state, answer, hangUp, startTalking, stopTalking } = useLiveCall({
    initialBackdrop,
    mode,
    onFinished: leaveWithReason,
  });

  /**
   * WAKE THE SERVER WHILE HE RINGS. The deployment is autoscale and scales to
   * zero, and a cold container needs about 8 seconds to open its port. A
   * learner who answers into that window gets "Chacha-ji could not get
   * through", which is exactly what build 533 did on TestFlight.
   *
   * Ringing is dead time we already spend, so spending it on a health ping
   * costs nothing and usually removes the whole window before Answer is even
   * tapped. Once, on mount, and never awaited: this is a head start, not a
   * gate, and startCall's retry is what actually has to hold if it fails.
   */
  React.useEffect(() => {
    warmCallServer();
  }, []);

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
  const [fakeVoicing, setFakeVoicing] = React.useState(false);

  // The real call waits about a second between his turn starting and his voice
  // arriving. The scaffolding reproduces it so the held mouth can be watched.
  React.useEffect(() => {
    if (!fake || !fakeConnected) return;
    if (fakePhase !== 'speaking') {
      setFakeVoicing(false);
      return;
    }
    setFakeVoicing(false);
    const t = setTimeout(() => setFakeVoicing(true), 1000);
    return () => clearTimeout(t);
  }, [fake, fakeConnected, fakePhase, fakeTurn]);

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
            chaiEarned={current.chai}
            xpEarned={current.xp}
            outcome={current.heard ? 'earned' : 'missed'}
            // The scaffolding holds his mouth shut for the first beat of each
            // speaking turn, so the wait the real call has is visible here too.
            voicing={fakePhase === 'speaking' ? fakeVoicing : true}
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
          level={state.level}
          chaiEarned={state.chaiEarned}
          xpEarned={state.xpEarned}
          outcome={state.outcome}
          heard={state.heard}
          heardRomanized={state.heardRomanized}
          heardEnglish={state.heardEnglish}
          voicing={state.voicing}
          languageName={state.languageName}
          talking={state.status === 'talking'}
          onTalkStart={() => void startTalking()}
          onTalkEnd={stopTalking}
          backdrop={state.backdrop}
          selfView={state.selfView}
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
