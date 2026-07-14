import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';

// On-screen captions of the narration so the story lands with sound off.
//
// Each entry mirrors one scene's voiceover line, split into short segments that
// are revealed at offsets measured from the scene's start. Because the composite
// audio track seeks to each scene's canonical start on every scene change (see
// SCENE_OFFSETS in VideoTemplate), a caption timeline that also restarts from 0
// on each scene change stays locked to the voiceover across the normal loop,
// manual scene jumps, and the scene-lock replay behavior.
//
// `hideAt` is roughly where the spoken line ends, so the caption clears once the
// narration is done rather than lingering silently for the rest of the scene.
type CaptionSegment = { text: string; at: number };
type SceneCaption = { segments: CaptionSegment[]; hideAt: number };

export const SCENE_CAPTIONS: Record<string, SceneCaption> = {
  intro: {
    segments: [
      { text: 'Your story begins with a single word.', at: 0 },
      { text: 'Get back to your roots.', at: 2000 },
    ],
    hideAt: 3900,
  },
  languages: {
    segments: [
      {
        text: '22 languages, each with its own beautiful script and living voice.',
        at: 0,
      },
      { text: 'One of them is yours.', at: 4400 },
    ],
    hideAt: 6100,
  },
  listen: {
    segments: [
      { text: 'Listen closely to native speakers', at: 0 },
      {
        text: 'and let the true sound of every word settle into your ear.',
        at: 2400,
      },
    ],
    hideAt: 5800,
  },
  speak: {
    segments: [
      { text: 'Now say it out loud.', at: 0 },
      {
        text: 'Instant, gentle feedback helps your pronunciation grow with every try.',
        at: 1800,
      },
    ],
    hideAt: 5600,
  },
  reward: {
    segments: [
      { text: 'Finish a lesson, keep your streak alive,', at: 0 },
      { text: 'and feel your confidence build day by day.', at: 2500 },
    ],
    hideAt: 4900,
  },
  mastery: {
    segments: [
      { text: 'Earn badges, track your growth,', at: 0 },
      { text: 'and truly master your mother tongue over time.', at: 2200 },
    ],
    hideAt: 4700,
  },
  outro: {
    segments: [
      { text: 'Bolo — find your voice and get back to your roots.', at: 0 },
      { text: 'Download today.', at: 3400 },
    ],
    hideAt: 4900,
  },
};

export default function SceneCaptions({ sceneKey }: { sceneKey: string }) {
  const baseKey = sceneKey.replace(/_r[12]$/, '');
  const caption = SCENE_CAPTIONS[baseKey];
  const [index, setIndex] = useState(0);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setIndex(0);
    setHidden(false);
    if (!caption) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    caption.segments.forEach((seg, i) => {
      if (i === 0) return;
      timers.push(setTimeout(() => setIndex(i), seg.at));
    });
    timers.push(setTimeout(() => setHidden(true), caption.hideAt));
    return () => timers.forEach((t) => clearTimeout(t));
  }, [sceneKey, caption]);

  if (!caption) return null;
  const segment = caption.segments[index];

  return (
    <div className="absolute inset-x-0 bottom-[7%] z-50 flex justify-center px-[8vw] pointer-events-none">
      <AnimatePresence mode="wait">
        {!hidden && segment && (
          <motion.p
            key={index}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="max-w-[82vw] rounded-2xl bg-black/55 px-[3vw] py-[1.6vh] text-center text-[2.5vw] font-semibold leading-snug text-white shadow-lg backdrop-blur-sm"
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.45)' }}
          >
            {segment.text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
