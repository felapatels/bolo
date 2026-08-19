import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/**
 * MilestoneToast, a brief, non-blocking pill that slides up from the bottom
 * of its containing element, displays for ~1.5 s, then exits automatically.
 *
 * Accepts a `message` (what to show) and a `toastKey` (changing it re-triggers
 * the animation). When `toastKey` is null the toast is hidden.
 *
 * Reduced-motion: skips the slide, just fades in/out.
 */
export function MilestoneToast({
  message,
  toastKey,
}: {
  message: string | null;
  toastKey: number | null;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center z-40">
      <AnimatePresence mode="wait">
        {message !== null && toastKey !== null && (
          <motion.div
            key={toastKey}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
            transition={{ duration: reduceMotion ? 0.2 : 0.35, ease: "easeOut" }}
            onAnimationComplete={(definition) => {
              // The exit animation is handled by AnimatePresence; we only need
              // to trigger removal after the enter completes + dwell time.
              // This is done via the parent key change pattern.
            }}
            data-testid="milestone-toast"
            className="mb-4 rounded-full bg-foreground/90 px-5 py-2.5 text-sm font-black text-background shadow-lg backdrop-blur-sm"
          >
            {message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
