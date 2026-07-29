// Boarding-pass ticket treatment — variant FULL-TICKET.
// A fuller train-ticket composition: a vertical tear-off stub on the right
// with its own perforation, notches on both perforation lines, a diagonal
// brand-stripe texture, the fare-zone stamp overlapping the perforation, and
// a punched hole in the stub. Existing dashed horizontal perforation and all
// live content retained. Brand colors only — no artwork.
import "./_group.css";
import { ArrowLeft, ArrowRight, Flame, Target } from "lucide-react";
import { TrainEngine } from "./_shared/TrainEngine";
import { ACCENT, DONE_COUNT, LINE_NAME, TOTAL_COUNT } from "./_shared/data";

/** Diagonal ticket-stock stripes in brand color (CSS gradient only). */
function Stripes({ light }: { light: boolean }) {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage: `repeating-linear-gradient(-45deg, ${
          light ? "rgba(255,255,255,0.05)" : `${ACCENT}08`
        } 0 10px, transparent 10px 26px)`,
      }}
      aria-hidden
    />
  );
}

function ZoneStamp({ light, size = 58 }: { light: boolean; size?: number }) {
  const ink = light ? "rgba(255,255,255,0.8)" : ACCENT;
  return (
    <div
      className="flex flex-col items-center justify-center rounded-full border-2 border-dashed text-center shrink-0 bg-transparent"
      style={{
        width: size,
        height: size,
        borderColor: ink,
        color: ink,
        transform: "rotate(-12deg)",
      }}
      aria-hidden
    >
      <span className="text-[7px] font-black uppercase tracking-widest leading-none">Fare zone</span>
      <span className="text-lg font-black leading-none">2</span>
      <span className="text-[7px] font-black uppercase tracking-wide leading-none">Anand</span>
    </div>
  );
}

/** Vertical perforation line with top/bottom notch cutouts. */
function VerticalPerforation({ light }: { light: boolean }) {
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

function HomePass() {
  return (
    <div
      className="relative w-full overflow-hidden rounded-3xl text-white shadow-[0_8px_0_rgba(0,0,0,0.18)]"
      style={{ backgroundColor: ACCENT }}
    >
      <Stripes light />
      <div className="pointer-events-none absolute -right-8 -top-12 h-44 w-44 rounded-full bg-white/10 blur-xl" aria-hidden />
      <div className="relative flex items-stretch">
        {/* main body */}
        <div className="min-w-0 flex-1">
          <div className="p-5 pr-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-widest text-white/80">
                  Boarding pass · બોલો રેલ
                </div>
                <h2 className="mt-0.5 text-lg font-black leading-tight">
                  Ride the {LINE_NAME}
                </h2>
                <p className="mt-1 truncate text-xs font-semibold text-white/90">
                  Next stop: Anand · Stop 2 of 3
                </p>
              </div>
              <TrainEngine className="mt-1 h-10 w-auto shrink-0 text-white drop-shadow-sm" />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/25">
                <div className="h-full rounded-full bg-white" style={{ width: "40%" }} />
              </div>
              <span className="shrink-0 text-[11px] font-bold text-white/90">2/5 at this stop</span>
            </div>
          </div>
          {/* existing horizontal perforation, retained */}
          <div className="relative" aria-hidden>
            <div className="absolute -left-2.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-background" />
            <div className="mx-5 border-t-2 border-dashed border-white/40" />
          </div>
          <div className="flex items-center justify-between gap-2 p-5 pt-3.5 pr-3">
            <span className="flex items-center gap-1.5 text-sm font-black">
              Continue your journey
              <ArrowRight className="h-4 w-4" />
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <span className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-1 text-[11px] font-black">
                <Flame className="h-3.5 w-3.5" fill="currentColor" />
                6-day
              </span>
              <span className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-1 text-[11px] font-black">
                <Target className="h-3.5 w-3.5" />
                4/10
              </span>
            </span>
          </div>
        </div>
        {/* tear-off stub */}
        <VerticalPerforation light />
        <div className="relative flex w-16 shrink-0 flex-col items-center justify-between py-4">
          {/* punched hole */}
          <div className="h-3.5 w-3.5 rounded-full bg-background" aria-hidden />
          <div className="-mx-4">
            <ZoneStamp light size={52} />
          </div>
          <div
            className="select-none text-[9px] font-black uppercase tracking-[0.2em] text-white/70"
            style={{ writingMode: "vertical-rl" }}
            aria-hidden
          >
            {LINE_NAME}
          </div>
        </div>
      </div>
    </div>
  );
}

function MapHeaderPass() {
  return (
    <div className="bg-card/95 border-b border-border px-3 py-3 flex items-center gap-2 rounded-xl">
      <div className="p-2 rounded-full text-foreground shrink-0" aria-hidden>
        <ArrowLeft className="w-5 h-5" />
      </div>
      <div className="relative flex-1 overflow-hidden rounded-lg border-2 border-dashed border-border bg-card">
        <Stripes light={false} />
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
          <VerticalPerforation light={false} />
          <div className="relative flex w-[76px] shrink-0 flex-col items-center justify-center gap-0.5 px-2 py-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-background absolute top-1.5 left-1/2 -translate-x-1/2" aria-hidden />
            <div className="text-lg leading-none mt-2" aria-hidden>
              🎫
            </div>
            <ZoneStamp light={false} size={44} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function TicketFull() {
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
