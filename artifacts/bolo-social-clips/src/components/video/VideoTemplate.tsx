// Video Template - Orchestrates the 3 scenes for Bolo! social clips

import { useEffect } from 'react';

import { useVideoPlayer } from '@/lib/video';
import { AnimatePresence } from 'framer-motion';

import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';

// EXACTLY 3 CLIPS = 3 SCENES
export const SCENE_DURATIONS = {
  roots: 20000, // Clip 1: Get back to your roots (~20s emotional beat)
  howItWorks: 26000, // Clip 2: How it works demo (~26s full loop demo)
  languages: 18000, // Clip 3: Breadth + CTA (~18s rapid fire + CTA)
};

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  roots: Scene1,
  howItWorks: Scene2,
  languages: Scene3,
};

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentSceneKey } = useVideoPlayer({ durations, loop });

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  const baseSceneKey = currentSceneKey.replace(
    /_r[12]$/,
    '',
  ) as keyof typeof SCENE_DURATIONS;
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  return (
    // Letterbox background for wider viewports (should only be visible outside 9:16)
    <div className="w-full min-h-[100dvh] flex items-center justify-center bg-slate-900 overflow-hidden relative">
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
      </div>
    </div>
  );
}
