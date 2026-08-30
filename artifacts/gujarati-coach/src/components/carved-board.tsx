// THE CARVED STATION BOARD, and there is exactly ONE of it on web.
//
// Extracted from the board block inside ZonePostcard (pages/journey.tsx) on
// 2026-08-28, when the home hero was rebuilt as a station board to match
// mobile. Two screens now draw this board, and this repo's standing rule is
// that a second definition of the same thing is the defect rather than the
// fix. Web and mobile are already hand-maintained twins held together by
// prose; a third copy inside web itself would be worse.
//
// Mobile twin: components/journey/CarvedBoard.tsx in bolo-mobile, extracted
// from its own journey screen a day earlier for exactly the same reason. The
// two take the same props and read the same ZONE_BOARD fractions.
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ZONE_BOARD, ZONE_BOARD_ART } from "@/lib/zone-backdrops";

/** The modern card's own colours (mobile build 22, here build 23): ivory
 *  paper, a lavender edge, the plate in the app's violet. Static rather than
 *  themed, like the ticket stock: the card lies on a painting, not on the
 *  app's background. Mobile twin: MODERN in components/journey/CarvedBoard. */
export const MODERN_BOARD = {
  paper: "#FFFDF9",
  edge: "#CFC8F0",
  arc: "#B9B0E8",
  plateTop: "#6D5BF4",
  plateBottom: "#4F46E5",
  tagPaper: "#EFEBFA",
  tagInk: "#4B3F8F",
} as const;
const MODERN_RADIUS = 18;

export function CarvedBoard({
  height,
  panelHeight,
  panelAspect,
  nameplate,
  plate,
  className,
  style,
  clipContent = true,
  bare = false,
  variant = "carved",
  testId,
  pedimentTestId,
  children,
}: {
  /**
   * 'carved' is the painted station board: the wood pediment with its
   * rosettes and brass plates. 'modern' (mobile build 22, here build 23; the
   * owner's zone card crop: "i like this new zone card style") keeps the
   * board's exact geometry, so nothing that measures the map moves, and
   * draws the pediment in code instead: an ivory cap with rounded shoulders
   * and a faint arch, a violet plate carrying the zone's name, and a small
   * ZONE tag straddling the cap and the body. The body below is the
   * caller's card, flush to the cap's width.
   */
  variant?: "carved" | "modern";
  /**
   * The board's TOTAL height in px, pediment included. EXACTLY this, not "at
   * most": the pediment takes its own aspect out of the top and the panel
   * absorbs precisely the remainder, so the board always fills its reserved
   * row and never exceeds it. A cap plus overflow-hidden crops whatever
   * happens to be last, which is how the journey's daily fact once ended up
   * with its final line sliced off.
   *
   * Use this where the LAYOUT reserves an exact row for the board (the journey
   * map does: the board may never push into the first station beneath it).
   */
  height?: number;
  /**
   * The PANEL's height in px, with the pediment left to its own aspect on top.
   *
   * Use this where the board is fluid-width (the home hero fills its grid
   * column, which is a phone's width on one screen and half a desktop on
   * another). Sizing the panel and letting the pediment self-size is the CSS
   * way round and needs no measurement at all — where mobile has to compute a
   * total in points because Yoga will not derive one, an `img` with `w-full`
   * already knows its own aspect here. Exactly one of `height` and
   * `panelHeight` should be given.
   */
  panelHeight?: number;
  /**
   * The panel's width-to-height ratio, so it grows with a fluid board instead
   * of letterboxing. Used WITH `panelHeight`, which becomes the floor.
   *
   * Mobile can hardcode a panel height because a phone's width barely varies.
   * Web's hero runs from a 320px phone to a 704px grid column, and a fixed
   * height across that range is a squat letterbox at the top end: the same
   * board that reads correctly on a phone had three and a bit times its panel
   * height in width on a desktop. The ratio holds the shape; the floor keeps
   * the phone case identical to mobile's.
   */
  panelAspect?: number;
  /** The carved nameplate's line. Upper-cased here, not by the caller. */
  nameplate: string;
  /** The small plate under it, e.g. "Zone 2". */
  plate: string;
  className?: string;
  style?: CSSProperties;
  /**
   * THE BOARD CLIPS BY DEFAULT, AND IT HAS TO. The panel takes exactly the
   * height it is given, so the crop is what stops content spilling past the
   * frame.
   *
   * Pass false for the length of an animation that must LEAVE the board. The
   * home hero's ticket tears in two and the halves settle askew, and with the
   * board clipping they were cut off at the frame line instead. Nothing
   * resizes during that window, so the crop is not doing any work while it is
   * off.
   */
  clipContent?: boolean;
  /**
   * NO PANEL ART (build 17 on mobile, build 18 here). The journey's zone board
   * draws its own card under the pediment now (owner: "this box should
   * replace that box"), so the parchment slice and the cream fill are skipped
   * and the children get the panel's full height, inset only to the
   * pediment's own posts (panelInsetLeft/Right). The home hero keeps the art.
   */
  bare?: boolean;
  testId?: string;
  pedimentTestId?: string;
  /** Whatever the panel says. Laid out inside the drawn frame. */
  children?: ReactNode;
}) {
  if (variant === "modern") {
    // The cap takes the pediment art's own aspect, so the panel below it is
    // exactly what the carved board's panel would be and the map's row
    // budget holds (journey-board-budget.test.ts).
    const capAspect = ZONE_BOARD.artW / ZONE_BOARD.topH;
    const plateH = 30;
    const tagH = 18;
    return (
      <div
        data-testid={testId}
        className={cn("relative flex flex-col", clipContent ? "overflow-hidden" : "overflow-visible", className)}
        style={{ height, ...style }}
      >
        <div
          data-testid={pedimentTestId}
          className="relative z-[2] w-full shrink-0"
          style={{
            aspectRatio: String(capAspect),
            background: MODERN_BOARD.paper,
            border: `1.5px solid ${MODERN_BOARD.edge}`,
            borderBottom: "none",
            borderTopLeftRadius: MODERN_RADIUS,
            borderTopRightRadius: MODERN_RADIUS,
          }}
        >
          {/* The arch, a whisper of the carved board's curve, drawn once. */}
          <svg aria-hidden className="absolute inset-0 h-full w-full" viewBox="0 0 100 20" preserveAspectRatio="none">
            <path d="M 6 16 Q 50 -7 94 16" stroke={MODERN_BOARD.arc} strokeWidth={1.5} strokeOpacity={0.55} fill="none" vectorEffect="non-scaling-stroke" />
          </svg>
          <div
            aria-hidden
            className="absolute flex items-center justify-center overflow-hidden rounded-[9px] shadow-[0_2px_4px_rgba(43,26,18,0.18)]"
            style={{
              left: "17%",
              right: "17%",
              top: `max(6px, calc((100% - ${tagH + plateH}px) / 2 - 2px))`,
              height: plateH,
              backgroundImage: `linear-gradient(${MODERN_BOARD.plateTop}, ${MODERN_BOARD.plateBottom})`,
            }}
          >
            <span className="truncate text-[11px] font-black uppercase tracking-[1.6px] text-white">{nameplate}</span>
          </div>
          <div
            aria-hidden
            className="absolute left-1/2 z-[3] flex -translate-x-1/2 items-center justify-center rounded-full border px-3"
            style={{ bottom: -tagH / 2, height: tagH, background: MODERN_BOARD.tagPaper, borderColor: MODERN_BOARD.edge }}
          >
            <span className="truncate text-[9px] font-black uppercase tracking-[1.2px]" style={{ color: MODERN_BOARD.tagInk }}>
              {plate}
            </span>
          </div>
        </div>
        <div className={cn("relative min-h-0 flex-1", clipContent ? "overflow-hidden" : "overflow-visible")}>
          <div className={cn("absolute inset-0", clipContent ? "overflow-hidden" : "overflow-visible")}>{children}</div>
        </div>
      </div>
    );
  }
  return (
    <div
      data-testid={testId}
      className={cn(
        "relative flex flex-col",
        clipContent ? "overflow-hidden" : "overflow-visible",
        className,
      )}
      style={{ height, ...style }}
    >
      {/* The pediment, aspect preserved: its rosettes and arch must not
          stretch, which is the whole reason the art is cut into slices. */}
      <div className="relative">
        <img
          src={ZONE_BOARD_ART.top}
          alt=""
          aria-hidden
          className="block w-full shrink-0"
          data-testid={pedimentTestId}
        />
        {/* The plates. Positions are fractions of the slice, so the overlays
            track the board at any width. */}
        <div
          className="absolute flex items-center justify-center"
          style={{
            left: `${ZONE_BOARD.namePlate.left * 100}%`,
            right: `${ZONE_BOARD.namePlate.right * 100}%`,
            top: `${ZONE_BOARD.namePlate.top * 100}%`,
            height: `${ZONE_BOARD.namePlate.height * 100}%`,
          }}
        >
          <span
            className="truncate text-[9px] font-black uppercase tracking-widest"
            style={{ color: ZONE_BOARD.ink }}
          >
            {nameplate}
          </span>
        </div>
        <div
          className="absolute left-1/2 flex -translate-x-1/2 items-center justify-center"
          style={{
            width: `${ZONE_BOARD.zonePlate.width * 100}%`,
            top: `${ZONE_BOARD.zonePlate.top * 100}%`,
            height: `${ZONE_BOARD.zonePlate.height * 100}%`,
          }}
        >
          <span
            className="truncate text-[8px] font-black uppercase tracking-widest"
            style={{ color: ZONE_BOARD.inkMuted }}
          >
            {plate}
          </span>
        </div>
      </div>
      {/* The panel. THE ONLY PART THAT STRETCHES: given a total `height` it
          absorbs precisely the remainder, given a `panelHeight` it is that. */}
      <div
        className={cn(
          "relative min-h-0",
          panelHeight === undefined && "flex-1",
          clipContent ? "overflow-hidden" : "overflow-visible",
        )}
        style={
          panelHeight === undefined
            ? undefined
            : panelAspect === undefined
              ? { height: panelHeight }
              : { aspectRatio: panelAspect, minHeight: panelHeight }
        }
      >
        {/* Cream UNDER the art, and only as wide as the art's own frame. The
            slice's paper is drawn with PARTIAL ALPHA, so the slice alone is
            see-through and whatever sits behind the board reads straight
            through it. Its outer margin is fully transparent, so the fill must
            stop there or the panel reads wider than the pediment above it. The
            two insets differ because the art is not centred in its own file. */}
        {!bare && (
          <div
            className="absolute inset-y-0"
            style={{
              left: `${ZONE_BOARD.panelInsetLeft * 100}%`,
              right: `${ZONE_BOARD.panelInsetRight * 100}%`,
              background: ZONE_BOARD.panel,
            }}
            aria-hidden
          />
        )}
        {!bare && (
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${ZONE_BOARD_ART.panel})`,
              backgroundSize: "100% 100%",
            }}
            aria-hidden
          />
        )}
        {/* Everything the board says lives inside the drawn frame, on all four
            sides. Absolutely positioned rather than padded: a CSS percentage
            padding resolves against the WIDTH even for top and bottom, so a
            vertical inset written as padding is wrong by however much the
            board is wider than it is tall. `top`/`bottom` on a positioned box
            resolve against the height, which is what this needs.
            BARE, the children take the panel's full height, inset only to
            the pediment's posts: there is no drawn frame to stay inside. */}
        <div
          className={cn(
            "absolute",
            clipContent ? "overflow-hidden" : "overflow-visible",
          )}
          style={
            bare
              ? {
                  left: `${ZONE_BOARD.panelInsetLeft * 100}%`,
                  right: `${ZONE_BOARD.panelInsetRight * 100}%`,
                  top: 0,
                  bottom: 0,
                }
              : {
                  left: `${ZONE_BOARD.contentInset * 100}%`,
                  right: `${ZONE_BOARD.contentInset * 100}%`,
                  top: `${ZONE_BOARD.contentInsetTop * 100}%`,
                  bottom: `${ZONE_BOARD.contentInsetBottom * 100}%`,
                }
          }
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * THE FRAME IS NOT SYMMETRIC, SO A FULL-BLEED CONTENT BOX CANNOT BE EITHER.
 *
 * CarvedBoard insets its content by ZONE_BOARD.contentInset, one number on
 * both sides, but the panel ART carries a 4% transparent margin on the left
 * against 5.7% on the right, so the DRAWN frame sits further in on the right.
 * At the journey's width nobody could see it; at the home hero's full bleed
 * the ticket and the CTA plate ran up against the frame line.
 *
 * This is exactly that asymmetry, off the same two numbers, so re-cutting the
 * art moves it rather than leaving a stale hand-tuned correction behind.
 * Mobile calls the same value `artNudge` and computes it in points; web has no
 * board width to multiply, so it is expressed against the CONTENT box (which
 * is already inset by contentInset on each side) and applied as padding.
 */
export const BOARD_ART_NUDGE_FRACTION =
  ((ZONE_BOARD.panelInsetRight - ZONE_BOARD.panelInsetLeft) * 2) /
  (1 - ZONE_BOARD.contentInset * 2);
export const BOARD_ART_NUDGE = `${BOARD_ART_NUDGE_FRACTION * 100}%`;
