import { useEffect, useRef } from 'react';
import { useVideoPlayer } from '@/lib/video/hooks';
import { AnimatePresence } from 'framer-motion';

import Scene1Intro from './video_scenes/Scene1Intro';
import Scene1bLanguages from './video_scenes/Scene1bLanguages';
import Scene2Listen from './video_scenes/Scene2Listen';
import Scene3Speak from './video_scenes/Scene3Speak';
import Scene4Reward from './video_scenes/Scene4Reward';
import Scene4bMastery from './video_scenes/Scene4bMastery';
import Scene5Outro from './video_scenes/Scene5Outro';
import SceneCaptions from './SceneCaptions';

// Total target: 52.0 seconds (within 45-60s range)
export const SCENE_DURATIONS = {
  intro: 6000,      // 6.0s
  languages: 8000,  // 8.0s
  listen: 8000,     // 8.0s
  speak: 8500,      // 8.5s
  reward: 7000,     // 7.0s
  mastery: 7500,    // 7.5s
  outro: 7000,      // 7.0s
};

// Cumulative scene-start offsets (ms) in the canonical timeline. The composite
// audio track is pre-mixed against this exact order, so playback seeks to a
// scene's canonical offset regardless of how the scene list is rotated/locked
// for preview controls.
export const SCENE_OFFSETS: Record<string, number> = (() => {
  const offsets: Record<string, number> = {};
  let acc = 0;
  for (const [key, dur] of Object.entries(SCENE_DURATIONS)) {
    offsets[key] = acc;
    acc += dur;
  }
  return offsets;
})();

export const TOTAL_DURATION_MS = Object.values(SCENE_DURATIONS).reduce(
  (a, b) => a + b,
  0,
);

// Tolerance for re-anchoring the audio track to a scene's canonical offset.
// During a normal linear pass (including the recorded export) the track is
// already free-running at ~1x, so currentTime is within this window of the
// target and we skip the seek to avoid an audible gap at each scene boundary.
// Scene jumps and scene-lock replays drift further than this, so they still
// re-seek and stay in sync.
const AUDIO_SEEK_EPSILON_SEC = 0.18;

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  intro: Scene1Intro,
  languages: Scene1bLanguages,
  listen: Scene2Listen,
  speak: Scene3Speak,
  reward: Scene4Reward,
  mastery: Scene4bMastery,
  outro: Scene5Outro,
};

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  muted = false,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  muted?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentSceneKey } = useVideoPlayer({ durations, loop });
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const baseSceneKey = currentSceneKey.replace(
    /_r[12]$/,
    '',
  ) as keyof typeof SCENE_DURATIONS;

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  // Keep the audio track aligned to the visible scene. We re-anchor to the
  // scene's canonical offset only when the track has drifted (manual scene
  // jumps, scene-lock replays); a normal linear pass free-runs so the recorded
  // export stays gapless while remaining in sync.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const offsetSec = (SCENE_OFFSETS[baseSceneKey] ?? 0) / 1000;
    try {
      // Only re-anchor when the track has actually drifted (scene jump or a
      // scene-lock replay). During a normal linear pass — including the
      // recorded export — the track is already at the right spot, so we leave
      // it running to avoid an audible gap at each scene boundary.
      if (Math.abs(audio.currentTime - offsetSec) > AUDIO_SEEK_EPSILON_SEC) {
        audio.currentTime = offsetSec;
      }
    } catch {
      // currentTime can throw if metadata isn't ready yet; the loadedmetadata
      // handler below re-seeks once it is.
    }
    const p = audio.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }, [currentSceneKey, baseSceneKey]);

  // When unmuted (via the control bar), resume playback under the user gesture.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || muted) return;
    const p = audio.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }, [muted]);

  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  return (
    <div
      className="w-full h-screen overflow-hidden relative"
      style={{ backgroundColor: 'var(--color-background)' }}
    >
      <audio
        ref={audioRef}
        src={`${import.meta.env.BASE_URL}audio/composite_audio.mp3`}
        muted={muted}
        preload="auto"
        onLoadedMetadata={(e) => {
          const audio = e.currentTarget;
          audio.currentTime = (SCENE_OFFSETS[baseSceneKey] ?? 0) / 1000;
          const p = audio.play();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        }}
      />

      {/* mode="sync" allows cross-fades and smooth transforms between scenes */}
      <AnimatePresence mode="sync">
        {SceneComponent && <SceneComponent key={currentSceneKey} />}
      </AnimatePresence>

      {/* Timed narration captions so the story lands with sound off. Keyed by
          currentSceneKey so its timeline restarts on every scene change — the
          same trigger the audio uses to re-seek — keeping the two in sync. */}
      <SceneCaptions key={currentSceneKey} sceneKey={currentSceneKey} />
    </div>
  );
}
