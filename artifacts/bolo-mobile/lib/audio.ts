import { Platform } from 'react-native';
import {
  AudioModule,
  RecordingPresets,
  createAudioPlayer,
  setAudioModeAsync,
  type AudioRecorder,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';

export const RECORDING_PRESET = RecordingPresets.HIGH_QUALITY;

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
/** Tracks which mode the last enqueued flip targets, to skip redundant sets. */
let modeIsRecording = false;

/** Ask for microphone permission and configure the audio session for recording. */
export async function prepareRecordingSession(): Promise<boolean> {
  const status = await AudioModule.requestRecordingPermissionsAsync();
  if (!status.granted) return false;
  modeIsRecording = true;
  await enqueueSessionOp(() => setAudioModeAsync(RECORDING_MODE));
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
  modeIsRecording = true;
  return enqueueSessionOp(() => recorder.prepareToRecordAsync());
}

/**
 * Re-assert recording mode (fast category switch) if coach playback flipped
 * the session to playback-only. Await this before `recorder.record()`.
 */
export function ensureRecordingMode(): Promise<void> {
  if (!recordingSessionActive || modeIsRecording) {
    // Still wait for any in-flight session op so record() never races one.
    return sessionChain.then(() => undefined);
  }
  modeIsRecording = true;
  return enqueueSessionOp(() => setAudioModeAsync(RECORDING_MODE)).then(
    () => undefined,
  );
}

/** Flip to playback-only mode so iOS routes audio to the speaker. */
function activatePlaybackMode(): Promise<void> {
  modeIsRecording = false;
  return enqueueSessionOp(() => setAudioModeAsync(PLAYBACK_MODE)).then(
    () => undefined,
  );
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
  if (needsModeFlip) {
    try {
      await activatePlaybackMode();
    } catch {
      // If the flip fails, still play — quiet audio beats no audio.
    }
  }
  const restoreMode = () => {
    if (needsModeFlip) void ensureRecordingMode().catch(() => {});
  };

  const player = createAudioPlayer({ uri });
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
        player.remove();
      } catch {}
      restoreMode();
    },
  };
}
