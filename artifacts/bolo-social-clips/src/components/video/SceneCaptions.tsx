import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';

// On-screen captions of each clip's voiceover line so the spoken message lands
// with sound off (most TikTok/Reels viewers watch muted).
//
// Timing: each VO's start offset within its clip was measured by
// cross-correlating the individual VO file against the composite audio mix
// (vo_roots @8.30s, vo_howitworks @1.00s, vo_languages @12.80s), and the hide
// time is the VO duration plus a short linger so the line stays readable.
// Because the composite audio seeks to each scene's canonical start on every
// scene change (see SCENE_OFFSETS in VideoTemplate), a caption timeline that
// restarts from 0 on each scene change stays locked to the voiceover across
// normal looping, manual scene jumps, and scene-lock replays.

const VO_CAPTIONS: Record<
  string,
  { text: string; showAt: number; hideAt: number; position?: 'top' | 'bottom' }
> = {
  roots: {
    text: "It's never too late to speak your language again.",
    showAt: 8300, // vo_roots starts 8.30s into clip 1 (VO ~3.4s)
    hideAt: 12500,
  },
  howItWorks: {
    text: 'Just speak, and get instant feedback on every phrase.',
    showAt: 1000, // vo_howitworks starts 1.00s into clip 2 (VO ~4.1s)
    hideAt: 6000,
  },
  languages: {
    text: 'Twenty-two languages. One app. Start speaking today.',
    showAt: 12800, // vo_languages starts 12.80s into clip 3 (VO ~4.6s)
    hideAt: 17800,
    // The CTA build-up fills the center/bottom (headline, Bolo! lockup,
    // mascot), so this caption sits at the top where the frame stays clear.
    position: 'top',
  },
};

export default function SceneCaptions({ sceneKey }: { sceneKey: string }) {
  const baseKey = sceneKey.replace(/_r[12]$/, '');
  const caption = VO_CAPTIONS[baseKey];
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);
    if (!caption) return;
    const timers = [
      setTimeout(() => setVisible(true), caption.showAt),
      setTimeout(() => setVisible(false), caption.hideAt),
    ];
    return () => timers.forEach((t) => clearTimeout(t));
  }, [sceneKey, caption]);

  if (!caption) return null;

  return (
    <div
      className={`absolute inset-x-0 z-50 flex justify-center px-[8%] pointer-events-none ${
        caption.position === 'top' ? 'top-[6%]' : 'bottom-[7%]'
      }`}
    >
      <AnimatePresence mode="wait">
        {visible && (
          <motion.p
            key={baseKey}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="max-w-[84%] rounded-2xl bg-black/55 px-6 py-3 text-center text-2xl font-semibold leading-snug text-white shadow-lg backdrop-blur-sm"
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.45)' }}
          >
            {caption.text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
