import { Link } from "wouter";
import { ChevronRight, Map } from "lucide-react";
import { TRAIN_FULL_SRC } from "@/components/train-svg";
import type { JourneyProgress, JourneyZoneProgress } from "@/lib/useJourneyProgress";

/**
 * THE JOURNEY ON THE PROGRESS PAGE (build 23, ported from mobile's
 * components/progress/JourneyProgressCard.tsx, build 22, the owner's Progress
 * mockup: "Journey 1 / Ganga Line / New Delhi / 19 of 64 phrases mastered",
 * a bar per zone with its percentage, the painted train, and "View all stops"
 * into the map).
 *
 * Every number here comes from useJourneyProgress, the same six payloads the
 * home pass and the map read, so the three surfaces cannot disagree about
 * where the learner is. The rows are the LINE'S ZONES (Greetings & Manners,
 * Family, ...), each a city on the map, which is what the mockup lists; a
 * row's bar is the zone's mastered phrases over its phrases on offer.
 *
 * ONE THING THE PHONE DRAWS THAT THIS DOES NOT: the city's landmark at a
 * whisper behind the train. Mobile has a per-city silhouette component
 * (components/journey/Landmark); web's scenery is the postcard vista, a
 * painted scene per zone, and a scene at 12% behind a train reads as smudge.
 * Left out on purpose rather than approximated.
 */
/** The painting is 1200 by 760. Drawn in px, never a percentage. */
const ART_W = 150;
const ART_H = Math.round((ART_W * 760) / 1200);
/** The mockup shows four zones and a "View all stops" door for the rest. */
const ZONE_ROWS_SHOWN = 4;

function zonePct(z: Pick<JourneyZoneProgress, "masteredCount" | "phraseCount">): number {
  return z.phraseCount > 0 ? Math.round((100 * z.masteredCount) / z.phraseCount) : 0;
}

export function JourneyProgressCard({
  lineName,
  fallbackCity,
  journey,
}: {
  /** The line's name from the naming table, e.g. "Ganga Line". */
  lineName: string;
  /** The first zone's city, for the heading while the zones are unknown. */
  fallbackCity: string;
  journey: JourneyProgress;
}) {
  const { current, zones, isLoading } = journey;
  // The zone the learner is in: the current stop's, else the first zone not
  // finished and not locked (the pass shows the same city), else the first.
  const zone: JourneyZoneProgress | undefined = current
    ? zones[current.zoneIndex]
    : (zones.find((z) => !z.allDone && !z.locked) ?? zones[0]);
  const city = current?.geoName || zone?.geoName || fallbackCity;
  const mastered = zone?.masteredCount ?? 0;
  const total = zone?.phraseCount ?? 0;
  const pct = zone ? zonePct(zone) : 0;

  return (
    <section
      className="rounded-[22px] border border-card-border bg-card p-[18px] shadow-sm"
      data-testid="journey-progress-card"
    >
      <div className="mb-3.5 flex items-center gap-2">
        <Map className="h-[15px] w-[15px] text-primary" />
        <p className="text-[11px] font-extrabold tracking-[1.2px] text-primary">JOURNEY PROGRESS</p>
      </div>
      {isLoading ? (
        <div className="h-[150px] animate-pulse rounded-[14px] bg-muted" />
      ) : (
        <>
          <div className="flex items-start gap-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-muted-foreground">
                {`Journey 1  •  ${lineName}`}
              </p>
              <p className="mt-1 truncate text-2xl font-extrabold text-foreground">{city}</p>
              <p className="mt-1.5 text-[13px] text-muted-foreground">
                {`${mastered} of ${total} phrases mastered`}
              </p>
              <div
                className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                aria-label={`${city} mastery`}
              >
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="flex flex-col items-end" style={{ width: ART_W }}>
              {current ? (
                <span className="rounded-full border border-primary/20 bg-primary/[0.08] px-[11px] py-[5px] text-xs font-bold text-primary">
                  {`Stop ${current.stopNumber} of ${current.stopCount}`}
                </span>
              ) : null}
              <img
                src={TRAIN_FULL_SRC}
                alt=""
                aria-hidden
                width={ART_W}
                height={ART_H}
                className="mt-0.5 object-contain"
                style={{ width: ART_W, height: ART_H }}
              />
            </div>
          </div>

          {zones.length > 0 ? <div className="my-3.5 h-px bg-card-border" /> : null}

          {zones.slice(0, ZONE_ROWS_SHOWN).map((z) => {
            const p = zonePct(z);
            return (
              <Link
                key={z.zoneIndex}
                href="/journey"
                aria-label={`${z.title}, ${p} percent mastered`}
                className="flex items-center gap-3 py-2 transition-opacity hover:opacity-80"
                data-testid={`journey-zone-row-${z.zoneIndex}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="mb-1.5 truncate text-sm font-semibold text-foreground">{z.title}</p>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-success" style={{ width: `${p}%` }} />
                  </div>
                </div>
                <span
                  className={`min-w-[40px] text-right text-sm font-extrabold ${p > 0 ? "text-success" : "text-foreground"}`}
                >
                  {`${p}%`}
                </span>
                <ChevronRight className="h-[18px] w-[18px] text-primary" />
              </Link>
            );
          })}

          <Link
            href="/journey"
            aria-label="View all stops"
            className="flex items-center justify-center gap-1 pb-0.5 pt-3 text-sm font-bold text-primary hover:opacity-80"
            data-testid="journey-view-all"
          >
            View all stops
            <ChevronRight className="h-[18px] w-[18px]" />
          </Link>
        </>
      )}
    </section>
  );
}
