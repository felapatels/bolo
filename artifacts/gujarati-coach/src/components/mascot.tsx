import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { mascotEntrance, floatIdle } from "@/lib/motion";
import { accessoryOverlaySrc, mascotAssetSrc } from "@/lib/mascot-outfits";
import { useEquippedOutfit } from "@/hooks/use-equipped-outfit";

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

/** Reactive mode: "talking" while Bolo's voice plays, "listening" while the
 * learner records, "evaluating" while something is being worked out for them —
 * he zooms out small and spins in place, then zooms back in when the answer
 * lands. Whole-image motion only (pulse / lean / shrink / spin), so the
 * canonical art rule holds. */
export type MascotActivity = "talking" | "listening" | "evaluating";

// Pose art (canonical and dressed) resolves in one place, so every surface
// that renders <Mascot> shows the equipped outfit without knowing it exists.

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

/**
 * The sprite canvas: 1024 WIDE BY 1200 TALL since build 26, previously square.
 *
 * She filled almost the whole square, with 36 to 96 pixels of sky above her
 * head depending on the pose, and a peacock feather needs about 113 more than
 * that. Every pagdi ever generated came back with its plume sawn off. The
 * extra 176 is all sky, so a plume, a pennant or a tassel has somewhere to go.
 *
 * MASCOT_SKY_PCT is that sky as a percentage of the WIDTH, which is the unit
 * CSS resolves a margin percentage against. Mobile's twin is MASCOT_SPRITE_H
 * in components/Mascot.tsx; the frames must match or every accessory slides
 * off her head.
 */
const MASCOT_SKY_PCT = ((1200 - 1024) / 1024) * 100;

export function Mascot({
  pose,
  size = 96,
  idle = "float",
  ambient = "full",
  className,
  fill = false,
  activity = null,
  talkAudioRef,
  outfit,
  accessory,
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
  /**
   * Force an outfit instead of the learner's equipped one. Only the outfit
   * shop uses this, to preview a costume on the learner's own Bolo before they
   * buy it; pass null to force canonical Bolo.
   */
  outfit?: string | null;
  /**
   * Force an accessory instead of the learner's equipped one — the head slot's
   * twin of `outfit`, so the shop can preview a hat over whatever garment is
   * already on the bird. Pass null for bare-headed.
   */
  accessory?: string | null;
}) {
  void talkAudioRef;
  const equipped = useEquippedOutfit();
  const wornOutfit = outfit === undefined ? equipped.garment : outfit;
  const wornAccessory =
    accessory === undefined ? equipped.accessory : accessory;
  const overlaySrc = accessoryOverlaySrc(pose, wornAccessory);
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
  // The shrink itself is a CSS class on an in-flow wrapper, not a framer value:
  // it must hold with animations off, and the mascot's fill chain has no
  // definite ancestor height, so the wrapper stays in flow (see the crossfade
  // note below — an absolute box collapses the whole parrot zone). The class
  // carries `transition-transform`, so adding and dropping it IS the zoom out
  // and the zoom back in; the spin below rides on top.
  const working = activity === "evaluating";
  // Reduced motion kills the zoom transition and the spin, and a bird sitting
  // shrunk and still does not read as "working". A slow opacity breathe
  // carries it instead: no movement, so it stays motion-safe.
  const workingBreathe =
    working && reduceMotion
      ? {
          animate: { opacity: [1, 0.5, 1] },
          transition: { duration: 1.7, repeat: Infinity, ease: "easeInOut" as const },
        }
      : undefined;

  const activityAnim = !animActive
    ? undefined
    : activity === "evaluating"
      ? {
          // Continuous spin while he is shrunk. The shrink lives on the wrapper
          // class below, so this layer is pure rotation — a small bird turning
          // in place. Linear, because an eased spin reads as a stutter.
          animate: { rotate: 360 },
          transition: { duration: 1.4, repeat: Infinity, ease: "linear" as const },
        }
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
          <motion.div
            data-testid={working ? "mascot-working" : undefined}
            className={cn(
              "h-full w-full transition-transform duration-500",
              working && "scale-[0.45]",
            )}
            animate={workingBreathe?.animate}
            transition={workingBreathe?.transition}
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
              key={`${wornOutfit ?? "canonical"}:${pose}`}
              src={mascotAssetSrc(pose, wornOutfit)}
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
                  marginTop: `-${MASCOT_SKY_PCT}%`,
                } as React.CSSProperties
              }
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.22, ease: "easeOut" }}
              // THE SPRITE IS 1024x1200 SINCE BUILD 26, and the box is still
              // square, so the image is drawn taller than the box and pulled UP
              // by the difference. The bird lands exactly where she landed when
              // the canvas was square; the new sky hangs above the box so a
              // plume has room. See MASCOT_SPRITE_H.
              //
              // IN FLOW, NOT ABSOLUTE, and that is not a style preference: the
              // practice screen's `fill` chain has no definite ancestor height,
              // and an absolutely-positioned base collapses the whole parrot
              // zone. That regression is dated July 30, 2026 in the comment
              // above and must not be reintroduced to save a line here.
              //
              // The negative margin is a percentage of the WIDTH, which is what
              // CSS resolves margin percentages against, and the overhang is a
              // fraction of the width too, so the two agree by construction.
              className={cn(
                "w-full object-contain",
                fill ? "h-full" : "aspect-[1024/1200]",
                // The floaty drop shadow reads wrong inside small chrome circles.
                !calm && "drop-shadow-[0_12px_22px_hsl(243_75%_59%_/_0.22)]",
              )}
            />
          </AnimatePresence>
          {/* The head slot, stacked over whatever base the garment picked.
              Absolute so it cannot affect layout: the base img above is the
              in-flow element that opens the box (an absolute base collapses
              the fill chain), and this sits inside the same relative wrapper
              at the same size, so the two 1024-frame images line up with no
              per-pose maths here. */}
          {overlaySrc ? (
            <AnimatePresence initial={false} mode="popLayout">
              <motion.img
                key={`${wornAccessory}:${pose}`}
                src={overlaySrc}
                alt=""
                draggable={false}
                data-testid="mascot-accessory"
                onContextMenu={(e) => e.preventDefault()}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.22, ease: "easeOut" }}
                // Same frame as the base, so the same pull-up keeps the two in
                // register. Absolute here is correct and always was: the base
                // above is the in-flow element that opens the box.
                style={{ marginTop: `-${MASCOT_SKY_PCT}%` }}
                className={cn(
                  "pointer-events-none absolute inset-x-0 top-0 w-full object-contain",
                  fill ? "h-full" : "aspect-[1024/1200]",
                )}
              />
            </AnimatePresence>
          ) : null}
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
