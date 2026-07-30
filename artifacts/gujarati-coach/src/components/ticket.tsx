// Full-ticket boarding-pass fittings (Task 3 journey visual upgrade, approved
// variant "full-ticket"). Pure CSS in brand colors only — no artwork. Shared
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

/** Rubber-stamp fare-zone ring in brand ink. */
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
  return (
    <div
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
      <span className="text-[7px] font-black uppercase tracking-widest leading-none">
        Fare zone
      </span>
      <span className="text-lg font-black leading-none">{zone}</span>
      <span className="max-w-[80%] truncate text-[7px] font-black uppercase tracking-wide leading-none">
        {name}
      </span>
    </div>
  );
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
