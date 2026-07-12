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

/** Ask for microphone permission and configure the audio session for recording. */
export async function prepareRecordingSession(): Promise<boolean> {
  const status = await AudioModule.requestRecordingPermissionsAsync();
  if (!status.granted) return false;
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
  });
  return true;
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
    },
  };
}
