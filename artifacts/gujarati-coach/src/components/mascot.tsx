import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { mascotEntrance, floatIdle, funnyIdleVariants, type FunnyIdleVariant } from "@/lib/motion";
import { useIdleTimer } from "@/lib/hooks/useIdleTimer";
import { BoloRig, type MascotActivity } from "@/components/bolo-rig";

// Bolo the Parrot — the friendly face of the app. Each pose maps to a mood so
// screens can show the right reaction for the moment. See public/mascot/README.md.
// Since the rig rebuild, Bolo is a layered SVG character (BoloRig): poses
// spring-morph between per-part targets instead of swapping images, and he
// blinks, breathes, follows the cursor, and reacts to touch on his own.
export type MascotPose = "wave" | "cheer" | "thumbsup" | "thinking" | "tryagain";

// How the mascot idles once it's on screen. "float" gently bobs (default),
// "cheer" adds a springy celebratory hop, "none" stays put.
type IdleMotion = "float" | "cheer" | "none";

export function Mascot({
  pose,
  size = 96,
  idle = "float",
  className,
  fill = false,
  activity = null,
  talkAudioRef,
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
  /**
   * Reactive micro-personality mode: "talking" syncs Bolo's beak to the audio
   * in `talkAudioRef` (chat voice playback); "listening" leans him in
   * attentively (chat recording). Omit everywhere else.
   */
  activity?: MascotActivity | null;
  /** The audio element Bolo's voice plays through, for beak sync. */
  talkAudioRef?: RefObject<HTMLAudioElement | null>;
}) {
  const reduceMotion = useReducedMotion();

  const isIdle = useIdleTimer(10);

  // Pick a random funny variant each time idle begins. Variants collapse to []
  // under reduced motion so funnyVariant stays null and normal bob resumes.
  const variants = funnyIdleVariants(reduceMotion);
  const [funnyVariant, setFunnyVariant] = useState<FunnyIdleVariant | null>(null);
  // Bumped per performance so the rig can retrigger matching wing effects.
  const [funnyKey, setFunnyKey] = useState(0);
  const lastIdleRef = useRef(false);

  useEffect(() => {
    if (isIdle && !lastIdleRef.current && variants.length > 0) {
      const pick = variants[Math.floor(Math.random() * variants.length)];
      setFunnyVariant(pick);
      setFunnyKey((k) => k + 1);
    } else if (!isIdle) {
      setFunnyVariant(null);
    }
    lastIdleRef.current = isIdle;
  }, [isIdle]); // eslint-disable-line react-hooks/exhaustive-deps

  // Shared motion primitives: the springy entrance + gentle idle bob that the
  // launch video uses. Both collapse to a still frame under reduced motion.
  // Note there is deliberately NO key={pose} remount anymore — pose changes
  // morph the rig's parts in place (smooth springy transitions, no hard swap).
  const entrance = mascotEntrance(reduceMotion);
  const bob = idle === "none" ? undefined : floatIdle(reduceMotion, idle);

  // When idle and we have a funny variant, override the normal bob.
  const animateProps = funnyVariant
    ? { animate: funnyVariant.animate, transition: funnyVariant.transition }
    : { animate: bob?.animate, transition: bob?.transition };

  return (
    <motion.div
      {...entrance}
      className={cn("relative select-none", className)}
      style={fill ? { width: "100%", height: "100%" } : { width: size, height: size }}
      aria-hidden="true"
    >
      <motion.div
        className="h-full w-full"
        animate={animateProps.animate}
        transition={animateProps.transition}
      >
        <BoloRig
          pose={pose}
          activity={activity}
          talkAudioRef={talkAudioRef}
          effect={funnyVariant?.rig ? { kind: funnyVariant.rig, id: funnyKey } : null}
          className="h-full w-full drop-shadow-[0_12px_22px_hsl(243_75%_59%_/_0.22)]"
        />
      </motion.div>
    </motion.div>
  );
}
