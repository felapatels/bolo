import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { mascotEntrance, floatIdle } from "@/lib/motion";

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
  fill = false,
}: {
  pose: MascotPose;
  size?: number;
  idle?: IdleMotion;
  className?: string;
  /**
   * When true, the mascot stretches to fill its parent container (width/height
   * 100%). Use this when you want the parrot to scale with a flex/grid cell.
   * The `size` prop is ignored when `fill` is true.
   */
  fill?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const src = MASCOT_BASE + POSE_SRC[pose];

  // Shared motion primitives: the springy entrance + gentle idle bob that the
  // launch video uses. Both collapse to a still frame under reduced motion.
  const entrance = mascotEntrance(reduceMotion);
  const bob = idle === "none" ? undefined : floatIdle(reduceMotion, idle);

  return (
    <motion.div
      key={pose}
      {...entrance}
      className={cn("relative select-none", className)}
      style={fill ? { width: "100%", height: "100%" } : { width: size, height: size }}
      aria-hidden="true"
    >
      <motion.img
        src={src}
        alt=""
        draggable={false}
        className="h-full w-full object-contain drop-shadow-[0_12px_22px_hsl(243_75%_59%_/_0.22)]"
        animate={bob?.animate}
        transition={bob?.transition}
      />
    </motion.div>
  );
}
