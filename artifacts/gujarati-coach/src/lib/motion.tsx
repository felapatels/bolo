import {
  motion,
  useReducedMotion,
  useTransform,
  type MotionValue,
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
// Funny idle variants — played when the screen sits untouched for 10 s.
// ---------------------------------------------------------------------------

/**
 * Each entry is an `{ animate, transition }` pair you can spread onto a
 * `motion.img`. They are intentionally one-shot (no `repeat: Infinity`) so
 * Bolo snaps back to the normal float after each performance.
 *
 * All entries collapse to `undefined` when `reduceMotion` is true — callers
 * must check for that before indexing this array.
 */
export interface FunnyIdleVariant {
  animate: MotionProps["animate"];
  transition: Transition;
  /**
   * Optional body-part effect the mascot rig plays alongside the whole-body
   * move — real wing flaps on the jump, spread wings on the spin, a quick
   * flutter on the shimmy. Ignored by non-rig consumers.
   */
  rig?: "flap" | "spread" | "flutter";
}

export function funnyIdleVariants(reduceMotion: boolean | null): FunnyIdleVariant[] {
  if (reduceMotion) return [];
  return [
    // 1. Spin — full 360° rotation, wings spread like a pirouette
    {
      animate: { rotate: [0, 360] },
      transition: { duration: 0.6, ease: [0.34, 1.56, 0.64, 1] },
      rig: "spread",
    },
    // 2. Peek left-right — like a curious bird peering around
    {
      animate: { rotate: [0, -20, 20, -20, 20, 0] },
      transition: { duration: 1.2, ease: "easeInOut" },
    },
    // 3. Sneeze-scale — quick puff then settle, feathers ruffling
    {
      animate: { scale: [1, 1.3, 0.85, 1.1, 1] },
      transition: { duration: 0.5, ease: "easeOut" },
      rig: "flutter",
    },
    // 4. Jump — bouncy hop with real wing flaps powering it
    {
      animate: { y: [0, -24, 0, -12, 0] },
      transition: { duration: 0.7, ease: [0.34, 1.56, 0.64, 1] },
      rig: "flap",
    },
    // 5. Dizzy spiral — wobble with a subtle float, wings out for balance
    {
      animate: { rotate: [0, -15, 15, -15, 0], y: [0, -8, 0] },
      transition: { duration: 1, ease: "easeInOut" },
      rig: "spread",
    },
    // 6. Excited shimmy — rapid tiny shakes side to side
    {
      animate: { x: [0, -6, 6, -6, 6, -4, 4, 0] },
      transition: { duration: 0.6, ease: "easeInOut" },
      rig: "flutter",
    },
  ];
}

// ---------------------------------------------------------------------------
// PageTransition — shared enter transition for routed page content.
// ---------------------------------------------------------------------------

/**
 * Wraps a page's content in a short fade + slight upward slide so navigation
 * inside the persistent app shell feels fluid instead of snapping. Key it by
 * the current location so it re-runs on every route change. Collapses to a
 * plain quick fade under reduced motion.
 */
export function PageTransition({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={
        reduceMotion
          ? { duration: 0.15, ease: "linear" }
          : { duration: 0.2, ease: "easeOut" }
      }
    >
      {children}
    </motion.div>
  );
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

/**
 * One amplitude-driven bar. The height tracks the shared amplitude
 * MotionValue directly (no React state, no re-renders per frame); `peak`
 * staggers each bar's sensitivity so the array reads as a wave rather than
 * six identical columns.
 */
function AmplitudeBar({
  amplitude,
  peak,
  size,
  className,
}: {
  amplitude: MotionValue<number>;
  peak: number;
  size: number;
  className?: string;
}) {
  const height = useTransform(
    amplitude,
    (a) => Math.max(size * 0.18, Math.min(1, a) * peak * size),
  );
  return (
    <motion.span
      className={cn("w-[3px] rounded-full bg-current", className)}
      style={{ height }}
    />
  );
}

export function SoundWavePulse({
  className,
  barClassName,
  bars = WAVE_HEIGHTS.length,
  /** Overall height of the wave, in px. */
  size = 20,
  amplitude,
}: {
  className?: string;
  barClassName?: string;
  bars?: number;
  size?: number;
  /**
   * Optional live input level (0..1) as a framer-motion MotionValue. When
   * provided, the bars are driven by it (real audio, Spec D2). When absent,
   * the pre-existing time-based loop runs unchanged.
   */
  amplitude?: MotionValue<number>;
}) {
  const reduceMotion = useReducedMotion();
  const heights = Array.from(
    { length: bars },
    (_, i) => WAVE_HEIGHTS[i % WAVE_HEIGHTS.length],
  );

  // Live-driven mode (Spec D2): bar heights bind to the amplitude
  // MotionValue via useTransform — updates bypass React state entirely.
  // Under reduced motion the amplitude-driven branch below is NOT used;
  // callers render their own static level indicator (the waveform must not
  // dance, but mic-is-working feedback must not disappear either).
  if (amplitude && !reduceMotion) {
    return (
      <span
        className={cn("flex items-center gap-[3px]", className)}
        style={{ height: size }}
        aria-hidden="true"
      >
        {heights.map((peak, i) => (
          <AmplitudeBar
            key={i}
            amplitude={amplitude}
            peak={peak}
            size={size}
            className={barClassName}
          />
        ))}
      </span>
    );
  }

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
