// Video Template - Orchestrates the 3 scenes for Bolo! social clips

import { useEffect, useRef } from 'react';

import { useVideoPlayer } from '@/lib/video';
import { AnimatePresence } from 'framer-motion';

import SceneCaptions from './SceneCaptions';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';

// EXACTLY 3 CLIPS = 3 SCENES
export const SCENE_DURATIONS = {
  roots: 20000, // Clip 1: Get back to your roots (~20s emotional beat)
  howItWorks: 26000, // Clip 2: How it works demo (~26s full loop demo)
  languages: 18000, // Clip 3: Breadth + CTA (~18s rapid fire + CTA)
};

// Cumulative scene-start offsets (ms) in the canonical timeline. The composite
// audio track (music bed + timed sound design + short VO) is pre-mixed against
// this exact order, so playback seeks to a scene's canonical offset regardless
// of how the scene list is rotated/locked for the preview controls.
export const SCENE_OFFSETS: Record<string, number> = (() => {
  const offsets: Record<string, number> = {};
  let acc = 0;
  for (const [key, dur] of Object.entries(SCENE_DURATIONS)) {
    offsets[key] = acc;
    acc += dur;
  }
  return offsets;
})();

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  roots: Scene1,
  howItWorks: Scene2,
  languages: Scene3,
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

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  const baseSceneKey = currentSceneKey.replace(
    /_r[12]$/,
    '',
  ) as keyof typeof SCENE_DURATIONS;
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  // Keep the composite audio track aligned to the visible scene. Seeking on
  // every scene change (rather than letting it free-run) keeps the sound design
  // synced across normal looping, manual scene jumps, and scene-lock replays.
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

  return (
    // Letterbox background for wider viewports (should only be visible outside 9:16)
    <div className="w-full min-h-[100dvh] flex items-center justify-center bg-slate-900 overflow-hidden relative">
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

      {/* 9:16 Vertical Stage */}
      <div
        className="relative h-[100dvh] aspect-[9/16] overflow-hidden shadow-2xl bg-background"
        style={{
          // Use the generated elegant textures as a subtle background behind the scenes
          backgroundImage: `url(${import.meta.env.BASE_URL}images/bg-texture-1.jpg)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* Soft overlay to ensure content readability */}
        <div className="absolute inset-0 bg-background/80 backdrop-blur-[2px] z-0" />

        <AnimatePresence mode="popLayout">
          {SceneComponent && <SceneComponent key={currentSceneKey} />}
        </AnimatePresence>

        {/* VO captions burned in so the spoken line lands with sound off */}
        <SceneCaptions sceneKey={currentSceneKey} />
      </div>
    </div>
  );
}
