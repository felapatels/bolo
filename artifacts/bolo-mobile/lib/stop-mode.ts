import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * How a practice recording ends. Mirrors the web app's toggle:
 *  - 'manual': recording only ends when the learner taps stop (the mobile
 *    default, it's the long-standing behavior on this platform).
 *  - 'auto': recording also ends on its own after a stretch of silence; the
 *    stop button stays available as an override.
 *
 * The choice persists across phrases, lessons, and app launches.
 */
export type StopMode = 'auto' | 'manual';

export const STOP_MODE_KEY = 'bolo.stopMode';

export async function loadStopMode(): Promise<StopMode> {
  try {
    return (await AsyncStorage.getItem(STOP_MODE_KEY)) === 'auto'
      ? 'auto'
      : 'manual';
  } catch {
    return 'manual';
  }
}

export async function saveStopMode(mode: StopMode): Promise<void> {
  try {
    await AsyncStorage.setItem(STOP_MODE_KEY, mode);
  } catch {
    // Persistence is best-effort; the in-session choice still applies.
  }
}
