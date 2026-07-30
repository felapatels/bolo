// Spec D1b: the journey map. One themed rail line per language (structured
// content in lib/journeyLines.ts), six fare zones in authoritative category
// order, one station per lesson group (phrase-stage stops before
// sentence-stage), states straight from the Slice 2 unlock API. For
// plan-locked languages the map renders in M1 teaser/exhausted "showroom"
// mode per the API's access envelope: full structure, everything locked
// except the marked teaser station. Approved treatments: tested_out = express
// stamp, sentence stage = first-class diamond + Plus chip, locked showroom
// zones = grayscale postcards.
//
// Task 3 visual upgrade (approved picks): the rail renders as a PRONOUNCED
// serpentine railway track — stations alternate left/right, twin rails with
// sleeper ties curve between them, completed segments solid, locked segments
// faded and dashed — and the map-header boarding pass gets the full-ticket
// treatment (tear-off stub, stripes, fare-zone stamp, punched hole). Stop
// cards, badges, lock states, dialogs and the parked-train marker are
// functionally unchanged; only path geometry, connector art and the header
// pass chrome changed.
import { Link } from "wouter";
import { useEffect, useRef, useState } from "react";
import {
  useListCategories,
  useListCategoryLessonGroups,
  type LessonGroupList,
  type LessonGroupSummary,
} from "@workspace/api-client-react";
import { ArrowLeft, Lock, Sparkles, X } from "lucide-react";
import { TrainEngine } from "@/components/train-svg";
import { useReducedMotion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Mascot } from "@/components/mascot";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/language-context";
import { LessonErrorScreen } from "@/components/lesson-states";
import { UpgradeScreen } from "@/components/plus";
import {
  asUpgradeRequired,
  upgradeHref,
  upgradeHrefForDenial,
  useEntitlements,
} from "@/lib/entitlements";
import { JOURNEY_ZONES, getJourneyLine } from "@/lib/journeyLines";
import { TicketPerforationV, TicketStripes, ZoneStamp } from "@/components/ticket";
import { Bunting, TracksideDoodad, ZoneVista } from "@/components/journey-scenery";

const GRAY = "#9ca3af"; // rail/marker color for locked showroom zones

// Serpentine layout rhythm (approved "pronounced" treatment). The map column
// is mobile-width (max 390px) and centers inside the page's max-w-2xl on
// desktop — no separate desktop composition.
const MAP_MAX_W = 390;
const STATION_H = 100; // vertical rhythm per station row
const PC_H = 152; // vertical rhythm per fare-zone postcard (incl. picture side)
const TERM_H = 92; // terminus row
const TOP_PAD = 10;
const LEFT_X = 92; // marker x for even-index stations

type Station = LessonGroupSummary & {
  zoneId: number;
  zoneIndex: number;
  stopNumber: number; // 1-based within the zone
  stopCount: number; // stations in the zone
};

type LockInfo = {
  kind: "progression" | "sentence" | "language";
  stopLabel: string;
  zoneTitle: string;
};

function stageRank(g: LessonGroupSummary): number {
  return g.stage === "sentence" ? 1 : 0;
}

function isStatusAccessible(status: LessonGroupSummary["status"]): boolean {
  return (
    status === "unlocked" ||
    status === "in_progress" ||
    status === "completed" ||
    status === "tested_out"
  );
}

/** Measured width of the map column, so the serpentine geometry stays inside
 *  the viewport on phones narrower than 390px. */
function useMapWidth() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(MAP_MAX_W);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const cw = el.clientWidth;
      if (cw > 0) setW(Math.round(cw));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

/** Marker sitting on the rail: circle for phrase stops, diamond for the
 *  first-class sentence stops, train for the current stop. */
function StationMarker({
  station,
  color,
  isCurrent,
  accessible,
}: {
  station: Station;
  color: string;
  isCurrent: boolean;
  accessible: boolean;
}) {
  const reduceMotion = useReducedMotion();
  if (isCurrent) {
    return (
      <div
        className="w-10 h-7 rounded-full bg-white flex items-center justify-center px-1"
        style={{ boxShadow: `0 0 0 4px ${color}, 0 0 0 8px ${color}33`, color }}
        title="Your current stop"
      >
        {/* Soft idle bob on the parked train, whole-element transform only. */}
        <TrainEngine className={cn("w-8 h-full", !reduceMotion && "animate-train-bob")} />
      </div>
    );
  }
  const done = station.status === "completed" || station.status === "tested_out";
  const shapeClass =
    station.stage === "sentence" ? "rotate-45 rounded-[3px]" : "rounded-full";
  if (done) {
    return (
      <div
        className={cn("w-5 h-5 border-4 border-white", shapeClass)}
        style={{ background: color, boxShadow: `0 0 0 2px ${color}` }}
      />
    );
  }
  return (
    <div
      className={cn("w-5 h-5 bg-background", shapeClass)}
      style={{
        boxShadow: accessible
          ? `inset 0 0 0 3px ${color}`
          : "inset 0 0 0 3px hsl(var(--border))",
      }}
    />
  );
}

/** Fare-zone postcard: picture side on top (per-zone landmark vista, inline
 *  SVG in brand colors — no artwork is generated, acceptance 8), address side
 *  below with stamp + postmark. Locked showroom zones render grayscale.
 *  Full-width card; the interchange diamond is drawn by the map on the track
 *  where it meets the card. */
function ZonePostcard({
  zoneIndex,
  zoneTitle,
  geoName,
  accent,
  stationCount,
  grayed,
}: {
  zoneIndex: number;
  zoneTitle: string;
  geoName: string;
  accent: string;
  stationCount: number;
  grayed: boolean;
}) {
  const color = grayed ? GRAY : accent;
  return (
    <div className={cn(grayed && "grayscale opacity-80")}>
      {/* postcard frame — outer 2px border */}
      <div className="rounded-lg border-2 bg-white shadow-sm overflow-hidden" style={{ borderColor: color }}>
        {/* dashed inner frame */}
        <div className="m-1 rounded-md border border-dashed overflow-hidden" style={{ borderColor: `${color}66` }}>
          {/* picture side: the zone's landmark vista */}
          <ZoneVista zoneIndex={zoneIndex} accent={accent} />
          {/* address side */}
          <div className="flex items-stretch gap-0">
            {/* left column: main address side */}
            <div className="flex-1 min-w-0 px-3 py-1.5">
              <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color }}>
                Fare zone {zoneIndex + 1} · {zoneTitle}
              </div>
              <div className="text-sm font-extrabold leading-tight text-foreground truncate">
                {geoName}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {stationCount} {stationCount === 1 ? "stop" : "stops"} in this zone
              </div>
            </div>
            {/* divided-back vertical rule */}
            <div className="w-px self-stretch my-1.5" style={{ background: `${color}44` }} aria-hidden />
            {/* right column: stamp + postmark, side by side */}
            <div className="shrink-0 flex items-center gap-1.5 px-2 py-1.5">
              {/* circular postmark */}
              <div
                className="w-7 h-7 rounded-full border border-dashed flex items-center justify-center"
                style={{ borderColor: `${color}88` }}
                aria-hidden
              >
                <div
                  className="w-4 h-4 rounded-full border flex items-center justify-center"
                  style={{ borderColor: color }}
                >
                  <div className="w-1 h-1 rounded-full" style={{ background: color }} />
                </div>
              </div>
              {/* postage stamp: bold zone number in accent */}
              <div
                className="h-9 w-9 rounded-sm border-2 flex flex-col items-center justify-center"
                style={{ borderColor: color, background: `${color}14` }}
                aria-hidden
              >
                <span className="text-[8px] font-black uppercase tracking-wide leading-none" style={{ color }}>
                  Zone
                </span>
                <span className="text-base font-black leading-none" style={{ color }}>
                  {zoneIndex + 1}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Stop card (Link when boardable, lock-dialog button otherwise). The rail
 *  marker is positioned separately by the map on the track itself. */
function StationCard({
  station,
  color,
  isCurrent,
  accessible,
  showTeaserChip,
  href,
  onLocked,
  side,
}: {
  station: Station;
  color: string;
  isCurrent: boolean;
  accessible: boolean;
  showTeaserChip: boolean;
  href: string;
  onLocked: () => void;
  side: "left" | "right";
}) {
  const reduceMotion = useReducedMotion();
  const stopLabel = `Stop ${station.stopNumber} of ${station.stopCount}`;
  const statusCopy =
    station.status === "completed"
      ? "Completed"
      : station.status === "tested_out"
        ? "Tested out"
        : station.status === "in_progress"
          ? "In progress"
          : accessible
            ? "Now boarding"
            : "Locked";
  const card = (
    <div
      className={cn(
        "relative min-w-0 rounded-lg px-3 py-2 transition-colors group-hover:bg-accent",
        isCurrent && "bg-card border shadow-sm",
      )}
      style={isCurrent ? { borderColor: color } : undefined}
    >
      {/* "Now boarding" accent pulse: an opacity-only glow overlay so the
          animated property stays within the transforms/opacity budget. */}
      {isCurrent && !reduceMotion && (
        <div
          className="pointer-events-none absolute -inset-px rounded-lg animate-stop-glow-pulse"
          style={{ boxShadow: `0 0 0 3px ${color}55` }}
          aria-hidden
        />
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={cn(
            "text-sm font-semibold",
            accessible ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {stopLabel}
        </span>
        {station.stage === "sentence" && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-secondary/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-secondary shrink-0"
            title="First-class sentence stop — All-Access"
          >
            <Sparkles className="w-2.5 h-2.5" />
            All-Access
          </span>
        )}
        {station.status === "tested_out" && (
          <span
            className="inline-block -rotate-6 rounded-sm border-2 border-dashed px-1.5 py-px text-[8px] font-black uppercase tracking-widest shrink-0"
            style={{ borderColor: color, color }}
          >
            Express
          </span>
        )}
        {showTeaserChip && (
          <span
            className="rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shrink-0"
            style={{ background: color }}
          >
            Free taste
          </span>
        )}
        {!accessible && <Lock className="w-3 h-3 text-muted-foreground shrink-0" />}
      </div>
      <div
        className={cn("text-[11px]", isCurrent ? "font-semibold" : "text-muted-foreground")}
        style={isCurrent ? { color } : undefined}
      >
        {statusCopy}
        {station.attemptedCount ? ` · ${station.masteredCount}/${station.phraseCount} mastered` : ` · ${station.phraseCount} phrases`}
        {isCurrent && " · Bolo is waiting here"}
      </div>
    </div>
  );
  const body = (
    <>
      {side === "left" && isCurrent && (
        <Mascot pose="cheer" size={44} className="shrink-0" />
      )}
      {card}
      {side === "right" && isCurrent && (
        <Mascot pose="cheer" size={44} className="shrink-0" />
      )}
    </>
  );
  const aria = `${stopLabel} — ${statusCopy}${station.stage === "sentence" ? " (sentence stop)" : ""}`;
  const rowClass = cn(
    "flex w-full items-center gap-1 text-left group",
    side === "left" ? "justify-end" : "justify-start",
  );
  if (accessible) {
    return (
      <Link href={href} aria-label={aria} className={rowClass}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" aria-label={aria} onClick={onLocked} className={rowClass}>
      {body}
    </button>
  );
}

/** One railway segment: sleeper ties under twin rails (a wide stroke split in
 *  two by a background-colored center stroke). Locked segments are faded and
 *  dashed; completed/boarding segments are solid accent. */
function RailSegment({ d, lit, accent }: { d: string; lit: boolean; accent: string }) {
  const color = lit ? accent : GRAY;
  return (
    <g opacity={lit ? 1 : 0.5}>
      <path d={d} stroke={color} strokeWidth={15} strokeDasharray="3 11" opacity={0.3} fill="none" />
      <path d={d} stroke={color} strokeWidth={8.5} fill="none" strokeDasharray={lit ? undefined : "9 7"} />
      <path
        d={d}
        style={{ stroke: "hsl(var(--background))" }}
        strokeWidth={4}
        fill="none"
        strokeDasharray={lit ? undefined : "9 7"}
      />
    </g>
  );
}

type Pt = {
  x: number;
  y: number;
  kind: "station" | "postcard" | "terminus";
  lit: boolean;
  station?: Station;
  zoneIndex?: number;
};

export default function Journey() {
  const { activeLang, activeLanguage } = useLanguage();
  const { isAllAccess } = useEntitlements();
  const line = getJourneyLine(activeLang);
  const [lock, setLock] = useState<LockInfo | null>(null);
  const { ref: mapRef, w: mapW } = useMapWidth();

  // One language's map never fetches another language's data (behavior 9):
  // exactly six fixed zone queries for the active language.
  const categoriesQuery = useListCategories({ lang: activeLang });
  const q1 = useListCategoryLessonGroups(JOURNEY_ZONES[0].id, activeLang);
  const q2 = useListCategoryLessonGroups(JOURNEY_ZONES[1].id, activeLang);
  const q3 = useListCategoryLessonGroups(JOURNEY_ZONES[2].id, activeLang);
  const q4 = useListCategoryLessonGroups(JOURNEY_ZONES[3].id, activeLang);
  const q5 = useListCategoryLessonGroups(JOURNEY_ZONES[4].id, activeLang);
  const q6 = useListCategoryLessonGroups(JOURNEY_ZONES[5].id, activeLang);
  const zoneQueries = [q1, q2, q3, q4, q5, q6];

  // Plain-locked language (no teaser set): the API keeps its pre-M1 402 and
  // the map defers to the standard upgrade screen.
  const upgrade = zoneQueries
    .map((q) => asUpgradeRequired(q.error))
    .find((u) => u !== null);
  if (upgrade) {
    return (
      <UpgradeScreen
        backHref="/app"
        title={
          upgrade.reason === "teaser_exhausted"
            ? "You've tried this language!"
            : "Unlock this language"
        }
        message={upgrade.message}
        upgradeHref={upgradeHrefForDenial(upgrade, activeLang)}
      />
    );
  }
  if (zoneQueries.some((q) => q.isError)) {
    return (
      <LessonErrorScreen
        backHref="/app"
        onRetry={() => {
          zoneQueries.forEach((q) => void q.refetch());
        }}
        isRetrying={zoneQueries.some((q) => q.isFetching)}
      />
    );
  }
  if (zoneQueries.some((q) => q.isLoading)) {
    return (
      <div className="app-surface min-h-[100dvh] bg-background flex flex-col items-center justify-center gap-3">
        <Mascot pose="wave" size={88} />
        <p className="text-sm font-bold text-muted-foreground">
          Laying the tracks…
        </p>
      </div>
    );
  }

  // Behavior 8: the embedded zone table is authoritative; a live mismatch is a
  // hard stop, never a silent remap.
  const categories = categoriesQuery.data;
  const zoneMismatch =
    categories !== undefined &&
    JOURNEY_ZONES.some(
      (z) => !categories.some((c) => c.id === z.id && c.title === z.title),
    );
  if (zoneMismatch) {
    return (
      <LessonErrorScreen
        backHref="/app"
        onRetry={() => void categoriesQuery.refetch()}
        isRetrying={categoriesQuery.isFetching}
      />
    );
  }

  // M1 access envelope: present only in showroom (teaser/exhausted) mode.
  const access =
    zoneQueries.map((q) => (q.data as LessonGroupList | undefined)?.access).find(Boolean) ??
    null;
  const teaserProgress =
    zoneQueries.map((q) => (q.data as LessonGroupList | undefined)?.teaser).find(Boolean) ??
    null;
  const showroom = access !== null;

  const zones = JOURNEY_ZONES.map((z, i) => {
    const groups = [...((zoneQueries[i]!.data as LessonGroupList | undefined)?.lessonGroups ?? [])]
      // Phrase-stage stops before sentence-stage, then position order.
      .sort((a, b) => stageRank(a) - stageRank(b) || (a.position ?? 0) - (b.position ?? 0));
    const stations: Station[] = groups.map((g, gi) => ({
      ...g,
      zoneId: z.id,
      zoneIndex: i,
      stopNumber: gi + 1,
      stopCount: groups.length,
    }));
    return { ...z, geoName: line.zones[i]!, stations };
  });

  const allStations = zones.flatMap((z) => z.stations);
  const doneCount = allStations.filter(
    (s) => s.status === "completed" || s.status === "tested_out",
  ).length;
  const totalCount = allStations.length;
  const currentId = allStations.find(
    (s) =>
      (s.status === "unlocked" || s.status === "in_progress") &&
      !(s.stage === "sentence" && !isAllAccess),
  )?.id;
  const currentStation = allStations.find((s) => s.id === currentId) ?? null;
  const currentZone = currentStation ? zones[currentStation.zoneIndex]! : null;

  const languageName = activeLanguage?.name ?? "this language";
  const upgradeLanguageHref = upgradeHref({
    plan: "plus",
    reason: access === "exhausted" ? "teaser_exhausted" : "language_locked",
  });

  // --- Serpentine geometry (pronounced): stations alternate left/right down
  // the measured map column; the track curves between them.
  const rightX = mapW - 94; // mirror of LEFT_X within the measured column
  const stationX = (k: number) => (k % 2 === 0 ? LEFT_X : rightX);
  const pts: Pt[] = [];
  const postcardYs: { y: number; zoneIndex: number }[] = [];
  let layoutY = TOP_PAD;
  let k = 0; // global station index (drives the serpentine phase)
  for (let zi = 0; zi < zones.length; zi++) {
    const zone = zones[zi]!;
    const zoneLit = zone.stations.some(
      (s) => isStatusAccessible(s.status) || s.teaserStation,
    );
    postcardYs.push({ y: layoutY, zoneIndex: zi });
    // Path point mid-postcard, x interpolated between neighbor stations.
    const xPrev = k === 0 ? stationX(0) : stationX(k - 1);
    const xNext = stationX(k);
    pts.push({
      x: (xPrev + xNext) / 2,
      y: layoutY + PC_H / 2,
      kind: "postcard",
      lit: !showroom || zoneLit,
      zoneIndex: zi,
    });
    layoutY += PC_H;
    for (const s of zone.stations) {
      const sentenceGated = s.stage === "sentence" && !isAllAccess;
      const lit =
        s.status === "completed" ||
        s.status === "tested_out" ||
        s.status === "in_progress" ||
        (s.status === "unlocked" && !sentenceGated);
      pts.push({ x: stationX(k), y: layoutY + STATION_H / 2, kind: "station", lit, station: s });
      layoutY += STATION_H;
      k++;
    }
  }
  const allDone = doneCount === totalCount && totalCount > 0;
  const termX = k > 0 ? stationX(k - 1) : LEFT_X;
  const termY = layoutY + TERM_H / 2;
  pts.push({ x: termX, y: termY, kind: "terminus", lit: allDone });
  const totalH = layoutY + TERM_H + 8;

  const segs = pts.slice(1).map((p, i) => {
    const a = pts[i]!;
    const dy = (p.y - a.y) / 2;
    return {
      d: `M ${a.x} ${a.y} C ${a.x} ${a.y + dy}, ${p.x} ${p.y - dy}, ${p.x} ${p.y}`,
      lit: p.lit,
    };
  });

  let stationIdx = 0;

  return (
    <div className="app-surface min-h-[100dvh] bg-background flex flex-col">
      {/* Boarding-pass header — full-ticket treatment */}
      <header className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border">
        <div className="mx-auto w-full max-w-2xl px-3 py-3 flex items-center gap-2">
          <Link
            href="/app"
            aria-label="Back to home"
            className="p-2 rounded-full hover:bg-muted text-foreground transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="relative flex-1 overflow-hidden rounded-lg border-2 border-dashed border-border bg-card">
            <TicketStripes ink={`${line.accent}08`} />
            <div className="relative flex items-stretch">
              <div className="min-w-0 flex-1 px-4 py-2.5">
                <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                  Boarding pass · બોલો રેલ
                </div>
                <div className="text-base font-extrabold text-foreground leading-tight truncate">
                  {line.lineName}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {line.zones[0]} → {line.zones[5]} · {doneCount}/{totalCount} stations
                </div>
                {access === "teaser" && teaserProgress && (
                  <div className="text-[10px] font-bold" style={{ color: line.accent }}>
                    Free taste {teaserProgress.consumed}/{teaserProgress.limit}
                  </div>
                )}
              </div>
              {/* tear-off stub */}
              <TicketPerforationV light={false} />
              {/* Stub: perforation-end notches (edge bites) come from
                  TicketPerforationV. The floating notch dot and 🎫 emoji were
                  removed — cutout circles only ever straddle card edges
                  (approved ruling, ported from the mobile build-28 pass), and
                  the emoji renders as tofu without an emoji font. */}
              <div className="relative flex w-[76px] shrink-0 flex-col items-center justify-center gap-0.5 px-2 py-1.5">
                {currentZone && currentStation && (
                  <ZoneStamp
                    ink={line.accent}
                    zone={currentStation.zoneIndex + 1}
                    name={currentZone.geoName}
                    size={44}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* pb-28 below lg clears the fixed BottomNav now mounted by AppShell */}
      <main className="mx-auto w-full max-w-2xl flex-1 pb-28 lg:pb-14">
        {access === "exhausted" && (
          <div className="mx-3 mt-4 rounded-2xl border-2 p-4" style={{ borderColor: line.accent }}>
            <p className="text-sm font-bold text-foreground">
              You've tried the {line.lineName}! All {teaserProgress?.limit ?? 3} free
              phrases are used.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Unlock {languageName} to board every stop on the line.
            </p>
            <Link
              href={upgradeLanguageHref}
              className="mt-3 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black text-white active:scale-[0.98] transition-transform"
              style={{ background: line.accent }}
            >
              <Sparkles className="w-4 h-4" />
              Get your ticket
            </Link>
          </div>
        )}

        {/* Serpentine railway: track + zone postcards + stations. The map is
            mobile-width and centers in the column on desktop. */}
        <div ref={mapRef} className="relative mx-auto mt-2 w-full max-w-[390px]">
          <div className="relative" style={{ height: totalH }}>
            <svg
              className="absolute inset-0 pointer-events-none"
              width={mapW}
              height={totalH}
              viewBox={`0 0 ${mapW} ${totalH}`}
              aria-hidden
            >
              {segs.map((s, i) => (
                <RailSegment key={i} d={s.d} lit={s.lit} accent={line.accent} />
              ))}
              {/* Trackside scenery: one small scene in the free strip beside
                  each station (opposite its card), cycling by station index. */}
              {pts
                .filter((p) => p.kind === "station")
                .map((p, i) => {
                  const s = p.station!;
                  const zone = zones[s.zoneIndex]!;
                  const zoneAccessible = zone.stations.some(
                    (st) => isStatusAccessible(st.status) || st.teaserStation,
                  );
                  return (
                    <TracksideDoodad
                      key={s.id}
                      variant={i}
                      x={i % 2 === 0 ? 42 : mapW - 42}
                      y={p.y + 22}
                      accent={line.accent}
                      gray={showroom && !zoneAccessible}
                    />
                  );
                })}
              {/* Festival bunting over the terminus */}
              <Bunting x1={20} x2={mapW - 20} y={termY - 34} accent={line.accent} />
            </svg>

            {/* Zone postcards (full width; interchange diamond rides the track) */}
            {postcardYs.map(({ y: py, zoneIndex }) => {
              const zone = zones[zoneIndex]!;
              const pt = pts.find((p) => p.kind === "postcard" && p.zoneIndex === zoneIndex)!;
              const zoneAccessible = zone.stations.some(
                (s) => isStatusAccessible(s.status) || s.teaserStation,
              );
              const grayed = showroom && !zoneAccessible;
              const diamondColor = grayed ? GRAY : line.accent;
              return (
                <div key={zone.id}>
                  <div className="absolute" style={{ left: 16, right: 16, top: py + 10 }}>
                    <ZonePostcard
                      zoneIndex={zoneIndex}
                      zoneTitle={zone.title}
                      geoName={zone.geoName}
                      accent={line.accent}
                      stationCount={zone.stations.length}
                      grayed={grayed}
                    />
                  </div>
                  {/* interchange diamond pinned where the track meets the zone
                      card (top border) so it never collides with the card text */}
                  <div
                    className="absolute w-4 h-4 border-4 border-white"
                    style={{
                      left: pt.x,
                      top: py + 10,
                      transform: "translate(-50%, -50%) rotate(45deg)",
                      background: diamondColor,
                      boxShadow: `0 0 0 2px ${diamondColor}`,
                      zIndex: 5,
                    }}
                    aria-hidden
                  />
                </div>
              );
            })}

            {/* Stations */}
            {pts
              .filter((p) => p.kind === "station")
              .map((p) => {
                const s = p.station!;
                const zone = zones[s.zoneIndex]!;
                const zoneAccessible = zone.stations.some(
                  (st) => isStatusAccessible(st.status) || st.teaserStation,
                );
                const grayed = showroom && !zoneAccessible;
                const zoneColor = grayed ? GRAY : line.accent;
                const k2 = stationIdx++;
                const side: "left" | "right" = k2 % 2 === 0 ? "right" : "left";
                const boxLeft = side === "right" ? p.x + 28 : 16;
                const boxWidth =
                  side === "right" ? mapW - 16 - (p.x + 28) : p.x - 28 - 16;
                const stopLabel = `Stop ${s.stopNumber} of ${s.stopCount}`;
                // Behavior 4 + 6: a Free learner's sentence stop always routes
                // through the entitlement presentation, even when progression
                // says unlocked — its phrases are Plus content server-side.
                const sentenceGated = s.stage === "sentence" && !isAllAccess;
                const accessible = isStatusAccessible(s.status) && !sentenceGated;
                return (
                  <div key={s.id}>
                    <div
                      className="absolute flex items-center justify-center pointer-events-none"
                      style={{
                        left: p.x,
                        top: p.y,
                        transform: "translate(-50%, -50%)",
                        zIndex: 6,
                      }}
                      aria-hidden
                    >
                      <StationMarker
                        station={s}
                        color={zoneColor}
                        isCurrent={s.id === currentId}
                        accessible={accessible}
                      />
                    </div>
                    <div
                      className="absolute"
                      style={{
                        left: boxLeft,
                        width: boxWidth,
                        top: p.y,
                        transform: "translateY(-50%)",
                        zIndex: 4,
                      }}
                    >
                      <StationCard
                        station={s}
                        color={zoneColor}
                        isCurrent={s.id === currentId}
                        accessible={accessible}
                        showTeaserChip={s.teaserStation === true}
                        href={`/practice/${zone.id}?group=${s.id}`}
                        onLocked={() =>
                          setLock({
                            kind: showroom
                              ? "language"
                              : sentenceGated
                                ? "sentence"
                                : "progression",
                            stopLabel: `${stopLabel} · ${zone.geoName}`,
                            zoneTitle: zone.title,
                          })
                        }
                        side={side}
                      />
                    </div>
                  </div>
                );
              })}

            {/* terminus */}
            <div
              className="absolute w-6 h-6 rounded-full border-4 border-white"
              style={{
                left: termX,
                top: termY,
                transform: "translate(-50%, -50%)",
                background: allDone ? line.accent : GRAY,
                boxShadow: `0 0 0 2px ${allDone ? line.accent : GRAY}`,
                zIndex: 5,
              }}
              aria-hidden
            />
            <div
              className="absolute text-xs font-bold text-muted-foreground"
              style={
                termX > mapW / 2
                  ? {
                      left: 12,
                      width: termX - 36,
                      top: termY,
                      transform: "translateY(-50%)",
                      textAlign: "right",
                    }
                  : {
                      left: termX + 24,
                      right: 12,
                      top: termY,
                      transform: "translateY(-50%)",
                    }
              }
            >
              Terminus: {line.zones[5]} —{" "}
              {allDone ? "journey complete!" : "the festival finale awaits"}
            </div>
          </div>
        </div>

        <p className="mt-2 px-6 text-center text-[11px] text-muted-foreground">
          Tap any lit station to practice it. The {line.lineName} only stops at
          the next station once you finish the one before it.
        </p>
      </main>

      {/* Lock dialogs: entitlement locks and progression locks read differently
          (behavior 4 / acceptance 4). */}
      <Dialog open={lock !== null} onOpenChange={(open) => !open && setLock(null)}>
        <DialogContent className="max-w-sm rounded-3xl">
          {lock?.kind === "progression" && (
            <>
              <DialogHeader>
                <DialogTitle>This stop is still locked</DialogTitle>
                <DialogDescription>
                  {lock.stopLabel}: finish the stop before it to board here.
                  The {line.lineName} runs station by station.
                </DialogDescription>
              </DialogHeader>
              <button
                type="button"
                onClick={() => setLock(null)}
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground active:scale-[0.98] transition-transform"
              >
                Keep practicing
              </button>
            </>
          )}
          {lock?.kind === "sentence" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rotate-45 rounded-[2px]"
                    style={{ background: line.accent }}
                    aria-hidden
                  />
                  First-class coach: full sentences
                </DialogTitle>
                <DialogDescription>
                  {lock.stopLabel} is a sentence stop — graduate from phrases to
                  real, natural sentences. First-class seats are an All-Access perk.
                </DialogDescription>
              </DialogHeader>
              <Link
                href={upgradeHref({ plan: "plus" })}
                onClick={() => setLock(null)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-secondary px-4 py-3 text-sm font-black text-white active:scale-[0.98] transition-transform"
              >
                <Sparkles className="w-4 h-4" />
                Unlock with All-Access
              </Link>
            </>
          )}
          {lock?.kind === "language" && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {access === "exhausted"
                    ? "You've tried this line!"
                    : "This line needs a ticket"}
                </DialogTitle>
                <DialogDescription>
                  {access === "exhausted"
                    ? `All ${teaserProgress?.limit ?? 3} free phrases on the ${line.lineName} are used. Unlock ${languageName} to keep riding.`
                    : `Your free taste covers the marked station (${teaserProgress?.consumed ?? 0}/${teaserProgress?.limit ?? 3} tried). Unlock ${languageName} to board every stop.`}
                </DialogDescription>
              </DialogHeader>
              <Link
                href={upgradeLanguageHref}
                onClick={() => setLock(null)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground active:scale-[0.98] transition-transform"
              >
                <Sparkles className="w-4 h-4" />
                Get your ticket
              </Link>
            </>
          )}
          <button
            type="button"
            onClick={() => setLock(null)}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="w-4 h-4" />
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
