import { motion, useReducedMotion, type MotionProps } from "framer-motion";
import { Mascot, type MascotPose } from "@/components/mascot";
import { springs } from "@/lib/motion";

interface EmptyStateProps {
  title: string;
  body?: string;
  /**
   * When provided, renders the mascot-card layout (bordered card, parrot
   * illustration, smaller title). When omitted, renders the minimal centred
   * layout used inside practice / review screens.
   */
  pose?: MascotPose;
}

/**
 * A staggered fade + small rise for the text below the mascot, so the empty
 * state reads as an entrance (mascot pops in, copy follows) rather than a
 * static block. Collapses to a plain fade under reduced motion.
 */
function fadeUp(reduceMotion: boolean | null, delay: number): MotionProps {
  if (reduceMotion) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      transition: { duration: 0.001 },
    };
  }
  return {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { ...springs.gentle, delay },
  };
}

/**
 * Flexible empty-state block.
 *
 * With `pose` → bordered card with mascot (friends lists, leaderboard, etc.)
 * Without `pose` → minimal centred text (review queue, practice done-states).
 *
 * The mascot brings its own spring pop-in entrance (see `mascotEntrance`);
 * the copy staggers in just after it.
 */
export function EmptyState({ title, body, pose }: EmptyStateProps) {
  const reduceMotion = useReducedMotion();

  if (pose) {
    return (
      <div className="flex flex-col items-center text-center py-8 px-6 bg-white rounded-3xl border border-dashed border-border">
        <Mascot pose={pose} size={80} idle="float" className="mb-3" />
        <motion.p
          {...fadeUp(reduceMotion, 0.08)}
          className="text-lg font-bold text-foreground mb-1"
        >
          {title}
        </motion.p>
        {body && (
          <motion.p
            {...fadeUp(reduceMotion, 0.16)}
            className="text-sm text-muted-foreground max-w-xs"
          >
            {body}
          </motion.p>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-6">
      <motion.p
        {...fadeUp(reduceMotion, 0)}
        className="text-2xl font-black text-foreground"
      >
        {title}
      </motion.p>
      {body && (
        <motion.p
          {...fadeUp(reduceMotion, 0.08)}
          className="text-muted-foreground font-medium text-sm max-w-xs"
        >
          {body}
        </motion.p>
      )}
    </div>
  );
}
