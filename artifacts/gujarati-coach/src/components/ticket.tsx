// Full-ticket boarding-pass fittings (Task 3 journey visual upgrade, approved
// variant "full-ticket"). Pure CSS in brand colors only — no artwork. Shared
// by the home hero pass and the /journey map-header pass.
import type React from "react";
import { cn } from "@/lib/utils";
import { TICKET, TICKET_SHAPE } from "@/lib/ticket-stock";

// The bite taken out of the paper where it tears, in px. Sized once and shared
// by both halves so the two quarter-circles meet as one semicircle.
const TICKET_NOTCH = 10;

/** Diagonal ticket-stock stripes (CSS gradient only). `ink` is the stripe
 *  color including alpha, e.g. "rgba(255,255,255,0.05)" on accent, or
 *  `${accent}08` on card. */
export function TicketStripes({ ink }: { ink: string }) {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage: `repeating-linear-gradient(-45deg, ${ink} 0 10px, transparent 10px 26px)`,
      }}
      aria-hidden
    />
  );
}

// The stamp is rotated -12 degrees, so its axis-aligned bounding box is
// larger than the stamp square by (cos 12 + sin 12) ~= 1.186x. Hosts must
// reserve this extent or derive the stamp size from their own column width
// (R1 amendment: shared rule with the mobile TicketParts implementation).
const STAMP_ROTATION_DEG = 12;
export function zoneStampExtent(size: number): number {
  const rad = (STAMP_ROTATION_DEG * Math.PI) / 180;
  return Math.ceil(size * (Math.cos(rad) + Math.sin(rad)));
}

/** Inverse of zoneStampExtent: the largest stamp size whose rotated visual
 *  extent fits the given slot width (label + circle scale as one unit). */
export function stampSizeForExtent(extent: number): number {
  const rad = (STAMP_ROTATION_DEG * Math.PI) / 180;
  return Math.floor(extent / (Math.cos(rad) + Math.sin(rad)));
}

// Deterministic fit for the stamp's station-name line (R1 amendment, ported
// from mobile). Size the font so the longest WORD fits the 0.72-diameter
// chord budget (the name sits below the numeral where the chord is narrower
// than the equator) and let the text wrap on spaces - with the font fitted
// to the longest word, a mid-word break or ellipsis is impossible by
// construction. 0.7em per uppercase black character is a conservative
// advance estimate; the floor keeps degenerate names legible.
export function stampNameFontSize(name: string, size: number): number {
  const budget = size * 0.72;
  const longestWord = Math.max(
    1,
    ...name.trim().split(/\s+/).map((w) => w.length),
  );
  return Math.max(3, Math.min(7, budget / (longestWord * 0.7)));
}

/** Rubber-stamp fare-zone ring in brand ink.
 *
 *  R1 amendment sizing contract (shared with mobile): EVERY piece of type
 *  inside the ring derives from `size`, so the label + circle scale as one
 *  unit wherever the stamp is placed. The old fixed 7px tracking-widest
 *  FARE ZONE label was wider than the chord near the top arc, so the dashed
 *  border crossed the final E ("FARE ZONB" defect); the old truncated name
 *  cut stations mid-word ("NEW DE..."). */
export function ZoneStamp({
  ink,
  zone,
  name,
  size = 52,
}: {
  ink: string;
  zone: number;
  name: string;
  size?: number;
}) {
  // Label chord: the label row sits ~0.3 diameters above center, where the
  // chord is ~0.8 of the diameter. 0.115em per glyph keeps FARE ZONE (9
  // glyphs + tracking) comfortably inside it at any size.
  const labelFontSize = Math.max(4, Math.round(size * 0.115));
  const zoneFontSize = Math.max(12, Math.round(size * 0.375));
  const nameFontSize = stampNameFontSize(name, size);
  return (
    <div
      data-testid="zone-stamp"
      className="flex flex-col items-center justify-center rounded-full border-2 border-dashed text-center shrink-0"
      style={{
        width: size,
        height: size,
        borderColor: ink,
        color: ink,
        transform: "rotate(-12deg)",
      }}
      aria-hidden
    >
      <span
        className="font-black uppercase"
        style={{
          fontSize: labelFontSize,
          lineHeight: `${labelFontSize + 1}px`,
          letterSpacing: labelFontSize >= 6 ? "0.6px" : "0.3px",
        }}
      >
        Fare zone
      </span>
      <span
        className="font-black"
        style={{ fontSize: zoneFontSize, lineHeight: `${zoneFontSize + 1}px` }}
      >
        {zone}
      </span>
      <span
        data-testid="zone-stamp-name"
        className="max-w-[72%] whitespace-normal font-black uppercase"
        style={{
          fontSize: nameFontSize,
          lineHeight: `${nameFontSize + 1}px`,
          // Tracking only at full size; squeezed names need every pixel.
          letterSpacing: nameFontSize >= 7 ? "0.5px" : "0px",
        }}
      >
        {name}
      </span>
    </div>
  );
}

// R1 amendment: fit the vertical line-name wordmark to its measured vertical
// run (mobile stubLineFontSize parity: 0.75em per uppercase black glyph,
// 8px run margin, font clamped 5..8 - never an ellipsis). When even the
// floor font overflows the run, shorten the string DELIBERATELY by dropping
// trailing words (never a mid-word cut). extent <= 0 means "not measured
// yet" and renders the full name at top size until the observer reports.
export function stubLineFontSize(lineName: string, extent: number): number {
  const glyphs = Math.max(1, lineName.trim().length);
  return Math.max(5, Math.min(8, (extent - 8) / (glyphs * 0.75)));
}
export function fitStubWordmark(
  lineName: string,
  extent: number,
): { text: string; fontSize: number } {
  const full = lineName.trim().toUpperCase();
  if (extent <= 0) return { text: full, fontSize: 8 };
  let words = full.split(/\s+/);
  let fontSize = stubLineFontSize(words.join(" "), extent);
  const run = (text: string, px: number) => text.length * px * 0.75 + 8;
  while (words.length > 1 && run(words.join(" "), fontSize) > extent) {
    words = words.slice(0, -1);
    fontSize = stubLineFontSize(words.join(" "), extent);
  }
  return { text: words.join(" "), fontSize };
}

/** Vertical tear-off perforation with semicircle notch cutouts top and
 *  bottom. `light` picks the dash color for accent (light) vs card (dark)
 *  ticket stock. Notches punch through to the page background. */
export function TicketPerforationV({ light }: { light: boolean }) {
  return (
    <div className="relative w-px self-stretch shrink-0" aria-hidden>
      <div
        className={`absolute inset-y-1.5 left-0 border-l-2 border-dashed ${
          light ? "border-white/40" : "border-border"
        }`}
      />
      <div className="absolute -top-3 left-1/2 h-5 w-5 -translate-x-1/2 rounded-full bg-background" />
      <div className="absolute -bottom-3 left-1/2 h-5 w-5 -translate-x-1/2 rounded-full bg-background" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// MiniTicket — the whole ticket that lies in the corner of the home hero's
// carved station board. Ported from mobile (JourneyPassCard's ticket block)
// on 2026-08-28.
// ---------------------------------------------------------------------------

/**
 * A WHOLE TICKET, NOT A TORN-OFF STRIP, and it lies landscape in the corner.
 *
 * On mobile this replaced a bare vertical stub (a stamp with the line's name
 * rotated beside it), which read as crammed into a column that tall. The web
 * hero carried the same vertical stub and gets the same fix.
 *
 * IT DOES NOT REPEAT THE BOARD. The station and the stop are named directly to
 * its left, so the ticket carries its own furniture instead: what it admits,
 * and which line it admits you to.
 *
 * THE BOARD'S OWN PERFORATION WENT WITH THIS. A dashed line between the board
 * and the ticket said they were two halves of one piece of paper, which was
 * true of the old green pass and is not true of a ticket lying on a carved
 * board. The only perforation left is the ticket's own.
 *
 * TWO BOXES RATHER THAN ONE, because they have to come apart. Each half
 * carries its own paper and its own THREE borders: the middle edge is square
 * and borderless, so at rest the perforation runs between two halves of one
 * ticket, and the moment they part each is a whole piece of paper. The refs
 * are what the tear hand-off overlay measures at navigation, so they belong on
 * the two halves and nowhere else.
 *
 * Mobile twin: the `ticket` / `ticketHalf` block in
 * bolo-mobile/components/journey/JourneyPassCard.tsx.
 */
export function MiniTicket({
  lineName,
  zone,
  stationName,
  stampSize,
  tearing,
  bodyRef,
  stubRef,
  /** The panel cream the notches are punched out of. */
  notchFill,
}: {
  lineName: string;
  zone: number | null;
  stationName: string | null;
  stampSize: number;
  tearing: boolean;
  bodyRef?: React.Ref<HTMLDivElement>;
  stubRef?: React.Ref<HTMLDivElement>;
  notchFill: string;
}) {
  const stock = `linear-gradient(to bottom, ${TICKET.stockTop}, ${TICKET.stockBottom})`;
  // A disc of the panel's own cream, half of it hanging past the half's inner
  // edge; overflow-hidden crops it to a quarter and the opposite half's mirror
  // image completes the semicircle. A cutout may only ever straddle an EDGE,
  // which is the standing ruling that took the floating punch hole off both
  // platforms.
  const notch = (position: string) => (
    <span
      aria-hidden
      className={cn("absolute rounded-full border", position)}
      style={{
        width: TICKET_NOTCH,
        height: TICKET_NOTCH,
        background: notchFill,
        borderColor: TICKET.edge,
      }}
    />
  );
  // The sheet's inner frame, set in from the border, per half.
  const rule = (
    <span
      aria-hidden
      className="pointer-events-none absolute rounded-[6px] border"
      style={{
        inset: TICKET_SHAPE.ruleInset,
        borderColor: TICKET.rule,
      }}
    />
  );
  return (
    <div className="flex shrink-0 items-stretch" data-testid="home-mini-ticket">
      {/* THE LEFT HALF: what the ticket admits, and to which line. */}
      <div
        ref={bodyRef}
        className={cn(
          "relative flex min-w-0 flex-1 items-center overflow-hidden border-y-2 border-l-2 pl-2",
          "rounded-l-[10px]",
          // Once they are apart each half gets the corners it was missing, so
          // neither sails away with one square end.
          tearing
            ? "animate-body-tear rounded-r-[10px] border-r-0"
            : "border-r-0",
        )}
        style={{
          background: stock,
          borderColor: TICKET.edge,
          // It is ON the board, not part of it.
          boxShadow: `0 2px 4px ${TICKET.ink}38`,
        }}
      >
        {rule}
        {notch("-right-[5px] -top-[5px]")}
        {notch("-bottom-[5px] -right-[5px]")}
        <div className="relative min-w-0 flex-1 py-[5px]">
          <div
            className="truncate text-[9px] font-black leading-tight"
            style={{ color: TICKET.ink }}
          >
            ADMIT ONE
          </div>
          <div
            className="truncate text-[6px] font-black uppercase leading-tight tracking-[0.8px]"
            style={{ color: TICKET.inkMuted }}
          >
            {lineName}
          </div>
        </div>
      </div>
      {/* THE PERFORATION, and THE DASHES STOP AT THE BITES. Run to the paper's
          very edge and they pass straight through the notches, so the
          perforation reads as a line drawn ON the ticket rather than the tear
          it is. It hides while tearing: the halves have already parted. */}
      {!tearing && (
        <span
          aria-hidden
          data-testid="mini-ticket-perf"
          className="relative flex shrink-0 flex-col items-center justify-between border-y-2"
          style={{
            background: stock,
            borderColor: TICKET.edge,
            paddingTop: TICKET_NOTCH / 2 + 3,
            paddingBottom: TICKET_NOTCH / 2 + 3,
            width: 5,
          }}
        >
          {Array.from({ length: 7 }).map((_, i) => (
            <span
              key={i}
              className="block"
              style={{ width: 1, height: 2, background: TICKET.rule }}
            />
          ))}
        </span>
      )}
      {/* THE STUB, AND ONLY THE STAMP ON IT. A fixed slot, because the stamp is
          tilted 12 degrees and that inflates its bounding box by about 1.19x:
          an exact-size slot clips the corners. */}
      <div
        ref={stubRef}
        className={cn(
          "relative flex shrink-0 items-center overflow-hidden border-y-2 border-r-2 px-[5px]",
          "rounded-r-[10px]",
          tearing
            ? "animate-stub-tear rounded-l-[10px] border-l-0"
            : "border-l-0",
        )}
        style={{
          background: stock,
          borderColor: TICKET.edge,
          boxShadow: `0 2px 4px ${TICKET.ink}38`,
        }}
      >
        {rule}
        {notch("-left-[5px] -top-[5px]")}
        {notch("-bottom-[5px] -left-[5px]")}
        {/* THE SLOT IS SIZED TO THE STAMP'S ROTATED EXTENT, not to the stamp:
            it is tilted 12 degrees, which inflates its bounding box by about
            1.19x, and an exact-size slot clips the corners.
            IT COLLAPSES WHEN THERE IS NO STAMP. A learner with no journey
            progress yet has no fare zone, and holding the full slot open for a
            stamp that is not coming drew an empty framed box on the end of the
            ticket that read as a rendering fault rather than an unstamped
            ticket. Unstamped, the stub is simply a narrow blank end. */}
        {zone !== null && stationName !== null ? (
          <div
            data-testid="home-stamp-slot"
            className="relative flex items-center justify-center"
            style={{
              width: zoneStampExtent(stampSize),
              height: zoneStampExtent(stampSize),
            }}
          >
            <ZoneStamp
              ink={TICKET.ink}
              zone={zone}
              name={stationName}
              size={stampSize}
            />
          </div>
        ) : (
          // UNSTAMPED, THE STUB IS AN END TAB, NOT A PANEL. Held at the stamp's
          // width it drew a tall empty framed box on the end of the ticket that
          // read as a rendering fault ("ticket stub doesn't look right",
          // owner). A real ticket with nothing franked on it still has its
          // stub; it is just narrow. Kept rendered rather than dropped so the
          // tear still has two halves to come apart into.
          <div
            data-testid="home-stamp-slot"
            style={{ width: 6, height: zoneStampExtent(stampSize) }}
          />
        )}
      </div>
    </div>
  );
}
