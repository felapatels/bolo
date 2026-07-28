/**
 * Audio cue layer (Spec 1 v3 §4.3). Uses expo-audio (installed SDK ships
 * expo-audio ~1.1.1; expo-av is not installed).
 *
 * `playCue(name)` plays a short feedback cue. It reads the Spec 1a sound
 * preference and no-ops when sound is off, when the app is backgrounded, and
 * when a cue asset is missing — so the app works fully before any audio file
 * exists. React Native requires static `require` calls for bundled assets, so
 * cues are registered in CUE_SOURCES below; entries are added as assets land
 * (e.g. `correct: require('../assets/sounds/correct.mp3')`).
 *
 * The iOS silent switch is respected because cue playback never opts into
 * `playsInSilentMode`; do not wrap cues in the coach-audio playback mode
 * (which configures the session for speech).
 */
import { AppState } from 'react-native';
import { createAudioPlayer } from 'expo-audio';
import { loadSoundPref } from './soundPref';

export type CueName = 'correct' | 'wrong' | 'session_complete';

// Static asset registry — RN cannot require() dynamically or conditionally
// at runtime, so absent assets are simply absent entries here.
const CUE_SOURCES: Partial<Record<CueName, number>> = {};

export async function playCue(name: CueName): Promise<void> {
  try {
    const source = CUE_SOURCES[name];
    if (source == null) return; // asset not shipped yet — silent no-op
    if (AppState.currentState !== 'active') return; // no audio when backgrounded
    if (!(await loadSoundPref())) return;

    const player = createAudioPlayer(source);
    player.play();
    // Cues are ≤2s; release the player once it has certainly finished.
    setTimeout(() => {
      try {
        player.remove();
      } catch {
        // Already released.
      }
    }, 3000);
  } catch {
    // Never let an optional cue break the app.
  }
}
