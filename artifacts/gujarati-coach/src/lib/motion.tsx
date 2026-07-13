import {
  motion,
  useReducedMotion,
  type Transition,
  type MotionProps,
} from "framer-motion";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared motion language for the Bolo! web app.
 *
 * These primitives mirror the feel of the launch video (see
 * `bolo-launch-video/src/lib/video/animations.ts`): snappy, springy, playful
 * motion that stays brand-consistent across the app. Every primitive here is
 * built to honor the OS "reduce motion" setting — the hooks/components collapse
 * to a still frame when `useReducedMotion()` is true, so nothing ever bobs,
 * pulses, or springs for visitors who asked us not to.
 *
 * Use these instead of hand-rolling one-off transitions so the whole app shares
 * one motion vocabulary.
 */

// ---------------------------------------------------------------------------
// Spring presets — the core of the app's motion language.
// ---------------------------------------------------------------------------

/**
 * Reusable spring transitions. `snappy` is the workhorse for UI state changes;
 * `bouncy`/`poppy` add personality to entrances; `gentle`/`smooth` are for
 * larger, calmer moves. Values are lifted from the launch video presets.
 */
export const springs = {
  snappy: { type: "spring", stiffness: 400, damping: 30 } as Transition,
  bouncy: { type: "spring", stiffness: 300, damping: 15 } as Transition,
  poppy: { type: "spring", stiffness: 500, damping: 22 } as Transition,
  gentle: { type: "spring", stiffness: 120, damping: 20 } as Transition,
  smooth: { type: "spring", stiffness: 120, damping: 25 } as Transition,
} as const;

export type SpringName = keyof typeof springs;

// ---------------------------------------------------------------------------
// Entrance / idle helpers — return props you can spread onto a motion element.
// ---------------------------------------------------------------------------

/**
 * A springy "pop + settle" entrance, matching the mascot's arrival in the
 * launch video. Pass the result of `useReducedMotion()` so it can collapse to a
 * plain fade (or nothing) when motion is reduced.
 */
export function mascotEntrance(reduceMotion: boolean | null): MotionProps {
  if (reduceMotion) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      transition: { duration: 0.001 },
    };
  }
  return {
    initial: { opacity: 0, scale: 0.55, y: 12 },
    animate: { opacity: 1, scale: 1, y: 0 },
    transition: { type: "spring", stiffness: 260, damping: 18 },
  };
}

/**
 * A gentle, looping bob. `cheer` adds a springier celebratory hop. Returns
 * `undefined` when motion is reduced so the element simply stays put.
 */
export function floatIdle(
  reduceMotion: boolean | null,
  variant: "float" | "cheer" = "float",
): { animate: MotionProps["animate"]; transition: Transition } | undefined {
  if (reduceMotion) return undefined;
  if (variant === "cheer") {
    return {
      animate: { y: [0, -10, 0], rotate: [0, -3, 3, 0] },
      transition: { duration: 1.6, repeat: Infinity, ease: "easeInOut" },
    };
  }
  return {
    animate: { y: [0, -6, 0], rotate: [0, -1.5, 1.5, 0] },
    transition: { duration: 4, repeat: Infinity, ease: "easeInOut" },
  };
}

// ---------------------------------------------------------------------------
// FloatingTag — a softly bobbing pill, used for language tags in the shell.
// ---------------------------------------------------------------------------

export function FloatingTag({
  children,
  className,
  style,
  dir,
  /** Stagger multiple tags by giving each a small delay offset. */
  delay = 0,
  /** How far it drifts, in px. Smaller = subtler. */
  distance = 6,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Text direction — forward `"rtl"` for right-to-left scripts (e.g. Urdu). */
  dir?: "ltr" | "rtl";
  delay?: number;
  distance?: number;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-sm font-bold",
        className,
      )}
      style={style}
      dir={dir}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8, y: 4 }}
      animate={
        reduceMotion
          ? { opacity: 1 }
          : {
              opacity: 1,
              scale: 1,
              y: [0, -distance, 0],
            }
      }
      transition={
        reduceMotion
          ? { duration: 0.001 }
          : {
              opacity: springs.snappy,
              scale: springs.bouncy,
              y: {
                duration: 3.4,
                repeat: Infinity,
                ease: "easeInOut",
                delay,
              },
            }
      }
    >
      {children}
    </motion.span>
  );
}

// ---------------------------------------------------------------------------
// SoundWavePulse — animated equalizer bars, echoing the "speak out loud" theme.
// ---------------------------------------------------------------------------

const WAVE_HEIGHTS = [0.45, 0.8, 1, 0.65, 0.9, 0.5];

export function SoundWavePulse({
  className,
  barClassName,
  bars = WAVE_HEIGHTS.length,
  /** Overall height of the wave, in px. */
  size = 20,
}: {
  className?: string;
  barClassName?: string;
  bars?: number;
  size?: number;
}) {
  const reduceMotion = useReducedMotion();
  const heights = Array.from(
    { length: bars },
    (_, i) => WAVE_HEIGHTS[i % WAVE_HEIGHTS.length],
  );

  return (
    <span
      className={cn("flex items-center gap-[3px]", className)}
      style={{ height: size }}
      aria-hidden="true"
    >
      {heights.map((peak, i) => {
        // Reduced motion: show a static, staggered bar profile (no animation)
        // so the mark still reads as a sound wave without any movement.
        if (reduceMotion) {
          return (
            <span
              key={i}
              className={cn(
                "w-[3px] rounded-full bg-current",
                barClassName,
              )}
              style={{ height: `${peak * size}px` }}
            />
          );
        }
        return (
          <motion.span
            key={i}
            className={cn("w-[3px] rounded-full bg-current", barClassName)}
            initial={{ height: size * 0.3 }}
            animate={{ height: [size * 0.3, peak * size, size * 0.3] }}
            transition={{
              duration: 0.9,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.12,
            }}
          />
        );
      })}
    </span>
  );
}
