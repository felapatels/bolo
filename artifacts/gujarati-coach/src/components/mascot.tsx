import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { mascotEntrance, floatIdle, funnyIdleVariants, type FunnyIdleVariant } from "@/lib/motion";
import { useIdleTimer } from "@/lib/hooks/useIdleTimer";

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

  const isIdle = useIdleTimer(10);

  // Pick a random funny variant each time idle begins. Variants collapse to []
  // under reduced motion so funnyVariant stays null and normal bob resumes.
  const variants = funnyIdleVariants(reduceMotion);
  const [funnyVariant, setFunnyVariant] = useState<FunnyIdleVariant | null>(null);
  const lastIdleRef = useRef(false);

  useEffect(() => {
    if (isIdle && !lastIdleRef.current && variants.length > 0) {
      const pick = variants[Math.floor(Math.random() * variants.length)];
      setFunnyVariant(pick);
    } else if (!isIdle) {
      setFunnyVariant(null);
    }
    lastIdleRef.current = isIdle;
  }, [isIdle]); // eslint-disable-line react-hooks/exhaustive-deps

  // Shared motion primitives: the springy entrance + gentle idle bob that the
  // launch video uses. Both collapse to a still frame under reduced motion.
  const entrance = mascotEntrance(reduceMotion);
  const bob = idle === "none" ? undefined : floatIdle(reduceMotion, idle);

  // When idle and we have a funny variant, override the normal bob.
  const animateProps = funnyVariant
    ? { animate: funnyVariant.animate, transition: funnyVariant.transition }
    : { animate: bob?.animate, transition: bob?.transition };

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
        animate={animateProps.animate}
        transition={animateProps.transition}
      />
    </motion.div>
  );
}
