import { Platform } from 'react-native';
import {
  AudioModule,
  RecordingPresets,
  createAudioPlayer,
  setAudioModeAsync,
  type AudioRecorder,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { Sentry } from '@/lib/sentry';

// Speech-optimised recording preset: 16 kHz mono at 96 kbps.
// Whisper resamples to 16 kHz internally regardless of input sample rate, so
// sending 44.1 kHz stereo (HIGH_QUALITY default) wastes upload bandwidth
// without improving transcription.
//
// BITRATE (96 kbps, was 32 kbps): the noise-robustness bench
// (docs/specs/noise-robustness-bench.md §7) re-encoded the same clips at both
// rates and scored them. 96 kbps gained +6.1 points at 12 dB SNR with the
// no-score rate falling 15 % → 5 %, replicated at +3.1, and gained +2.4 on
// clean audio — so a quieter encoder budget is never spent on the learner's
// voice, only on the room. Read those deltas against the bench's ±3.8-point
// measurement floor: this is a cheap bet, not a proven win. It is applied
// unconditionally rather than switched on in noisy rooms because the same
// bench found no loudness threshold worth switching anything on, so there is
// no client-side room classifier to gate it with — and at +2.4 on clean audio
// there is nothing to protect quiet rooms from.
//
// `bitRate` is deliberately a TOP-LEVEL field. expo-audio's
// createRecordingOptions spreads the common options first and the platform
// block second, and RecordingPresets.HIGH_QUALITY.ios carries no bitRate of
// its own, so this value reaches AVEncoderBitRateKey on iOS as well as the
// MediaRecorder encoder on Android. That matters: bitrate is the ONLY
// capture-side lever available on iOS without a native build.
//
// Metering stays on for silence auto-stop.
export const RECORDING_PRESET = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
  ios: {
    ...RecordingPresets.HIGH_QUALITY.ios,
    sampleRate: 16000,
    numberOfChannels: 1,
  },
  isMeteringEnabled: true,
};

/**
 * Silence auto-stop tuning, mirroring the web practice flow's semantics:
 * recording ends after a continuous stretch of quiet. Metering reports dBFS
 * (negative numbers, 0 = full scale); levels above the threshold count as
 * speech and reset the timer.
 */
export const SILENCE_THRESHOLD_DB = -45;
// A short pause between syllables is normal speech, not the end of the
// attempt; 2s of continuous quiet is a more reliable "learner is done" signal
// than 1.6s, which was cutting words off mid-attempt on real devices.
export const SILENCE_DURATION_MS = 2000;
/**
 * Real devices rarely sit below a fixed dBFS floor — room tone on a phone
 * mic is often -40..-30 dBFS, which would keep resetting a fixed -45
 * countdown forever. So auto-stop is adaptive: it arms only once actual
 * speech is heard (a peak above SPEECH_MIN_DB) and then treats anything
 * SILENCE_DROP_DB quieter than that peak as silence, never stricter than
 * the absolute SILENCE_THRESHOLD_DB floor. SPEECH_MIN_DB is deliberately
 * lenient (rather than a "confidently loud" bar) so a soft-spoken learner or
 * a phone held at arm's length still arms the countdown; this feature is
 * inherently sensitive to background noise, so callers should tell learners
 * to use it in a quiet room rather than trying to tune noise out entirely.
 */
export const SPEECH_MIN_DB = -40;
export const SILENCE_DROP_DB = 14;

/**
 * Maps recorder metering (dBFS, negative, 0 = full scale) to a normalized
 * 0..1 amplitude for visualization (Spec D2). Roughly -50 dBFS (quiet room)
 * maps to 0 and 0 dBFS (full scale) to 1, clamped at both ends. Visual
 * mapping only — silence auto-stop keeps using raw dBFS thresholds above.
 */
export function meteringToAmplitude(db: number): number {
  return Math.min(1, Math.max(0, (db + 50) / 50));
}

// iOS routes playback to the quiet earpiece (receiver) whenever the audio
// session category is `playAndRecord` — expo-audio never adds the
// `defaultToSpeaker` option and exposes no iOS routing control. Since the
// practice screen keeps recording mode warm for the whole session (so the
// record tap doesn't clip the first syllable), coach playback would come out
// of the earpiece at phone-call volume. Fix: flip to playback-only mode for
// the duration of coach playback and restore recording mode the moment it
// ends. All session operations are serialized through one queue so a
// recorder warm-up prepare (which natively re-asserts `playAndRecord`) can't
// interleave with — and undo — a mode flip.
const RECORDING_MODE = { allowsRecording: true, playsInSilentMode: true };
const PLAYBACK_MODE = { allowsRecording: false, playsInSilentMode: true };

let sessionChain: Promise<unknown> = Promise.resolve();
function enqueueSessionOp<T>(fn: () => Promise<T>): Promise<T> {
  const next = sessionChain.then(fn, fn);
  sessionChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

/** True once the recording session has been configured (mic permission granted). */
let recordingSessionActive = false;
/**
 * The mode the native session was last successfully switched TO — a record of
 * what has been APPLIED, never of what is merely intended.
 *
 * It used to track "which mode the last enqueued flip targets", written
 * synchronously ahead of the op. Two ways that diverged from the device, both
 * ending in a dead microphone behind "Could not start recording":
 *   1. `prepareRecorderInSession` set it true while enqueueing only a
 *      prepare — no mode set at all — so a prepare landing after a playback
 *      flip left the flag claiming recording mode over a playback-only
 *      session, and the deferred restore then skipped its re-assert.
 *   2. A `setAudioModeAsync` that REJECTED left the optimistic true behind
 *      it, and every later caller skipped the re-assert for the rest of the
 *      process. Callers swallow those rejections, so it was silent.
 * So it is now written only after a resolved set, and cleared on failure.
 *
 * The one deliberate exception is `activatePlaybackMode`, which still writes
 * `false` ahead of its op: false is the recoverable direction (a stale false
 * costs one redundant category switch), and the synchronous read in
 * `activateSfxPlaybackRoute` depends on it to skip a redundant flip.
 */
let modeIsRecording = false;

/**
 * Observing the audio session from the outside.
 *
 * Build 37 shipped the applied-mode fix and "Recording failed" reproduced
 * unchanged on iOS, so the mode-flag theory is NOT confirmed and this path
 * stops guessing. Every session op now leaves a breadcrumb (including the ops
 * that deliberately do nothing, which are the ones that used to leave no
 * trace at all), and every failure this path used to swallow is bound and
 * sent with the session state as it stood at that moment.
 *
 * PII: stage name, platform and the three session flags only. No phrase text,
 * no transcripts, no audio, no file URIs. lib/sentry.ts scrubbing is the
 * backstop, not the primary defense.
 */
export type AudioSessionStage =
  | 'prepare_session'
  | 'prepare_recorder'
  | 'start_record'
  | 'flip_playback'
  | 'restore_recording';

/** Which alert line the learner is looking at, when a report follows one. */
export type AudioAlertSite = 'prepare_failed' | 'record_threw';

/** Read-only view of the applied-mode flag. Diagnostics only. */
export function isRecordingModeApplied(): boolean {
  return modeIsRecording;
}

/** Read-only view of the session-configured flag. Diagnostics only. */
export function isRecordingSessionActive(): boolean {
  return recordingSessionActive;
}

/** Read-only view of the playback-mode token. Diagnostics only. */
export function currentPlaybackModeToken(): number {
  return playbackModeToken;
}

/** The session state carried by every breadcrumb and every report. */
function sessionState() {
  return {
    platform: Platform.OS,
    modeIsRecording,
    recordingSessionActive,
    playbackModeToken,
  };
}

/**
 * Breadcrumb for one session op. Ops that decide to do NOTHING breadcrumb
 * too: a skipped restore is invisible in the result, but it is exactly the
 * state that ends in a dead microphone one tap later.
 */
function noteAudioSessionOp(op: string): void {
  Sentry.addBreadcrumb({
    category: 'audio',
    type: 'default',
    level: 'info',
    message: op,
    data: sessionState(),
  });
}

/**
 * Report a session failure that used to be swallowed. Mirrors
 * `reportApiFailure` in lib/apiErrors.ts: never anonymous, always tagged with
 * the stage that failed and the session state at the moment it failed.
 *
 * `alert` names which of the two identical "Recording failed" lines the
 * learner is looking at, so the copy can stay the same for them while the
 * two sites stay distinguishable for us.
 */
export function reportAudioSessionFailure(
  stage: AudioSessionStage,
  err: unknown,
  alert?: AudioAlertSite,
): void {
  const state = sessionState();
  const exception =
    err instanceof Error
      ? err
      : new Error(`audio ${stage} failed: ${String(err)}`);
  Sentry.captureException(exception, {
    tags: {
      audioStage: stage,
      platform: state.platform,
      ...(alert ? { audioAlert: alert } : {}),
    },
    extra: {
      audioStage: stage,
      ...(alert ? { audioAlert: alert } : {}),
      ...state,
    },
  });
}

/**
 * Switch the native session to recording mode, then record that fact.
 *
 * MUST already be running inside the session queue: it calls
 * `setAudioModeAsync` directly rather than enqueueing, because enqueueing
 * from within a queued op would park it behind the op that is awaiting it.
 */
async function applyRecordingMode(): Promise<void> {
  try {
    await setAudioModeAsync(RECORDING_MODE);
  } catch (err) {
    // The set failed, so the native mode is unknown — the flag must not claim
    // recording. False is the recoverable value: the next prepare re-asserts.
    modeIsRecording = false;
    noteAudioSessionOp('mode:recording failed');
    throw err;
  }
  modeIsRecording = true;
  noteAudioSessionOp('mode:recording');
}

/**
 * True if mic permission is already granted. Never prompts - use this to
 * gate background pre-warms so the permission dialog only ever appears in
 * response to a real press (R6, 32.1).
 */
export async function hasRecordingPermission(): Promise<boolean> {
  try {
    const status = await AudioModule.getRecordingPermissionsAsync();
    return status.granted;
  } catch {
    return false;
  }
}

/** Ask for microphone permission and configure the audio session for recording. */
export async function prepareRecordingSession(): Promise<boolean> {
  const status = await AudioModule.requestRecordingPermissionsAsync();
  if (!status.granted) return false;
  // The flag is set inside applyRecordingMode, after the set resolves: a
  // rejection here propagates to the caller with the flag left false, instead
  // of leaving a stale "already recording" claim nothing would ever re-assert.
  await enqueueSessionOp(applyRecordingMode);
  recordingSessionActive = true;
  return true;
}

/**
 * Prepare a recorder inside the serialized session queue. On iOS the native
 * prepare step re-applies the `playAndRecord` category, so it must not run
 * concurrently with (or after) a playback-mode flip while audio is playing.
 */
export function prepareRecorderInSession(
  recorder: AudioRecorder,
): Promise<void> {
  return enqueueSessionOp(async () => {
    // Breadcrumb at ENTRY, not on success: a prepare that hangs or throws is
    // the interesting one, and it would leave no trace from the far side.
    noteAudioSessionOp('prepare');
    // Assert the mode rather than claim it. This used to be a bare
    // `modeIsRecording = true`, which made a prepare landing AFTER a playback
    // flip claim recording mode while the native session stayed playback-only;
    // the clip's deferred restore then saw "already recording" and skipped the
    // re-assert, and record() ran against a playback-only session. The check
    // runs inside the queued unit, so it reads the mode actually applied
    // rather than one still sitting in the queue.
    if (!modeIsRecording) await applyRecordingMode();
    // Pass the preset explicitly: metering must be enabled at prepare time or
    // recorder state never reports levels and silence auto-stop can't work.
    await recorder.prepareToRecordAsync(RECORDING_PRESET);
  });
}

/**
 * Re-assert recording mode (fast category switch) before `recorder.record()`.
 * Await this on every record path.
 *
 * The re-assert is UNCONDITIONAL for a warm session. It used to be skipped
 * when `modeIsRecording` was already true, which meant any stale true — a
 * failed set, or a prepare that claimed the mode without setting it — made
 * this a no-op forever and record() ran against a playback-only session. The
 * skip saved one category switch on a path that already awaits the queue; it
 * cost the microphone. Note this is not what protects a newer playback's mode
 * claim from a stale restore — the playbackModeToken check in each
 * restoreMode is, and it is unchanged.
 */
export function ensureRecordingMode(): Promise<void> {
  noteAudioSessionOp('record');
  if (!recordingSessionActive) {
    // Still wait for any in-flight session op so record() never races one.
    // Breadcrumbed because this returns WITHOUT asserting any mode: a
    // record() that follows it runs on whatever the session happens to be.
    noteAudioSessionOp('record skipped session cold');
    return sessionChain.then(() => undefined);
  }
  return enqueueSessionOp(applyRecordingMode);
}

/** Flip to playback-only mode so iOS routes audio to the speaker. */
function activatePlaybackMode(): Promise<void> {
  modeIsRecording = false;
  return enqueueSessionOp(() => setAudioModeAsync(PLAYBACK_MODE)).then(() => {
    noteAudioSessionOp('mode:playback');
  });
}

/**
 * Route a one-shot UI SFX (the boarding-pass tear, 34B item 4) to the
 * speaker. While the recording session is warm, iOS keeps the
 * `playAndRecord` category and routes playback to the quiet earpiece; flip
 * to playback-only mode first, serialized on the same session-op queue as
 * every other flip so a recorder prepare can't interleave with it. The flip
 * claims the playback-mode token so an older playback's deferred
 * recording-mode restore can't land after it and re-route the SFX mid-clip.
 * Nothing restores recording mode here — the next recorder prepare
 * re-asserts it. No-op (but still serialized) off iOS, when the session was
 * never configured for recording, or when the session is already
 * playback-only.
 */
export function activateSfxPlaybackRoute(): Promise<void> {
  if (Platform.OS !== 'ios' || !recordingSessionActive) {
    // Still wait for any in-flight session op so play() never races one.
    return sessionChain.then(() => undefined);
  }
  // Claim the token FIRST, even when the session is already playback-only:
  // an older playback that just finished may still have a deferred
  // recording-mode restore in flight, and without a newer claim it would
  // land mid-clip and re-route the SFX to the earpiece.
  ++playbackModeToken;
  if (!modeIsRecording) {
    noteAudioSessionOp('flip skipped already playback');
    return sessionChain.then(() => undefined);
  }
  return activatePlaybackMode();
}

/** Read a recorded file's contents as a base64 string (web + native). */
export async function uriToBase64(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.includes(',') ? result.split(',')[1] : result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  return FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

/** Stop a recorder and return the recording as base64. */
export async function stopAndReadRecording(
  recorder: AudioRecorder,
): Promise<string> {
  await recorder.stop();
  const uri = recorder.uri;
  if (!uri) throw new Error('Recording produced no file.');
  return uriToBase64(uri);
}

export type PlaybackHandle = { stop: () => void };

// Monotonic token guarding the iOS playback/record mode flips. When playback
// A is stopped right as playback B starts (e.g. a partial voice stream being
// cut over to the buffered clip), A's deferred `ensureRecordingMode()` must
// not land AFTER B's `activatePlaybackMode()` — that re-routes B's audio to
// the earpiece at near-zero volume. Each new playback claims a token; a
// restore only runs if no newer playback has claimed the mode since.
let playbackModeToken = 0;

/**
 * Play a progressive (still-being-synthesized) audio stream from a URL.
 * Native only: AVPlayer (iOS) and ExoPlayer (Android) handle chunked HTTP
 * audio natively, so playback starts as soon as enough initial bytes arrive —
 * callers on web should use the buffered path instead.
 *
 * Reuses the same iOS earpiece-routing mode flip as playBase64Audio: while
 * the mic session is warm, playback must run in playback-only mode or it
 * comes out of the receiver at phone-call volume.
 */
export async function playStreamingAudio(
  url: string,
  headers: Record<string, string>,
  onDone?: () => void,
): Promise<PlaybackHandle> {
  const needsModeFlip = Platform.OS === 'ios' && recordingSessionActive;
  const myToken = ++playbackModeToken;
  if (needsModeFlip) {
    try {
      await activatePlaybackMode();
    } catch (err) {
      // If the flip fails, still play — quiet audio beats no audio. The
      // failure is no longer silent: a session left in recording mode is a
      // candidate cause of the record() that fails after the clip.
      reportAudioSessionFailure('flip_playback', err);
    }
  }
  const restoreMode = () => {
    // Skip the restore if a newer playback has claimed the mode since —
    // otherwise this stale restore re-routes it to the earpiece. Both skips
    // breadcrumb: a restore that never runs leaves the session in playback
    // mode, and nothing downstream says so until record() fails.
    if (!needsModeFlip) {
      noteAudioSessionOp('restore skipped no flip');
      return;
    }
    if (playbackModeToken !== myToken) {
      noteAudioSessionOp('restore skipped stale token');
      return;
    }
    void ensureRecordingMode().catch((err) => {
      reportAudioSessionFailure('restore_recording', err);
    });
  };

  // keepAudioSessionActive: by default expo-audio schedules an AVAudioSession
  // setActive(false) 0.1 s after ANY player finishes or pauses, unless some
  // other registered player is strictly in the .playing state. A streaming
  // reply that is still buffering does not count as playing, so a short clip
  // (e.g. the squawk chirp) finishing during the buffer window deactivates
  // the session that activatePlaybackMode just configured, and AVPlayer then
  // reactivates it implicitly outside our session model. That was the build
  // 29 "replies quieter than the greeting" seam: the greeting is the only
  // clip never preceded by another player's completion. Keeping the session
  // active leaves its lifecycle entirely to the serialized mode-flip queue.
  const player = createAudioPlayer(
    { uri: url, headers },
    { keepAudioSessionActive: true },
  );
  const sub = player.addListener('playbackStatusUpdate', (s) => {
    if (s.didJustFinish) {
      onDone?.();
      try {
        sub.remove();
      } catch {}
      try {
        player.remove();
      } catch {}
      restoreMode();
    }
  });
  player.play();
  return {
    stop: () => {
      try {
        sub.remove();
      } catch {}
      try {
        // Pause before releasing (see playBase64Audio for why).
        player.pause();
      } catch {}
      try {
        player.remove();
      } catch {}
      restoreMode();
    },
  };
}

/**
 * Play a bundled audio asset (static require() source) as COACH VOICE audio.
 * Same session handling as playBase64Audio — iOS earpiece-mode flip while the
 * mic session is warm, keepAudioSessionActive, playback-token guard — but
 * skips the temp-file write since the asset is already local. Used for the
 * instant band call-out clips (Task 903).
 */
export async function playAssetAudio(
  source: number,
  onDone?: () => void,
): Promise<PlaybackHandle> {
  const needsModeFlip = Platform.OS === 'ios' && recordingSessionActive;
  const myToken = ++playbackModeToken;
  if (needsModeFlip) {
    try {
      await activatePlaybackMode();
    } catch (err) {
      // If the flip fails, still play — quiet audio beats no audio. The
      // failure is no longer silent: a session left in recording mode is a
      // candidate cause of the record() that fails after the clip.
      reportAudioSessionFailure('flip_playback', err);
    }
  }
  const restoreMode = () => {
    // Same two skips as playStreamingAudio, breadcrumbed for the same reason.
    if (!needsModeFlip) {
      noteAudioSessionOp('restore skipped no flip');
      return;
    }
    if (playbackModeToken !== myToken) {
      noteAudioSessionOp('restore skipped stale token');
      return;
    }
    void ensureRecordingMode().catch((err) => {
      reportAudioSessionFailure('restore_recording', err);
    });
  };

  // keepAudioSessionActive: see playStreamingAudio for the deactivation seam.
  const player = createAudioPlayer(source, { keepAudioSessionActive: true });
  const sub = player.addListener('playbackStatusUpdate', (s) => {
    if (s.didJustFinish) {
      onDone?.();
      try {
        sub.remove();
      } catch {}
      try {
        player.remove();
      } catch {}
      restoreMode();
    }
  });
  player.play();
  return {
    stop: () => {
      try {
        sub.remove();
      } catch {}
      try {
        // Pause before releasing (see playBase64Audio for why).
        player.pause();
      } catch {}
      try {
        player.remove();
      } catch {}
      restoreMode();
    },
  };
}

/** Play a base64-encoded audio clip. Resolves the handle immediately. */
export async function playBase64Audio(
  base64: string,
  format: string,
  onDone?: () => void,
): Promise<PlaybackHandle> {
  if (Platform.OS === 'web') {
    const audio = new Audio(`data:audio/${format};base64,${base64}`);
    audio.onended = () => onDone?.();
    await audio.play().catch(() => onDone?.());
    return { stop: () => audio.pause() };
  }

  const uri = `${FileSystem.cacheDirectory}bolo-audio-${Date.now()}.${format}`;
  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // While the mic session is warm, iOS would route this playback to the
  // earpiece; flip to playback-only mode first and restore recording mode
  // when the clip finishes or is stopped.
  const needsModeFlip = Platform.OS === 'ios' && recordingSessionActive;
  const myToken = ++playbackModeToken;
  if (needsModeFlip) {
    try {
      await activatePlaybackMode();
    } catch (err) {
      // If the flip fails, still play — quiet audio beats no audio. The
      // failure is no longer silent: a session left in recording mode is a
      // candidate cause of the record() that fails after the clip.
      reportAudioSessionFailure('flip_playback', err);
    }
  }
  const restoreMode = () => {
    // Skip the restore if a newer playback has claimed the mode since —
    // otherwise this stale restore re-routes it to the earpiece. Both skips
    // breadcrumb: a restore that never runs leaves the session in playback
    // mode, and nothing downstream says so until record() fails.
    if (!needsModeFlip) {
      noteAudioSessionOp('restore skipped no flip');
      return;
    }
    if (playbackModeToken !== myToken) {
      noteAudioSessionOp('restore skipped stale token');
      return;
    }
    void ensureRecordingMode().catch((err) => {
      reportAudioSessionFailure('restore_recording', err);
    });
  };

  // keepAudioSessionActive: prevent expo-audio's automatic session
  // deactivation when this clip finishes or pauses; see playStreamingAudio
  // for the full explanation of the build 29 loudness seam.
  const player = createAudioPlayer({ uri }, { keepAudioSessionActive: true });
  const sub = player.addListener('playbackStatusUpdate', (s) => {
    if (s.didJustFinish) {
      onDone?.();
      try {
        sub.remove();
      } catch {}
      try {
        player.remove();
      } catch {}
      restoreMode();
    }
  });
  player.play();
  return {
    stop: () => {
      try {
        sub.remove();
      } catch {}
      try {
        // Pause before releasing: on iOS, remove() alone releases the JS
        // handle but the buffered audio can keep playing to the end, so a
        // "stop" without pause bleeds into whatever comes next.
        player.pause();
      } catch {}
      try {
        player.remove();
      } catch {}
      restoreMode();
    },
  };
}
