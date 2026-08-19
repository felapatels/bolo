// Serpentine-track journey map renderer. Stop cards, badges, lock states and
// the parked-train current-stop marker are copied 1:1 from
// artifacts/gujarati-coach/src/pages/journey.tsx — only the path geometry and
// the connector art (railway track) differ, per the Task 3 spec.
import { Lock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { TrainEngine } from "./TrainEngine";
import {
  ACCENT,
  BG,
  DONE_COUNT,
  GRAY,
  LINE_NAME,
  TOTAL_COUNT,
  ZONES,
  isAccessible,
  mascotUrl,
  statusCopy,
  type MockStation,
} from "./data";

const W = 390;

export interface SerpentineConfig {
  /** Marker x for global station index k. */
  stationX: (k: number) => number;
  /** Card box, given the marker x. */
  cardBox: (x: number, k: number) => { left: number; width: number; side: "left" | "right" };
  /** Row height per station. */
  stationH: number;
}

interface Pt {
  x: number;
  y: number;
  kind: "station" | "postcard" | "terminus";
  lit: boolean;
  station?: MockStation;
  zoneIndex?: number;
}

/** Marker copied from journey.tsx StationMarker (circle / diamond / train). */
function StationMarker({ station, color }: { station: MockStation; color: string }) {
  if (station.isCurrent) {
    return (
      <div
        className="w-10 h-7 rounded-full bg-white flex items-center justify-center px-1"
        style={{ boxShadow: `0 0 0 4px ${color}, 0 0 0 8px ${color}33`, color }}
        title="Your current stop"
      >
        <TrainEngine className="w-8 h-full" />
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
  const accessible = isAccessible(station);
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

/** Stop card contents copied from journey.tsx StationRow (badges intact). */
function StopCard({ station, color }: { station: MockStation; color: string }) {
  const accessible = isAccessible(station);
  const stopLabel = `Stop ${station.stopNumber} of ${station.stopCount}`;
  return (
    <div
      className={cn(
        "min-w-0 rounded-lg px-3 py-2",
        station.isCurrent && "bg-card border shadow-sm",
      )}
      style={station.isCurrent ? { borderColor: color } : undefined}
    >
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
        {station.teaser && (
          <span
            className="rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shrink-0"
            style={{ background: color }}
          >
            Free taste
          </span>
        )}
        {!accessible && <Lock className="w-3 h-3 text-muted-foreground shrink-0" />}
      </div>
      <div className="text-[11px] text-muted-foreground">
        {statusCopy(station)}
        {station.attemptedCount
          ? ` · ${station.masteredCount}/${station.phraseCount} mastered`
          : ` · ${station.phraseCount} phrases`}
        {station.isCurrent && " · Bolo is waiting here"}
      </div>
    </div>
  );
}

/** Fare-zone postcard copied from journey.tsx (full-width; the interchange
 *  diamond is drawn on the track at the path's x for this y). */
function ZonePostcard({
  zoneIndex,
  zoneTitle,
  geoName,
  stationCount,
}: {
  zoneIndex: number;
  zoneTitle: string;
  geoName: string;
  stationCount: number;
}) {
  const color = ACCENT;
  return (
    <div className="rounded-lg border-2 bg-white shadow-sm overflow-hidden" style={{ borderColor: color }}>
      <div className="m-1 rounded-md border border-dashed" style={{ borderColor: `${color}66` }}>
        <div className="flex items-stretch gap-0">
          <div className="flex-1 min-w-0 px-3 py-2">
            <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color }}>
              Fare zone {zoneIndex + 1} · {zoneTitle}
            </div>
            <div className="text-sm font-extrabold leading-tight text-foreground truncate">
              {geoName}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {stationCount} {stationCount === 1 ? "stop" : "stops"} in this zone
            </div>
            <div
              className="mt-1.5 text-[10px] font-semibold italic"
              style={{ color, transform: "rotate(-1.5deg)", transformOrigin: "left center" }}
              aria-hidden
            >
              {geoName}
            </div>
          </div>
          <div className="w-px self-stretch my-1.5" style={{ background: `${color}44` }} aria-hidden />
          <div className="shrink-0 flex flex-col items-center justify-between gap-1 px-2 py-1.5">
            <div
              className="h-9 w-9 rounded-sm border-2 flex flex-col items-center justify-center"
              style={{ borderColor: color }}
              aria-hidden
            >
              <span className="text-[8px] font-black uppercase tracking-wide leading-none" style={{ color }}>
                Zone
              </span>
              <span className="text-base font-black leading-none" style={{ color }}>
                {zoneIndex + 1}
              </span>
            </div>
            <div
              className="w-8 h-8 rounded-full border border-dashed flex items-center justify-center"
              style={{ borderColor: `${color}88` }}
              aria-hidden
            >
              <div className="w-5 h-5 rounded-full border flex items-center justify-center" style={{ borderColor: color }}>
                <div className="w-1 h-1 rounded-full" style={{ background: color }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One railway segment: sleeper ties under twin rails (a wide stroke split in
 *  two by a background-colored center stroke). Locked segments are faded and
 *  dashed; completed/boarding segments are solid accent. */
function RailSegment({ d, lit }: { d: string; lit: boolean }) {
  const color = lit ? ACCENT : GRAY;
  return (
    <g opacity={lit ? 1 : 0.5}>
      <path d={d} stroke={color} strokeWidth={15} strokeDasharray="3 11" opacity={0.3} fill="none" />
      <path d={d} stroke={color} strokeWidth={8.5} fill="none" strokeDasharray={lit ? undefined : "9 7"} />
      <path d={d} stroke={BG} strokeWidth={4} fill="none" strokeDasharray={lit ? undefined : "9 7"} />
    </g>
  );
}

const PC_H = 122;
const TERM_H = 92;
const TOP_PAD = 10;

export function SerpentineMap({ config }: { config: SerpentineConfig }) {
  // Lay the sequence out on a fixed vertical rhythm, collecting path points.
  const pts: Pt[] = [];
  const postcardYs: { y: number; zoneIndex: number }[] = [];
  let y = TOP_PAD;
  let k = 0; // global station index (drives the serpentine phase)
  for (let zi = 0; zi < ZONES.length; zi++) {
    const zone = ZONES[zi]!;
    const zoneLit = zone.stations.some((s) => isAccessible(s) || s.teaser);
    postcardYs.push({ y, zoneIndex: zi });
    // Path point mid-postcard, x interpolated between neighbor stations.
    const xPrev = k === 0 ? config.stationX(0) : config.stationX(k - 1);
    const xNext = config.stationX(k);
    pts.push({ x: (xPrev + xNext) / 2, y: y + PC_H / 2, kind: "postcard", lit: zoneLit, zoneIndex: zi });
    y += PC_H;
    for (const s of zone.stations) {
      const x = config.stationX(k);
      const lit =
        s.status === "completed" ||
        s.status === "tested_out" ||
        s.status === "in_progress" ||
        (s.status === "unlocked" && !s.sentenceGated);
      pts.push({ x, y: y + config.stationH / 2, kind: "station", lit, station: s });
      y += config.stationH;
      k++;
    }
  }
  const allDone = DONE_COUNT === TOTAL_COUNT && TOTAL_COUNT > 0;
  const termY = y + TERM_H / 2;
  pts.push({ x: config.stationX(k - 1), y: termY, kind: "terminus", lit: allDone });
  const totalH = y + TERM_H + 8;

  const segs = pts.slice(1).map((p, i) => {
    const a = pts[i]!;
    const dy = (p.y - a.y) / 2;
    return {
      d: `M ${a.x} ${a.y} C ${a.x} ${a.y + dy}, ${p.x} ${p.y - dy}, ${p.x} ${p.y}`,
      lit: p.lit,
    };
  });

  let k2 = 0;
  return (
    <div className="journey-mockup bg-background" style={{ width: W }}>
      {/* Boarding-pass header, unchanged from journey.tsx (baseline styling) */}
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border px-3 py-3">
        <div className="rounded-lg border-2 border-dashed border-border bg-card px-4 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
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
            <div className="text-2xl shrink-0" aria-hidden>
              🎫
            </div>
          </div>
        </div>
      </div>

      <div className="relative" style={{ height: totalH }}>
        {/* Railway track */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width={W}
          height={totalH}
          viewBox={`0 0 ${W} ${totalH}`}
          aria-hidden
        >
          {segs.map((s, i) => (
            <RailSegment key={i} d={s.d} lit={s.lit} />
          ))}
        </svg>

        {/* Zone postcards (full width; interchange diamond rides the track) */}
        {postcardYs.map(({ y: py, zoneIndex }) => {
          const zone = ZONES[zoneIndex]!;
          const pt = pts.find((p) => p.kind === "postcard" && p.zoneIndex === zoneIndex)!;
          return (
            <div key={zone.id}>
              <div className="absolute" style={{ left: 16, right: 16, top: py + 10 }}>
                <ZonePostcard
                  zoneIndex={zoneIndex}
                  zoneTitle={zone.title}
                  geoName={zone.geoName}
                  stationCount={zone.stations.length}
                />
              </div>
              {/* interchange diamond pinned where the track enters the zone
                  card (top border) so it never collides with the card text */}
              <div
                className="absolute w-4 h-4 border-4 border-white"
                style={{
                  left: pt.x,
                  top: py + 10,
                  transform: "translate(-50%, -50%) rotate(45deg)",
                  background: pt.lit ? ACCENT : GRAY,
                  boxShadow: `0 0 0 2px ${pt.lit ? ACCENT : GRAY}`,
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
            const box = config.cardBox(p.x, k2++);
            return (
              <div key={s.id}>
                <div
                  className="absolute flex items-center justify-center"
                  style={{ left: p.x, top: p.y, transform: "translate(-50%, -50%)", zIndex: 6 }}
                >
                  <StationMarker station={s} color={ACCENT} />
                </div>
                <div
                  className="absolute flex items-center gap-1"
                  style={{
                    left: box.left,
                    width: box.width,
                    top: p.y,
                    transform: "translateY(-50%)",
                    zIndex: 4,
                    justifyContent: box.side === "left" ? "flex-end" : "flex-start",
                  }}
                >
                  {box.side === "left" && s.isCurrent && (
                    <img
                      src={mascotUrl("mascot-cheer")}
                      alt=""
                      width={44}
                      height={44}
                      className="shrink-0"
                    />
                  )}
                  <StopCard station={s} color={ACCENT} />
                  {box.side === "right" && s.isCurrent && (
                    <img
                      src={mascotUrl("mascot-cheer")}
                      alt=""
                      width={44}
                      height={44}
                      className="shrink-0"
                    />
                  )}
                </div>
              </div>
            );
          })}

        {/* Terminus, unchanged from journey.tsx */}
        <div
          className="absolute w-6 h-6 rounded-full border-4 border-white"
          style={{
            left: pts[pts.length - 1]!.x,
            top: termY,
            transform: "translate(-50%, -50%)",
            background: allDone ? ACCENT : GRAY,
            boxShadow: `0 0 0 2px ${allDone ? ACCENT : GRAY}`,
            zIndex: 5,
          }}
        />
        <div
          className="absolute text-xs font-bold text-muted-foreground"
          style={{ left: pts[pts.length - 1]!.x + 24, right: 12, top: termY, transform: "translateY(-50%)" }}
        >
          Terminus: Dwarka — the festival finale awaits
        </div>
      </div>

      <p className="px-6 pb-6 pt-1 text-center text-[11px] text-muted-foreground">
        Tap any lit station to practice it. The {LINE_NAME} only stops at the
        next station once you finish the one before it.
      </p>
    </div>
  );
}
