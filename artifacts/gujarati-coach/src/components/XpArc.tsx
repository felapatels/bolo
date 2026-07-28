/**
 * XP arc animation (Spec 1 v3 §4.2).
 *
 * A small "+N XP" badge arcs from the result area to the persistent XP
 * counter (located via the Spec 1a xpCounterRef accessor), then triggers a
 * pop on the counter. ≤600ms, transform/opacity only.
 *
 * If the counter is not mounted, the arc is skipped with a console.warn and
 * the counter still updates through its normal data flow.
 */
import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { getXpCounterRect, popXpCounter } from "@/lib/xpCounterRef";

export function XpArc({
  amount,
  from,
  onDone,
}: {
  amount: number;
  /** Viewport coordinates the badge starts from (center point). */
  from: { x: number; y: number };
  onDone?: () => void;
}) {
  const reduceMotion = useReducedMotion();
  // Capture the target once on mount; the counter doesn't move mid-flight.
  const target = useMemo(() => getXpCounterRect(), []);

  const skip = !target || reduceMotion;
  useEffect(() => {
    if (!target) {
      console.warn("[XpArc] XP counter not mounted; skipping arc animation");
    }
    if (skip) {
      // Reduced motion: outcome is instant, the pop is skipped visually but
      // completion still fires so callers proceed identically.
      if (target && !reduceMotion) popXpCounter();
      onDone?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (skip) return null;

  const dx = target.x + target.width / 2 - from.x;
  const dy = target.y + target.height / 2 - from.y;
  // Arc via a raised midpoint keyframe (transform-only).
  const midX = dx * 0.5 + (dx >= 0 ? 48 : -48);
  const midY = Math.min(0, dy) * 0.5 - 64;

  return createPortal(
    <motion.div
      initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
      animate={{
        x: [0, midX, dx],
        y: [0, midY, dy],
        scale: [1, 1.08, 0.5],
        opacity: [1, 1, 0.85],
      }}
      transition={{ duration: 0.55, ease: "easeInOut", times: [0, 0.55, 1] }}
      onAnimationComplete={() => {
        popXpCounter();
        onDone?.();
      }}
      className="pointer-events-none fixed z-[60] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground shadow-md"
      style={{ left: from.x, top: from.y }}
      aria-hidden
    >
      +{amount} XP
    </motion.div>,
    document.body,
  );
}
