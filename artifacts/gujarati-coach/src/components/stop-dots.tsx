/**
 * THE DOTTED PROGRESS ROW, ONCE.
 *
 * Born inline on mobile's home boarding pass (build 17, the owner's hybrid
 * mockup): a row of stops, done ones filled in the app's violet, the current
 * one ringed, the rest hollow, joined by hairline links. Then: "for each cards
 * progress bar, i like the dotted bar you did with purple on the boarding
 * pass." So it is one component, drawn on the pass (stops in the zone), on
 * every phrase card (phrases mastered) and on the chalkboard (letters traced,
 * in chalk). A second copy of these dots is the defect, not the fix.
 *
 * Web port of bolo-mobile/components/journey/StopDots.tsx (build 18 parity).
 * Same props, same behaviours, same test ids; keep the two in step.
 *
 * Links flex, so any count from 4 to 14 fits the same width; above 14 the
 * dots shrink rather than the row overflowing, because a card is a fixed
 * width and a phrase count is not.
 */
import { Fragment } from "react";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StopDotsProps {
  /** How many stops (or phrases, or letters) the row counts. */
  total: number;
  /** How many are done: filled in the accent, counted from the left. */
  done: number;
  /** The 1-based position to ring as "here", if any. */
  current?: number | null;
  /** The fill and ring colour: the app's violet on a card, white in chalk. */
  accent: string;
  /** Hollow dots and the links ahead. */
  muted: string;
  /** A skyline at the end, the way the boarding pass draws the terminus. */
  terminus?: boolean;
  /** Chalk: white fill on the ring instead of paper. */
  ringFill?: string;
  /**
   * WEB ONLY, and the mobile twin has no such prop on purpose. The home
   * hero's board scales its whole face with the measured column (build 21,
   * off the owner's screenshot of the live home: "text too small ... should
   * fill space"), and a row of 10px dots under 33px type reads as a
   * different object. Everything here is a multiple of this: the dots, the
   * ring, the links, the terminus. Mobile's hosts are one width, so its dots
   * are one size.
   */
  scale?: number;
  testId?: string;
  className?: string;
}

/**
 * Mobile appends a two-digit alpha to the muted colour, which only works on
 * a six-digit hex. Web is handed CSS colours too (the chalkboard passes an
 * rgba), so the alpha is applied only where it can be.
 */
function withAlpha(color: string, alphaHex: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}${alphaHex}` : color;
}

export function StopDots({
  total,
  done,
  current = null,
  accent,
  muted,
  terminus = false,
  ringFill = "#FFFFFF",
  scale = 1,
  testId,
  className,
}: StopDotsProps) {
  const count = Math.max(0, Math.floor(total));
  if (count === 0) return null;
  // Past fourteen the dots shrink so the row keeps its width.
  const dot = Math.round((count > 14 ? 7 : 10) * scale);
  const ringPad = Math.round(6 * scale);
  const ringStroke = Math.max(2, Math.round(3 * scale));
  const dotStroke = Math.max(1, Math.round(2 * scale));
  const link = Math.max(2, Math.round(2 * scale));
  const terminusSize = Math.round(16 * scale);
  const here = current != null && current >= 1 && current <= count ? current : null;
  return (
    <div
      data-testid={testId}
      className={cn("flex min-w-0 flex-1 items-center", className)}
      aria-hidden
    >
      {Array.from({ length: count }).map((_, i) => {
        const n = i + 1;
        const isDone = n <= done && n !== here;
        const isHere = n === here;
        return (
          <Fragment key={n}>
            {i > 0 && (
              <span
                className="flex-1"
                style={{
                  height: link,
                  minWidth: link,
                  background: n <= done || isHere ? accent : withAlpha(muted, "55"),
                }}
              />
            )}
            <span
              data-testid={
                isHere ? "stop-dot-here" : isDone ? "stop-dot-done" : "stop-dot-ahead"
              }
              className="box-border shrink-0 rounded-full"
              style={
                isHere
                  ? {
                      width: dot + ringPad,
                      height: dot + ringPad,
                      border: `${ringStroke}px solid ${accent}`,
                      background: ringFill,
                    }
                  : isDone
                    ? {
                        width: dot,
                        height: dot,
                        border: `${dotStroke}px solid ${accent}`,
                        background: accent,
                      }
                    : {
                        width: dot,
                        height: dot,
                        border: `${dotStroke}px solid ${withAlpha(muted, "88")}`,
                        background: "transparent",
                      }
              }
            />
          </Fragment>
        );
      })}
      {terminus && (
        <Building2
          className="shrink-0"
          style={{
            color: muted,
            width: terminusSize,
            height: terminusSize,
            marginLeft: Math.round(6 * scale),
          }}
          data-testid="stop-dots-terminus"
        />
      )}
    </div>
  );
}
