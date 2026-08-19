// The Bolo Bazaar changing room: a curtained booth the bird steps into.
//
// WHY IT EXISTS: swapping the mascot art in place made a costume change read
// as a glitch, the old bird blinked out and a new one blinked in. A shop
// solves this with a curtain, so the shop does: the panels draw shut, the art
// is swapped behind them, and they open on the dressed bird.
//
// TWO RULES THIS COMPONENT EXISTS TO KEEP:
//  1. The curtains NEVER leave. Open means tied back at the posts, not slid
//     off-stage, a booth with no cloth in it stops reading as a booth, and
//     the change then looks like two red rectangles flying in from nowhere.
//  2. `closed` is caller state, never an animation-end callback. The caller
//     always flips it back (on load, on error, on a timer), so the curtain
//     cannot stick shut over the product.
//
// The booth itself is scenery on the fixed INDIA palette, timber frame and
// posts, a plaster back wall lit by a warm ceiling glow, a velvet pelmet with
// a scalloped hem, and a timber floor, so it reads the same in both themes.
import type { ReactNode } from "react";
import { INDIA } from "@/lib/india-palette";
import { cn } from "@/lib/utils";

const VELVET_DARK = "#6E1A0E";
const VELVET_MID = "#8C2213";
const VELVET_LIGHT = "#A32B18";

/** Velvet with its folds: light and shadow pleats over a red base. */
const VELVET = [
  "repeating-linear-gradient(90deg, rgba(0,0,0,0.30) 0 2px, rgba(255,255,255,0.11) 5px 11px, rgba(0,0,0,0.18) 17px 22px)",
  `linear-gradient(180deg, ${VELVET_LIGHT} 0%, ${VELVET_MID} 55%, ${VELVET_DARK} 100%)`,
].join(", ");

const TIMBER = `linear-gradient(180deg, ${INDIA.timber} 0%, ${INDIA.timberShade} 100%)`;

/** How much of the booth each panel still covers once it is tied back. */
const TIED_BACK = 13;
const PANEL_WIDTH = 52;

export function DressingRoom({
  closed,
  children,
  className,
}: {
  /** True while the bird is changing. */
  closed: boolean;
  children: ReactNode;
  className?: string;
}) {
  // Panels are always PANEL_WIDTH wide and slide within the booth, so the
  // cloth is on screen in both states, open just parks most of it behind the
  // post. Transform (not width) so the pleats do not squash while moving.
  const shift = PANEL_WIDTH - TIED_BACK;
  const panel = {
    backgroundImage: VELVET,
    width: `${PANEL_WIDTH}%`,
    transition: "transform 620ms cubic-bezier(0.33, 0, 0.2, 1)",
  } as const;

  return (
    <div
      data-testid="dressing-room"
      data-state={closed ? "closed" : "open"}
      className={cn("relative overflow-hidden", className)}
      style={{
        background: "linear-gradient(180deg, #F7E7C8 0%, #EEDAB4 72%, #E3CBA0 100%)",
      }}
    >
      {/* The booth's own light, before anything stands in it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 78% at 50% 12%, rgba(255,240,208,0.95) 0%, rgba(255,240,208,0) 68%)",
        }}
      />

      <div className="relative">{children}</div>

      {/* Everything below is scenery: the learner interacts with the bird and
          the buttons, never with the booth. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {/* Curtains, hung under the pelmet and stopping at the floor. */}
        <div
          data-testid="curtain-left"
          className="absolute bottom-3 left-0 top-5"
          style={{
            ...panel,
            transform: closed ? "translateX(0)" : `translateX(-${(shift / PANEL_WIDTH) * 100}%)`,
            boxShadow: "4px 0 12px rgba(60,20,10,0.35)",
            borderRight: `2px solid rgba(240,163,43,0.55)`,
          }}
        />
        <div
          data-testid="curtain-right"
          className="absolute bottom-3 right-0 top-5"
          style={{
            ...panel,
            transform: closed ? "translateX(0)" : `translateX(${(shift / PANEL_WIDTH) * 100}%)`,
            boxShadow: "-4px 0 12px rgba(60,20,10,0.35)",
            borderLeft: `2px solid rgba(240,163,43,0.55)`,
          }}
        />

        {/* Gold ties, only meaningful once the cloth is gathered at a post. */}
        {[
          { side: "left" as const },
          { side: "right" as const },
        ].map(({ side }) => (
          <span
            key={side}
            className="absolute h-3 rounded-full transition-opacity duration-500"
            style={{
              top: "48%",
              [side]: 0,
              width: `${TIED_BACK}%`,
              opacity: closed ? 0 : 1,
              background: `linear-gradient(180deg, ${INDIA.gold} 0%, #B4761A 100%)`,
              boxShadow: "0 1px 0 rgba(0,0,0,0.25)",
            }}
          />
        ))}

        {/* Posts and floor: the booth's timber. */}
        <div
          className="absolute inset-y-0 left-0 w-2"
          style={{ background: `linear-gradient(90deg, ${INDIA.timberShade}, ${INDIA.timber})` }}
        />
        <div
          className="absolute inset-y-0 right-0 w-2"
          style={{ background: `linear-gradient(270deg, ${INDIA.timberShade}, ${INDIA.timber})` }}
        />
        <div className="absolute inset-x-0 bottom-0 h-3" style={{ background: TIMBER }} />

        {/* The pelmet: a velvet valance with a scalloped hem, hiding the rail.
            One cloth masked into half-rounds, the same construction as the
            shop awning, a separate row of tabs never lines up. */}
        <div
          className="absolute inset-x-0 top-0"
          style={{
            height: 26,
            backgroundImage: VELVET,
            maskImage:
              "linear-gradient(#000 0 0), radial-gradient(circle 8px at 8px 0, #000 99%, transparent 100%)",
            maskSize: "100% 18px, 16px 8px",
            maskPosition: "0 0, 0 18px",
            maskRepeat: "no-repeat, repeat-x",
            WebkitMaskImage:
              "linear-gradient(#000 0 0), radial-gradient(circle 8px at 8px 0, #000 99%, transparent 100%)",
            WebkitMaskSize: "100% 18px, 16px 8px",
            WebkitMaskPosition: "0 0, 0 18px",
            WebkitMaskRepeat: "no-repeat, repeat-x",
          }}
        />
        <div
          className="absolute inset-x-0 top-0 h-1.5"
          style={{ background: `linear-gradient(180deg, ${INDIA.gold}, #B4761A)` }}
        />
      </div>
    </div>
  );
}
