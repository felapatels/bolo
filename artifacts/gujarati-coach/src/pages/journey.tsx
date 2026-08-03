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
import { blessAudioPlayback } from "@/lib/iosAudio";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  useListCategories,
  useListCategoryLessonGroups,
  useListZoneStamps,
  useRecordSignalWave,
  type LessonGroupList,
  type LessonGroupSummary,
} from "@workspace/api-client-react";
import { ArrowLeft, Coffee, Lock, Sparkles, Star } from "lucide-react";
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
import { DEPTH_2_5D, RAIL_PULSE } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/language-context";
import { LessonErrorScreen } from "@/components/lesson-states";
import { UpgradeScreen } from "@/components/plus";
import {
  asUpgradeRequired,
  upgradeHref,
  upgradeHrefForDenial,
} from "@/lib/entitlements";
import { JOURNEY_ZONES, getJourneyLine } from "@/lib/journeyLines";
import {
  TicketPerforationV,
  TicketStripes,
  ZoneStamp,
  stampSizeForExtent,
} from "@/components/ticket";
import {
  Bunting,
  SCENERY_PLACEMENT,
  SceneryElement,
  SignalGlyph,
  SignalmanGlyph,
  SignpostGlyph,
  ZoneVista,
  planTracksideSignals,
  planZoneScenery,
  planZoneSignpost,
} from "@/components/journey-scenery";
import { factForZone, factRotationForZone } from "@/lib/india-facts";
import { toast } from "@/hooks/use-toast";
import {
  closeoutStateUnseeded,
  gameForSignal,
  isSignalCleared,
  isSignalStopSeen,
  isSignalWaved,
  markSignalStopSeen,
  markSignalWaved,
  readCloseoutStages,
  type QuickGameDef,
  type QuickGameId,
} from "@/lib/quick-games";
import { ZoneCloseoutOverlay } from "@/components/zone-closeout";

const GRAY = "#9ca3af"; // rail/marker color for locked showroom zones

// Client-side scenario id lookup by zone index (0-based). Must stay in sync
// with the server-side SCENARIOS map in artifacts/api-server/src/lib/scenarios.ts.
// Adding a new zone scenario is a content-only change: add the entry here and
// the matching entry in scenarios.ts.
function scenarioIdForZone(zoneIndex: number): string | undefined {
  const MAP: Record<number, string> = {
    0: "greetings-manners",
  };
  return MAP[zoneIndex];
}

// Serpentine layout rhythm (approved "pronounced" treatment). The map column
// is mobile-width (max 390px) and centers inside the page's max-w-2xl on
// desktop — no separate desktop composition.
const MAP_MAX_W = 390;
const STATION_H = 100; // vertical rhythm per station row
const PC_H = 184; // vertical rhythm per fare-zone postcard (incl. picture side + fact strip)
const TERM_H = 92; // terminus row
const TOP_PAD = 10;
const LEFT_X = 92; // marker x for even-index stations
const RIGHT_INSET = 94; // mirror inset of LEFT_X for odd-index stations
const CARD_GAP = 28; // gap between a marker and its station card
const EDGE_PAD = 16; // station card / postcard inset from the map edge
const MARKER_HALF_W = 23; // widest marker (the 46px current-stop train pill) / 2

/** Serpentine geometry constants shared with the scenery placement tests
 *  (Task 985), so the no-overlap assertions can never drift from the layout
 *  the page actually renders. */
export const SERPENTINE = {
  MAP_MAX_W,
  STATION_H,
  PC_H,
  TERM_H,
  TOP_PAD,
  LEFT_X,
  RIGHT_INSET,
  CARD_GAP,
  EDGE_PAD,
  MARKER_HALF_W,
  /** Half of the rail's widest stroke (the 15px sleeper-tie band). */
  RAIL_HALF_W: 7.5,
} as const;
// Task #917 / #973: comet samples per active-run segment come from the shared
// RAIL_PULSE tuning export in lib/motion.tsx (geometry density, not timing;
// the timing constants live in the :root block in index.css).

type Station = LessonGroupSummary & {
  zoneId: number;
  zoneIndex: number;
  stopNumber: number; // 1-based within the zone
  stopCount: number; // stations in the zone
};

type LockInfo = {
  kind: "progression" | "sentence" | "language" | "plan";
  stopLabel: string;
  zoneTitle: string;
  /** Route pieces for the progression dialog's test-out action. */
  zoneId?: number;
  groupId?: number;
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
        className="w-[46px] h-8 rounded-full bg-white flex items-center justify-center px-1"
        style={{
          boxShadow: `0 0 0 4px ${color}, 0 0 0 8px ${color}33, var(--depth-shadow)`,
          color,
        }}
        title="Your current stop"
      >
        {/* Soft idle bob on the parked train, whole-element transform only.
            Width routed through the :root tuning constants (task 899 bump). */}
        <TrainEngine
          className={cn("w-[var(--train-marker-w)] h-full", !reduceMotion && "animate-train-bob")}
        />
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
        style={{ background: color, boxShadow: `0 0 0 2px ${color}, var(--depth-shadow)` }}
      />
    );
  }
  return (
    <div
      className={cn("w-5 h-5 bg-background", shapeClass)}
      style={{
        boxShadow: accessible
          ? `inset 0 0 0 3px ${color}, var(--depth-shadow)`
          : "inset 0 0 0 3px hsl(var(--border)), var(--depth-shadow)",
      }}
    />
  );
}

/** Hotfix 3 item 3: one fun blurb per quick game, shown under the play
 *  action in the signal encounter dialog. */
const GAME_BLURBS: Record<QuickGameId, string> = {
  "ticket-check": "Punch tickets to their matching script before the whistle blows.",
  "wrong-platform": "Spot the phrase that wandered onto the wrong platform.",
  "luggage-match": "Pair up the luggage tags before the carousel moves on.",
  "express-listening": "The express won't wait. Catch the meaning at full speed.",
  "signal-lights": "Green for true, red for false. Call it before the gate drops.",
};

/** Hotfix 3 item 6: live fact strip timing. The cycle only counts continued
 *  on-screen visibility; the fade is a JS-driven swap so the CSS minifier
 *  time-unit trap (cssTimeMs) never applies. */
const FACT_CYCLE_MS = 6000;
const FACT_FADE_MS = 250;

/** Hotfix 3 item 6: the postcard's live "Did you know?" strip. Cycles to the
 *  next fact in the zone's rotation after roughly 6 seconds of continued
 *  visibility with a gentle crossfade; tapping advances immediately. Reduced
 *  motion: no auto-cycle, tap still advances with an instant swap. Facts are
 *  a local lookup, so cycling makes zero network calls. */
function FactStrip({
  facts,
  zoneIndex,
  color,
}: {
  facts: string[];
  zoneIndex: number;
  color: string;
}) {
  const reduceMotion = useReducedMotion();
  const [idx, setIdx] = useState(0);
  const [fading, setFading] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const visibleRef = useRef(true);
  const fadeTimer = useRef<number | null>(null);

  // Cycle only while the strip is actually on screen. jsdom and very old
  // browsers lack IntersectionObserver; they simply count as always visible.
  useEffect(() => {
    const el = btnRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => {
      visibleRef.current = entry?.isIntersecting ?? true;
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const advance = useCallback(() => {
    if (facts.length < 2 || fadeTimer.current !== null) return;
    if (reduceMotion) {
      setIdx((i) => (i + 1) % facts.length);
      return;
    }
    setFading(true);
    fadeTimer.current = window.setTimeout(() => {
      fadeTimer.current = null;
      setFading(false);
      setIdx((i) => (i + 1) % facts.length);
    }, FACT_FADE_MS);
  }, [facts.length, reduceMotion]);

  useEffect(
    () => () => {
      if (fadeTimer.current !== null) window.clearTimeout(fadeTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (reduceMotion || facts.length < 2) return;
    const t = window.setInterval(() => {
      if (visibleRef.current) advance();
    }, FACT_CYCLE_MS);
    return () => window.clearInterval(t);
  }, [advance, reduceMotion, facts.length]);

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={advance}
      aria-label="Show the next India fact"
      data-testid={`postcard-fact-${zoneIndex}`}
      className="mx-1.5 mb-1.5 block w-[calc(100%-0.75rem)] rounded-md border border-dashed px-2 py-1 text-left"
      style={{ borderColor: `${color}55` }}
    >
      <span
        className="block text-[8px] font-black uppercase tracking-widest"
        style={{ color }}
      >
        Did you know?
      </span>
      <p
        className={cn(
          "line-clamp-2 text-[9px] leading-tight text-muted-foreground transition-opacity duration-200",
          fading ? "opacity-0" : "opacity-100",
        )}
      >
        {facts[idx % facts.length]}
      </p>
    </button>
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
  zoneAllDone,
  scenarioId,
  hasStamp,
  testOutHref,
  facts,
}: {
  zoneIndex: number;
  zoneTitle: string;
  geoName: string;
  accent: string;
  stationCount: number;
  grayed: boolean;
  zoneAllDone?: boolean;
  scenarioId?: string;
  hasStamp?: boolean;
  /** Present only when the zone is gate-locked (Chunk 4B): links into the
   *  zone-level test-out flow. Dormant pre-flip by construction. */
  testOutHref?: string;
  /** Hotfix 3 item 6: the zone's rotating India facts for the live strip
   *  (index 0 is today's daily pick, factForZone parity). */
  facts?: string[];
}) {
  const color = grayed ? GRAY : accent;
  return (
    <div className={cn("pointer-events-auto", grayed && "grayscale opacity-80")}>
      {/* postcard frame — outer 2px border */}
      <div className="rounded-lg border-2 bg-white depth-shadow overflow-hidden" style={{ borderColor: color }}>
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
          {facts && facts.length > 0 && (
            <FactStrip facts={facts} zoneIndex={zoneIndex} color={color} />
          )}
          {testOutHref && (
            <Link
              href={testOutHref}
              onClick={blessAudioPlayback}
              data-testid={`link-zone-test-out-${zoneIndex}`}
              className="mx-1.5 mb-1.5 flex items-center justify-center rounded-md border-2 bg-white py-2 text-xs font-bold active:scale-[0.98] transition-transform"
              style={{ borderColor: color, color }}
            >
              Test out of this zone
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/** Tiny station signboard glyph (awning + posts) for the active stop card.
 *  UI art, not mascot art, so it may be drawn freely. */
function StationSignGlyph({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 14 12" className="h-3 w-3.5 shrink-0" aria-hidden>
      <path d="M1 4 L7 0.5 L13 4 Z" fill={color} />
      <rect x="2.5" y="4.5" width="9" height="3.5" rx="1" fill={color} opacity="0.3" />
      <rect x="3.5" y="8" width="1.4" height="4" fill={color} />
      <rect x="9.1" y="8" width="1.4" height="4" fill={color} />
    </svg>
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
  polishEnabled,
}: {
  station: Station;
  color: string;
  isCurrent: boolean;
  accessible: boolean;
  showTeaserChip: boolean;
  href: string;
  onLocked: () => void;
  side: "left" | "right";
  polishEnabled?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const stopLabel = `Stop ${station.stopNumber} of ${station.stopCount}`;
  const masteredAtStop = station.masteredCount ?? 0;
  const phrasesAtStop = station.phraseCount ?? 0;
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
        "relative min-w-0 rounded-lg px-3 py-2 transition-colors",
        isCurrent ? "border pt-3 depth-shadow" : "group-hover:bg-accent",
      )}
      style={
        isCurrent
          ? { borderColor: color, background: "var(--station-surface)" }
          : undefined
      }
    >
      {/* Station-signboard family marker: full-width accent bar on the
          active card, a short quiet tick on every other stop so the whole
          line reads as one system while the active card dominates. */}
      {isCurrent ? (
        <div
          className="absolute inset-x-0 top-0 h-1.5 rounded-t-lg"
          style={{ background: color }}
          aria-hidden
        />
      ) : (
        <div
          className="absolute left-3 top-0 h-1 w-7 rounded-b"
          style={{
            background: accessible ? color : "hsl(var(--border))",
            opacity: 0.55,
          }}
          aria-hidden
        />
      )}
      {/* "Now boarding" accent pulse: an opacity-only glow overlay so the
          animated property stays within the transforms/opacity budget. */}
      {isCurrent && !reduceMotion && (
        <div
          className="pointer-events-none absolute -inset-px rounded-lg animate-stop-glow-pulse"
          style={{ boxShadow: `0 0 0 3px ${color}, 0 0 16px 4px ${color}88` }}
          aria-hidden
        />
      )}
      <div className="flex items-center gap-2 flex-wrap">
        {isCurrent && <StationSignGlyph color={color} />}
        <span
          className={cn(
            "text-sm font-semibold",
            accessible ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {stopLabel}
        </span>
        {/* Entitlement chip only where the server actually serves the stop
            plan-locked — on stops the caller can ride free (Hindi Zone 1
            carve-out) or already owns (Plus/Family), the badge is noise. */}
        {station.stage === "sentence" && station.planLocked === true && (
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
        {/* Plan-locked stops serve a plan-visible count of zero, so the count
            segment is omitted there: "Locked" plus the lock icon only.
            Progression-locked stops keep their real counts. */}
        {!station.attemptedCount &&
          station.planLocked !== true &&
          ` · ${station.phraseCount} phrases`}
        {isCurrent && " · Bolo is waiting here"}
      </div>
      {/* Progress as a small filled track once the stop has attempts; the
          fraction stays as a label. Quiet palette off the active card. */}
      {station.attemptedCount ? (
        <div className="mt-1 flex items-center gap-1.5">
          <div
            className="h-1.5 w-20 max-w-full overflow-hidden rounded-full"
            style={{ background: accessible ? `${color}26` : "hsl(var(--muted))" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${
                  phrasesAtStop > 0
                    ? Math.round((masteredAtStop / phrasesAtStop) * 100)
                    : 0
                }%`,
                background: accessible ? color : "hsl(var(--muted-foreground))",
              }}
              data-testid={`progress-stop-${station.stopNumber}`}
            />
          </div>
          <span
            className={cn("text-[10px] font-bold", !isCurrent && "text-muted-foreground")}
            style={isCurrent ? { color } : undefined}
          >
            {masteredAtStop}/{phrasesAtStop} mastered
          </span>
          {/* All-top-band gold stamp: shown when POLISH_ENABLED is on and every
              phrase in the stop has reached Perfect or Great. */}
          {polishEnabled && station.allTopBand && (
            <Star
              className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0"
              aria-label="All phrases top band"
            />
          )}
        </div>
      ) : null}
    </div>
  );
  const body = (
    <>
      {/* Periodic celebratory hop at the active stop: the Mascot component's
          "cheer" idle is whole-image motion on the canonical PNG and already
          collapses to static under reduced motion. */}
      {side === "left" && isCurrent && (
        <span className="relative shrink-0">
          {/* Shared ground-contact shadow (Task 985): sits under the canonical
              mascot PNG, which itself stays untouched. */}
          <span className="ground-contact-shadow" aria-hidden />
          <Mascot pose="cheer" idle="cheer" size={44} className="shrink-0" />
        </span>
      )}
      {card}
      {side === "right" && isCurrent && (
        <span className="relative shrink-0">
          <span className="ground-contact-shadow" aria-hidden />
          <Mascot pose="cheer" idle="cheer" size={44} className="shrink-0" />
        </span>
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
      <Link href={href} aria-label={aria} className={rowClass} onClick={blessAudioPlayback}>
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
      {/* Rail-bed thickness (Task 985): the tie band repeated once in ink,
          offset down by the shared depth step, so every sleeper shows an
          underside edge and the track reads as a raised bed. Same `d` and
          dash rhythm — the rail geometry the comet samples is untouched. */}
      <path
        d={d}
        transform={`translate(0 ${DEPTH_2_5D.railBedDy})`}
        stroke="#0f172a"
        strokeWidth={15}
        strokeDasharray="3 11"
        opacity={DEPTH_2_5D.railBedOpacity}
        fill="none"
      />
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

/** Chunk 6B Story 3: a trackside signal seated in the gap after an odd
 *  global stop. State derives from progress + wave/clear memory each render. */
type SignalSpot = {
  /** Gap number N (signal sits after global stop N); contextRef is gap-N. */
  gap: number;
  signalIndex: number;
  x: number;
  y: number;
  zoneIndex: number;
  zoneId: number;
  state: "upcoming" | "active" | "waved" | "cleared";
  /** Hotfix 3S Item 4: first-clear Chai served by the zone payload — the
   *  reward chip renders THIS value, never a hardcoded number. */
  rewardChai: number;
  /** Rotation pick for this signal; null means auto-wave (roster empty). */
  game: QuickGameDef | null;
  /** True when the pulse run is held at this signal (train stopped). */
  held: boolean;
};

/** Prod hotfix Item 3 (owner-ruled soft stop): reaching a held signal (the
 *  active signal in the gap right behind the boardable stop) auto-opens the
 *  encounter dialog once per signal per session. Never over an open dialog
 *  or a pending zone closeout; waved and cleared signals are never held, so
 *  they never qualify. Renders nothing. */
function SignalSoftStop({
  sig,
  dialogOpen,
  closeoutPending,
  lang,
  onOpen,
}: {
  sig: SignalSpot | null;
  dialogOpen: boolean;
  closeoutPending: boolean;
  lang: string;
  onOpen: (sig: SignalSpot) => void;
}) {
  const gap = sig?.gap;
  useEffect(() => {
    if (!sig || gap === undefined || dialogOpen || closeoutPending) return;
    if (isSignalStopSeen(lang, gap)) return;
    markSignalStopSeen(lang, gap);
    onOpen(sig);
    // The signal object is re-derived every render; keying on the gap (plus
    // the suppressors) keeps this one-shot per arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gap, dialogOpen, closeoutPending, lang]);
  return null;
}

export default function Journey() {
  const { activeLang, activeLanguage } = useLanguage();
  const line = getJourneyLine(activeLang);
  const [lock, setLock] = useState<LockInfo | null>(null);
  // Chunk 6B: trackside signal encounter + signpost fact dialogs. signalTick
  // only forces a re-render after a wave so states re-derive from storage.
  const [signalDlg, setSignalDlg] = useState<SignalSpot | null>(null);
  const [factDlg, setFactDlg] = useState<{ geoName: string; fact: string } | null>(null);
  const [signalTick, setSignalTick] = useState(0);
  const { ref: mapRef, w: mapW } = useMapWidth();
  const reduceMotion = useReducedMotion();

  // Task 985: light scroll parallax on the scenery layer — ONE scroll-linked
  // transform on the scenery group, so it drifts slightly slower than the
  // rail and reads as sitting behind it. Page scrolling is window scroll
  // (sticky header, no overflow container), so the listener binds to window.
  // Entirely absent under reduced motion. The ref is read lazily inside the
  // handlers because the map SVG mounts after the loading state clears.
  const sceneryLayerRef = useRef<SVGGElement | null>(null);
  useEffect(() => {
    if (reduceMotion) {
      sceneryLayerRef.current?.removeAttribute("transform");
      return;
    }
    let raf = 0;
    const apply = () => {
      raf = 0;
      sceneryLayerRef.current?.setAttribute(
        "transform",
        `translate(0 ${(window.scrollY * DEPTH_2_5D.parallaxFactor).toFixed(1)})`,
      );
    };
    const onScroll = () => {
      if (raf === 0) raf = requestAnimationFrame(apply);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, [reduceMotion]);

  // One language's map never fetches another language's data (behavior 9):
  // exactly six fixed zone queries for the active language.
  const categoriesQuery = useListCategories({ lang: activeLang });
  // Zone conversation stamps: lightweight list of zones where the learner
  // has already completed the capstone chat. Used to show "Replay the chat".
  const stampsQuery = useListZoneStamps({ lang: activeLang });
  const q1 = useListCategoryLessonGroups(JOURNEY_ZONES[0].id, activeLang);
  const q2 = useListCategoryLessonGroups(JOURNEY_ZONES[1].id, activeLang);
  const q3 = useListCategoryLessonGroups(JOURNEY_ZONES[2].id, activeLang);
  const q4 = useListCategoryLessonGroups(JOURNEY_ZONES[3].id, activeLang);
  const q5 = useListCategoryLessonGroups(JOURNEY_ZONES[4].id, activeLang);
  const q6 = useListCategoryLessonGroups(JOURNEY_ZONES[5].id, activeLang);
  const zoneQueries = [q1, q2, q3, q4, q5, q6];
  // Hotfix 3S Item 1: waves persist server-side; the sessionStorage mark stays
  // as the optimistic cache so the gate lifts instantly even if the POST is
  // still in flight (or fails — the server catches up on the next wave).
  const recordSignalWave = useRecordSignalWave();

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

  // Task #906: zone display titles come from the categories listing the map
  // already fetches, so a server-side rename shows up here without a client
  // release. The JOURNEY_ZONES table keeps the id joins authoritative and its
  // hardcoded titles serve only as the loading-state fallback (the old
  // title-mismatch hard stop is gone; ids alone define the mapping).
  const categories = categoriesQuery.data;
  // Polish feature flag: read from any category item (all carry the same value).
  const polishEnabled = categories?.some(c => c.polishEnabled) ?? false;
  // Zone conversation stamps: set of zoneIndex values that the learner has
  // already completed (capstone chat done). Stamp list is fetched in the
  // background and used to show "Replay the chat" vs "Chat with Bolo".
  const stampedZoneIndices = new Set(stampsQuery.data?.map(s => s.zoneIndex) ?? []);

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
    const zoneAllDone =
      stations.length > 0 &&
      stations.every(s => s.status === "completed" || s.status === "tested_out");
    return {
      ...z,
      title: categories?.find((c) => c.id === z.id)?.title ?? z.title,
      geoName: line.zones[i]!,
      stations,
      zoneAllDone,
    };
  });

  const allStations = zones.flatMap((z) => z.stations);
  const doneCount = allStations.filter(
    (s) => s.status === "completed" || s.status === "tested_out",
  ).length;
  const totalCount = allStations.length;
  const currentId = allStations.find(
    (s) => s.status === "unlocked" || s.status === "in_progress",
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
      // Free-tier content policy: a plan-gated sentence stop arrives
      // status "locked" (planLocked) from the server, so unlocked means lit.
      const lit =
        s.status === "completed" ||
        s.status === "tested_out" ||
        s.status === "in_progress" ||
        s.status === "unlocked";
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

  // Task #917: directional pulse on the active run. The run is the rail path
  // from the current stop to the NEXT STATION in path order; at a zone
  // boundary that spans two segments (station to postcard, postcard to
  // station) and the dot sequence stays continuous across the seam. No next
  // station (current stop is the final station, journey complete, or showroom
  // with no boardable stop) means no dots, and the terminus never counts as a
  // next stop, so nothing ever pulses toward it.
  const currentPtIdx =
    currentId != null
      ? pts.findIndex((p) => p.kind === "station" && p.station!.id === currentId)
      : -1;
  let nextPtIdx = -1;
  for (let i = currentPtIdx + 1; currentPtIdx !== -1 && i < pts.length; i++) {
    if (pts[i]!.kind === "station") {
      nextPtIdx = i;
      break;
    }
  }
  // Accent dots sampled directly on the rail beziers (same control points the
  // segment `d` strings use), ordered current stop first. The per-dot delay
  // fraction grows along that order, so the CSS opacity wave always travels
  // toward the next stop, on every serpentine orientation. Reduced motion
  // renders no dots at all (the CSS base frame is opacity 0 as backstop).
  const pulseDots: { x: number; y: number }[] = [];
  if (!reduceMotion && currentPtIdx !== -1 && nextPtIdx !== -1) {
    for (let i = currentPtIdx; i < nextPtIdx; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const dy = (b.y - a.y) / 2;
      const c1 = { x: a.x, y: a.y + dy };
      const c2 = { x: b.x, y: b.y - dy };
      for (let s = 0; s < RAIL_PULSE.dotsPerSegment; s++) {
        // Sample midpoints of equal t slices: stays off both endpoints, so no
        // dot hides under a station marker or the interchange diamond.
        const t = (s + 0.5) / RAIL_PULSE.dotsPerSegment;
        const u = 1 - t;
        pulseDots.push({
          x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
          y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
        });
      }
    }
  }

  // --- Chunk 6B Story 3: trackside signals seated in the gaps after odd
  // global stops (gap-N sits after global stop N, 1-based; contextRef gap-N).
  // Hotfix 3 item 2: each crossing renders at the DEPARTURE EDGE of its
  // preceding stop (visually adjacent, just past it), nudged to the opposite
  // side of that stop's label card, instead of floating mid-gap. VISUAL ONLY:
  // the gap-N seating data and contextRefs are untouched. Showroom zones get
  // no interactive signals. States re-derive from storage on every render;
  // signalTick only forces that re-render after a wave.
  void signalTick;
  const stationPts = pts.filter((p) => p.kind === "station");
  const visibleCountForZone = (zoneId: number) =>
    categories?.find((c) => c.id === zoneId)?.phraseCount ?? 0;
  // 0-based index of the boardable stop; the gap right behind it is gap-N
  // with N === that index (N previous stops are done).
  const currentGlobalIdx =
    currentId != null ? allStations.findIndex((s) => s.id === currentId) : -1;
  const signals: SignalSpot[] = showroom
    ? []
    : planTracksideSignals(totalCount).flatMap(({ afterStop, signalIndex }) => {
        const a = stationPts[afterStop - 1];
        if (!a) return [];
        const station = a.station!;
        const zone = zones[station.zoneIndex]!;
        // Station label cards alternate right/left by render order (k2 % 2),
        // so the crossing takes the opposite flank of its preceding stop,
        // just past it in the travel direction (the serpentine flows down).
        const cardSide = (afterStop - 1) % 2 === 0 ? "right" : "left";
        const x = Math.min(
          mapW - 20,
          Math.max(20, a.x + (cardSide === "right" ? -30 : 30)),
        );
        const stopDone = station.status === "completed" || station.status === "tested_out";
        // Hotfix 3S Item 2: server truth first (ledger-backed clears, persisted
        // waves from the zone payload), local storage second as an optimistic
        // cache for marks the server hasn't confirmed yet. Cleared is checked
        // before waved on both sides, so a later clear supersedes a wave.
        const zoneSignals = zoneQueries[station.zoneIndex]?.data?.signals;
        const gapRef = `gap-${afterStop}`;
        const state: SignalSpot["state"] =
          zoneSignals?.clears.includes(gapRef) || isSignalCleared(activeLang, afterStop)
            ? "cleared"
            : zoneSignals?.waves.includes(gapRef) || isSignalWaved(activeLang, afterStop)
              ? "waved"
              : stopDone
                ? "active"
                : "upcoming";
        return [
          {
            gap: afterStop,
            signalIndex,
            x,
            y: a.y + 30,
            zoneIndex: station.zoneIndex,
            zoneId: zone.id,
            state,
            rewardChai: zoneSignals?.rewardChai ?? 1,
            game: gameForSignal(signalIndex, visibleCountForZone(zone.id)),
            held: state === "active" && afterStop === currentGlobalIdx,
          },
        ];
      });
  // "The train stops at the signal": an active signal in the gap right behind
  // the boardable stop halts the pulse run (a visual hold, never a forced
  // modal); the held signal pulses instead.
  if (signals.some((s) => s.held)) pulseDots.length = 0;

  // --- Chunk 6B Story 5: one tappable signpost per zone, seated on a station
  // row the zone's scenery plan left free, on the marker's side of the track.
  const signposts = zones.flatMap((zone, zi) => {
    const zonePts = pts.filter((p) => p.kind === "station" && p.station!.zoneIndex === zi);
    const spot = planZoneSignpost(zi, zonePts.length);
    if (!spot) return [];
    const p = zonePts[spot.row];
    if (!p) return [];
    const zoneAccessible = zone.stations.some(
      (s) => isStatusAccessible(s.status) || s.teaserStation,
    );
    return [
      {
        zoneIndex: zi,
        geoName: zone.geoName,
        x: p.x < mapW / 2 ? SCENERY_PLACEMENT.edgeX : mapW - SCENERY_PLACEMENT.edgeX,
        y: p.y + SCENERY_PLACEMENT.groundDy,
        grayed: showroom && !zoneAccessible,
      },
    ];
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
                    // R1 amendment: derive the stamp from the slot so label +
                    // circle scale as one unit (76px slot - 16px px-2 padding
                    // - 8px rotated-extent margin).
                    size={stampSizeForExtent(52)}
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
              {/* India-flavored trackside scenery (Task 985): zone-themed
                  dimensional flat scenes in the free strip beside station
                  rows, anchored to the same serpentine geometry the stations
                  use. Painted FIRST so the whole layer sits below the rail
                  (depth order: scenery < rail < stations). The group carries
                  the single scroll-linked parallax transform. */}
              <g data-testid="journey-scenery-layer" ref={sceneryLayerRef}>
                {zones.map((zone, zi) => {
                  const zonePts = pts.filter(
                    (p) => p.kind === "station" && p.station!.zoneIndex === zi,
                  );
                  const zoneAccessible = zone.stations.some(
                    (st) => isStatusAccessible(st.status) || st.teaserStation,
                  );
                  return planZoneScenery(zi, zonePts.length).map(({ kind, row }, i) => {
                    const p = zonePts[row]!;
                    return (
                      <SceneryElement
                        key={`${zone.id}-${i}`}
                        kind={kind}
                        x={
                          p.x < mapW / 2
                            ? SCENERY_PLACEMENT.edgeX
                            : mapW - SCENERY_PLACEMENT.edgeX
                        }
                        y={p.y + SCENERY_PLACEMENT.groundDy}
                        accent={line.accent}
                        gray={showroom && !zoneAccessible}
                      />
                    );
                  });
                })}
              </g>
              <g data-testid="journey-rail-layer">
                {segs.map((s, i) => (
                  <RailSegment key={i} d={s.d} lit={s.lit} accent={line.accent} />
                ))}
              </g>
              {/* Task #917 / #973: comet sweep on the active run. Delay
                  fraction grows with sample order (current stop to next), and
                  the sharp-attack / slow-decay keyframes light one bright head
                  with a fading tail that travels toward the next stop. The
                  inline color feeds the currentColor drop-shadow glow. Absent
                  entirely under reduced motion or when there is no next
                  station. */}
              {pulseDots.map((p, i) => (
                <circle
                  key={`pulse-${i}`}
                  className="rail-pulse-dot"
                  data-testid="rail-pulse-dot"
                  cx={p.x}
                  cy={p.y}
                  r={RAIL_PULSE.dotRadius}
                  fill={line.accent}
                  style={
                    {
                      "--rail-pulse-delay": (i / pulseDots.length).toFixed(4),
                      color: line.accent,
                    } as React.CSSProperties
                  }
                />
              ))}
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
              // Zone gate-lock (Chunk 4B, owner-corrected): every stop locked
              // by progression, none by plan, and the listing is NOT a
              // showroom payload (no top-level access field). Showroom forces
              // every station locked with planLocked unset, so without the
              // access check the affordance would render for teaser and
              // exhausted callers; they keep the postcard's existing behavior
              // unchanged. Pre-flip the first stop of every zone is unlocked,
              // so this stays dormant until CROSS_ZONE_GATE_ENABLED flips
              // server-side.
              const zoneGateLocked =
                access === null &&
                zone.stations.length > 0 &&
                zone.stations.every((s) => s.status === "locked") &&
                !zone.stations.some((s) => s.planLocked === true);
              return (
                <div key={zone.id}>
                  {/* Prod hotfix Item 1: this full-width wrapper paints at
                      z-index 8, above the z-index 6 signal buttons, and was
                      swallowing taps on every zone-boundary gap signal. The
                      wrapper now passes events through; the postcard itself
                      re-enables them (it holds the zone test-out link). */}
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      left: 16,
                      right: 16,
                      top: py + 10,
                      zIndex: DEPTH_2_5D.layers.postcard,
                    }}
                  >
                    <ZonePostcard
                      zoneIndex={zoneIndex}
                      zoneTitle={zone.title}
                      geoName={zone.geoName}
                      accent={line.accent}
                      stationCount={zone.stations.length}
                      grayed={grayed}
                      zoneAllDone={zone.zoneAllDone}
                      scenarioId={scenarioIdForZone(zoneIndex)}
                      hasStamp={stampedZoneIndices.has(zoneIndex)}
                      testOutHref={
                        zoneGateLocked
                          ? `/practice/${zone.id}?mode=testout&scope=zone`
                          : undefined
                      }
                      facts={factRotationForZone({
                        zoneIndex,
                        geoName: zone.geoName,
                        lineName: line.lineName,
                        salt: 1,
                      })}
                    />
                  </div>
                  {/* interchange diamond pinned where the track meets the zone
                      card (top border) so it never collides with the card text */}
                  <div
                    className="absolute w-4 h-4 border-4 border-white pointer-events-none"
                    style={{
                      left: pt.x,
                      top: py + 10,
                      transform: "translate(-50%, -50%) rotate(45deg)",
                      background: diamondColor,
                      boxShadow: `0 0 0 2px ${diamondColor}, var(--depth-shadow)`,
                      zIndex: DEPTH_2_5D.layers.postcard,
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
                // Free-tier content policy: sentence stops gate by the
                // server's planLocked flag (all-premium groups), not by
                // stage — Hindi Fare Zone 1's sentence stops serve free. A
                // planLocked sentence stop keeps the first-class upsell.
                const sentenceGated =
                  s.stage === "sentence" && s.planLocked === true;
                const accessible = isStatusAccessible(s.status) && !sentenceGated;
                return (
                  <div key={s.id}>
                    <div
                      className="absolute flex items-center justify-center pointer-events-none"
                      style={{
                        left: p.x,
                        top: p.y,
                        transform: "translate(-50%, -50%)",
                        zIndex:
                          s.id === currentId
                            ? DEPTH_2_5D.layers.train
                            : DEPTH_2_5D.layers.station,
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
                        zIndex: DEPTH_2_5D.layers.stationCard,
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
                                : s.planLocked === true
                                  ? "plan"
                                  : "progression",
                            stopLabel: `${stopLabel} · ${zone.geoName}`,
                            zoneTitle: zone.title,
                            zoneId: zone.id,
                            groupId: s.id,
                          })
                        }
                        side={side}
                        polishEnabled={polishEnabled}
                      />
                      {/* Polish pill: flag-gated secondary CTA below the station
                          card for completed/tested-out stops where not every
                          phrase has reached top band. Renders outside the
                          StationCard link to avoid nested interactive elements. */}
                      {polishEnabled &&
                        (s.status === "completed" || s.status === "tested_out") &&
                        !s.allTopBand && (
                          <Link
                            href={`/practice/${zone.id}?group=${s.id}&polish=1`}
                            onClick={blessAudioPlayback}
                            className="mt-0.5 flex w-full items-center justify-center rounded-lg border border-border py-1 text-[10px] font-bold text-primary transition-colors hover:bg-accent"
                          >
                            Polish phrases
                          </Link>
                        )}
                    </div>
                  </div>
                );
              })}

            {/* Chunk 6B: trackside signals (HTML buttons; the SVG scenery
                layer is pointer-events-none, so these stay tappable) */}
            {signals.map((sig) => (
              <button
                key={`signal-${sig.gap}`}
                type="button"
                disabled={sig.state === "upcoming"}
                data-testid={`trackside-signal-${sig.gap}`}
                data-state={sig.state}
                aria-label={`Trackside signal after stop ${sig.gap}`}
                onClick={() => {
                  // A manual open counts as the session's soft stop too, so
                  // closing it never triggers an auto reopen (Item 3).
                  markSignalStopSeen(activeLang, sig.gap);
                  setSignalDlg(sig);
                }}
                className={cn(
                  // p-2 on the 32x40 glyph keeps the hit target at 48x56
                  // (44px minimum, Item 1); every active signal carries the
                  // attention pulse, motion-safe only. RED FUTURE renders
                  // full color, non-tappable, with no dead-feeling cursor
                  // affordance (STATE MODEL).
                  "absolute -translate-x-1/2 -translate-y-1/2 rounded-lg p-2 transition-transform",
                  sig.state === "upcoming" ? "cursor-default" : "active:scale-95",
                  sig.state === "active" && "motion-safe:animate-pulse",
                )}
                // Item 1: sit ABOVE the postcard layer. The residual tap
                // occluder was the ZonePostcard's own pointer-events-auto
                // card (z8) recapturing the taps its pass-through wrapper
                // released, wherever the card overlapped a signal.
                style={{ left: sig.x, top: sig.y, zIndex: DEPTH_2_5D.layers.postcard + 1 }}
              >
                <SignalGlyph state={sig.state} />
              </button>
            ))}

            {/* Chunk 6B: zone signposts opening a daily line fact */}
            {signposts.map((sp) => (
              <button
                key={`signpost-${sp.zoneIndex}`}
                type="button"
                data-testid={`zone-signpost-${sp.zoneIndex}`}
                aria-label={`Line facts for ${sp.geoName}`}
                onClick={() =>
                  setFactDlg({
                    geoName: sp.geoName,
                    fact: factForZone({
                      zoneIndex: sp.zoneIndex,
                      geoName: sp.geoName,
                      lineName: line.lineName,
                      salt: 2,
                    }),
                  })
                }
                className={cn(
                  // p-2 lifts the hit target to 46x54 (Item 1).
                  "absolute -translate-x-1/2 -translate-y-full rounded-lg p-2 active:scale-95 transition-transform",
                  sp.grayed && "grayscale opacity-70",
                )}
                style={{ left: sp.x, top: sp.y, zIndex: DEPTH_2_5D.layers.station }}
              >
                <SignpostGlyph accent={sp.grayed ? GRAY : line.accent} />
              </button>
            ))}

            {/* terminus */}
            <div
              className="absolute w-6 h-6 rounded-full border-4 border-white"
              style={{
                left: termX,
                top: termY,
                transform: "translate(-50%, -50%)",
                background: allDone ? line.accent : GRAY,
                boxShadow: `0 0 0 2px ${allDone ? line.accent : GRAY}, var(--depth-shadow)`,
                zIndex: DEPTH_2_5D.layers.station,
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
                  {lock.stopLabel}: finish the stop before this one to board here.
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
              {/* Express test-out: five sampled phrases, one take each, judged
                  server-side (0.8 pass ratio). Quiet secondary action so the
                  default path stays "finish the stop before it". */}
              {lock.zoneId !== undefined && lock.groupId !== undefined && (
                <Link
                  href={`/practice/${lock.zoneId}?group=${lock.groupId}&mode=testout`}
                  onClick={() => { blessAudioPlayback(); setLock(null); }}
                  data-testid="link-test-out"
                  className="flex w-full items-center justify-center rounded-xl border-2 border-border bg-white px-4 py-3 text-sm font-bold text-foreground active:scale-[0.98] transition-transform"
                >
                  Test out of this stop
                </Link>
              )}
              {/* Zone-level express (Chunk 4B): one sampled phrase from each
                  stop in the zone, judged in one shot by the zone endpoint.
                  Same quiet secondary styling, below the stop-level action. */}
              {lock.zoneId !== undefined && (
                <Link
                  href={`/practice/${lock.zoneId}?mode=testout&scope=zone`}
                  onClick={() => { blessAudioPlayback(); setLock(null); }}
                  data-testid="link-test-out-zone"
                  className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-border bg-white px-4 py-3 active:scale-[0.98] transition-transform"
                >
                  <span className="text-sm font-bold text-foreground">Test out of this whole zone</span>
                  <span className="mt-0.5 text-xs font-medium text-muted-foreground">One phrase from each stop. Pass to unlock everything here.</span>
                </Link>
              )}
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
          {lock?.kind === "plan" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Lock className="w-4 h-4" aria-hidden />
                  This stop is All-Access territory
                </DialogTitle>
                <DialogDescription>
                  {lock.stopLabel}: every phrase at this stop is part of the
                  extended library. Unlock All-Access to keep riding the{" "}
                  {line.lineName}.
                </DialogDescription>
              </DialogHeader>
              <Link
                href={upgradeHref({ plan: "plus" })}
                onClick={() => setLock(null)}
                data-testid="link-plan-lock-upgrade"
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
          {/* No manual close button here: DialogContent renders its own X
              top-right, and a second one stacked on it (the defect this
              replaced) reads as a rendering glitch. */}
        </DialogContent>
      </Dialog>

      {/* Chunk 6B Story 3: signal encounter. Never a forced modal: it only
          opens from a tap, and waving through is always available. */}
      <Dialog open={signalDlg !== null} onOpenChange={(open) => !open && setSignalDlg(null)}>
        <DialogContent className="max-w-sm rounded-3xl">
          {signalDlg && signalDlg.game === null && (
            <>
              <DialogHeader>
                <DialogTitle>Green flag!</DialogTitle>
                <DialogDescription data-testid="signal-autowave-quip">
                  Not enough phrases here for a game yet. Green flag, straight through!
                </DialogDescription>
              </DialogHeader>
              <button
                type="button"
                data-testid="signal-carry-on"
                onClick={() => {
                  markSignalWaved(activeLang, signalDlg.gap);
                  // Hotfix 3S Item 1: persist the auto-wave too (idempotent);
                  // local mark above is the optimistic cache.
                  recordSignalWave.mutate({
                    data: {
                      languageCode: activeLang,
                      categoryId: signalDlg.zoneId,
                      gap: signalDlg.gap,
                    },
                  });
                  setSignalTick((t) => t + 1);
                  setSignalDlg(null);
                }}
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground active:scale-[0.98] transition-transform"
              >
                Carry on
              </button>
            </>
          )}
          {signalDlg && signalDlg.game !== null && (
            <>
              {/* Hotfix 3 item 3: compact scene header from existing art
                  only, the TrainEngine pulling up to the crossing glyph. */}
              <div
                aria-hidden
                data-testid="signal-scene"
                className="flex items-end gap-2 rounded-2xl bg-muted/60 px-4 pb-2 pt-4"
              >
                <TrainEngine className="w-16 shrink-0" />
                <div className="mb-1 flex-1 border-b-2 border-dashed border-border" />
                {/* Hotfix 3S Item 5: the Signalman himself steps out beside
                    his crossing. Decorative; the scene is aria-hidden. */}
                <SignalmanGlyph className="shrink-0" />
                <SignalGlyph
                  state={
                    signalDlg.state === "cleared"
                      ? "cleared"
                      : signalDlg.state === "waved"
                        ? "waved"
                        : "active"
                  }
                />
              </div>
              <DialogHeader>
                <DialogTitle>
                  {signalDlg.state === "cleared" ? "Signal already cleared" : "Signal ahead"}
                </DialogTitle>
                <DialogDescription>
                  {signalDlg.state === "cleared"
                    ? `You cleared this signal and pocketed the Chai. Fancy another round of ${signalDlg.game.title}?`
                    : signalDlg.state === "waved"
                      ? "The gate is up for you, and the signalman kept your Chai. Clear the signal whenever you like."
                      : "The crossing gate is down and the signalman steps out. Clear the signal with a quick game, or wave and roll on."}
                </DialogDescription>
              </DialogHeader>
              {/* Item 3 reward chip: what clearing pays, shown BEFORE playing,
                  and ONLY while the first-clear grant is unclaimed (red active
                  and yellow reopen). A green replay never promises Chai. */}
              {signalDlg.state !== "cleared" && (
                <div
                  data-testid="signal-chai-chip"
                  className="mx-auto flex w-fit items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-extrabold text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                >
                  <Coffee className="h-3.5 w-3.5" />
                  {/* Hotfix 3S Item 4: served value from the zone payload,
                      never a hardcoded amount. */}
                  +{signalDlg.rewardChai} Chai
                </div>
              )}
              <Link
                href={`/games/${signalDlg.game.id}?cat=${signalDlg.zoneId}&ctx=signal&gap=${signalDlg.gap}`}
                onClick={() => {
                  blessAudioPlayback();
                  setSignalDlg(null);
                }}
                data-testid="signal-play-game"
                className="flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground active:scale-[0.98] transition-transform"
              >
                Play {signalDlg.game.title}
              </Link>
              <p
                data-testid="signal-game-blurb"
                className="text-center text-xs font-medium text-muted-foreground"
              >
                {GAME_BLURBS[signalDlg.game.id]}
              </p>
              {signalDlg.state !== "cleared" && (
                <button
                  type="button"
                  data-testid="signal-wave-through"
                  onClick={() => {
                    markSignalWaved(activeLang, signalDlg.gap);
                    // Hotfix 3S Item 1: persist the wave server-side so the
                    // gate-up state survives devices; the local mark above is
                    // the optimistic cache (idempotent replays are no-ops).
                    recordSignalWave.mutate({
                      data: {
                        languageCode: activeLang,
                        categoryId: signalDlg.zoneId,
                        gap: signalDlg.gap,
                      },
                    });
                    setSignalTick((t) => t + 1);
                    setSignalDlg(null);
                    // Item 4: skip receipt, never-shamed voice, and the open
                    // invitation to come back for the unclaimed Chai.
                    toast({
                      description:
                        "Waved through. The signalman kept your Chai warm, come back anytime.",
                    });
                  }}
                  className="w-full rounded-xl border-2 border-border bg-white px-4 py-3 text-sm font-bold text-foreground active:scale-[0.98] transition-transform"
                >
                  Wave me through
                </button>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Chunk 6B Story 5: signpost fact dialog */}
      <Dialog open={factDlg !== null} onOpenChange={(open) => !open && setFactDlg(null)}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle>Trackside signpost · {factDlg?.geoName}</DialogTitle>
            <DialogDescription data-testid="signpost-fact">{factDlg?.fact}</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      {/* Chunk 6B Story 4: zone closeout celebration (client-detected, never
          gating). Showroom callers have no live progress to close out. */}
      {!showroom && (
        <>
          <SignalSoftStop
            sig={signals.find((s) => s.held) ?? null}
            dialogOpen={lock !== null || signalDlg !== null || factDlg !== null}
            closeoutPending={
              closeoutStateUnseeded(activeLang) ||
              zones.some(
                (z, zi) =>
                  z.zoneAllDone === true &&
                  readCloseoutStages(activeLang)[zi] !== "done",
              )
            }
            lang={activeLang}
            onOpen={setSignalDlg}
          />
          <ZoneCloseoutOverlay
            lang={activeLang}
            lineName={line.lineName}
            accent={line.accent}
            zones={zones.map((z, zi) => ({
              zoneIndex: zi,
              zoneId: z.id,
              geoName: z.geoName,
              title: z.title,
              allDone: z.zoneAllDone,
              scenarioId: scenarioIdForZone(zi),
              hasStamp: stampedZoneIndices.has(zi),
            }))}
          />
        </>
      )}
    </div>
  );
}
