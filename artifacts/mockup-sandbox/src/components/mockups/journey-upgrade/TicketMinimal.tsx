// Boarding-pass ticket treatment — variant MINIMAL.
// Both passes keep their current structure; additions are limited to the
// spec'd elements: edge notch cutouts at the perforation, the existing dashed
// perforation retained, a subtle brand-color watermark, and a fare-zone stamp.
import "./_group.css";
import { ArrowLeft, ArrowRight, Flame, Target } from "lucide-react";
import { TrainEngine } from "./_shared/TrainEngine";
import { ACCENT, DONE_COUNT, LINE_NAME, TOTAL_COUNT } from "./_shared/data";

/** Rotated repeating brand-text watermark (existing brand string + colors
 *  only — no artwork). */
function Watermark({ light }: { light: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute -left-16 -top-8 select-none whitespace-nowrap font-black uppercase leading-[2.1]"
        style={{
          color: light ? "rgba(255,255,255,0.055)" : `${ACCENT}0d`,
          fontSize: 22,
          letterSpacing: 4,
          transform: "rotate(-16deg)",
          width: "200%",
        }}
      >
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} style={{ marginLeft: (i % 2) * 48 }}>
            બોલો રેલ · {LINE_NAME} · બોલો રેલ · {LINE_NAME}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Fare-zone stamp: dashed rubber-stamp ring in brand ink. */
function ZoneStamp({ light, size = 58 }: { light: boolean; size?: number }) {
  const ink = light ? "rgba(255,255,255,0.75)" : ACCENT;
  return (
    <div
      className="flex flex-col items-center justify-center rounded-full border-2 border-dashed text-center shrink-0"
      style={{
        width: size,
        height: size,
        borderColor: ink,
        color: ink,
        transform: "rotate(-10deg)",
        opacity: light ? 1 : 0.85,
      }}
      aria-hidden
    >
      <span className="text-[7px] font-black uppercase tracking-widest leading-none">Fare zone</span>
      <span className="text-lg font-black leading-none">2</span>
      <span className="text-[7px] font-black uppercase tracking-wide leading-none">Anand</span>
    </div>
  );
}

/** Home-screen hero pass (structure copied from home.tsx; static data). */
function HomePass() {
  return (
    <div
      className="group relative block w-full overflow-hidden rounded-3xl text-white shadow-[0_8px_0_rgba(0,0,0,0.18)]"
      style={{ backgroundColor: ACCENT }}
    >
      <div className="pointer-events-none absolute -right-8 -top-12 h-44 w-44 rounded-full bg-white/10 blur-xl" aria-hidden />
      <Watermark light />
      <div className="relative p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-widest text-white/80">
              Boarding pass · બોલો રેલ
            </div>
            <h2 className="mt-0.5 truncate text-xl font-black">Ride the {LINE_NAME}</h2>
            <p className="mt-1 truncate text-sm font-semibold text-white/90">
              Next stop: Anand · Stop 2 of 3
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <TrainEngine className="mt-1 h-12 w-auto text-white drop-shadow-sm" />
            <ZoneStamp light size={54} />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/25">
            <div className="h-full rounded-full bg-white" style={{ width: "40%" }} />
          </div>
          <span className="shrink-0 text-[11px] font-bold text-white/90">2/5 at this stop</span>
        </div>
      </div>
      {/* existing perforation: notch cutouts + dashed line, retained */}
      <div className="relative" aria-hidden>
        <div className="absolute -left-2.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-background" />
        <div className="absolute -right-2.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-background" />
        <div className="mx-5 border-t-2 border-dashed border-white/40" />
      </div>
      <div className="relative flex items-center justify-between gap-3 p-5 pt-3.5">
        <span className="flex items-center gap-2 text-base font-black">
          Continue your journey
          <ArrowRight className="h-5 w-5" />
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-xs font-black">
            <Flame className="h-3.5 w-3.5" fill="currentColor" />
            6-day streak
          </span>
          <span className="flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-xs font-black">
            <Target className="h-3.5 w-3.5" />
            4/10 today
          </span>
        </span>
      </div>
    </div>
  );
}

/** Map-header pass (journey.tsx header) with a vertical perforation + notches
 *  added between the info side and the stub. */
function MapHeaderPass() {
  return (
    <div className="bg-card/95 border-b border-border px-3 py-3 flex items-center gap-2 rounded-xl">
      <div className="p-2 rounded-full text-foreground shrink-0" aria-hidden>
        <ArrowLeft className="w-5 h-5" />
      </div>
      <div className="relative flex-1 overflow-hidden rounded-lg border-2 border-dashed border-border bg-card">
        <Watermark light={false} />
        <div className="relative flex items-stretch">
          <div className="min-w-0 flex-1 px-4 py-2.5">
            <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              Boarding pass · બોલો રેલ
            </div>
            <div className="text-base font-extrabold text-foreground leading-tight truncate">
              {LINE_NAME}
            </div>
            <div className="text-[11px] text-muted-foreground truncate">
              Ahmedabad Junction → Dwarka · {DONE_COUNT}/{TOTAL_COUNT} stations
            </div>
          </div>
          {/* vertical perforation with semicircle notches */}
          <div className="relative w-px self-stretch" aria-hidden>
            <div className="absolute inset-y-1 left-0 border-l-2 border-dashed border-border" />
            <div className="absolute -top-2.5 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full bg-background" />
            <div className="absolute -bottom-2.5 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full bg-background" />
          </div>
          <div className="relative flex shrink-0 flex-col items-center justify-center gap-1 px-3 py-1.5">
            <div className="text-xl leading-none" aria-hidden>
              🎫
            </div>
            <ZoneStamp light={false} size={46} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function TicketMinimal() {
  return (
    <div className="journey-mockup min-h-screen bg-background p-4" style={{ width: 390 }}>
      <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        Home hero pass
      </div>
      <HomePass />
      <div className="mb-2 mt-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        Map header pass
      </div>
      <MapHeaderPass />
    </div>
  );
}
