import React from 'react';
import { useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import {
  RECORDING_PRESET,
  SILENCE_DURATION_MS,
  SPEECH_MIN_DB,
  SILENCE_DROP_DB,
  meteringToAmplitude,
  SILENCE_THRESHOLD_DB,
  ensureRecordingMode,
  playBase64Audio,
  playStreamingAudio,
  prepareRecorderInSession,
  prepareRecordingSession,
  stopAndReadRecording,
  type PlaybackHandle,
} from '@/lib/audio';
import {
  absoluteCallUrl,
  callAudioHeaders,
  endCall,
  fetchTurn,
  sendTurn,
  startCall,
} from '@/lib/chachaCallApi';
import { Sentry } from '@/lib/sentry';
import type { CallMode } from '@/lib/chachaCallApi';
import type { CallBackdropId } from './backdrops';

/**
 * A real call with Chacha-ji, against the real server.
 *
 * ONE TURN, END TO END:
 *   record the learner, stopping itself on silence
 *   POST the clip, which answers in about 30 ms with an audio URL
 *   start playing that URL immediately, progressively
 *   ask a SECOND, BLOCKING request for his words, for the captions
 *   when the audio finishes, listen again, or hang up if the agenda is done
 *
 * THE TWO REQUESTS ARE THE WHOLE LATENCY STORY. Measured on this repo's key:
 * one hop through gpt-audio puts his first audio byte at about 1.0 s warm,
 * against about 1.9 s for the three-hop path chat uses. Waiting for the full
 * reply before playing anything would give that back and land near 3 s, which
 * is the walkie-talkie this feature was measured specifically to avoid. React
 * Native cannot stream a response body, so his WORDS cannot ride the same
 * response as the URL; hence the second request, which blocks server-side
 * rather than being polled.
 *
 * NOTHING HERE SCORES ANYONE. There is no correct/incorrect, no chai and no
 * strikes in this build, by decision: all of that is reward stacked on an
 * interaction nobody has yet heard work on a real device.
 *
 * EVERY FAILURE ENDS THE CALL GENTLY RATHER THAN THROWING. A learner whose
 * network drops mid-sentence should see the call end, not a red screen.
 */

export type LiveCallStatus =
  | 'ringing'
  | 'connecting'
  | 'speaking'
  | 'listening'
  // The learner is holding the button down and being recorded.
  | 'talking'
  | 'ending'
  | 'ended'
  | 'error';

export interface LiveCallState {
  status: LiveCallStatus;
  backdrop: CallBackdropId;
  text: string;
  romanized: string | null;
  /**
   * True once his voice is ACTUALLY coming out of the speaker.
   *
   * SEPARATE FROM `status === 'speaking'`, which only means it is his turn.
   * The gap between the two is the model generating, about a second warm, and
   * the backdrop used to loop through all of it so he mouthed words nobody
   * could hear (owner, 2026-08-28: "he starts talking at the begining of his
   * turn but sometimes audio takes a second"). The film waits for this.
   */
  voicing: boolean;
  elapsedSeconds: number;
  error: string | null;
  /**
   * The learner's own level, 0..1, while it is their turn.
   *
   * SHOWN TO THEM RATHER THAN KEPT INTERNAL (owner, 2026-08-28: "I can't tell
   * that my response is being captured"). He is right and it is a design fault
   * rather than a polish item: this call has no press-and-hold, so a learner
   * who is talking has nothing at all telling them the phone is listening.
   * A silent, still screen during your own turn is indistinguishable from a
   * broken one, which is exactly the confusion that cost this session an
   * afternoon.
   */
  level: number;
  /**
   * Chai just credited for the turn they answered. Non-zero for one beat, then
   * cleared, because it drives a float-up-and-fade rather than a running total:
   * the wallet holds the total, this is the moment of getting one.
   */
  chaiEarned: number;
  /**
   * XP just credited for the turn they answered. The GAME call's currency:
   * chai is what he gives you for picking up when HE rang, XP is what every
   * other game on the hub pays. Never both in one call (owner, 2026-08-28).
   */
  xpEarned: number;
  /**
   * How the turn they just answered went, for the glow around the screen edge.
   *
   * `earned`  he heard them and the turn paid.
   * `missed`  he heard nothing, so it paid nothing.
   * `null`    nothing to say, which is most of the time.
   *
   * IT IS NOT A SCORE AND MUST NEVER BECOME ONE. Nothing here reads WHAT they
   * said, only whether they said anything. A call is an event, not a lesson.
   */
  outcome: 'earned' | 'missed' | null;
  /** The language this call is fixed to, shown under the clock. */
  languageName: string | null;

}

export interface UseLiveCallOptions {
  /** Backdrop to show while ringing, before the server has told us its choice. */
  initialBackdrop: CallBackdropId;
  /**
   * Which call this is. The journey's interruption unless the games hub says
   * otherwise; the default is the shorter one on purpose.
   */
  mode?: CallMode;
  /** Called once the call is over and the screen should go away. */
  /**
   * Called when the call is over. The reason is passed through so the screen
   * can TELL the learner: every failure used to funnel into a silent navigate,
   * which made a missing microphone, an undeployed route and a dropped turn
   * indistinguishable. Undefined means a normal, deliberate hang-up.
   */
  onFinished: (reason?: string | null) => void;
}

export function useLiveCall({
  initialBackdrop,
  mode = 'journey',
  onFinished,
}: UseLiveCallOptions) {
  const recorder = useAudioRecorder(RECORDING_PRESET);
  const recorderState = useAudioRecorderState(recorder, 100);

  const [state, setState] = React.useState<LiveCallState>({
    status: 'ringing',
    backdrop: initialBackdrop,
    text: '',
    romanized: null,
    voicing: false,
    elapsedSeconds: 0,
    error: null,
    level: 0,
    chaiEarned: 0,
    xpEarned: 0,
    outcome: null,
    languageName: null,
  });

  const callIdRef = React.useRef<string | null>(null);
  const turnIndexRef = React.useRef(0);
  const playbackRef = React.useRef<PlaybackHandle | null>(null);
  const aliveRef = React.useRef(true);
  const overRef = React.useRef(false);
  // Silence auto-stop bookkeeping. Speech must be HEARD before silence can end
  // a turn, or the recorder stops during the pause before the learner starts.
  const heardSpeechRef = React.useRef(false);
  const quietSinceRef = React.useRef<number | null>(null);
  /**
   * hangUp is declared below submitTurn but called from inside it. A direct
   * reference would work only because the call happens after render; a ref
   * says so instead of relying on it, and survives anyone reordering the file.
   */
  const hangUpRef = React.useRef<() => Promise<void>>(async () => {});
  /** Same reason as hangUpRef above: stopTalking is declared before submitTurn. */
  const submitTurnRef = React.useRef<() => Promise<void>>(async () => {});

  const patch = React.useCallback((p: Partial<LiveCallState>) => {
    if (!aliveRef.current) return;
    setState((s) => ({ ...s, ...p }));
  }, []);

  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      try {
        playbackRef.current?.stop();
      } catch {
        // A player already torn down is not worth a crash on the way out.
      }
      // Hang up on the server too, so the session is not left waiting out its
      // TTL holding a learner's call open.
      const id = callIdRef.current;
      if (id) void endCall(id).catch(() => {});
    };
  }, []);

  // The call clock.
  React.useEffect(() => {
    if (state.status === 'ringing' || state.status === 'ended') return;
    const t = setInterval(
      () => patch({ elapsedSeconds: stateRef.current.elapsedSeconds + 1 }),
      1000,
    );
    return () => clearInterval(t);
  }, [state.status, patch]);

  // Kept so the clock does not need `state` in its dependency list.
  const stateRef = React.useRef(state);
  stateRef.current = state;

  /**
   * End the call. With a message, it ended badly.
   *
   * A FAILED CALL LEAVES QUIETLY BUT NOT SILENTLY. Quietly, because the design
   * is that he rings again later and an error dialog over a call nobody could
   * take is noise on top of a disappointment. NOT silently, because this app
   * has already had a total outage that produced no alert and was found by a
   * human using it. Every failed call is reported, with the stage it died at,
   * so a call that never connects for real learners is visible to somebody.
   */
  const finish = React.useCallback(
    (message?: string, cause?: unknown) => {
      if (!aliveRef.current) return;
      if (message) {
        // AND IT LEAVES A TRACE IN METRO TOO. Sentry alone is not enough while
        // the feature is being built: this repo's api-server has never
        // delivered one event, and on 2026-08-28 a failed call was debugged for
        // an afternoon with an empty Metro log because the underlying error
        // only ever went to a dashboard. Tagged so it can be grepped out of the
        // RevenueCat noise: `grep "\[call\]" metro.log`.
        console.error('[call] ended badly:', message, cause);
        Sentry.captureException(
          cause instanceof Error ? cause : new Error(`chacha-call: ${message}`),
          {
            tags: { feature: 'chacha-call' },
            // In the MESSAGE and in tags, not in extras: Sentry's default
            // scrubbing eats extras keyed on anything token-like, and this
            // repo has already lost a diagnostic field that way.
            extra: { stage: message, turnIndex: turnIndexRef.current },
          },
        );
      }
      patch({ status: message ? 'error' : 'ended', error: message ?? null });
      onFinished(message ?? null);
    },
    [patch, onFinished],
  );

  /**
   * PRESS AND HOLD TO TALK, replacing an automatic silence detector.
   *
   * The owner's verdict on the automatic version was "it waits too long", and
   * that is inherent rather than tunable: the turn could only end after
   * SILENCE_DURATION_MS of proven quiet, so every single reply carried two
   * dead seconds before anything happened. Dropping that number to feel quick
   * would start cutting learners off mid-sentence, which is the exact trade the
   * constant's own comment says was already lost once at 1.6s.
   *
   * A finger has neither problem. Release IS the end of the turn, so there is
   * nothing to wait for, and a noisy room cannot submit on the learner's behalf,
   * which is what the mute button existed to solve. Mute is gone with it.
   *
   * It is also what every other speaking surface in this app already does, so a
   * learner who has used chat or practice already knows how to talk to him.
   */
  const startTalking = React.useCallback(async () => {
    const callId = callIdRef.current;
    if (!callId || !aliveRef.current) return;
    try {
      heardSpeechRef.current = false;
      quietSinceRef.current = null;
      /**
       * RELEASE HIS PLAYER BEFORE ASKING FOR THE MICROPHONE.
       *
       * This is called FROM the playback's own onEnded callback, so
       * playbackRef still holds a finished player, and on iOS a live player
       * keeps the audio session in playback. prepareRecorderInSession
       * re-applies `playAndRecord` and the recorder then would not start:
       * "The microphone would not start", every call, immediately after his
       * first line (owner, 2026-08-28, on a live server).
       *
       * PROVEN BY A CONTROL RATHER THAN GUESSED. Holding the nav parrot in Bolo
       * Chat records fine on the same simulator, so the device was never the
       * problem. The difference is that chat.tsx stops AND NULLS the player
       * before it prepares the recorder, for the same reason, with a comment
       * about stuck 'playing' states. The call skipped that step.
       *
       * Nulling matters as much as stopping: a retained handle is what holds
       * the session, so dropping the reference is half the release.
       */
      try {
        playbackRef.current?.stop();
      } catch {
        // Already finished. Releasing the reference below is the part that counts.
      }
      playbackRef.current = null;
      await prepareRecorderInSession(recorder);
      await ensureRecordingMode();
      recorder.record();
      patch({ status: 'talking' });
    } catch (err) {
      // A microphone that will not start ends the call rather than leaving the
      // learner talking to a phone that is not listening.
      finish('The microphone would not start.', err);
    }
  }, [recorder, patch, finish]);

  /** Release: end the turn and send what was captured. */
  const stopTalking = React.useCallback(() => {
    // Guarded rather than assumed: a release with no matching press (a stray
    // pointer-cancel, or a tap so short the prepare has not resolved) must not
    // send an empty turn and burn one of the learner's ten.
    if (stateRef.current.status !== 'talking') return;
    void submitTurnRef.current();
  }, []);

  /**
   * SHOWS THE LEARNER WHAT THE TURN DID, and it is the only feedback on this
   * screen. Owner ruling, 2026-08-28: a turn earns when he HEARD them, and a
   * turn he heard nothing in earns nothing and says so.
   *
   * NOT A SCORE, AND NEVER RED. Nothing reads WHAT they said, only whether
   * they said it, and often the failure is ours rather than theirs. The miss
   * is a calm amber with a word and an ear beside it, so it reads as "say that
   * again when you like" rather than as a mark. There is no wrong answer in
   * this feature and there must never be a colour claiming there is.
   *
   * Cleared after the float has flown, so the next turn re-triggers the
   * animation rather than finding the value unchanged.
   */
  const showOutcome = React.useCallback(
    (turn: { chaiEarned?: number; xpEarned?: number; heardSomething?: boolean }) => {
      const chai = turn.chaiEarned ?? 0;
      const xp = turn.xpEarned ?? 0;
      const earned = chai > 0 || xp > 0;
      // `heardSomething` is server-authoritative. An older server that does not
      // send it leaves the miss unreported rather than guessing one.
      const missed = turn.heardSomething === false;
      if (!earned && !missed) return;
      patch({
        chaiEarned: chai,
        xpEarned: xp,
        outcome: earned ? 'earned' : 'missed',
      });
      setTimeout(() => {
        if (aliveRef.current) patch({ chaiEarned: 0, xpEarned: 0, outcome: null });
      }, 2200);
    },
    [patch],
  );

  /** Stop recording and run one turn. */
  const submitTurn = React.useCallback(async () => {
    const callId = callIdRef.current;
    if (!callId || !aliveRef.current) return;
    const index = turnIndexRef.current;
    try {
      const audio = await stopAndReadRecording(recorder);
      // His turn, but not his VOICE yet: the film waits for the first sound.
      patch({ status: 'speaking', voicing: false });

      const started = await sendTurn(callId, audio, 'wav');
      turnIndexRef.current = index + 1;

      // Playback and captions run TOGETHER. The audio must not wait on the
      // words: the words are bookkeeping and the voice is the feature.
      const headers = await callAudioHeaders();
      const handle = await playStreamingAudio(
        absoluteCallUrl(started.audioUrl),
        headers,
        () => {
          if (!aliveRef.current) return;
          if (overRef.current) void hangUpRef.current();
          else patch({ status: 'listening', voicing: false });
        },
        () => {
          if (aliveRef.current) patch({ voicing: true });
        },
      );
      playbackRef.current = handle;

      void fetchTurn(callId, index)
        .then((turn) => {
          if (!turn || !aliveRef.current) return;
          overRef.current = turn.over;
          patch({ text: turn.text, romanized: turn.romanized });
          showOutcome(turn);
        })
        .catch(() => {
          // No caption is survivable. A call the learner can hear but not read
          // is still a call; an error over it is not.
        });
    } catch (err) {
      finish('The call dropped.', err);
    }
  }, [recorder, patch, finish, showOutcome]);

  /** Answer. Plays his canned hello, then starts listening. */
  const answer = React.useCallback(async () => {
    if (!aliveRef.current) return;
    patch({ status: 'connecting' });
    try {
      const granted = await prepareRecordingSession();
      if (!granted) {
        finish('Bolo needs your microphone for a call.');
        return;
      }
      const call = await startCall(mode);
      if (!aliveRef.current) return;
      callIdRef.current = call.callId;
      patch({
        languageName: call.languageName ?? null,
        backdrop: call.backdrop.id,
        text: call.beat.text,
        // His hello is in the learner's language now, so it gets the second
        // caption line every other beat has. It was null when the line was one
        // hardcoded Hinglish string and there was nothing to romanize.
        romanized: call.beat.romanized ?? null,
        status: 'speaking',
        voicing: false,
      });

      if (call.audioBase64 && call.format) {
        playbackRef.current = await playBase64Audio(
          call.audioBase64,
          call.format,
          () => {
            if (aliveRef.current) patch({ status: 'listening', voicing: false });
          },
          () => {
            if (aliveRef.current) patch({ voicing: true });
          },
        );
      } else {
        // No greeting audio is survivable: his line is on screen and the call
        // moves straight to the learner's turn rather than stalling in silence.
        patch({ status: 'listening', voicing: false });
      }
    } catch (err) {
      finish('Chacha-ji could not get through.', err);
    }
  }, [patch, finish, mode]);

  const hangUp = React.useCallback(async () => {
    const callId = callIdRef.current;
    callIdRef.current = null;
    try {
      playbackRef.current?.stop();
    } catch {
      // Already gone.
    }
    patch({ status: 'ending' });
    if (callId) await endCall(callId).catch(() => {});
    finish();
  }, [patch, finish]);

  hangUpRef.current = hangUp;
  submitTurnRef.current = submitTurn;

  /**
   * Silence auto-stop. Speech has to be HEARD first, then a run of quiet ends
   * the turn, using the same thresholds every other recording surface in the
   * app uses so a learner's pause means the same thing everywhere.
   */
  /**
   * THE LEVEL THE LEARNER WATCHES WHILE THEY HOLD.
   *
   * All that is left of what used to be an adaptive silence detector. That
   * detector is gone with the automatic turn: release ends a turn now, so
   * nothing has to infer when someone stopped talking, and the two seconds of
   * proven quiet it needed are two seconds nobody waits any more.
   *
   * Three real bugs died with it, all found on a live call on 2026-08-28 and
   * all worth remembering if an automatic mode ever comes back: a finished
   * player still held the audio session so the recorder would not start; the
   * check was keyed on the meter CHANGING, and real quiet is the one condition
   * where a level plateaus; and it used a fixed dB floor that lib/audio.ts
   * itself says cannot work, because room tone sits above it and reads as
   * speech forever.
   */
  const meteringRef = React.useRef<number | undefined>(undefined);
  meteringRef.current = recorderState.metering;

  React.useEffect(() => {
    if (state.status !== 'listening' && state.status !== 'talking') {
      if (stateRef.current.level !== 0) patch({ level: 0 });
      return;
    }
    const tick = setInterval(() => {
      const db = meteringRef.current;
      patch({
        level:
          state.status === 'talking' && typeof db === 'number' ? meteringToAmplitude(db) : 0,
      });
    }, 100);
    return () => clearInterval(tick);
  }, [state.status, patch]);

  return { state, answer, hangUp, startTalking, stopTalking };
}
