// THE SIGNED-OUT HERO'S ROTATING SHOWCASE.
//
// Replaces SpeakingDemo, a hand-built mock of a practice screen. It was wrong
// in the way a mock always eventually is: it read "Tap, then speak" and
// "LISTENING... STOPS ON ITS OWN", describing an auto-stop recorder this app
// does not have. The real screen says "Hold Bolo to speak" and "Release to
// submit" (pages/practice.tsx). Reported by the owner, 2026-08-30: "this is
// not how lessons work or scoring looks."
//
// THE FIX IS STRUCTURAL, NOT A COPY EDIT. Anything drawn here by hand is a
// second implementation of a screen that already exists, maintained by nobody,
// and it drifts silently because no test can fail when the real app changes.
// So this shows CAPTURES of the real app and nothing else: every panel is a
// file, and the only way it goes stale is if nobody re-captures it, which is at
// least visible.
//
// IT SLIDES ON AN OPEN-ENDED TRACK, and that is the second thing this got
// wrong. The first version re-rendered a three-panel window keyed by panel id,
// so every tick unmounted all three and mounted three more: the pictures
// changed but nothing ever moved. "It cycles but it's choppy, not a smooth
// scroll to next one" (owner). Now `pos` only ever counts UP, each slot is
// placed at its own offset from it, and framer animates that offset. Slides
// enter from the right and leave to the left forever; there is no wrap frame,
// because the wrap lives in the modulo that picks the panel, not in the
// geometry.
//
// Auto-rotating carousels are an accessibility hazard, so this one:
//   - pauses on keyboard focus anywhere inside it;
//   - stops rotating for good once someone presses a control, because a
//     carousel that keeps moving under a person who took hold of it is the
//     worst version of this pattern;
//   - never auto-rotates at all under reduce-motion;
//   - exposes real prev/next buttons and a labelled tab for each panel.
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** How long each panel holds before the next one comes up. */
export const SHOWCASE_INTERVAL_MS = 3400;

// THE TRACK'S GEOMETRY HAS TO BE NUMBERS. The slide is a transform on each
// slot, so the step between slots is arithmetic rather than layout, which is
// why there is one width at a time instead of a responsive class.
/** iPhone 17 Pro, 1206x2622: the aspect every panel is cut to. */
const PANEL_ASPECT_W = 1206;
const PANEL_ASPECT_H = 2622;
/** The gap between slots, as a fraction of a panel's width. */
const GAP_RATIO = 28 / 220;

/**
 * THE PANEL IS SIZED FROM THE SPACE ACTUALLY LEFT BELOW IT, so the hero lands
 * above the fold instead of assuming one laptop. Asked for 2026-08-30: "any
 * way you can adjust the layout so the hero shows before scrolling?"
 *
 * A fraction of the viewport was the first attempt and it missed by 70px,
 * because the copy block above the showcase is not a fixed height: it wraps
 * differently at every width, and the headline alone changes by two lines
 * between breakpoints. Measuring the showcase's own top and subtracting is the
 * only version that cannot be wrong about what is above it.
 *
 * RESERVED_BELOW is what still has to fit UNDER the phones: the caption (~40),
 * the controls (~48), and clearance for the sticky get-the-app bar, which is
 * fixed and therefore invisible to layout while very much covering the bottom
 * of the screen. That bar is also dismissible, so it is given breathing room
 * rather than its full height.
 */
const RESERVED_BELOW = 140;
const PANEL_H_MIN = 280;
const PANEL_H_MAX = 478;

function panelWidthForSpace(topOffset: number, viewportH: number): number {
  const available = viewportH - topOffset - RESERVED_BELOW;
  const h = Math.max(PANEL_H_MIN, Math.min(PANEL_H_MAX, available));
  return Math.round((h * PANEL_ASPECT_W) / PANEL_ASPECT_H);
}

export interface ShowcasePanel {
  /** Stable key, also used as the testid suffix. */
  id: string;
  /** Short label under the phone. This is the sales line for that screen. */
  caption: string;
  /** What the screen shows, for anyone who cannot see it. */
  alt: string;
  /** A still capture, or a silent looping clip when `poster` is set. */
  src: string;
  /** Present for a video panel: the poster frame shown before it plays. */
  poster?: string;
}

export function HeroShowcase({
  panels,
  className,
}: {
  panels: readonly ShowcasePanel[];
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  // COUNTS UP FOREVER, never wraps. See the header: the wrap lives in the
  // modulo that picks a panel, so the track only ever travels one way and
  // never has to snap back from the last slide to the first.
  const [pos, setPos] = useState(0);
  const [taken, setTaken] = useState(false);
  const [paused, setPaused] = useState(false);
  const videoRefs = useRef(new Map<string, HTMLVideoElement>());

  // Starts at the tallest panel so first paint is the roomy case, then
  // settles once the copy block above has laid out and its height is known.
  const rootRef = useRef<HTMLDivElement>(null);
  const [panelW, setPanelW] = useState(
    Math.round((PANEL_H_MAX * PANEL_ASPECT_W) / PANEL_ASPECT_H),
  );
  useEffect(() => {
    const fit = () => {
      const el = rootRef.current;
      if (!el) return;
      // Document-relative, so a mid-page reload does not measure a scrolled
      // viewport and conclude there is no room.
      const top = el.getBoundingClientRect().top + window.scrollY;
      setPanelW(panelWidthForSpace(top, window.innerHeight));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  const step = Math.round(panelW * (1 + GAP_RATIO));
  const panelH = Math.round((panelW * PANEL_ASPECT_H) / PANEL_ASPECT_W);

  const count = panels.length;
  const at = (slot: number) => panels[((slot % count) + count) % count];
  const index = ((pos % count) + count) % count;
  const active = panels[index];

  const rotating = !reduceMotion && !taken && !paused && count > 1;
  useEffect(() => {
    if (!rotating) return;
    const t = window.setInterval(
      () => setPos((p) => p + 1),
      SHOWCASE_INTERVAL_MS,
    );
    return () => window.clearInterval(t);
  }, [rotating]);

  // Only the panel on screen plays. A silent clip decoding frames off-screen
  // is a phone battery spent on a picture nobody is looking at.
  useEffect(() => {
    for (const [id, el] of videoRefs.current) {
      if (id === active?.id && !reduceMotion) {
        const played = el.play();
        if (played && typeof played.catch === "function") played.catch(() => {});
      } else {
        el.pause();
        el.currentTime = 0;
      }
    }
  }, [active, reduceMotion]);

  const take = (delta: number) => {
    setTaken(true);
    setPos((p) => p + delta);
  };
  // Jump to a tab by the SHORTEST signed path, so picking the last dot from
  // the first slides one step left rather than sweeping the whole track.
  const takeTo = (target: number) => {
    let delta = (target - index + count) % count;
    if (delta > count / 2) delta -= count;
    take(delta);
  };

  // One slot either side fills a desktop; anything further is off the track
  // and stays unmounted, so seven phone screenshots never become seven
  // requests on a page whose whole point is loading fast.
  const slots = [pos - 1, pos, pos + 1];

  return (
    <div
      ref={rootRef}
      className={cn("relative", className)}
      // No pause-on-hover: this wrapper spans the full width of the hero, so a
      // cursor left where a cursor usually sits while reading held the whole
      // thing still. Focus pauses, and any control stops it for good.
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      data-testid="hero-showcase"
    >
      <div className="relative overflow-hidden" style={{ height: panelH }}>
        {slots.map((slot) => {
          const panel = at(slot);
          const offset = slot - pos;
          const isActive = offset === 0;
          return (
            <motion.div
              key={slot}
              className="absolute top-0 left-1/2"
              style={{ width: panelW }}
              initial={false}
              animate={{
                x: offset * step - panelW / 2,
                scale: isActive ? 1 : 0.88,
                opacity: isActive ? 1 : 0.45,
              }}
              transition={
                reduceMotion
                  ? { duration: 0.001 }
                  : { type: 'spring', stiffness: 210, damping: 30, mass: 0.9 }
              }
            >
              <PhoneFrame>
                {panel.poster ? (
                  <video
                    ref={(el) => {
                      if (el) videoRefs.current.set(panel.id, el);
                      else videoRefs.current.delete(panel.id);
                    }}
                    src={panel.src}
                    poster={panel.poster}
                    muted
                    loop
                    playsInline
                    preload="none"
                    aria-label={panel.alt}
                    data-testid={`showcase-video-${panel.id}`}
                    className="block h-full w-full object-cover"
                  />
                ) : (
                  <img
                    src={panel.src}
                    // The two flanking panels are decoration for the one on
                    // show; naming all three would read a screen reader three
                    // screens when one is being presented.
                    alt={isActive ? panel.alt : ''}
                    aria-hidden={isActive ? undefined : true}
                    loading={isActive ? 'eager' : 'lazy'}
                    decoding="async"
                    data-testid={`showcase-image-${panel.id}`}
                    className="block h-full w-full object-cover"
                  />
                )}
              </PhoneFrame>
            </motion.div>
          );
        })}
      </div>

      <p
        className="mt-5 text-center text-sm font-black uppercase tracking-widest text-muted-foreground"
        data-testid="showcase-caption"
      >
        {active?.caption}
      </p>

      {/* Controls. The tabs carry a name each, so the set is usable without
          seeing it; the active one changes SHAPE as well as fill, because a
          control that reads only as a colour is invisible to a colour-blind
          visitor. */}
      <div className="mt-4 flex items-center justify-center gap-3">
        <ShowcaseArrow label="Previous screen" onClick={() => take(-1)}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </ShowcaseArrow>
        <div className="flex items-center gap-2" role="tablist" aria-label="Screens">
          {panels.map((panel, i) => (
            <button
              key={panel.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={panel.caption}
              data-testid={`showcase-tab-${panel.id}`}
              onClick={() => takeTo(i)}
              className={cn(
                'h-2 rounded-full transition-all',
                i === index
                  ? 'w-6 bg-foreground'
                  : 'w-2 bg-foreground/25 hover:bg-foreground/50',
              )}
            />
          ))}
        </div>
        <ShowcaseArrow label="Next screen" onClick={() => take(1)}>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </ShowcaseArrow>
      </div>
    </div>
  );
}

function ShowcaseArrow({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-foreground/70 transition-colors hover:text-foreground"
    >
      {children}
    </button>
  );
}

/**
 * A drawn bezel. The captures are screen-only, so the frame comes from CSS.
 *
 * THE ASPECT IS PINNED HERE, NOT LEFT TO THE MEDIA. A <video> with
 * `preload="none"` has no intrinsic size until metadata loads, and the HTML
 * default is 300x150 - landscape. So the call panel rendered as a squat
 * letterbox beside six portrait screenshots, and with preload="none" its
 * metadata never arrives, because nothing has asked for it yet.
 */
function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[1.9rem] border-[5px] border-foreground/85 bg-foreground/85 shadow-[0_16px_36px_-14px_rgba(15,23,42,0.45)]">
      <div
        className="overflow-hidden rounded-[1.5rem]"
        style={{ aspectRatio: `${PANEL_ASPECT_W} / ${PANEL_ASPECT_H}` }}
      >
        {children}
      </div>
    </div>
  );
}
