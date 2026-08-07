// Art tiles for the Chai wallet rows.
//
// Each row of the wallet used to be text and a button; these give every offer
// a picture of what it does. Three rules hold them together:
//
//  - The TRAIN is the canonical engine (components/train-svg.tsx), never a new
//    drawing. Its parts read theme tokens, so each tile PINS those tokens to
//    fixed values on its own wrapper — the tiles are painted scenes on fixed
//    backgrounds and must not flip with the theme.
//  - BOLO is the canonical mascot component, so the bird in the bazaar tile is
//    wearing whatever the learner bought, and the whole-image motion rule
//    holds automatically.
//  - MOTION is CSS from index.css (train-bob / train-drive), which the global
//    prefers-reduced-motion reset already neutralises into a clean parked
//    frame. Nothing here animates layout — transforms and opacity only.
import type { CSSProperties } from "react";
import { Mascot } from "@/components/mascot";
import { TrainEngine } from "@/components/train-svg";
import { INDIA } from "@/lib/india-palette";
import { cn } from "@/lib/utils";

/** Token pins for engine art sitting on a warm (daylight) tile. */
const WARM_ENGINE_VARS = {
  "--color-foreground": INDIA.iron,
  "--color-primary": INDIA.express,
  "--color-secondary": INDIA.peacock,
  "--color-card-border": "#FFFFFF",
} as CSSProperties;

/** Token pins for engine art sitting on the indigo express tile. */
const NIGHT_ENGINE_VARS = {
  "--color-foreground": INDIA.iron,
  "--color-primary": INDIA.gold,
  "--color-secondary": INDIA.peacock,
  "--color-card-border": "#FFFFFF",
} as CSSProperties;

function Tile({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl",
        className,
      )}
      style={style}
    >
      {children}
    </div>
  );
}

/**
 * Station Pause: the engine standing at a platform under a signal, steam
 * ticking over. It is waiting for you — which is exactly what a pause buys.
 */
export function StationPauseTile() {
  return (
    <Tile
      style={{
        ...WARM_ENGINE_VARS,
        background: `linear-gradient(180deg, ${INDIA.skyHigh} 0%, ${INDIA.skyLow} 100%)`,
      }}
    >
      {/* afternoon sun */}
      <span
        className="absolute right-2 top-2 block h-3.5 w-3.5 rounded-full"
        style={{ background: INDIA.gold, opacity: 0.85 }}
      />
      {/* signal post: red lamp, arm out over the line */}
      <span
        className="absolute right-3 bottom-4 block w-[2px]"
        style={{ height: 22, background: INDIA.iron }}
      />
      <span
        className="absolute right-[7px] block h-1.5 w-1.5 rounded-full"
        style={{ bottom: 24, background: INDIA.stripe }}
      />
      {/* the engine, parked and breathing */}
      <span className="animate-train-bob absolute bottom-[13px] left-1 block">
        <TrainEngine className="h-[26px] w-10 text-white" />
      </span>
      {/* platform edge and its shadow */}
      <span
        className="absolute inset-x-0 bottom-0 block"
        style={{
          height: 13,
          background: `linear-gradient(180deg, ${INDIA.timber} 0 45%, ${INDIA.timberShade} 45% 100%)`,
        }}
      />
    </Tile>
  );
}

/**
 * Bolo Bazaar: a stall front — striped awning, marigold dot, and the learner's
 * own bird standing under it in whatever he currently owns.
 */
export function BazaarTile() {
  return (
    <Tile style={{ background: INDIA.wall }}>
      {/* awning across the top, scalloped hem beneath it */}
      <span
        className="absolute inset-x-0 top-0 block"
        style={{
          height: 13,
          backgroundImage: `repeating-linear-gradient(90deg, ${INDIA.stripe} 0 8px, ${INDIA.cloth} 8px 16px)`,
        }}
      />
      <span className="absolute inset-x-0 top-[13px] flex">
        {Array.from({ length: 8 }).map((_, i) => (
          <span
            key={i}
            className="h-1.5 flex-1 rounded-b-full"
            style={{ background: i % 2 === 0 ? INDIA.stripe : INDIA.cloth }}
          />
        ))}
      </span>
      {/* a marigold hanging from the awning */}
      <span
        className="absolute left-2 top-[21px] block h-1.5 w-1.5 rounded-full"
        style={{ background: INDIA.gold }}
      />
      {/* the bird, wearing whatever he owns */}
      <span className="absolute bottom-[7px] left-1/2 block -translate-x-1/2">
        <Mascot pose="wave" size={40} ambient="calm" />
      </span>
      {/* the counter he stands behind */}
      <span
        className="absolute inset-x-0 bottom-0 block"
        style={{
          height: 7,
          background: `linear-gradient(180deg, ${INDIA.timber} 0 55%, ${INDIA.timberShade} 55% 100%)`,
        }}
      />
    </Tile>
  );
}

/**
 * Express Multiplier: the same engine, but running — speed streaks behind it
 * and a 2× flag on the roof.
 */
export function ExpressTile({ running = false }: { running?: boolean }) {
  return (
    <Tile
      style={{
        ...NIGHT_ENGINE_VARS,
        background: `linear-gradient(135deg, ${INDIA.express} 0%, ${INDIA.expressDeep} 100%)`,
      }}
    >
      {/* speed streaks */}
      {[14, 22, 30].map((top, i) => (
        <span
          key={top}
          className="absolute left-1 block rounded-full bg-white"
          style={{ top, height: 2, width: 14 + i * 6, opacity: 0.28 }}
        />
      ))}
      {/* the 2x flag */}
      <span
        className="absolute right-1.5 top-1.5 rounded-md px-1.5 py-px text-[10px] font-black leading-tight"
        style={{ background: INDIA.gold, color: INDIA.iron }}
      >
        2×
      </span>
      {/* the engine, driving */}
      <span
        className={cn(
          "absolute bottom-[11px] left-1 block",
          running ? "animate-train-drive" : "animate-train-bob",
        )}
      >
        <TrainEngine className="h-[26px] w-10 text-white" />
      </span>
      {/* the rail under it */}
      <span
        className="absolute inset-x-0 bottom-[7px] block h-[3px]"
        style={{ background: "rgba(255,255,255,0.55)" }}
      />
    </Tile>
  );
}
