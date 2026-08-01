/**
 * Paper-tear SFX for the boarding-pass stub tear (R4). Port of the web
 * pattern (gujarati-coach/src/lib/tearAudio.ts) to expo-audio.
 *
 * The recorded clip (assets/sounds/tear-sfx.m4a, 0.985s, mono, 44.1kHz,
 * loudness-normalized) is decoded ONCE at home mount via preloadTearAudio()
 * into a module-cached player, so the first play has zero load lag.
 *
 * Constraints (same contract as web):
 *   - Fire-and-forget: both exports return immediately and never throw.
 *   - Never delays or gates the tear animation or the navigation.
 *   - Silent when the player is not ready (preload failed or never ran),
 *     when the app is backgrounded, or when the sound preference is off
 *     (same guards as lib/sound.ts cues). The iOS silent switch is respected
 *     because playback never opts into playsInSilentMode.
 *   - Reduced-motion silence is the CALLER's job: the tear itself is skipped
 *     under reduced motion, and the SFX call sits inside the tear path.
 */
import { AppState } from 'react-native';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { loadSoundPref } from './soundPref';

/** Playback gain, matching the web port of the recorded asset (0.40). */
export const TEAR_SFX_GAIN = 0.4;

let player: AudioPlayer | null = null;

/**
 * Create and cache the player at home mount so the clip is loaded before the
 * first tap. Safe to call repeatedly; silent no-op on any failure.
 */
export function preloadTearAudio(): void {
  try {
    if (player) return;
    const p = createAudioPlayer(require('../assets/sounds/tear-sfx.m4a'));
    p.volume = TEAR_SFX_GAIN;
    player = p;
  } catch {
    player = null; // playTearSfx then simply stays quiet
  }
}

/**
 * Play the tear clip. Fire-and-forget: returns immediately, never throws.
 * Silent when the player is not ready — a load-then-play would lag the tap,
 * so silence is the fallback.
 */
export function playTearSfx(): void {
  try {
    if (!player) return;
    if (AppState.currentState !== 'active') return; // no audio when backgrounded
    void loadSoundPref()
      .then((on) => {
        const p = player;
        if (!on || !p) return;
        // Rewind for repeat activations; a finished expo-audio player does
        // not restart on play() alone.
        void Promise.resolve(p.seekTo(0)).then(
          () => p.play(),
          () => {},
        );
      })
      .catch(() => {});
  } catch {
    // Never let an optional SFX break the tear or navigation.
  }
}
