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

  // Keep the audio track aligned to the visible scene. Seeking on every scene
  // change (rather than letting it free-run) keeps sync across normal looping,
  // manual scene jumps, and the scene-lock replay behavior.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const offsetSec = (SCENE_OFFSETS[baseSceneKey] ?? 0) / 1000;
    try {
      audio.currentTime = offsetSec;
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
    </div>
  );
}
