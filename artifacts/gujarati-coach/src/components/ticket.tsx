// Full-ticket boarding-pass fittings (Task 3 journey visual upgrade, approved
// variant "full-ticket"). Pure CSS in brand colors only, no artwork. Shared
// by the home hero pass and the /journey map-header pass.

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
