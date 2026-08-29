/**
 * THE ONE-PAGER MAP (build 20): the whole line at once.
 *
 * Home's View Map pill was kept, even though the boarding pass already opens
 * the journey, as the door to exactly this ("later we can create a onepager
 * map view that shows the full journey", chat 17; asked again in build 20).
 * The language's painted poster fills the top; the legend beneath it is the
 * live part: six zones with the same dots and "Stop N of M" the boarding pass
 * uses, from the same six payloads, so this page can never disagree with the
 * journey about where the learner is. Clicking a zone opens the journey.
 *
 * Mobile twin: app/(app)/map.tsx.
 */
import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, CheckCircle2, ChevronRight, Lock } from "lucide-react";
import { StopDots } from "@/components/stop-dots";
import { useLanguage } from "@/lib/language-context";
import { BADGE, TICKET } from "@/lib/ticket-stock";
import { JOURNEY_ZONES, getJourneyLine } from "@/lib/journeyLines";
import { JOURNEY_MAP_POSTER_ASPECT, journeyMapPosterUrl } from "@/lib/journey-map";
import { useJourneyProgress, type JourneyZoneProgress } from "@/lib/useJourneyProgress";

/** The status line under a zone's name, worded rather than coloured. */
export function zoneStatusCopy(z: JourneyZoneProgress): string {
  if (z.stopCount === 0) return "Not open yet";
  if (z.currentStopNumber !== null) return `Stop ${z.currentStopNumber} of ${z.stopCount}`;
  if (z.allDone) return `All ${z.stopCount} stops done`;
  if (z.locked) return `${z.stopCount} stops, locked`;
  return `${z.stopCount} stops`;
}

/** Dots filled from the left: everything before the current stop, or all of a finished zone. */
export function zoneDotsDone(z: JourneyZoneProgress): number {
  if (z.allDone) return z.stopCount;
  if (z.currentStopNumber !== null) return z.currentStopNumber - 1;
  return 0;
}

export default function JourneyMap() {
  const { activeLang } = useLanguage();
  const line = getJourneyLine(activeLang);
  const progress = useJourneyProgress(activeLang, line.zones);
  const [posterFailed, setPosterFailed] = useState(false);

  return (
    <div className="mx-auto max-w-md px-4 pb-28 pt-4">
      <header className="mb-3 flex items-center gap-3">
        <Link
          href="/app"
          aria-label="Back to home"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-center text-lg font-extrabold text-foreground">
          {line.lineName}
        </h1>
        <span className="w-11 shrink-0" aria-hidden />
      </header>

      <div
        data-testid="map-poster-frame"
        className="overflow-hidden rounded-[18px] border-[1.5px]"
        style={{
          borderColor: BADGE.brassEdge,
          background: TICKET.stockTop,
          aspectRatio: String(JOURNEY_MAP_POSTER_ASPECT),
        }}
      >
        {posterFailed ? (
          <PosterPlaceholder lineName={line.lineName} cities={line.zones} />
        ) : (
          <img
            data-testid="map-poster"
            src={journeyMapPosterUrl(activeLang)}
            alt={`${line.lineName} journey map`}
            className="block h-full w-full object-cover"
            onError={() => setPosterFailed(true)}
          />
        )}
      </div>

      <div className="mb-2.5 mt-6 flex items-baseline justify-between">
        <div className="text-xs font-black tracking-[1.6px] text-primary">WHERE YOU ARE</div>
        {progress.totalCount > 0 ? (
          <div className="text-[13px] font-semibold text-muted-foreground">
            {progress.doneCount} of {progress.totalCount} lessons done
          </div>
        ) : null}
      </div>

      {progress.zones.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">
          {progress.isLoading ? "Finding your train..." : "Open the journey to board your first stop."}
        </p>
      ) : (
        <ol className="flex flex-col gap-2.5">
          {progress.zones.map((z) => {
            const here = z.currentStopNumber !== null;
            return (
              <li key={z.zoneIndex}>
                <Link
                  href="/journey"
                  data-testid={`map-zone-${z.zoneIndex}`}
                  aria-label={`Zone ${z.zoneIndex + 1}, ${JOURNEY_ZONES[z.zoneIndex]?.title ?? ""}, ${z.geoName}, ${zoneStatusCopy(z)}`}
                  className="flex items-center gap-3 rounded-2xl border-[1.5px] bg-card px-3 py-3 transition-colors hover:bg-muted"
                  style={{ borderColor: here ? "hsl(var(--primary))" : undefined }}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[15px] font-extrabold text-primary-foreground">
                    {z.zoneIndex + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-base font-bold text-foreground">
                        {JOURNEY_ZONES[z.zoneIndex]?.title ?? `Zone ${z.zoneIndex + 1}`}
                      </span>
                      {z.locked ? <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden /> : null}
                      {z.allDone ? <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden /> : null}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{z.geoName}</span>
                    <span
                      data-testid={`map-zone-${z.zoneIndex}-status`}
                      className={`mt-1 block text-[13px] font-semibold ${here ? "text-primary" : "text-muted-foreground"}`}
                    >
                      {zoneStatusCopy(z)}
                    </span>
                    {z.stopCount > 0 ? (
                      <span className="mt-2 block">
                        <StopDots
                          total={z.stopCount}
                          done={zoneDotsDone(z)}
                          current={z.currentStopNumber}
                          accent="hsl(var(--primary))"
                          muted="hsl(var(--border))"
                          terminus={z.zoneIndex === 5}
                          testId={`map-zone-${z.zoneIndex}-dots`}
                        />
                      </span>
                    ) : null}
                  </span>
                  <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/**
 * What stands in for a poster that is not there yet: the line and its six
 * cities on ticket stock, so every language has a map today and the art can
 * land one language at a time.
 */
function PosterPlaceholder({ lineName, cities }: { lineName: string; cities: readonly string[] }) {
  return (
    <div
      data-testid="map-poster-fallback"
      className="flex h-full flex-col justify-center gap-2 p-6"
      style={{ color: TICKET.ink }}
    >
      <div className="text-xs font-black tracking-[1.6px]" style={{ color: BADGE.brassBg }}>
        JOURNEY 1
      </div>
      <div className="mb-2 text-2xl font-extrabold">{lineName}</div>
      <ol className="flex flex-col gap-3.5">
        {cities.map((city, i) => (
          <li key={city} className="flex items-center gap-2.5 text-[15px] font-semibold">
            <span
              className="inline-block h-3 w-3 shrink-0 rounded-full border-2"
              style={{ borderColor: BADGE.brassEdge, background: TICKET.stockBottom }}
              aria-hidden
            />
            <span className="truncate">
              {i + 1}. {city}
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-3 text-xs" style={{ color: TICKET.inkMuted }}>
        Poster on its way
      </div>
    </div>
  );
}
