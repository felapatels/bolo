import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

// Bolo the Parrot — the friendly face of the app. Each pose maps to a mood so
// screens can show the right reaction for the moment. See public/mascot/README.md.
export type MascotPose = "wave" | "cheer" | "thumbsup" | "thinking" | "tryagain";

const POSE_SRC: Record<MascotPose, string> = {
  wave: "mascot-wave.png",
  cheer: "mascot-cheer.png",
  thumbsup: "mascot-thumbsup.png",
  thinking: "mascot-thinking.png",
  tryagain: "mascot-tryagain.png",
};

const MASCOT_BASE = `${import.meta.env.BASE_URL}mascot/`;

// How the mascot idles once it's on screen. "float" gently bobs (default),
// "cheer" adds a springy celebratory hop, "none" stays put.
type IdleMotion = "float" | "cheer" | "none";

export function Mascot({
  pose,
  size = 96,
  idle = "float",
  className,
}: {
  pose: MascotPose;
  size?: number;
  idle?: IdleMotion;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const src = MASCOT_BASE + POSE_SRC[pose];

  const idleAnimation =
    reduceMotion || idle === "none"
      ? undefined
      : idle === "cheer"
        ? { y: [0, -10, 0], rotate: [0, -3, 3, 0] }
        : { y: [0, -6, 0], rotate: [0, -1.5, 1.5, 0] };

  const idleTransition =
    reduceMotion || idle === "none"
      ? undefined
      : idle === "cheer"
        ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" as const }
        : { duration: 4, repeat: Infinity, ease: "easeInOut" as const };

  return (
    <motion.div
      key={pose}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.55, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 18 }}
      className={cn("relative select-none", className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <motion.img
        src={src}
        alt=""
        draggable={false}
        className="h-full w-full object-contain drop-shadow-[0_12px_22px_hsl(243_75%_59%_/_0.22)]"
        animate={idleAnimation}
        transition={idleTransition}
      />
    </motion.div>
  );
}
