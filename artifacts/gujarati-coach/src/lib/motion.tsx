import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
  type Transition,
  type MotionProps,
} from "framer-motion";
import { useRef } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";
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
// Journey rail comet tuning (Task #973). Geometry constants for the traveling
// comet sweep on the journey map's active run. Timing and opacity live as the
// --rail-pulse-* custom properties in the :root tuning block in index.css.
// Named exports so composing work (for example the journey open sweep) and
// tests share one source of truth instead of hardcoding values.
// ---------------------------------------------------------------------------

export const RAIL_PULSE = {
  /**
   * Bezier samples per rail segment. Dense enough that the lit stretch reads
   * as one continuous comet tail rather than separate blinking dots.
   */
  dotsPerSegment: 10,
  /**
   * Radius of each sampled dot in SVG px. The r=3 dots this replaced read as
   * noise at map scale; 4px plus the CSS glow reads as a single bright head.
   */
  dotRadius: 4,
} as const;

// ---------------------------------------------------------------------------
// 2.5D depth pass tuning (Task 985). The journey map's shared dimensional
// language: one upper-left key light, soft down-right shadows, a rail-bed
// thickness offset, light scroll parallax on the scenery layer, and the
// depth-order tokens later surfaces (games hub, home) should reuse. CSS-side
// shadow constants live as the --depth-shadow-* custom properties in the
// :root tuning block in index.css; these are the geometry/behavior values.
// ---------------------------------------------------------------------------

export const DEPTH_2_5D = {
  /**
   * Scroll-linked parallax factor for the journey scenery layer: the scenery
   * group translates down by scrollY * factor, so it travels slightly slower
   * than the rail and reads as sitting behind it. Kept small on purpose; over
   * a full-line scroll (~6000px) the total drift stays around one station row.
   * Applied as ONE transform on the scenery group, and not at all under
   * reduced motion.
   */
  parallaxFactor: 0.03,
  /**
   * Rail-bed thickness: the sleeper-tie stroke is duplicated once per segment,
   * offset down by this many SVG px in ink at low opacity, so every tie shows
   * an underside edge and the track reads as a raised bed. The rail path
   * geometry (`d`) itself is untouched — the comet samples the same beziers.
   */
  railBedDy: 2.5,
  railBedOpacity: 0.18,
  /**
   * Depth-order tokens: scenery below rail, rail below station cards, cards
   * below station markers, markers below the train, train below postcards,
   * postcards below overlays (dialogs, z-50). Scenery and rail are SVG groups
   * (paint order inside the map svg, which underlies all HTML overlays); the
   * rest are the z-indexes of the absolutely positioned HTML layers.
   */
  layers: {
    scenery: 0,
    rail: 1,
    stationCard: 4,
    station: 6,
    train: 7,
    postcard: 8,
    overlay: 50,
  },
} as const;

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

// ---------------------------------------------------------------------------
// Scroll-linked motion. Added 2026-08-28 for the "living homepage" pass: the
// public landing page revealed each section once and then sat perfectly still,
// so a long scroll felt like paging through a PDF. These primitives give the
// scroll itself something to drive.
//
// EVERY ONE OF THEM COLLAPSES TO A STILL FRAME UNDER REDUCE-MOTION. That is
// not decoration: framer-motion animates from JS, so the global
// prefers-reduced-motion reset in index.css does NOT neutralize any of this.
// The parallax distance goes to zero, the rails and drifts do not render at
// all, and the reveals degrade to a plain opacity fade.
// ---------------------------------------------------------------------------

/**
 * Scroll-linked vertical drift, in px, for a decorative layer.
 *
 * The returned MotionValue runs from `+distance` when the target first enters
 * the viewport to `-distance` as it leaves, so the layer travels against the
 * scroll and reads as sitting at a different depth. Same idea as the journey
 * map's scenery parallax (see DEPTH_2_5D.parallaxFactor), expressed as a
 * viewport-relative range rather than a raw scrollY multiplier.
 *
 * Give the ref to a WRAPPER that is not itself transformed, and apply the
 * value to a child. Pointing both at one element feeds the transform back into
 * its own bounding box measurement and the drift compounds every frame.
 */
export function useParallaxY(
  ref: RefObject<HTMLElement | null>,
  distance = 60,
): MotionValue<number> {
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  // Hooks must run unconditionally, so reduced motion zeroes the travel rather
  // than skipping the subscription.
  const travel = reduceMotion ? 0 : distance;
  return useTransform(scrollYProgress, [0, 1], [travel, -travel]);
}

/**
 * A decorative layer that drifts as the page scrolls. Always `aria-hidden`:
 * this is for background shapes and glows, never for content.
 *
 * `className` positions the (untransformed) wrapper; the drift is applied to
 * an inner element so the measurement stays honest.
 */
export function ParallaxLayer({
  children,
  className,
  distance = 60,
  /**
   * Decorative layers are hidden from assistive tech. Pass `false` when the
   * thing that drifts is real content (a product shot, a card) — a parallax is
   * a visual effect and must never cost a screen reader the content itself.
   */
  decorative = true,
}: {
  children: ReactNode;
  className?: string;
  distance?: number;
  decorative?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const y = useParallaxY(ref, distance);
  return (
    <div ref={ref} className={className} aria-hidden={decorative || undefined}>
      <motion.div style={{ y }} className="h-full w-full">
        {children}
      </motion.div>
    </div>
  );
}

/**
 * A hairline rail across the top of the page showing how far down it you are.
 * The signal is LENGTH, never colour, so it stays readable for a colour-blind
 * visitor; it is also aria-hidden, because a scrollbar already tells assistive
 * tech this and a second announcement is noise.
 *
 * Renders nothing at all under reduce-motion.
 */
export function ScrollProgressRail({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  // Spring-smoothed so a trackpad flick glides instead of snapping.
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 220,
    damping: 40,
    restDelta: 0.001,
  });
  if (reduceMotion) return null;
  return (
    <motion.div
      aria-hidden="true"
      data-testid="scroll-progress-rail"
      className={cn(
        "fixed inset-x-0 top-0 z-40 h-[3px] origin-left bg-primary",
        className,
      )}
      style={{ scaleX }}
    />
  );
}

// ---------------------------------------------------------------------------
// Reveal — the scroll entrance used across public pages.
// ---------------------------------------------------------------------------

export type RevealFrom = "bottom" | "left" | "right" | "scale";

/**
 * Tags the reveal wrappers can render as. Kept to a short list on purpose:
 * the point is that a grid of list items stays valid HTML (an <li> inside an
 * <ol>, not a <div>), not that these become general-purpose polymorphs.
 */
export type MotionTagName = "div" | "ul" | "ol" | "li" | "section" | "span";

/** The hidden offset for each entrance direction, before the spring settles. */
function hiddenOffset(from: RevealFrom, y: number) {
  switch (from) {
    case "left":
      return { opacity: 0, x: -y, y: 0, scale: 1 };
    case "right":
      return { opacity: 0, x: y, y: 0, scale: 1 };
    case "scale":
      return { opacity: 0, x: 0, y: y * 0.4, scale: 0.94 };
    default:
      return { opacity: 0, x: 0, y, scale: 1 };
  }
}

const SHOWN = { opacity: 1, x: 0, y: 0, scale: 1 } as const;

/**
 * Spring-based reveal that mirrors the launch video's section entrances.
 * Lifted out of pages/landing.tsx on 2026-08-28 (where it was bottom-only and
 * private) so the per-language pages can share one entrance vocabulary.
 *
 * Set `replay` when the element should animate every time it crosses the
 * viewport rather than once. Off by default: content that re-animates on the
 * way back up is distracting, while ambient furniture benefits from it.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 28,
  from = "bottom",
  spring = "gentle",
  replay = false,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  from?: RevealFrom;
  spring?: SpringName;
  replay?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduceMotion ? { opacity: 0 } : hiddenOffset(from, y)}
      whileInView={reduceMotion ? { opacity: 1 } : SHOWN}
      viewport={{ once: !replay, margin: "-80px" }}
      transition={
        reduceMotion ? { duration: 0.001 } : { ...springs[spring], delay }
      }
    >
      {children}
    </motion.div>
  );
}

/**
 * Cascades its `RevealChild`ren in one after another as the group scrolls in.
 *
 * Prefer this over giving each child its own `Reveal delay={i * 0.06}`: the
 * per-child form starts every timer when that child crosses the margin, so a
 * row that enters all at once fires all its delays at once and the stagger is
 * invisible. Driving it from the parent's variants keeps the cascade intact.
 */
export function RevealStagger({
  children,
  className,
  stagger = 0.08,
  delayChildren = 0.04,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
  delayChildren?: number;
  as?: MotionTagName;
}) {
  const reduceMotion = useReducedMotion();
  const MotionTag = motion[Tag];
  return (
    <MotionTag
      className={className}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: "-80px" }}
      variants={{
        hidden: {},
        shown: {
          transition: reduceMotion
            ? { staggerChildren: 0, delayChildren: 0 }
            : { staggerChildren: stagger, delayChildren },
        },
      }}
    >
      {children}
    </MotionTag>
  );
}

/** One item inside a {@link RevealStagger}. Inherits the parent's timing. */
export function RevealChild({
  children,
  className,
  y = 26,
  from = "bottom",
  spring = "gentle",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  y?: number;
  from?: RevealFrom;
  spring?: SpringName;
  as?: MotionTagName;
}) {
  const reduceMotion = useReducedMotion();
  const MotionTag = motion[Tag];
  return (
    <MotionTag
      className={className}
      variants={{
        hidden: reduceMotion ? { opacity: 0 } : hiddenOffset(from, y),
        shown: {
          ...SHOWN,
          transition: reduceMotion ? { duration: 0.001 } : springs[spring],
        },
      }}
    >
      {children}
    </MotionTag>
  );
}

// ---------------------------------------------------------------------------
// SplitHeading — a headline whose words rise in sequence.
// ---------------------------------------------------------------------------

/**
 * Renders `text` word by word so each one can rise on its own beat.
 *
 * THE `aria-label` IS LOAD-BEARING, not belt-and-braces. Splitting a sentence
 * into one element per word destroys its accessible name: the name-from-content
 * algorithm trims each text node before joining, so the separating spaces
 * vanish and "What using Bolo! is actually like" is announced, and matched by
 * getByRole, as "WhatusingBolo!isactuallylike". Naming the heading explicitly
 * from the same `text` puts the sentence back, and cannot drift from what is
 * drawn because both read the one prop. Two landing-page tests caught this.
 *
 * The visible words keep a trailing space inside their own text node (with
 * `whitespace-pre`, since an inline-block span would otherwise collapse it),
 * so selecting and copying the heading still yields spaced words.
 */
export function SplitHeading({
  text,
  className,
  id,
  as: Tag = "h2",
  stagger = 0.045,
}: {
  text: string;
  className?: string;
  id?: string;
  as?: "h1" | "h2" | "h3";
  stagger?: number;
}) {
  const reduceMotion = useReducedMotion();
  const MotionTag = motion[Tag];
  const words = text.split(" ");
  return (
    <MotionTag
      id={id}
      className={className}
      aria-label={text}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: "-60px" }}
      variants={{
        hidden: {},
        shown: { transition: { staggerChildren: reduceMotion ? 0 : stagger } },
      }}
    >
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          className="inline-block whitespace-pre"
          variants={{
            hidden: reduceMotion
              ? { opacity: 0 }
              : { opacity: 0, y: "0.45em", rotate: -2 },
            shown: {
              opacity: 1,
              y: 0,
              rotate: 0,
              transition: reduceMotion ? { duration: 0.001 } : springs.gentle,
            },
          }}
        >
          {i < words.length - 1 ? `${word} ` : word}
        </motion.span>
      ))}
    </MotionTag>
  );
}
