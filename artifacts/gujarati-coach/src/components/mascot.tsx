import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { mascotEntrance, floatIdle } from "@/lib/motion";

// Bolo the Parrot — the friendly face of the app. Each pose maps to a mood so
// screens can show the right reaction for the moment. See public/mascot/README.md.
//
// CANONICAL ART RULE (July 29, 2026, owner decision): the ONLY permitted
// mascot pixels are the five canonical PNGs in public/mascot/, animated as
// WHOLE images (bounce/breathe scale, tilt on interaction, crossfade between
// poses). No part-level rigging, no eye tracking, no blinking, and no new
// Bolo artwork by any means (drawing, SVG, AI generation, tracing).
// bolo-rig.tsx is a non-canonical hand-drawn approximation kept on disk for
// reference only — do not render it in the app.
export type MascotPose = "wave" | "cheer" | "thumbsup" | "thinking" | "tryagain";

/** Reactive mode for chat: "talking" while Bolo's voice plays, "listening"
 * while the learner records. Whole-image motion only (pulse / lean). */
export type MascotActivity = "talking" | "listening";

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

// "full" (default) plays the springy entrance and the idle bob. "calm" is for
// small always-on chrome (the bottom-nav button): plain fade entrance, a very
// subtle breathe instead of the bob, and no heavy drop shadow.
type AmbientLevel = "full" | "calm";

/**
 * Pauses ambient animation when it can't be seen: element scrolled off-screen
 * (IntersectionObserver) or tab hidden (visibilitychange). Perf guard — idle
 * springs kept burning CPU on phones when several mascots were mounted.
 */
function useAnimationVisible(ref: RefObject<HTMLElement | null>): boolean {
  const [inView, setInView] = useState(true);
  const [tabVisible, setTabVisible] = useState(
    typeof document === "undefined" ? true : document.visibilityState !== "hidden",
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);

  useEffect(() => {
    const onVisibility = () => setTabVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return inView && tabVisible;
}

export function Mascot({
  pose,
  size = 96,
  idle = "float",
  ambient = "full",
  className,
  fill = false,
  activity = null,
  talkAudioRef,
}: {
  pose: MascotPose;
  size?: number;
  idle?: IdleMotion;
  ambient?: AmbientLevel;
  className?: string;
  /**
   * When true, the mascot stretches to fill its parent container (width/height
   * 100%). Use this when you want the parrot to scale with a flex/grid cell.
   * The `size` prop is ignored when `fill` is true.
   */
  fill?: boolean;
  /** Chat micro-personality: gentle pulse while talking, lean-in while listening. */
  activity?: MascotActivity | null;
  /** Kept for API compatibility (was beak sync in the retired rig). Unused. */
  talkAudioRef?: RefObject<HTMLAudioElement | null>;
}) {
  void talkAudioRef;
  const reduceMotion = useReducedMotion();
  const calm = ambient === "calm";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const visible = useAnimationVisible(containerRef);
  // Reduced motion disables ALL idle/ambient animation; off-screen or hidden
  // tab pauses it. Pose crossfades still happen (instant under reduced motion).
  const animActive = !reduceMotion && visible;

  // Entrance: springy pop for full ambient, plain fade for calm/reduced motion.
  const entrance = mascotEntrance(calm || reduceMotion);

  // Whole-image idle: gentle bob (full) or a barely-there breathe (calm).
  const bob =
    !animActive || idle === "none"
      ? undefined
      : calm
        ? {
            animate: { scale: [1, 1.03, 1] },
            transition: { duration: 3.6, repeat: Infinity, ease: "easeInOut" as const },
          }
        : floatIdle(false, idle);

  // Whole-image activity layer: talking = soft rhythmic pulse, listening =
  // attentive lean. No part-level motion.
  const activityAnim = !animActive
    ? undefined
    : activity === "talking"
      ? {
          animate: { scale: [1, 1.035, 1] },
          transition: { duration: 0.55, repeat: Infinity, ease: "easeInOut" as const },
        }
      : activity === "listening"
        ? {
            animate: { rotate: -5, x: 2 },
            transition: { type: "spring" as const, stiffness: 160, damping: 18 },
          }
        : { animate: { rotate: 0, x: 0, scale: 1 }, transition: { duration: 0.3 } };

  return (
    <motion.div
      ref={containerRef}
      {...entrance}
      whileHover={animActive ? { rotate: -3 } : undefined}
      whileTap={animActive ? { rotate: 3, scale: 0.95 } : undefined}
      className={cn("relative select-none", className)}
      style={fill ? { width: "100%", height: "100%" } : { width: size, height: size }}
      aria-hidden="true"
    >
      <motion.div className="h-full w-full" animate={bob?.animate} transition={bob?.transition}>
        <motion.div
          className="relative h-full w-full"
          animate={activityAnim?.animate}
          transition={activityAnim?.transition}
        >
          {/* Pose changes crossfade between whole canonical images.
              The CURRENT pose img must stay IN-FLOW (not absolute): the
              practice screen's `fill` chain has no definite ancestor height,
              so `height: 100%` resolves to 0 and an absolutely-positioned img
              collapses the whole parrot zone (July 30, 2026 regression). An
              in-flow replaced element falls back to its intrinsic size, which
              keeps the zone open. `popLayout` pops only the EXITING img out of
              flow so the crossfade still overlaps in place. */}
          <AnimatePresence initial={false} mode="popLayout">
            <motion.img
              key={pose}
              src={MASCOT_BASE + POSE_SRC[pose]}
              alt=""
              draggable={false}
              // iOS long-press image callout + drag ghost suppression: the
              // save/copy sheet was interrupting hold-to-speak on phones.
              // Chunk 1 Section C: also swallow the context menu on the
              // mascot image only, so a long-press cannot open the system
              // image save menu on iOS web.
              onContextMenu={(e) => e.preventDefault()}
              style={
                {
                  WebkitTouchCallout: "none",
                  WebkitUserDrag: "none",
                  userSelect: "none",
                } as React.CSSProperties
              }
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.22, ease: "easeOut" }}
              className={cn(
                "h-full w-full object-contain",
                // The floaty drop shadow reads wrong inside small chrome circles.
                !calm && "drop-shadow-[0_12px_22px_hsl(243_75%_59%_/_0.22)]",
              )}
            />
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
