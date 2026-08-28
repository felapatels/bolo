import React from 'react';
import { useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import {
  RECORDING_PRESET,
  SILENCE_DURATION_MS,
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
  | 'ending'
  | 'ended'
  | 'error';

export interface LiveCallState {
  status: LiveCallStatus;
  backdrop: CallBackdropId;
  text: string;
  romanized: string | null;
  elapsedSeconds: number;
  error: string | null;
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
  onFinished: () => void;
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
    elapsedSeconds: 0,
    error: null,
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
      onFinished();
    },
    [patch, onFinished],
  );

  /** Record until the learner stops talking, then send the turn. */
  const listen = React.useCallback(async () => {
    const callId = callIdRef.current;
    if (!callId || !aliveRef.current) return;
    try {
      heardSpeechRef.current = false;
      quietSinceRef.current = null;
      await prepareRecorderInSession(recorder);
      await ensureRecordingMode();
      recorder.record();
      patch({ status: 'listening' });
    } catch (err) {
      // A microphone that will not start ends the call rather than leaving the
      // learner talking to a phone that is not listening.
      finish('The microphone would not start.', err);
    }
  }, [recorder, patch, finish]);

  /** Stop recording and run one turn. */
  const submitTurn = React.useCallback(async () => {
    const callId = callIdRef.current;
    if (!callId || !aliveRef.current) return;
    const index = turnIndexRef.current;
    try {
      const audio = await stopAndReadRecording(recorder);
      patch({ status: 'speaking' });

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
          else void listen();
        },
      );
      playbackRef.current = handle;

      void fetchTurn(callId, index)
        .then((turn) => {
          if (!turn || !aliveRef.current) return;
          overRef.current = turn.over;
          patch({ text: turn.text, romanized: turn.romanized });
        })
        .catch(() => {
          // No caption is survivable. A call the learner can hear but not read
          // is still a call; an error over it is not.
        });
    } catch (err) {
      finish('The call dropped.', err);
    }
  }, [recorder, patch, finish, listen]);

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
        backdrop: call.backdrop.id,
        text: call.beat.text,
        romanized: null,
        status: 'speaking',
      });

      if (call.audioBase64 && call.format) {
        playbackRef.current = await playBase64Audio(
          call.audioBase64,
          call.format,
          () => {
            if (aliveRef.current) void listen();
          },
        );
      } else {
        // No greeting audio is survivable: his line is on screen and the call
        // moves straight to the learner's turn rather than stalling in silence.
        void listen();
      }
    } catch (err) {
      finish('Chacha-ji could not get through.', err);
    }
  }, [patch, finish, listen, mode]);

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

  /**
   * Silence auto-stop. Speech has to be HEARD first, then a run of quiet ends
   * the turn, using the same thresholds every other recording surface in the
   * app uses so a learner's pause means the same thing everywhere.
   */
  React.useEffect(() => {
    if (state.status !== 'listening') return;
    const db = recorderState.metering;
    if (typeof db !== 'number') return;

    if (db > SILENCE_THRESHOLD_DB) {
      heardSpeechRef.current = true;
      quietSinceRef.current = null;
      return;
    }
    if (!heardSpeechRef.current) return;
    if (quietSinceRef.current === null) {
      quietSinceRef.current = Date.now();
      return;
    }
    if (Date.now() - quietSinceRef.current >= SILENCE_DURATION_MS) {
      quietSinceRef.current = null;
      void submitTurn();
    }
  }, [state.status, recorderState.metering, submitTurn]);

  return { state, answer, hangUp };
}
