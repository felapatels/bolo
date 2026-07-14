import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';

import { SCENE_NARRATION } from './narration';

// On-screen captions of the narration so the clips land with sound off.
//
// The caption words and per-scene timing come straight from SCENE_NARRATION
// (see narration.ts), the single source of truth shared with voiceover
// regeneration — so the text on screen can never drift from what viewers hear.
// Segments are revealed at offsets measured from the scene's start. Because the
// composite audio track re-anchors to each scene's canonical start (see
// SCENE_OFFSETS in VideoTemplate), a caption timeline that also restarts from 0
// on each scene change stays locked to the voiceover across the normal loop,
// manual scene jumps, and the scene-lock replay behavior.

export default function SceneCaptions({ sceneKey }: { sceneKey: string }) {
  const baseKey = sceneKey.replace(/_r[12]$/, '');
  const caption = SCENE_NARRATION[baseKey];
  const [index, setIndex] = useState(-1);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(false);
    if (!caption) return;
    // Start hidden until the first segment's own offset (VO does not always
    // begin at the scene start in these clips).
    setIndex(caption.segments[0]?.at === 0 ? 0 : -1);
    const timers: ReturnType<typeof setTimeout>[] = [];
    caption.segments.forEach((seg, i) => {
      if (i === 0 && seg.at === 0) return;
      timers.push(setTimeout(() => setIndex(i), seg.at));
    });
    timers.push(setTimeout(() => setHidden(true), caption.hideAt));
    return () => timers.forEach((t) => clearTimeout(t));
  }, [sceneKey, caption]);

  if (!caption) return null;
  const segment = index >= 0 ? caption.segments[index] : undefined;

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
