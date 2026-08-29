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
import type React from "react";
import { Link } from "wouter";
import { ArrowLeft, CheckCircle2, ChevronRight, Hand, Hash, Heart, Lock, MessageCircle, Users, Utensils } from "lucide-react";
import { getListCategoryPhrasesQueryKey, useListCategoryPhrases } from "@workspace/api-client-react";
import { StopDots } from "@/components/stop-dots";
import { nativeTextProps, useLanguage } from "@/lib/language-context";
import { BADGE, TICKET } from "@/lib/ticket-stock";
import { JOURNEY_ZONES, getJourneyLine, type JourneyLine } from "@/lib/journeyLines";
import {
  JOURNEY_MAP_POSTER_ASPECT,
  journeyMapPosterUrl,
  journeyMapTagline,
  journeyMapWelcome,
  journeyMapZoneBlurb,
  useJourneyMapBoards,
  type JourneyMapBoards,
  type JourneyMapBox,
} from "@/lib/journey-map";
import { useJourneyProgress, type JourneyZoneProgress } from "@/lib/useJourneyProgress";

/**
 * The zone icons the app draws into a text-free poster's empty medallions,
 * one per zone in journey order. Drawn by the app rather than painted so
 * they can never sit beside the wrong word (the painted ones did).
 */
const ZONE_MEDALLION_ICONS = [Hand, Users, Hash, Utensils, MessageCircle, Heart] as const;

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
  const { activeLang, activeLanguage } = useLanguage();
  const line = getJourneyLine(activeLang);
  const progress = useJourneyProgress(activeLang, line.zones);
  const [posterFailed, setPosterFailed] = useState(false);
  // THE WORDS ON THE POSTER come from here, not from the paint: the boards
  // file says where, and the greeting is the language's own first phrase
  // from the API, so its script can never be wrong (lib/journey-map.ts).
  const boards = useJourneyMapBoards(activeLang);
  const greetingPhrases = useListCategoryPhrases(JOURNEY_ZONES[0].id, activeLang, {
    query: {
      enabled: !!activeLang && boards !== null,
      queryKey: getListCategoryPhrasesQueryKey(JOURNEY_ZONES[0].id, activeLang),
    },
  });
  const greeting = greetingPhrases.data?.[0] ?? null;
  const aspect = boards ? boards.size[0] / boards.size[1] : JOURNEY_MAP_POSTER_ASPECT;

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
        className="relative overflow-hidden rounded-[18px] border-[1.5px]"
        style={{
          borderColor: BADGE.brassEdge,
          background: TICKET.stockTop,
          aspectRatio: String(aspect),
          containerType: "inline-size",
        }}
      >
        {posterFailed ? (
          <PosterPlaceholder lineName={line.lineName} cities={line.zones} />
        ) : (
          <>
            <img
              data-testid="map-poster"
              src={journeyMapPosterUrl(activeLang)}
              alt={`${line.lineName} journey map`}
              className="block h-full w-full object-cover"
              onError={() => setPosterFailed(true)}
            />
            {boards ? (
              <PosterWords
                boards={boards}
                languageName={activeLanguage?.name ?? ""}
                nativeStyle={nativeTextProps(activeLanguage).style}
                line={line}
                greeting={greeting}
              />
            ) : null}
          </>
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
 * THE WORDS, WRITTEN OVER THE BLANK BOARDS. Every box is a fraction of the
 * poster, placed in percent of the frame (the frame takes the poster's own
 * aspect, so the two agree); every size is in container-query width units,
 * so a phone and a desktop column read the same poster.
 */
function PosterWords({
  boards,
  languageName,
  nativeStyle,
  line,
  greeting,
}: {
  boards: JourneyMapBoards;
  languageName: string;
  nativeStyle: React.CSSProperties;
  line: JourneyLine;
  greeting: { nativeScript: string; romanized: string } | null;
}) {
  const at = (b: JourneyMapBox): React.CSSProperties => ({
    position: "absolute",
    left: `${b.x * 100}%`,
    top: `${b.y * 100}%`,
    width: `${b.w * 100}%`,
    height: `${b.h * 100}%`,
    overflow: "hidden",
  });
  const ink = { color: TICKET.ink };
  return (
    <div data-testid="map-words" className="pointer-events-none absolute inset-0" aria-hidden>
      {boards.title ? (
        <div style={{ ...at(boards.title), padding: "1.5cqw 3cqw" }} className="flex flex-col items-center justify-center text-center">
          <div data-testid="map-word-title" style={{ ...ink, fontSize: "7.5cqw", letterSpacing: "0.5cqw", lineHeight: 1 }} className="font-black">
            {languageName.toUpperCase()}
          </div>
          <div style={{ color: BADGE.brassBg, fontSize: "2.3cqw", letterSpacing: "0.15cqw", marginTop: "0.6cqw", whiteSpace: "nowrap" }} className="font-bold">
            {`${line.lineName.toUpperCase()}  ·  JOURNEY 1`}
          </div>
        </div>
      ) : null}
      {boards.greeting ? (
        <div style={{ ...at(boards.greeting), padding: "2.6cqw", paddingBottom: "42%" }} className="flex flex-col">
          {/* The parrot stands over the board's lower half, so the words stay
              in the top of it: that is the paddingBottom. */}
          {greeting ? (
            <>
              <div data-testid="map-word-greeting" style={{ ...nativeStyle, fontSize: "4.6cqw", lineHeight: 1.3 }} className="font-bold text-primary">
                {greeting.nativeScript}
              </div>
              <div style={{ color: TICKET.inkMuted, fontSize: "2.4cqw", marginBottom: "1.2cqw" }}>{`(${greeting.romanized})`}</div>
            </>
          ) : null}
          <div style={{ ...ink, fontSize: "2.3cqw", lineHeight: 1.35 }}>{journeyMapWelcome(languageName)}</div>
        </div>
      ) : null}
      {boards.zones.map((z, i) =>
        z ? (
          <div key={`zone-${i}`} style={{ ...at(z), width: `${z.w * 100 * 0.66}%`, padding: "2.2cqw 2.6cqw" }}>
            <div data-testid={`map-word-zone-${i}`} style={{ fontSize: "2.6cqw", lineHeight: 1.2 }} className="font-black text-primary">
              {JOURNEY_ZONES[i]?.title ?? ""}
            </div>
            <div style={{ ...ink, fontSize: "2cqw", lineHeight: 1.3, marginTop: "0.6cqw" }}>{journeyMapZoneBlurb(i, languageName)}</div>
          </div>
        ) : null,
      )}
      {boards.numbers.map((n, i) =>
        n ? (
          <div key={`number-${i}`} style={{ ...at(n), fontSize: "3.2cqw", color: "#FFFFFF" }} className="flex items-center justify-center font-black">
            {i + 1}
          </div>
        ) : null,
      )}
      {boards.signs.map((s, i) => {
        if (!s) return null;
        const nativeName = line.zonesNative[i] ?? null;
        return (
          <div key={`sign-${i}`} style={{ ...at(s), padding: "0 1.5cqw", lineHeight: 1.15 }} className="flex flex-col items-center justify-center text-center">
            {nativeName ? (
              <span data-testid={`map-word-sign-native-${i}`} style={{ ...nativeStyle, fontSize: "2.9cqw", color: "#FFFFFF", lineHeight: 1.25 }} className="font-bold">
                {nativeName}
              </span>
            ) : null}
            <span
              data-testid={`map-word-sign-${i}`}
              style={{ fontSize: nativeName ? "1.8cqw" : "2.6cqw", letterSpacing: "0.2cqw", color: nativeName ? "#F2DDC2" : "#FFFFFF" }}
              className="font-bold"
            >
              {(line.zones[i] ?? "").toUpperCase()}
            </span>
          </div>
        );
      })}
      {!boards.iconsPainted
        ? boards.medallions.map((m, i) => {
            if (!m) return null;
            const Icon = ZONE_MEDALLION_ICONS[i] ?? Heart;
            return (
              <div key={`icon-${i}`} data-testid={`map-icon-${i}`} style={{ ...at(m), color: "hsl(var(--primary))" }} className="flex items-center justify-center">
                <Icon style={{ width: `${m.w * 100 * 0.55}%`, height: "auto" }} strokeWidth={2.2} aria-hidden />
              </div>
            );
          })
        : null}
      {boards.bottom ? (
        <div style={{ ...at(boards.bottom), ...ink, paddingLeft: "13%", paddingRight: "3cqw", fontSize: "2.5cqw", lineHeight: 1.35 }} className="flex items-center font-semibold">
          {journeyMapTagline(languageName)}
        </div>
      ) : null}
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
