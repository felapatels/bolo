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
import { Link, useLocation } from "wouter";
import { blessAudioPlayback } from "@/lib/iosAudio";
import { playStopSplash } from "@/lib/stop-splash";
import {
  ZONE_BACKDROP_SCRIM,
  ZONE_BOARD,
  ZONE_BOARD_ART,
  zoneBackdrop,
  zoneFootTone,
} from "@/lib/zone-backdrops";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  useGetTokens,
  useListCategories,
  useListCategoryLessonGroups,
  useListZoneStamps,
  useListScenarios,
  useRecordSignalWave,
  useUnlockStop,
  type LessonGroupList,
  type LessonGroupSummary,
} from "@workspace/api-client-react";
import { ArrowLeft, BookOpen, Check, ChevronDown, Lock, PenLine, Sparkles, Star } from "lucide-react";
import { ChaiGlyph } from "@/components/chai-stall";
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
import { useEntitlements } from "@/lib/entitlements";
import { LessonErrorScreen } from "@/components/lesson-states";
import { UpgradeScreen } from "@/components/plus";
import {
  asUpgradeRequired,
  upgradeHref,
  upgradeHrefForDenial,
} from "@/lib/entitlements";
import { JOURNEY_ZONES, getJourneyLine } from "@/lib/journeyLines";
import {
  traceStopCopy,
  traceStopFor,
  traceStopIndexIn,
  traceStopPassedCount,
  traceStopStatus,
  type TraceStop,
} from "@workspace/script-trace";
import {
  hasEmergency,
  EMERGENCY_AFTER_STOP,
  EMERGENCY_JOURNEY,
} from "@workspace/emergency";
import {
  isStoryTeaserBook,
  storyBookFor,
  storyStopIndexIn,
  type StoryBook,
} from "@workspace/story";
import { useTraceStopProgress } from "@/lib/useTraceStopProgress";
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
  planChachaStalls,
  planZoneScenery,
  planZoneSignpost,
  STALL_PLACEMENT,
} from "@/components/journey-scenery";
import { factForZone, factRotationForZone } from "@/lib/india-facts";
import { FIRST_CLASS_GOLD_VARS as firstClassGoldVars } from "@/lib/india-palette";
import { toast } from "@/hooks/use-toast";
import {
  closeoutStateUnseeded,
  gameForSignal,
  isChachaEncounterStation,
  isChachaStopSeen,
  isSignalCleared,
  isSignalStopSeen,
  isSignalWaved,
  markChachaStopSeen,
  markSignalStopSeen,
  markSignalWaved,
  readCloseoutStages,
  type QuickGameDef,
  type QuickGameId,
} from "@/lib/quick-games";
import {
  MEDALLION,
  stopEmblem,
  type StopEmblemKind,
} from "@/lib/stop-emblems";
import { RAIL, RAIL_GLOW_PASSES, RAIL_STROKE } from "@/lib/rail-palette";
import {
  BADGE,
  MAP_GLYPH_PLATE,
  MAP_GLYPH_PLATE_FILL,
} from "@/lib/ticket-stock";
import {
  INTRO_SCROLL,
  introScrollDurationMs,
  introScrollEase,
  introScrollLead,
} from "@/lib/journey-intro-scroll";
import { ZoneCloseoutOverlay } from "@/components/zone-closeout";
import { ChachaEncounterDialog } from "@/components/chacha-encounter";

const GRAY = "#9ca3af"; // rail/marker color for locked showroom zones

// Serpentine layout rhythm (approved "pronounced" treatment). The map column
// is mobile-width (max 390px) and centers inside the page's max-w-2xl on
// desktop — no separate desktop composition.
const MAP_MAX_W = 390;
// Task 1082 item 2: the station card was slimmed (tighter padding and line
// spacing, and the "Bolo is waiting here" fragment gone, which used to wrap
// the current stop's status onto a second line), so the slot that holds it
// comes down with it. Chacha-ji's stall is unaffected: it is seated in its own
// halt row off the halt point, not off a station row.
const STATION_H = 88; // vertical rhythm per station row
/** A folded zone's whole station block, in place of N * STATION_H. */
const COLLAPSED_H = 56;
const PC_H = 184; // vertical rhythm per fare-zone postcard (incl. picture side + fact strip)
const TERM_H = 92; // terminus row
// Chacha-ji's halt: a scenery-only row inserted after every encounter station
// so his stall has a lane on the RIGHT of the track. It is NOT a stop — no
// number, no marker, no card, nothing tappable, and it never enters the
// station list, so stop numbering and the station count are untouched. It
// only lengthens the map.
// RAISED FROM 74 TO 96 ON 2026-08-25. Chacha-ji's stall was landing on the
// words of the station card next to it, reported from a device. The stall is
// NOT the thing that moved: the scenery tests prove it stays inside this row
// (top > -HALT_H/2, bottom < HALT_H/2). The card is what overflows. Rows are
// laid out on a FIXED pitch while a card's height is variable, and a card
// carrying two chips plus a two-line status runs past its row into the halt
// beside it. The old 74 left about 10px of slack at each end of the stall,
// which a second line of text eats on its own.
//
// This buys roughly 21px of clearance each side instead of 10. It does not
// fix the underlying mismatch, which is that the pitch should be measured
// rather than assumed, and that is a bigger change than tonight's list.
// Kept identical on web and mobile: the two maps are drawn to the same
// geometry and a difference here shows up as the stall sitting somewhere
// else on the phone.
const HALT_H = 96;
// Item 3: drop of the terminus label below the terminus dot's center. The dot
// is 24px (border-box) with a 2px ring, so its lowest ink is termY+14; the
// bunting hangs ABOVE the dot. 18 clears both and still leaves the label's two
// possible lines inside the terminus row (which runs to termY + TERM_H/2 + 8).
const TERM_LABEL_DY = 18;
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
  HALT_H,
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
  /**
   * Present ONLY on the tracing stop, and the discriminator for it.
   *
   * A trace stop is not a lesson group: no row, no phrases, no id. It is
   * synthesised and marked, and everything that renders or opens a station
   * branches on this rather than on a sentinel id, which would be one refactor
   * away from colliding with a real one.
   */
  trace?: TraceStop;
  /**
   * The tracing stop's own status line, resolved where the passed-character
   * set is in scope. Present only alongside `trace`.
   */
  traceCopy?: string;
  /** The tracing stop's own progress, carried so the card can draw a track:
   *  its copy already counted the letters and only the bar was missing. */
  traceDone?: number;
  traceTotal?: number;
  /**
   * Present ONLY on the story stop, and the discriminator for it.
   *
   * Same arrangement as `trace` and for the same reason: a story stop is not a
   * lesson group, so it has no row, no phrases and no id, and everything that
   * renders or opens a station branches on this rather than on a sentinel id.
   */
  story?: StoryBook;
};

type LockInfo = {
  kind: "progression" | "sentence" | "language" | "plan";
  stopLabel: string;
  zoneTitle: string;
  /** Route pieces for the progression dialog's test-out action. */
  zoneId?: number;
  groupId?: number;
  /** Server says this locked stop can be opened with Chai (first zone only). */
  chaiUnlockable?: boolean;
};

/** Chai stop-unlock failures. Insufficient balance keeps the wallet's exact
 *  copy register so every Chai refusal in the app reads the same way. */
function unlockErrorCopy(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    const data = error.data as
      | { error?: string; balance?: number; cost?: number }
      | null;
    if (data?.error === "insufficient_tokens") {
      return `Not enough Chai yet. You have ${data.balance ?? 0}, this costs ${data.cost ?? 0}. Keep riding to earn more.`;
    }
  }
  return "That unlock did not go through. Try again in a moment.";
}

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
  firstClassActive,
}: {
  station: Station;
  color: string;
  isCurrent: boolean;
  accessible: boolean;
  /** When true, the current-stop train renders in First Class gold. */
  firstClassActive?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  if (isCurrent) {
    return (
      <div
        className="w-[46px] h-8 rounded-full bg-card flex items-center justify-center px-1"
        style={{
          boxShadow: `0 0 0 4px ${color}, 0 0 0 8px ${color}33, var(--depth-shadow)`,
          color,
        }}
        title="Your current stop"
      >
        {/* Soft idle bob on the parked train, whole-element transform only.
            Width routed through the :root tuning constants (task 899 bump).
            First Class: gold vars on a contents wrapper (no layout impact). */}
        <div
          className="contents"
          style={firstClassActive ? firstClassGoldVars : undefined}
        >
          <TrainEngine
            className={cn("w-[var(--train-marker-w)] h-full", !reduceMotion && "animate-train-bob")}
          />
        </div>
      </div>
    );
  }
  const done = station.status === "completed" || station.status === "tested_out";

  // WHAT KIND OF STOP, not what state it is in. The card beside every stop
  // already says "Completed" and "8/10 mastered", so a marker that only encoded
  // status was repeating it while leaving the thing it alone could say, that
  // this one is a tracing stop and that one is a story, to a chip.
  //
  // The sentence stop keeps its diamond rather than taking an emblem of its
  // own: it is a first-class stop and the rotated frame is what has always
  // marked that, on both platforms.
  const kind: StopEmblemKind = station.trace
    ? "trace"
    : station.story
      ? "story"
      : "station";
  const diamond = station.stage === "sentence";

  return (
    <div
      data-testid={`station-medallion-${kind}`}
      className={cn(
        "relative w-[26px] h-[26px] flex items-center justify-center overflow-hidden",
        diamond ? "rotate-45 rounded-[4px]" : "rounded-full",
      )}
      style={{
        background: done ? MEDALLION.face : MEDALLION.faceAhead,
        border: `2px solid ${done ? MEDALLION.rim : MEDALLION.rimAhead}`,
        opacity: done ? 1 : MEDALLION.aheadOpacity,
        boxShadow: "var(--depth-shadow)",
      }}
    >
      <img
        src={stopEmblem(kind)}
        alt=""
        aria-hidden
        className={cn("w-5 h-5 object-contain", diamond && "-rotate-45")}
      />
      {/* A locked stop keeps the border it always had, so "you cannot go here
          yet" still reads from the rim rather than only from the card. */}
      {!accessible && (
        <span
          className={cn(
            "absolute inset-0",
            diamond ? "rounded-[4px]" : "rounded-full",
          )}
          style={{ border: "2px solid hsl(var(--border))" }}
          aria-hidden
        />
      )}
    </div>
  );
}

/** Hotfix 3 item 3: one fun blurb per quick game, shown under the play
 *  action in the signal encounter dialog. */
const GAME_BLURBS: Record<QuickGameId, string> = {
  "ticket-check": "Punch tickets to their matching script before the whistle blows.",
  "wrong-platform": "Drag Chacha-ji onto the phrase that wandered onto the wrong platform.",
  // Part 2 never appears in a signal encounter (those are free-visible games),
  // but the map is keyed by QuickGameId and must stay total, so the blurb
  // exists rather than the type being loosened.
  "wrong-platform-2": "The same platform, a closer stray, and no English to lean on.",
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
      className="mx-1.5 mb-1 block w-[calc(100%-0.75rem)] rounded-md border border-dashed px-2 py-0.5 text-left"
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
      {/* THE CARVED STATION BOARD, cut into three so only the panel stretches.
          See ZONE_BOARD in lib/zone-backdrops.ts for why it is three files and
          why it is capped. Mobile twin: the board block in
          bolo-mobile/app/(app)/journey.tsx. */}
      <div
        className="relative flex flex-col overflow-hidden depth-shadow"
        // EXACTLY PC_H, not "at most". A cap plus overflow-hidden crops
        // whatever happens to be last, which is how the fact ended up with its
        // final line sliced off. As a column, the pediment and the foot take
        // their aspect and the panel absorbs precisely the remainder, so the
        // board always fills its reserved row and never exceeds it.
        style={{ height: PC_H }}
      >
        {/* The pediment, aspect preserved: its rosettes and arch must not
            stretch, which is the whole reason for the three-slice. */}
        <div className="relative">
          <img
            src={ZONE_BOARD_ART.top}
            alt=""
            aria-hidden
            className="block w-full shrink-0"
            data-testid={`zone-board-top-${zoneIndex}`}
          />
          {/* The nameplate. Positions are fractions of the slice, so the
              overlay tracks the board at any width. */}
          <div
            className="absolute flex items-center justify-center"
            style={{
              left: `${ZONE_BOARD.namePlate.left * 100}%`,
              right: `${ZONE_BOARD.namePlate.right * 100}%`,
              top: `${ZONE_BOARD.namePlate.top * 100}%`,
              height: `${ZONE_BOARD.namePlate.height * 100}%`,
            }}
          >
            <span
              className="truncate text-[9px] font-black uppercase tracking-widest"
              style={{ color: ZONE_BOARD.ink }}
            >
              {zoneTitle}
            </span>
          </div>
          <div
            className="absolute left-1/2 flex -translate-x-1/2 items-center justify-center"
            style={{
              width: `${ZONE_BOARD.zonePlate.width * 100}%`,
              top: `${ZONE_BOARD.zonePlate.top * 100}%`,
              height: `${ZONE_BOARD.zonePlate.height * 100}%`,
            }}
          >
            <span
              className="text-[8px] font-black uppercase tracking-widest"
              style={{ color: ZONE_BOARD.inkMuted }}
            >
              Zone {zoneIndex + 1}
            </span>
          </div>
        </div>
        {/* The panel. THE ONLY PART THAT STRETCHES, and it clips: the map
            reserves PC_H for this row and the board may never push into the
            first station beneath it. */}
        <div
          className="relative min-h-0 flex-1 overflow-hidden"
          style={{
            // Cream FIRST, art on top: the slice's paper is drawn with partial
            // alpha, so on its own the painted backdrop reads straight through
            // the board.
            backgroundColor: ZONE_BOARD.panel,
            backgroundImage: `url(${ZONE_BOARD_ART.mid})`,
            backgroundSize: "100% 100%",
          }}
        >
          {/* address side */}
          <div className="flex items-stretch gap-0">
            {/* left column: main address side */}
            <div className="min-w-0 flex-1 px-3 py-1">
              {/* The fare-zone line came off the panel when the carved board
                  landed: the pediment's nameplate carries the topic and the
                  small plate carries the number, so this said both twice. */}
              {/* Ink from the board, not a theme token: the panel is cream in
                  both themes and a cool slate reads cold on it. */}
              <div
                className="truncate text-sm font-extrabold leading-tight"
                style={{ color: ZONE_BOARD.ink }}
              >
                {geoName}
              </div>
              <div className="text-[10px]" style={{ color: ZONE_BOARD.inkMuted }}>
                {stationCount} {stationCount === 1 ? "stop" : "stops"} in this zone
              </div>
            </div>
            {/* THE POSTMARK AND THE ZONE STAMP CAME OFF with the carved board.
                The pediment's small plate says ZONE n, so the stamp said it a
                second time, and a franked postcard's furniture on a carved
                station board was two different objects at once. */}
          </div>
          {facts && facts.length > 0 && (
            <FactStrip facts={facts} zoneIndex={zoneIndex} color={color} />
          )}
          {testOutHref && (
            <Link
              href={testOutHref}
              onClick={blessAudioPlayback}
              data-testid={`link-zone-test-out-${zoneIndex}`}
              className="mx-1.5 mb-1.5 flex items-center justify-center rounded-md border-2 bg-card py-2 text-xs font-bold active:scale-[0.98] transition-transform"
              style={{ borderColor: color, color }}
            >
              Test out of this zone
            </Link>
          )}
        </div>
        {/* The board's foot, aspect preserved like the pediment. */}
        <img
          src={ZONE_BOARD_ART.bot}
          alt=""
          aria-hidden
          className="block w-full shrink-0"
          data-testid={`zone-board-bot-${zoneIndex}`}
        />
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
  onNavigate,
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
  /** Fired on an accessible stop's click, BEFORE the route changes. */
  onNavigate?: () => void;
  side: "left" | "right";
  polishEnabled?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const stopLabel = `Stop ${station.stopNumber} of ${station.stopCount}`;
  const masteredAtStop = station.masteredCount ?? 0;
  const phrasesAtStop = station.phraseCount ?? 0;
  // A tracing stop carries its own line ("Trace 8 letters", "3 of 8 letters
  // traced"). It must NOT fall through to the phrase-stop copy: it has no
  // phrases, so that path printed "Now boarding · undefined phrases" on the
  // live site, and "Now boarding" collided with the learner's actual current
  // stop two rows above.
  const statusCopy = station.trace
    ? (station.traceCopy ?? "")
    : station.story
      ? // Says what it IS and how long, because a stop nobody can guess the
        // shape of does not get opened. It must NOT fall through to the
        // phrase-stop copy below: a story stop has no phrases, and that
        // fall-through is exactly what printed "Now boarding · undefined
        // phrases" on the live site for tracing.
        `A picture story · ${station.story.scenes.length} scenes`
      : station.status === "completed"
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
        // Item 2: same type scale, tighter box — py-2 -> py-1.5 and the
        // current stop's roof clearance pt-3 -> pt-2.5.
        "relative min-w-0 rounded-lg px-3 py-1.5 transition-colors",
        // Item 1.1: THE PAPER TICKET. Every stop card carries stock, not just
        // the current one. Before this, a card that was not current had no
        // background at all, which was invisible over a flat theme and
        // unreadable the moment the map got painted: "Stop 1 of 11 /
        // Completed" was dark text on a bazaar. `.station-card` picks the
        // stock (see index.css) from the data attributes below; the shadow is
        // the shared depth pass, so the paper reads as laid ON the painting.
        // Background and shadow ONLY, no border: rows sit on a fixed pitch and
        // a card's height is variable, so the paper adds no pixels.
        "station-card depth-shadow",
        isCurrent && "border pt-2.5",
      )}
      // Which stock: full paper where the learner can ride, greyer paper where
      // they cannot, lifted paper under the cursor. Attributes rather than
      // classes because the stock is a themed token, not a Tailwind color.
      data-current={isCurrent ? "true" : undefined}
      data-accessible={accessible ? "true" : undefined}
      data-ahead={!accessible ? "true" : undefined}
      data-done={
        station.status === "completed" || station.status === "tested_out"
          ? "true"
          : undefined
      }
      /* Which edge the eyelet hangs from: the one facing the rail. A card on
         the left flank ties on its right, and the other way round. */
      data-side={side === "left" ? "left" : "right"}
      style={isCurrent ? { borderColor: color } : undefined}
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
        {isCurrent && (
          <span className="relative shrink-0">
            {/* Shared ground-contact shadow (Task 985): sits under the
                canonical mascot PNG, which itself stays untouched. */}
            <span className="ground-contact-shadow" aria-hidden />
            {/* 28, not 44: he is inside a two-line card now rather than
                standing in the margin beside it. */}
            <Mascot pose="cheer" idle="cheer" size={28} className="shrink-0" />
          </span>
        )}
        {isCurrent && <StationSignGlyph color={color} />}
        <span
          className={cn(
            // Item 2: leading-tight trims the line box, not the type scale;
            // whitespace-nowrap keeps "Stop 11 of 11" on one line down to
            // 320px (the card is ~180px wide there, the label ~90px).
            // Ink comes from `.station-card` now, not from a theme token: the
            // stock is cream in both themes and a cool slate reads cold on it.
            "text-sm font-semibold leading-tight whitespace-nowrap",
          )}
        >
          {stopLabel}
        </span>
        {/* Entitlement chip only where the server actually serves the stop
            plan-locked — on stops the caller can ride free (Hindi Zone 1
            carve-out) or already owns (Plus/Family), the badge is noise. */}
        {(station.stage === "sentence" ||
          station.trace !== undefined ||
          station.story !== undefined) &&
          station.planLocked === true && (
          <span
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide shrink-0"
            style={{
              background: BADGE.brassBg,
              borderColor: BADGE.brassEdge,
              color: BADGE.ink,
            }}
            title="First-class sentence stop: All-Access"
          >
            <Sparkles className="w-2.5 h-2.5" />
            All-Access
          </span>
        )}
        {station.trace && (
          <span
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide shrink-0"
            style={{
              background: BADGE.traceBg,
              borderColor: BADGE.traceEdge,
              color: BADGE.ink,
            }}
            title={station.trace.title}
          >
            <PenLine className="w-2.5 h-2.5" />
            Trace
          </span>
        )}
        {station.story && (
          <span
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide shrink-0"
            style={{
              background: BADGE.storyBg,
              borderColor: BADGE.storyEdge,
              color: BADGE.ink,
            }}
            title={station.story.title}
          >
            <BookOpen className="w-2.5 h-2.5" />
            Story
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
            className="rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide shrink-0"
            style={{
              background: BADGE.brassBg,
              borderColor: BADGE.brassEdge,
              color: BADGE.ink,
            }}
          >
            Free taste
          </span>
        )}
        {!accessible && <Lock className="w-3 h-3 text-muted-foreground shrink-0" />}
      </div>
      <div
        className={cn(
          "text-[11px] leading-tight",
          isCurrent ? "font-semibold" : "ticket-sub",
        )}
        style={isCurrent ? { color } : undefined}
      >
        {statusCopy}
        {/* Plan-locked stops serve a plan-visible count of zero, so the count
            segment is omitted there: "Locked" plus the lock icon only.
            Progression-locked stops keep their real counts. A tracing stop has
            no phrase count at all and is excluded outright. */}
        {!station.trace &&
          !station.story &&
          !station.attemptedCount &&
          station.planLocked !== true &&
          ` · ${station.phraseCount} phrases`}
        {/* Item 2: no "Bolo is waiting here" fragment. Bolo herself already
            stands beside this card, so the line only ever said in words what
            the mascot says in the art — and it was what pushed the current
            stop's status onto a second line at narrow widths. */}
      </div>
      {/* Progress as a small filled track once the stop has attempts; the
          fraction stays as a label. Quiet palette off the active card. */}
      {/* A TRACING STOP HAS PROGRESS AND HAD NO BAR. Reported from the
          preview: "stops 2 and 3 should have a progress bar as well". Its
          copy already counted the letters; only the track was missing, because
          the track hung off attemptedCount and a trace stop has no attempts.
          The STORY stop still has none, and deliberately: nothing in the app
          records how much of a book has been read, so a bar there would be
          decoration rather than progress. */}
      {station.trace && station.traceTotal ? (
        <div className="mt-0.5 flex items-center gap-1.5">
          <div
            className="h-1.5 w-20 max-w-full overflow-hidden rounded-full"
            style={{ background: accessible ? `${color}26` : "hsl(var(--muted))" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.round(((station.traceDone ?? 0) / station.traceTotal) * 100)}%`,
                background: accessible ? color : "hsl(var(--muted-foreground))",
              }}
              data-testid={`progress-trace-${station.stopNumber}`}
            />
          </div>
          <span className={cn("text-[10px] font-bold", !isCurrent && "ticket-sub")}>
            {station.traceDone ?? 0}/{station.traceTotal}
          </span>
        </div>
      ) : null}
      {station.attemptedCount ? (
        <div className="mt-0.5 flex items-center gap-1.5">
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
            className={cn("text-[10px] font-bold", !isCurrent && "ticket-sub")}
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
  // BOLO STANDS ON THE CARD NOW, not beside it. Reported from the preview:
  // "Move bolo onto the card itself, he blends in." He was on the painting,
  // which is a busy bazaar at his own scale, so a small mascot on it read as
  // more bazaar. On cream stock he has a ground to stand on.
  const body = <>{card}</>;
  // Item 3: journey-map copy carries no em dashes; a colon reads the same and
  // announces cleanly in a screen reader.
  const aria = station.trace
    ? `${stopLabel}: ${station.trace.title}, ${statusCopy} (tracing stop)`
    : station.story
      ? `${stopLabel}: ${station.story.title}, ${statusCopy} (story stop)`
      : `${stopLabel}: ${statusCopy}${station.stage === "sentence" ? " (sentence stop)" : ""}`;
  const rowClass = cn(
    "flex w-full items-center gap-1 text-left group",
    side === "left" ? "justify-end" : "justify-start",
  );
  if (accessible) {
    return (
      <Link
        href={href}
        aria-label={aria}
        className={rowClass}
        onClick={() => {
          blessAudioPlayback();
          // BEFORE the route changes, not after: the overlay has to be on
          // screen before the destination mounts, or the learner watches the
          // page appear and then get covered up.
          onNavigate?.();
        }}
      >
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

/** One railway segment: painted sleepers under twin rails, with a green halo
 *  under the run the learner has already travelled. The unlit run stays wood
 *  rather than going grey, because the sheet draws the two states as the same
 *  track with and without a halo, and greying it would say "disabled" where
 *  the truth is "not yet travelled". */
function RailSegment({ d, lit }: { d: string; lit: boolean }) {
  const dash = lit ? undefined : RAIL_STROKE.unlitDash;
  return (
    <g opacity={lit ? 1 : RAIL_STROKE.unlitOpacity}>
      {/* THE HALO, under everything and only on the run behind the learner.
          Two passes rather than one gradient, matching mobile stroke for
          stroke: react-native-svg cannot draw a radial gradient along a
          bezier, and a halo that differed between the platforms would be the
          one part of the repaint nobody could compare. */}
      {lit &&
        RAIL_GLOW_PASSES.map((pass) => (
          <path
            key={pass.width}
            d={d}
            stroke={RAIL.glow}
            strokeWidth={pass.width}
            opacity={pass.opacity}
            fill="none"
            strokeLinecap="round"
          />
        ))}
      {/* Rail-bed thickness (Task 985): the tie band repeated once in ink,
          offset down by the shared depth step, so every sleeper shows an
          underside edge and the track reads as a raised bed. Same `d` and
          dash rhythm — the rail geometry the comet samples is untouched. */}
      <path
        d={d}
        transform={`translate(0 ${DEPTH_2_5D.railBedDy})`}
        stroke={RAIL.tieInk}
        strokeWidth={RAIL_STROKE.tie}
        strokeDasharray={RAIL_STROKE.tieDash}
        opacity={DEPTH_2_5D.railBedOpacity}
        fill="none"
      />
      {/* The sleepers, full strength now. They were the line accent at 0.3
          when the rail was a coloured line; they are painted planks now and
          read as wood. */}
      <path d={d} stroke={RAIL.tie} strokeWidth={RAIL_STROKE.tie} strokeDasharray={RAIL_STROKE.tieDash} fill="none" />
      <path d={d} stroke={RAIL.rail} strokeWidth={RAIL_STROKE.rail} fill="none" strokeDasharray={dash} />
      <path d={d} stroke={lit ? RAIL.between : RAIL.betweenUnlit} strokeWidth={RAIL_STROKE.between} fill="none" strokeDasharray={dash} />
    </g>
  );
}

type Pt = {
  x: number;
  y: number;
  kind: "station" | "postcard" | "terminus" | "halt";
  lit: boolean;
  station?: Station;
  zoneIndex?: number;
  /** Station rows only: 0-based global index, the serpentine phase. Carried on
   *  the point so a render that SKIPS rows (a folded zone) still puts the label
   *  cards on the right flanks, instead of counting render order. */
  globalIdx?: number;
  /** Station rows only: this row belongs to a folded zone, so it keeps its
   *  place in the numbering but draws nothing and hosts nothing. */
  collapsed?: boolean;
  /** Halt rows only: the 1-based global station number this halt follows. */
  haltAfterStation?: number;
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

/**
 * Chacha-ji's stall auto-opens the same way a signal soft stop does: once per
 * arrival, never over another dialog or an owed closeout.
 *
 * Seen is written by the caller once the server has answered, not here: a
 * request that never lands must not cost the learner the encounter. The
 * in-flight guard below is what stops a re-render firing a second one in the
 * meantime, and it resets on remount so a failed arrival is retried on the
 * learner's next visit to the map.
 */
function ChachaSoftStop({
  station,
  dialogOpen,
  closeoutPending,
  lang,
  onOpen,
}: {
  station: number | null;
  dialogOpen: boolean;
  closeoutPending: boolean;
  lang: string;
  onOpen: (station: number) => void;
}) {
  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (station === null || dialogOpen || closeoutPending) return;
    if (isChachaStopSeen(lang, station)) return;
    const key = `${lang}:${station}`;
    if (asked.current === key) return;
    asked.current = key;
    onOpen(station);
  }, [station, dialogOpen, closeoutPending, lang]);
  return null;
}

/**
 * THE EMERGENCY, fired between stop 8 and stop 9 of a zone.
 *
 * SAME SHAPE AS ChachaSoftStop AND SignalSoftStop above, deliberately. This
 * file already had two watchers that observe where the learner is and open
 * something once; a third pattern for a third interruption would be the
 * beginning of three ways to do one thing.
 *
 * NOTHING IS DRAWN ON THE MAP FOR IT. It adds no row, no point, no station and
 * no entry in `pts` or `stationPts`, and that is the single most important
 * property of this feature. The tracing stop and the story stop are places you
 * can see coming and choose to walk into; this is an interruption, and an
 * interruption you can see on the timetable is an appointment. It also means
 * this cannot repeat the k-advancing bug that moved Chacha-ji's stall down the
 * line when the story row landed, because it never touches the geometry at all.
 *
 * THE REF IS WHY IT DOES NOT LOOP. Standing on stop 9 renders many times; the
 * key is the zone, so it fires once per zone per visit to the map. Leaving the
 * zone and coming back fires it again, which is what "fires every time" means
 * in practice. What it must never do is fire on every render, which is what a
 * bare condition here would have done.
 *
 * It waits for any open dialog to close first. Firing an interruption over the
 * top of a Chacha encounter would stack two of them.
 */
function EmergencySoftStop({
  zone,
  dialogOpen,
  onFire,
}: {
  /** 1-based zone whose stop 9 the learner is standing on, or null. */
  zone: number | null;
  dialogOpen: boolean;
  onFire: (zone: number) => void;
}) {
  const fired = useRef<number | null>(null);
  useEffect(() => {
    if (zone === null || dialogOpen) return;
    // A zone with no film has no Emergency, silently. The learner walks from
    // stop 8 to stop 9 with no idea anything was planned here.
    if (!hasEmergency(EMERGENCY_JOURNEY, zone)) return;
    if (fired.current === zone) return;
    fired.current = zone;
    onFire(zone);
  }, [zone, dialogOpen, onFire]);
  // Standing anywhere else re-arms it, so the next crossing fires again.
  useEffect(() => {
    if (zone === null) fired.current = null;
  }, [zone]);
  return null;
}

/**
 * A TAP SKIPS THE SHOT AND LANDS ON THE CARD. A tap moves nothing by itself, so
 * the shot is free to answer it with a destination.
 */
const INTRO_LAND_EVENTS = ["pointerdown", "touchstart"] as const;

/**
 * A WHEEL OR A KEY CANCELS IT INSTEAD, and this asymmetry is deliberate. Both
 * already scroll the page natively, so answering one by jumping to the stop
 * would compose the jump WITH the learner's own delta and land somewhere
 * neither of them chose. They are driving; the shot gets out of the way.
 */
const INTRO_CANCEL_EVENTS = ["wheel", "keydown"] as const;

/**
 * THE OPENING SHOT: the map opens at the top, holds on the fare-zone card, then
 * travels down to the learner's current stop.
 *
 * Mounted WITH the map rather than with the page, so it runs once the zone
 * payloads have landed instead of firing against the "Laying the tracks…"
 * screen, and so "once per visit" needs no extra bookkeeping: the map mounts
 * once, and the internal latch closes the door on refetches and re-renders
 * inside that visit.
 *
 * WHY IT IS HAND-ROLLED AND NOT `behavior: "smooth"`. The browser's smooth
 * scroll has no duration control, and its duration grows with distance, which
 * is the opposite of what was asked for: a learner six zones down should travel
 * the same shot FASTER, not for six times as long. The tween below takes its
 * duration from introScrollDurationMs, which caps at 900ms.
 *
 * TAPPING THE SCREEN LANDS YOU ON YOUR CARD. It does not cancel. Cancelling is
 * what this used to do for every input, and it left a learner who reached for
 * the screen stranded halfway down a map at a position nobody chose. A wheel or
 * a key still cancels, because those scroll the page on their own and a jump on
 * top of the learner's own delta lands somewhere neither of them chose.
 *
 * Skipped entirely when the page is not already at the top, because something
 * else moved the viewport and that something is the learner. Under reduced
 * motion there is no hold and no travel: it jumps.
 */
function AutoScrollToCurrentStop({
  mapRef,
  targetY,
  reduceMotion,
}: {
  mapRef: React.RefObject<HTMLDivElement | null>;
  targetY: number | null;
  /** framer-motion's hook reports null until it has read the media query. */
  reduceMotion: boolean | null;
}) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current || targetY == null) return;
    done.current = true;
    const map = mapRef.current;
    if (!map || typeof window === "undefined" || typeof window.scrollTo !== "function") {
      return;
    }
    // Already scrolled before we got here: the learner is driving.
    if (window.scrollY > 0) return;

    let raf = 0;
    let holdTimer = 0;
    let finished = false;
    /** Where the shot ends: the stop framed a third of the way down. */
    const destination = () => {
      const lead = introScrollLead(window.innerHeight);
      const top = map.getBoundingClientRect().top + window.scrollY + targetY - lead;
      return Math.max(0, top);
    };
    const land = () => {
      if (finished) return;
      finished = true;
      cleanup();
      window.scrollTo({ top: destination(), behavior: "auto" });
    };
    /** Stop the shot where it stands: the learner's own gesture is moving them. */
    const abandon = () => {
      if (finished) return;
      finished = true;
      cleanup();
    };
    const cleanup = () => {
      if (raf) cancelAnimationFrame(raf);
      if (holdTimer) window.clearTimeout(holdTimer);
      for (const ev of INTRO_LAND_EVENTS) window.removeEventListener(ev, land);
      for (const ev of INTRO_CANCEL_EVENTS) window.removeEventListener(ev, abandon);
    };
    for (const ev of INTRO_LAND_EVENTS) {
      window.addEventListener(ev, land, { passive: true });
    }
    for (const ev of INTRO_CANCEL_EVENTS) {
      window.addEventListener(ev, abandon, { passive: true });
    }

    if (reduceMotion) {
      land();
      return cleanup;
    }

    // One frame of grace so the map has been laid out, THEN the hold, so the
    // beat is spent on a zone card that is actually on screen.
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (finished) return;
      holdTimer = window.setTimeout(() => {
        holdTimer = 0;
        if (finished) return;
        const from = window.scrollY;
        const to = destination();
        const dur = introScrollDurationMs(to - from);
        if (to <= from) return void land();
        // NULL, NOT ZERO, as the "no first frame yet" sentinel. A frame clock
        // is allowed to hand out 0, and `if (!t0)` then re-stamps the start on
        // every frame, so the tween sits at its origin forever. Real browsers
        // never pass 0 here, which is precisely why this would have shipped.
        let t0: number | null = null;
        const step = (now: number) => {
          if (finished) return;
          if (t0 === null) t0 = now;
          const p = Math.min(1, (now - t0) / dur);
          window.scrollTo({ top: from + (to - from) * introScrollEase(p), behavior: "auto" });
          if (p < 1) {
            raf = requestAnimationFrame(step);
          } else {
            finished = true;
            cleanup();
          }
        };
        raf = requestAnimationFrame(step);
      }, INTRO_SCROLL.holdMs);
    });
    return cleanup;
  }, [mapRef, targetY, reduceMotion]);
  return null;
}

export default function Journey() {
  const { activeLang, activeLanguage } = useLanguage();
  // Only for placing the free taste: which tracing stops this learner may open.
  // Everything else on this page gates on the server's own planLocked flag.
  const { isPlus } = useEntitlements();
  const line = getJourneyLine(activeLang);
  const [lock, setLock] = useState<LockInfo | null>(null);
  // Chunk 6B: trackside signal encounter + signpost fact dialogs. signalTick
  // only forces a re-render after a wave so states re-derive from storage.
  const [signalDlg, setSignalDlg] = useState<SignalSpot | null>(null);
  const [factDlg, setFactDlg] = useState<{ geoName: string; fact: string } | null>(null);

  const [chachaDlg, setChachaDlg] = useState<number | null>(null);

  // Folded zones. With 52 stations the page is dominated by work already done
  // and the learner lands in their own history. Expanding is per-session and
  // per-zone, never persisted: it is a view, not progress.
  const [expandedZones, setExpandedZones] = useState<Set<number>>(new Set());
  const toggleZone = useCallback((zi: number) => {
    setExpandedZones((prev) => {
      const next = new Set(prev);
      if (next.has(zi)) next.delete(zi);
      else next.add(zi);
      return next;
    });
  }, []);

  const [signalTick, setSignalTick] = useState(0);
  const { ref: mapRef, w: mapW } = useMapWidth();
  const reduceMotion = useReducedMotion();
  /** Scroll the page so a map y lands where the auto-scroll puts the current
   *  stop. Same framing constant, so a jump and the initial landing agree. */
  const scrollToMapY = useCallback(
    (y: number) => {
      const map = mapRef.current;
      if (!map || typeof window === "undefined" || typeof window.scrollTo !== "function") return;
      const lead = introScrollLead(window.innerHeight);
      const top = map.getBoundingClientRect().top + window.scrollY + y - lead;
      window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? "auto" : "smooth" });
    },
    [mapRef, reduceMotion],
  );

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
  // Which letters are already traced, so each zone's tracing stop shows real
  // progress. Derived per stop, never stored, the same way lesson-group
  // unlock state is derived.
  const { passedCharacterIds } = useTraceStopProgress(activeLang);
  // Which zones have a capstone in THIS language. Replaces a hand-written
  // zone-to-scenario table that carried a comment telling the next person to
  // keep it in sync with the server's SCENARIOS map. The server owns the
  // scenes, so it answers directly, and a language with no content for a
  // scene's category simply is not listed.
  const scenariosQuery = useListScenarios({ lang: activeLang });
  const scenarioIdByZone = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of scenariosQuery.data ?? []) m.set(s.zoneIndex, s.id);
    return m;
  }, [scenariosQuery.data]);
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

  // Chai stop unlock. The offer, its price and its cap all come from the
  // server payload; this only spends and then re-reads. A success refetches
  // the zones (the bought stop comes back status "unlocked") and the wallet.
  const tokensQuery = useGetTokens();
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const unlockStop = useUnlockStop({
    mutation: {
      onSuccess: () => {
        setUnlockError(null);
        setLock(null);
        void tokensQuery.refetch();
        zoneQueries.forEach((q) => void q.refetch());
      },
      onError: (e) => setUnlockError(unlockErrorCopy(e)),
    },
  });

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
  // Served price of a Chai stop unlock. Present only for the first zone (the
  // only zone whose stops the server will sell), never hardcoded here.
  const stopUnlockCost =
    zoneQueries
      .map((q) => (q.data as LessonGroupList | undefined)?.stopUnlock?.cost)
      .find((c) => typeof c === "number") ?? null;

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

    // TWO LISTS, and the split is the whole design.
    //
    // `stations` stays exactly what it always was: the graded lesson groups.
    // Every derivation on this page counts off it, and must keep doing so —
    // the rail progress, the scenery budget, zone folding, the current stop,
    // and the global counter that places Chacha-ji's stalls.
    //
    // `rowStations` is what the map DRAWS: the same stations with the tracing
    // stop spliced into the MIDDLE and the whole run renumbered, so a learner
    // reads "Stop 6 of 11" and the tracing stop is a stop like any other.
    //
    // Added, never substituted: no phrase stop is displaced, so a zone of ten
    // stops becomes eleven. Journey 1 only for now; the ladder already carries
    // journey 2 and lights up when this page learns to render it.
    const trace = traceStopFor(activeLang, 1, i + 1);
    const withTrace = [...stations];
    // IS THIS WHOLE ZONE INCLUDED FOR THIS LEARNER? Derived from the phrase
    // stations the server already sent, never from a hardcoded language list.
    // Hindi's fare zones 1 and 2 serve free in full (owner ruling 2026-08-24),
    // and on 2026-08-25 the map was still stamping FREE TASTE on them, which
    // reads as a sample of something the learner already owns outright. A zone
    // whose every phrase stop is plan-visible is INCLUDED, so its tracing and
    // story rows are neither locked nor a taste. Deriving it means a future
    // widening of the free tier needs no change here, and it cannot drift from
    // what the server actually serves.
    const zoneIncluded =
      stations.length > 0 && stations.every((st) => st.planLocked !== true);
    // THE ZONE GATE, DECIDED ONCE AT THE ZONE BOUNDARY. With the cross-zone
    // gate on, the server reports EVERY group in an unreachable zone as
    // "locked", so a zone where no phrase station is open is a zone the
    // learner may not enter yet. Rows this client invents (the tracing stop,
    // the story stop, and whatever comes next) are not in that payload and
    // would otherwise each have to remember to lock themselves, which is
    // exactly how a stop ends up standing open at the top of a zone.
    //
    // Asked for on 2026-08-25: "add a hard gate (invisible) right after the
    // zone card, so we never have to count stops". This is that gate. A new
    // row type inherits it by being inside the zone rather than by joining a
    // list. With the flag off the first station of every zone is unlocked, so
    // this is false everywhere and nothing changes.
    const zoneGateLocked =
      stations.length > 0 && stations.every((st) => st.status === "locked");
    // Where the tracing row landed, so the story row can sit directly after it.
    // Null when this zone has no tracing stop, which storyStopIndexIn handles.
    let traceIndex: number | null = null;
    // NOT IN SHOWROOM. A locked-language preview already carries its own free
    // taste, the three-phrase voice teaser, and a tracing stop offering a
    // second "FREE TASTE" chip beside it reads as two competing offers on a
    // language the learner cannot open yet.
    //
    // ADDED, NEVER SUBSTITUTED, and you can only add to something: a zone with
    // no phrase stops at all gets no tracing stop either. Without this a zone
    // whose groups have not loaded, or a language whose later zones carry no
    // content yet, drew a lone "Trace 8 letters" row under an empty postcard
    // and advertised a zone that is not there. Caught 2026-08-23 porting this
    // to the phone, where a fixture with five empty zones grew five of them.
    if (trace && stations.length > 0 && !showroom) {
      traceIndex = traceStopIndexIn(stations.length, trace.journey, trace.zone);
      withTrace.splice(traceIndex, 0, {
        // Every LessonGroupSummary field is optional, so a trace stop supplies
        // only what a drawn station needs and is identified by `trace`.
        title: trace.title,
        stage: "phrase",
        status: zoneGateLocked
          ? "locked"
          : traceStopStatus(trace, passedCharacterIds),
        zoneId: z.id,
        zoneIndex: i,
        stopNumber: 0,
        stopCount: 0,
        trace,
        traceCopy: traceStopCopy(
          trace,
          traceStopPassedCount(trace, passedCharacterIds),
        ),
        traceDone: traceStopPassedCount(trace, passedCharacterIds),
        traceTotal: trace.characters.length,
        // THE FREE TASTE, and where it stops. Journey 1 zone 1 is open to
        // everyone (the first TRACE_TEASER_LIMIT characters of it, which the
        // game enforces); every later zone is All-Access. A tracing stop is
        // still never PROGRESSION-locked, which is a different thing: it
        // teaches the alphabet and no phrase stop gates it.
        planLocked:
          !isPlus && !zoneIncluded && !(trace.journey === 1 && trace.zone === 1),
        teaserStation:
          !isPlus && !zoneIncluded && trace.journey === 1 && trace.zone === 1,
      });
    }
    // THE STORY STOP, straight after the tracing one.
    //
    // Owner ruling 2026-08-24: zone 1 reads stop 1 the free phrase stop, stop 2
    // the tracing taste, stop 3 the story taste, so the three free things sit
    // together at the top of the map where they will actually be met. That is
    // the same reasoning that pinned the tracing stop to stop 2.
    //
    // storyStopIndexIn owns the position, not this file. Both clients must call
    // it or the web and the phone will disagree about which stop a learner is
    // on, which is the rule already written on traceStopIndexIn.
    //
    // MOST ZONES HAVE NO BOOK and that is not a gap to fill in later: only the
    // 44 concepts shared across 20+ languages can carry one, so a zone without
    // an authored book simply has no story stop, exactly as a language with an
    // unauthored script has no tracing stop.
    const story = storyBookFor(1, i + 1);
    if (story && stations.length > 0 && !showroom) {
      const spliced = storyStopIndexIn(
        withTrace.length,
        story.journey,
        story.zone,
        traceIndex,
      );
      withTrace.splice(spliced, 0, {
        title: story.title,
        stage: "phrase",
        status: zoneGateLocked ? "locked" : "unlocked",
        zoneId: z.id,
        zoneIndex: i,
        stopNumber: 0,
        stopCount: 0,
        story,
        // The free taste is the FIRST SCENE of the journey 1 zone 1 book, which
        // the server enforces by which concepts it will serve. Never
        // progression-locked: a story teaches nothing a phrase stop gates.
        planLocked: !isPlus && !zoneIncluded && !isStoryTeaserBook(story),
        teaserStation: !isPlus && !zoneIncluded && isStoryTeaserBook(story),
      });
    }

    const rowStations: Station[] = withTrace.map((st, gi) => ({
      ...st,
      stopNumber: gi + 1,
      stopCount: withTrace.length,
    }));

    return {
      ...z,
      title: categories?.find((c) => c.id === z.id)?.title ?? z.title,
      geoName: line.zones[i]!,
      stations,
      rowStations,
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

  // THE ARRIVAL FILM, symmetric with the departure one. Asked for 2026-08-26:
  // the same zone splash that plays on the way INTO a stop also plays when the
  // journey itself loads, so the map fades up out of the scene rather than
  // snapping in. It reuses the six films already bundled for the departure, so
  // it costs nothing extra.
  //
  // FIRED WHEN currentZone FIRST RESOLVES, not on bare mount, because the zone
  // is not known until the queries land and the wrong zone's painting is worse
  // than none. On a return visit those queries are cached and this is the same
  // tick as mount; on a cold load the page is in its loading state anyway, so
  // neither case shows the map and then covers it.
  //
  // Mobile twin carries the same comment.
  const arrivalPlayed = useRef(false);
  useEffect(() => {
    if (arrivalPlayed.current || !currentZone) return;
    arrivalPlayed.current = true;
    playStopSplash(currentZone.id);
  }, [currentZone]);

  const languageName = activeLanguage?.name ?? "this language";
  const upgradeLanguageHref = upgradeHref({
    plan: "plus",
    reason: access === "exhausted" ? "teaser_exhausted" : "language_locked",
  });

  // --- Serpentine geometry (pronounced): stations alternate left/right down
  // the measured map column; the track curves between them.
  const rightX = mapW - 94; // mirror of LEFT_X within the measured column
  const stationX = (k: number) => (k % 2 === 0 ? LEFT_X : rightX);
  // Zones still holding Chai nobody has collected. THE reason an earlier
  // attempt at folding was thrown away: a finished zone can still carry a
  // trackside signal that is active or waved, and both of those still owe the
  // learner Chai. Folding one hides a reward they have not taken.
  //
  // Derived from the same three inputs the signal spots use (the zone payload,
  // this device's wave/clear memory, and progress) and NOT from the map
  // geometry, which is what makes it available this early: the fold decision
  // has to be made before any of the layout exists.
  const zonesOwingChai = new Set<number>();
  if (!showroom) {
    for (const { afterStop } of planTracksideSignals(totalCount)) {
      const st = allStations[afterStop - 1];
      if (!st) continue;
      const gapRef = `gap-${afterStop}`;
      const cleared =
        zoneQueries[st.zoneIndex]?.data?.signals?.clears.includes(gapRef) ||
        isSignalCleared(activeLang, afterStop);
      // Anything not CLEARED still owes: an active signal has never been
      // played, and a waved one was rolled past with its Chai left on offer.
      if (!cleared) zonesOwingChai.add(st.zoneIndex);
    }
  }

  const pts: Pt[] = [];
  const postcardYs: { y: number; zoneIndex: number }[] = [];
  const collapsedRowYs: { y: number; zoneIndex: number }[] = [];
  let layoutY = TOP_PAD;
  let k = 0; // global station index (drives the serpentine phase)
  /**
   * A zone folds when it is FINISHED, is not the zone the learner is standing
   * in, owes no uncollected Chai, and has not been opened by hand this session.
   * Never folds the current zone: the one thing this map exists to show is
   * where you are.
   */
  const isZoneCollapsed = (zi: number, zone: (typeof zones)[number]) =>
    zone.zoneAllDone &&
    !zone.stations.some((st) => st.id === currentId) &&
    !zonesOwingChai.has(zi) &&
    !expandedZones.has(zi);
  for (let zi = 0; zi < zones.length; zi++) {
    const zone = zones[zi]!;
    const collapsed = isZoneCollapsed(zi, zone);
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
    // Every station of a folded zone shares the summary row's y. They stay in
    // the list, dense and in order, so global stop numbers and everything
    // indexed by them (signals, Chacha-ji's stalls, the rail pulse) keep
    // working untouched; they simply draw nothing.
    const collapsedRowY = layoutY + COLLAPSED_H / 2;
    if (collapsed) collapsedRowYs.push({ y: layoutY, zoneIndex: zi });
    for (const s of zone.rowStations) {
      // Free-tier content policy: a plan-gated sentence stop arrives
      // status "locked" (planLocked) from the server, so unlocked means lit.
      const lit =
        s.status === "completed" ||
        s.status === "tested_out" ||
        s.status === "in_progress" ||
        s.status === "unlocked";

      // THE TRACING STOP DRAWS A ROW BUT DOES NOT ADVANCE `k`, which is the
      // rule Chacha-ji's halt already follows two blocks down: "It advances
      // the layout only: `k` does not move, so the serpentine phase, the stop
      // numbers and the station count are all exactly what they were."
      //
      // `k` is the GLOBAL graded-stop ordinal, and three things key off it:
      // the serpentine flank, and through stationNumber both Chacha's stall
      // placement and the trackside signals. A tracing stop that advanced it
      // would slide Chacha's stall down the line and flip every card below
      // onto the wrong side of the track. It is a stop to a learner and a
      // scenery row to the geometry, and that is the correct split.
      //
      // It takes the previous station's flank, so the rail carries straight
      // down one side through it, exactly as it does through a halt.
      //
      // THE STORY STOP IS THE SAME KIND OF ROW and joined this branch when it
      // landed 2026-08-24. It was written without it and fell through to the
      // ordinary station push below, which DOES advance `k`. That one line
      // broke ten assertions across five suites at once: the directional rail
      // pulse ran over two segments instead of one, Chacha's stall seated at
      // the wrong y, the halt row moved, the current-stop card lost its
      // numbers and two test-out dialogs stopped opening. Every one of those
      // is downstream of `k`, which is precisely what the paragraph above
      // warns about.
      if (s.trace || s.story) {
        if (!collapsed) {
          pts.push({
            x: stationX(Math.max(k - 1, 0)),
            y: layoutY + STATION_H / 2,
            kind: "station",
            lit,
            station: s,
            globalIdx: Math.max(k - 1, 0),
            collapsed,
          });
          layoutY += STATION_H;
        }
        continue;
      }

      pts.push({
        x: stationX(k),
        y: collapsed ? collapsedRowY : layoutY + STATION_H / 2,
        kind: "station",
        lit,
        station: s,
        globalIdx: k,
        collapsed,
      });
      if (!collapsed) layoutY += STATION_H;
      k++;
      // CHACHA-JI'S HALT ROW WAS RETIRED HERE ON 2026-08-26. It used to insert
      // a 96-high scenery-only row after every encounter station, purely to
      // give his stall a lane clear of the station card. That is six rows over
      // a journey, about 576 of map carrying no stop, no number and nothing
      // tappable, and at 96 it spent MORE height on a decoration than STATION_H
      // spends on a stop.
      //
      // The stall did not go with it. It moved to the LEFT of the marker, which
      // is empty on an encounter station because those are always left-flank
      // and their card sits to the right. See STALL_PLACEMENT.laneDxLeft.
      //
      // The mechanic never depended on any of this: ChachaSoftStop fires off
      // chachaStationIdx, which comes from the current station index, and the
      // free chai is granted by recordChachaEncounter on that trigger. Nothing
      // taps the stall. Mobile twin carries the same note.
    }
    // The folded zone's whole station block costs ONE row.
    if (collapsed) layoutY += COLLAPSED_H;
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
  // GRADED station points, and the trace rows are excluded deliberately.
  //
  // Everything that indexes this list is graded logic: Chacha-ji's stall count
  // and placement, the zone-local row his stall occupies, and the current
  // stop's y. A tracing row in here inflates planChachaStalls' input and
  // shifts every stationPts[n - 1] lookup by however many tracing rows came
  // before it, which moves his stall onto the wrong stop and hands the scenery
  // plan the wrong row to leave free.
  //
  // The rule for the whole file: `pts` is what the map DRAWS, `stationPts` is
  // what it COUNTS.
  // `pts` is what the map DRAWS, `stationPts` is what it COUNTS. Neither the
  // tracing nor the story row is a phrase stop, so both are excluded here or
  // every stationPts[n-1] lookup shifts by however many non-phrase rows came
  // before it.
  const stationPts = pts.filter(
    (p) => p.kind === "station" && !p.station!.trace && !p.station!.story,
  );
  const visibleCountForZone = (zoneId: number) =>
    categories?.find((c) => c.id === zoneId)?.phraseCount ?? 0;
  // 0-based index of the boardable stop; the gap right behind it is gap-N
  // with N === that index (N previous stops are done).
  const currentGlobalIdx =
    currentId != null ? allStations.findIndex((s) => s.id === currentId) : -1;
  // Chacha-ji counts stations 1-based off that same flattened list.
  const currentStationNumber = currentGlobalIdx >= 0 ? currentGlobalIdx + 1 : -1;
  // Task 1082 item 1: the boarding pass used to read "{doneCount}/{totalCount}
  // stations", so the number in the current-station slot was actually the
  // COUNT OF FINISHED STOPS — it said 2 while the map highlighted stop 1. Both
  // numbers now come off `allStations`, the one flattened list the map, the
  // server payload and the Chacha encounter logic all already share: the total
  // is its length and the stop number is the very index the encounter check
  // uses, so the header can never disagree with the stop the map lights up.
  const headerStations =
    currentStationNumber > 0
      ? `Stop ${currentStationNumber} of ${totalCount} stations`
      : allDone
        ? `All ${totalCount} stations complete`
        : `${totalCount} stations`;
  // Item 4: y of the current stop inside the map column, off the same
  // serpentine points the markers are drawn from.
  const currentStopY =
    currentGlobalIdx >= 0 ? stationPts[currentGlobalIdx]?.y ?? null : null;
  // His stall is a permanent map LANDMARK at every encounter station, ahead of
  // the learner and behind, so the stop that pays is visible before it is
  // reached. Pure client geometry off the same predicate the arrival check
  // uses: no server call, no state, and no encounter row. Rendering is NOT
  // triggering — the gift still happens only on arrival, below.
  // Zone index for the desktop rail. The map column is phone-width and centred,
  // so on a wide screen most of the viewport is empty margin while the learner
  // scrolls 52 stations looking for where they are. The rail fills that margin
  // with the one thing the page cannot otherwise show: the whole line at once.
  //
  // y comes off the SAME geometry the map draws, so a jump can never disagree
  // with where the zone actually sits.
  const zoneNav = zones.map((z, zi) => {
    const pc = pts.find((p) => p.kind === "postcard" && p.zoneIndex === zi);
    const total = z.stations.length;
    const done = z.stations.filter(
      (st) => st.status === "completed" || st.status === "tested_out",
    ).length;
    return {
      zoneIndex: zi,
      geoName: z.geoName,
      y: pc?.y ?? 0,
      done,
      total,
      hasCurrent: z.stations.some((st) => st.id === currentId),
    };
  });

  const chachaStalls = planChachaStalls(stationPts.length).flatMap((station) => {
    const p = stationPts[station - 1];
    if (!p) return [];
    const zone = zones[p.station!.zoneIndex]!;
    const zoneAccessible = zone.stations.some(
      (st) => isStatusAccessible(st.status) || st.teaserStation,
    );
    return [
      {
        station,
        // LEFT of the marker, in the encounter station's OWN row. Encounter
        // stations are always left-flank so their card is on the right, which
        // is what makes this side free and what let the halt row go.
        x: p.x - STALL_PLACEMENT.laneDxLeft,
        y: p.y + STALL_PLACEMENT.groundDy,
        gray: showroom && !zoneAccessible,
      },
    ];
  });
  // Zone-local rows carrying a stall, so the decorative scenery plan and the
  // zone signpost both leave that strip alone.
  const stallRowsByZone = new Map<number, Set<number>>();
  for (const { station } of chachaStalls) {
    const p = stationPts[station - 1]!;
    const zi = p.station!.zoneIndex;
    const row = stationPts
      .filter((q) => q.station!.zoneIndex === zi)
      .findIndex((q) => q.station!.id === p.station!.id);
    if (row < 0) continue;
    const rows = stallRowsByZone.get(zi) ?? new Set<number>();
    rows.add(row);
    stallRowsByZone.set(zi, rows);
  }
  // WHICH ZONE'S CROSSING THE LEARNER IS STANDING ON, or null.
  //
  // ZONE-RELATIVE, not journey-wide. Each of the six zones has its own film, so
  // "between stops 8 and 9" counts within the zone; a journey-wide index would
  // put the only Emergency inside zone 1 and leave the other five films
  // unreachable.
  const [, navigate] = useLocation();

  const emergencyZone = (() => {
    if (currentId === undefined) return null;
    for (let zi = 0; zi < zones.length; zi++) {
      const idx = zones[zi]!.stations.findIndex((st) => st.id === currentId);
      if (idx === EMERGENCY_AFTER_STOP) return zi + 1;
    }
    return null;
  })();

  const activeChachaStation =
    currentStationNumber > 0 && isChachaEncounterStation(currentStationNumber)
      ? currentStationNumber
      : null;
  // The open encounter carries its stop with it: leaving the stall walks on
  // into that stop's first item, never back to the map.
  const chachaStopEntry = chachaDlg != null ? allStations[chachaDlg - 1] : undefined;
  const chachaStop =
    chachaDlg != null && chachaStopEntry
      ? {
          station: chachaDlg,
          href: `/practice/${chachaStopEntry.zoneId}?group=${chachaStopEntry.id}`,
        }
      : null;
  const signals: SignalSpot[] = showroom
    ? []
    : planTracksideSignals(totalCount).flatMap(({ afterStop, signalIndex }) => {
        const a = stationPts[afterStop - 1];
        // A folded zone draws no track furniture: its stations share one
        // summary row, so a signal placed off them would stack on that row.
        // Guarded upstream too, since a zone owing Chai never folds.
        if (!a || a.collapsed) return [];
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
    const zonePts = pts.filter(
      (p) =>
        p.kind === "station" &&
        p.station!.zoneIndex === zi &&
        !p.collapsed &&
        // GRADED rows only, same rule as Chacha-ji's stall: a tracing stop is
        // a row to the layout but not a station to the trackside furniture.
        // The STORY stop is the same kind of row and joined this rule when it
        // landed 2026-08-24; leaving it out moved the signpost onto rows the
        // scenery plan had already taken.
        !p.station!.trace &&
        !p.station!.story,
    );
    const spot = planZoneSignpost(zi, zonePts.length, stallRowsByZone.get(zi));
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
          {/* Same OBJECT as the pass on home (pages/home.tsx), not a second
              design: accent fill, white ink, the engine riding on the right.
              It used to be a pale outlined strip whose middle was empty
              hatching and whose stub was blank, which read as unfinished work
              sitting above a finished map. It stays a slim sticky header
              rather than a copy of home's hero, because it has to survive
              being pinned to the top of a scrolling map. */}
          <div
            className="relative flex-1 overflow-hidden rounded-lg border-2 border-dashed"
            style={{ backgroundColor: line.accent, borderColor: "rgba(255,255,255,0.45)" }}
          >
            <TicketStripes ink="rgba(255,255,255,0.10)" />
            <div className="relative flex items-stretch">
              <div className="min-w-0 flex-1 px-4 py-2.5">
                <div className="text-[9px] font-black uppercase tracking-widest text-white/80">
                  Boarding pass · બોલો રેલ
                </div>
                <div className="text-base font-extrabold text-white leading-tight truncate">
                  {line.lineName}
                </div>
                {/* Item 1: this line carries the number the whole item is
                    about, so it wraps instead of truncating. At 320px the
                    route alone fills the ticket, and `truncate` cut the stop
                    count off the end entirely. Wrapping shows both at every
                    width and still sits on one line once there is room. */}
                <div className="text-[11px] leading-tight text-white/85">
                  {line.zones[0]} → {line.zones[5]} · {headerStations}
                </div>
                {access === "teaser" && teaserProgress && (
                  <div className="text-[10px] font-bold" style={{ color: line.accent }}>
                    Free taste {teaserProgress.consumed}/{teaserProgress.limit}
                  </div>
                )}
              </div>
              {/* The engine that fills the dead space, and the same cue home
                  uses to say "this is a ticket for a train". Hidden on the
                  narrowest widths, where the route text needs the room. */}
              <div className="hidden shrink-0 items-end pb-2 pr-1 sm:flex" aria-hidden>
                <TrainEngine
                  className={cn(
                    "h-7 w-auto text-white drop-shadow-sm",
                    !reduceMotion && "animate-train-drive",
                  )}
                />
              </div>
              {/* THE STUB IS GONE, AND THE PERFORATION IS NOW A TORN EDGE.
                  Removed 2026-08-25: "technically, the ticket is already torn,
                  just get rid of the stub". A boarding pass being read on the
                  train has had its stub taken, so keeping one attached was the
                  detail that made the header look like a ticket nobody had
                  collected yet. Removed on both platforms together, since the
                  two headers are drawn to one design. */}
              <TicketPerforationV light />
            </div>
          </div>
        </div>
      </header>

      {/* Desktop line index. Fixed, so it never enters the map's layout, and
          xl-only because below that the margin it lives in does not exist.
          Hidden from assistive tech as a duplicate: every zone it lists is
          already reachable by scrolling the map itself. */}
      <nav
        aria-label="Jump to a fare zone"
        data-testid="journey-zone-rail"
        className="pointer-events-none fixed left-6 top-1/2 z-10 hidden -translate-y-1/2 xl:block"
      >
        <ol className="pointer-events-auto flex w-44 flex-col gap-1">
          {zoneNav.map((z) => (
            <li key={z.zoneIndex}>
              <button
                type="button"
                data-testid={`zone-rail-${z.zoneIndex}`}
                onClick={() => scrollToMapY(z.y)}
                className={cn(
                  "group flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors",
                  z.hasCurrent
                    ? "border-transparent"
                    : "border-transparent hover:bg-muted",
                )}
                style={
                  z.hasCurrent
                    ? { backgroundColor: `${line.accent}14`, borderColor: `${line.accent}59` }
                    : undefined
                }
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-black text-white"
                  style={{
                    backgroundColor:
                      z.done === z.total ? line.accent : `${line.accent}66`,
                  }}
                >
                  {z.zoneIndex + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-extrabold text-foreground">
                    {z.geoName}
                  </span>
                  <span className="mt-1 block h-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${z.total > 0 ? Math.round((z.done / z.total) * 100) : 0}%`,
                        backgroundColor: line.accent,
                      }}
                    />
                  </span>
                </span>
                <span className="shrink-0 text-[10px] font-bold tabular-nums text-muted-foreground">
                  {z.done}/{z.total}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {/* pb-nav below lg clears the floating BottomNav pill mounted by AppShell */}
      <main className="mx-auto w-full max-w-2xl flex-1 pb-nav lg:pb-14">
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
          <AutoScrollToCurrentStop
            mapRef={mapRef}
            targetY={currentStopY}
            reduceMotion={reduceMotion}
          />
          <div className="relative" style={{ height: totalH }}>
            {/* THE PAINTED BACKDROPS, one per fare zone, underneath everything.
                Depth order is now: backdrop < scenery < rail < stations.

                Plain divs rather than SVG <image>: the map is one <svg> laid
                over this container, and CSS background-size: cover is the same
                thing preserveAspectRatio="slice" would give with none of the
                viewBox arithmetic.

                NOT on the parallax layer. The scenery inside the svg drifts
                against the scroll, which reads as depth when it is a scatter
                of small props; a full-bleed painting doing the same thing
                reads as the ground sliding, which is worse than no parallax.

                The foot tone paints first so a slow fetch never flashes light
                behind the rail, and it is the colour the next band starts
                from. See lib/zone-backdrops.ts. Mobile twin carries the same
                comment. */}
            <div
              data-testid="journey-backdrop-layer"
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden"
            >
              {postcardYs.map(({ y, zoneIndex: zi }, si) => {
                const art = zoneBackdrop(zi);
                if (!art) return null;
                const end =
                  si + 1 < postcardYs.length ? postcardYs[si + 1]!.y : totalH;
                return (
                  <div
                    key={si}
                    data-testid={`journey-backdrop-${zi}`}
                    className="absolute left-0 w-full overflow-hidden bg-cover bg-center"
                    style={{
                      top: y,
                      height: end - y,
                      backgroundColor: zoneFootTone(zi),
                      backgroundImage: `url(${art})`,
                    }}
                  >
                    {/* A flat scrim rather than a gradient: the rail crosses
                        the whole height, so darkening only one end would leave
                        it legible in one half of the band and not the other. */}
                    <div
                      className="absolute inset-0"
                      style={{
                        backgroundColor: "#1B120E",
                        opacity: ZONE_BACKDROP_SCRIM,
                      }}
                    />
                  </div>
                );
              })}
            </div>
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
                    (p) =>
                      p.kind === "station" &&
                      p.station!.zoneIndex === zi &&
                      !p.collapsed &&
                      // Scenery is budgeted and placed by GRADED rows. Counting
                      // the tracing stop changed both how many pieces a zone
                      // got and which rows they landed on, and the STORY stop
                      // is the same kind of row. Counting it dropped a zone's
                      // scenery outright, because the stall-row set is built
                      // from graded indices and the two stopped agreeing.
                      !p.station!.trace &&
                      !p.station!.story,
                  );
                  const zoneAccessible = zone.stations.some(
                    (st) => isStatusAccessible(st.status) || st.teaserStation,
                  );
                  // A row hosting Chacha-ji's stall keeps its strip for him:
                  // decoration there would double as a second, meaningless
                  // stall right beside the landmark.
                  const stallRows = stallRowsByZone.get(zi);
                  return planZoneScenery(zi, zonePts.length)
                    .filter(({ row }) => !stallRows?.has(row))
                    .map(({ kind, row }, i) => {
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
                {/* Chacha-ji's stall: the same shipped trackside chai-stall
                    scene, seated in the gap after EVERY encounter station,
                    ahead of the learner and behind. Scenery only — this layer
                    is pointer-events-none and carries no state. */}
                {chachaStalls.map((s) => (
                  <g key={`chacha-stall-${s.station}`}>
                    {/* His plate. Two ellipses rather than one gradient, the
                        same trick the rail halo uses: an SVG radial gradient
                        needs a defs entry per zone and this is cheaper. */}
                    {MAP_GLYPH_PLATE.map((pass) => (
                      <ellipse
                        key={pass.r}
                        cx={s.x}
                        cy={s.y}
                        rx={pass.r}
                        ry={pass.r * 0.72}
                        fill={MAP_GLYPH_PLATE_FILL}
                        opacity={s.gray ? pass.opacity * 0.5 : pass.opacity}
                      />
                    ))}
                    <SceneryElement
                      kind="chaiStall"
                      x={s.x}
                      y={s.y}
                      accent={line.accent}
                      gray={s.gray}
                      testId={`chacha-stall-${s.station}`}
                    />
                    {/* The halt has a NAME. It was unlabelled scenery, so the
                        one recurring character on the map read as decoration:
                        a learner had no way to know the stall between stops is
                        the same stall, or whose it is. Indian lines name their
                        smallest stops "<name> Halt", and this is his.
                        Deliberately identical at every encounter station,
                        because it IS the same stall each time.
                        Two lines: the possessive is the quiet half and the
                        halt is the label, which keeps the wider line off a
                        18px-wide piece of art. Scenery still, so it inherits
                        the layer's pointer-events-none. */}
                    <text
                      data-testid={`chacha-stall-label-${s.station}`}
                      x={s.x}
                      y={s.y + 17}
                      textAnchor="middle"
                      className="select-none"
                      style={{
                        fill: line.accent,
                        opacity: s.gray ? 0.35 : 0.75,
                        fontSize: 7,
                        fontWeight: 700,
                      }}
                    >
                      Chacha-ji&rsquo;s
                    </text>
                    <text
                      x={s.x}
                      y={s.y + 25}
                      textAnchor="middle"
                      className="select-none"
                      style={{
                        fill: line.accent,
                        opacity: s.gray ? 0.3 : 0.6,
                        fontSize: 6,
                        fontWeight: 800,
                        letterSpacing: 0.6,
                        textTransform: "uppercase",
                      }}
                    >
                      CHAI HALT
                    </text>
                  </g>
                ))}
              </g>
              <g data-testid="journey-rail-layer">
                {segs.map((s, i) => (
                  <RailSegment key={i} d={s.d} lit={s.lit} />
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
                      // ROWS DRAWN, NOT PHRASE STATIONS. The card said 9
                      // while the rows beneath it said "Stop 1 of 11": the
                      // tracing and story stops are rows a learner counts and
                      // this number never knew about them. Reading the same
                      // list the rows come from means a new row type is
                      // counted by existing.
                      stationCount={zone.rowStations.length}
                      grayed={grayed}
                      zoneAllDone={zone.zoneAllDone}
                      scenarioId={scenarioIdByZone.get(zoneIndex)}
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

            {/* A folded zone's whole station block, as one row. It stands in
                for nine stops, so it has to say what it holds and how to get
                it back. */}
            {collapsedRowYs.map(({ y, zoneIndex }) => {
              const zone = zones[zoneIndex]!;
              return (
                <div
                  key={`collapsed-${zoneIndex}`}
                  className="absolute"
                  style={{ left: 16, right: 16, top: y, zIndex: DEPTH_2_5D.layers.postcard }}
                >
                  <button
                    type="button"
                    data-testid={`zone-collapsed-${zoneIndex}`}
                    onClick={() => toggleZone(zoneIndex)}
                    aria-expanded={false}
                    aria-label={`${zone.stations.length} stops ridden in ${zone.geoName}. Open this zone again.`}
                    className="flex w-full items-center gap-2 rounded-xl border-2 border-dashed bg-card/80 px-3 text-left transition-colors hover:bg-muted"
                    style={{ borderColor: `${line.accent}59`, height: COLLAPSED_H - 12 }}
                  >
                    <Check className="h-4 w-4 shrink-0" style={{ color: line.accent }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-extrabold text-foreground">
                        {zone.stations.length} stops ridden
                      </span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {zone.geoName} · tap to open this zone again
                      </span>
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                </div>
              );
            })}

            {/* Stations */}
            {pts
              .filter((p) => p.kind === "station" && !p.collapsed)
              .map((p, rowIdx) => {
                const s = p.station!;
                const zone = zones[s.zoneIndex]!;
                const zoneAccessible = zone.stations.some(
                  (st) => isStatusAccessible(st.status) || st.teaserStation,
                );
                const grayed = showroom && !zoneAccessible;
                const zoneColor = grayed ? GRAY : line.accent;
                // The flank comes off the station's GLOBAL index, not render
                // order: a folded zone removes rows from the render, and
                // counting them would flip every card below it onto the wrong
                // side of the track. Identical to the old counter when nothing
                // is folded.
                const k2 = p.globalIdx ?? stationIdx;
                stationIdx++;
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
                  // Keyed by ROW, not by group id. A tracing stop has no
                  // lesson-group id at all, and group ids are not unique across
                  // this list either: the same group can appear in more than
                  // one zone, which was already producing duplicate-key
                  // warnings before a tracing row existed. React is free to
                  // drop or duplicate children under a duplicate key, and that
                  // is what turned the scenery placement to nonsense.
                  <div key={`row-${rowIdx}`}>
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
                        firstClassActive={
                          tokensQuery.data?.firstClassActiveUntil != null &&
                          new Date(tokensQuery.data.firstClassActiveUntil) > new Date()
                        }
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
                        isCurrent={!s.trace && !s.story && s.id === currentId}
                        // A tracing stop is never PROGRESSION-locked: it
                        // teaches the alphabet, which no phrase stop gates. It
                        // can still be PLAN-locked, which is a different thing
                        // and is how the free taste is bounded to zone 1.
                        accessible={s.trace ? s.planLocked !== true : accessible}
                        showTeaserChip={s.teaserStation === true}
                        href={
                          // It opens the tracing screen, not a phrase session:
                          // there is no group to practise.
                          //
                          // KEYED OFF THE STOP, NOT OFF `zone.id`. The ladder
                          // is indexed by a 1-based zone ORDINAL, and a
                          // category id is not one: journeyLines.ts spells out
                          // that journey 1's ids are 1-6 only because those
                          // rows were inserted first, while journey 2's landed
                          // at 277-282. `s.trace` already carries the journey
                          // and ordinal it was resolved from, so it is the
                          // only thing that cannot drift.
                          s.trace
                            ? `/games/script-trace?journey=${s.trace.journey}&zone=${s.trace.zone}`
                            : s.story
                              ? `/games/storybook?journey=${s.story.journey}&zone=${s.story.zone}`
                              : `/practice/${zone.id}?group=${s.id}`
                        }
                        onNavigate={() => playStopSplash(zone.id)}
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
                            chaiUnlockable: s.chaiUnlockable === true,
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
                  // p-2 on the 40x50 glyph keeps the hit target at 56x66
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
                <span className="map-glyph-plate inline-flex">
                  <SignalGlyph state={sig.state} />
                </span>
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
                <span className="map-glyph-plate inline-flex">
                  <SignpostGlyph accent={sp.grayed ? GRAY : line.accent} />
                </span>
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
            {/* Item 3: the label used to sit BESIDE the terminus dot, flanking
                it on whichever side the serpentine ended, which put it under
                the festival bunting (strung at termY-34, its flags hanging to
                termY+3) and right-aligned it whenever the last stop landed on
                the right, so a wrapped second line drifted to the wrong edge.
                It now sits below the dot, across the full column, always
                centered: clear of the bunting above and of every scenery
                object, which is anchored to station rows further up. */}
            <div
              className="absolute text-xs font-bold text-muted-foreground text-center"
              style={{ left: 12, right: 12, top: termY + TERM_LABEL_DY }}
            >
              Terminus: {line.zones[5]},{" "}
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
                  className="flex w-full items-center justify-center rounded-xl border-2 border-border bg-card px-4 py-3 text-sm font-bold text-foreground active:scale-[0.98] transition-transform"
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
                  className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-border bg-card px-4 py-3 active:scale-[0.98] transition-transform"
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
                  {lock.stopLabel} is a sentence stop: graduate from phrases to
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
              {/* Chai stop unlock: offered ONLY where the server says so —
                  inside the first fare zone of a line the learner hasn't
                  bought. Once opened, the stop stays open for good (the
                  purchase is a ledger row, not device state). Everything
                  further down the line is All-Access territory, and the
                  ticket action below is untouched. */}
              {lock.chaiUnlockable === true &&
                stopUnlockCost !== null &&
                lock.groupId !== undefined && (
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      data-testid="button-unlock-stop-chai"
                      disabled={unlockStop.isPending}
                      onClick={() => {
                        setUnlockError(null);
                        unlockStop.mutate({
                          data: { lessonGroupId: lock.groupId! },
                        });
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-border bg-card px-4 py-3 text-sm font-black text-foreground active:scale-[0.98] transition-transform disabled:opacity-60"
                    >
                      <ChaiGlyph className="h-4 w-4" />
                      {unlockStop.isPending
                        ? "Opening the stop…"
                        : `Open this stop for ${stopUnlockCost} Chai`}
                    </button>
                    <p className="text-center text-[11px] text-muted-foreground">
                      Yours for keeps. You have {tokensQuery.data?.balance ?? 0}{" "}
                      Chai. Stops further down the {line.lineName} need a ticket.
                    </p>
                    {unlockError !== null && (
                      <p
                        role="alert"
                        data-testid="text-unlock-stop-error"
                        className="text-center text-[11px] font-bold text-destructive"
                      >
                        {unlockError}
                      </p>
                    )}
                  </div>
                )}
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
                {/* First Class: gold vars on a contents wrapper (no layout impact). */}
                <div
                  className="contents"
                  style={
                    tokensQuery.data?.firstClassActiveUntil &&
                    new Date(tokensQuery.data.firstClassActiveUntil) > new Date()
                      ? firstClassGoldVars
                      : undefined
                  }
                >
                  <TrainEngine className="w-16 shrink-0" />
                </div>
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
                  <ChaiGlyph className="h-3.5 w-3.5" />
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
                  className="w-full rounded-xl border-2 border-border bg-card px-4 py-3 text-sm font-bold text-foreground active:scale-[0.98] transition-transform"
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

      {/* Chacha-ji's stall. Dismissing it carries on into the stop's first
          item, which is the same place tapping the stop card would land. */}
      {chachaStop && (
        <ChachaEncounterDialog
          stationIndex={chachaStop.station}
          firstItemHref={chachaStop.href}
          open
          onOpenChange={(open) => !open && setChachaDlg(null)}
        />
      )}

      {/* Chunk 6B Story 4: zone closeout celebration (client-detected, never
          gating). Showroom callers have no live progress to close out. */}
      {!showroom && (
        <>
          
          <ChachaSoftStop
            station={activeChachaStation}
            dialogOpen={lock !== null || signalDlg !== null || factDlg !== null || chachaDlg !== null}
            closeoutPending={
              closeoutStateUnseeded(activeLang) ||
              zones.some(
                (z, zi) =>
                  z.zoneAllDone === true &&
                  readCloseoutStages(activeLang)[zi] !== "done",
              )
            }
            lang={activeLang}
            onOpen={setChachaDlg}
          />

          <EmergencySoftStop
            zone={emergencyZone}
            dialogOpen={lock !== null || signalDlg !== null || factDlg !== null || chachaDlg !== null}
            onFire={(z) => navigate(`/games/emergency?journey=${EMERGENCY_JOURNEY}&zone=${z}`)}
          />

          <SignalSoftStop
            sig={signals.find((s) => s.held) ?? null}
            dialogOpen={lock !== null || signalDlg !== null || factDlg !== null || chachaDlg !== null}
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
              scenarioId: scenarioIdByZone.get(zi),
              hasStamp: stampedZoneIndices.has(zi),
            }))}
          />
        </>
      )}
    </div>
  );
}
