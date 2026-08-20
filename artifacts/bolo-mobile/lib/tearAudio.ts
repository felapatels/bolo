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
import { activateSfxPlaybackRoute } from './audio';
import { loadSoundPref } from './soundPref';

/**
 * Playback gain. Dropped from 0.40 to 0.28 on 2026-08-20: the owner called it
 * slightly too loud on device, which is the only place this can be judged.
 *
 * WEB IS DELIBERATELY NOT FOLLOWING. gujarati-coach/src/lib/tearAudio.ts stays
 * at 0.40 because the same clip through laptop speakers at arm's length is not
 * the same clip through a phone held at reading distance. This is the one
 * constant in the twin pair where matching the platforms would be the bug.
 */
export const TEAR_SFX_GAIN = 0.28;

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
        // 34B item 4: if the mic session is still warm (playAndRecord), iOS
        // would route this clip to the quiet earpiece. Flip to playback-only
        // mode first through the serialized session queue, then play. The
        // flip is awaited only inside this fire-and-forget chain, so the
        // tear animation and navigation are never delayed.
        void activateSfxPlaybackRoute()
          .catch(() => {})
          .then(() =>
            // Rewind for repeat activations; a finished expo-audio player
            // does not restart on play() alone.
            Promise.resolve(p.seekTo(0)).then(
              () => p.play(),
              () => {},
            ),
          );
      })
      .catch(() => {});
  } catch {
    // Never let an optional SFX break the tear or navigation.
  }
}
