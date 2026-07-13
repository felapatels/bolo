import { useEffect } from 'react';
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
    <div
      className="w-full h-screen overflow-hidden relative"
      style={{ backgroundColor: 'var(--color-background)' }}
    >
      {/* mode="sync" allows cross-fades and smooth transforms between scenes */}
      <AnimatePresence mode="sync">
        {SceneComponent && <SceneComponent key={currentSceneKey} />}
      </AnimatePresence>
    </div>
  );
}
