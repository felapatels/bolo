// Task #1117 — web mock: train skins on leaderboard friend rows.
//
// MOCK AND MEASUREMENT, NOT A FEATURE. Nothing here is imported by the app,
// nothing here ships. The file is copied into artifacts/gujarati-coach/src/
// under a temporary directory at run time (so it resolves the artifact's own
// deps, alias and Tailwind source scan) and deleted again by the probe.
//
// Three rules keep the mock honest:
//  1. The ROW MARKUP is copied verbatim from src/pages/friends.tsx
//     (LeaderboardRow) — same wrapper classes, same rank badge, same name
//     column, same XP cluster. Task #1112 is editing that file right now; the
//     mock copies it, it never edits it.
//  2. The TRAIN is the real component (@/components/train-svg), recoloured the
//     way the product already recolours one instance: by pinning the four
//     theme tokens on a wrapper, exactly as the Chai wallet's art tiles do
//     (src/components/wallet-art.tsx). No palette prop is invented, and only
//     the four palette roles change — the white highlights and the headlamp
//     are left alone.
//  3. The AVATAR is replaced by a labelled placeholder block at 60px, the size
//     Task #1112 is moving the dressed mascot to. #1112 is not merged, so its
//     component is deliberately not imported.
import type { CSSProperties } from "react";
import { Crown, Medal } from "lucide-react";
import { motion } from "framer-motion";
import { TrainEngine } from "@/components/train-svg";
import { springs } from "@/lib/motion";
import { cn } from "@/lib/utils";
import {
  BACKGROUND_TREATMENT_OPACITY,
  ENGINE_BOX,
  PALETTES,
  ROWS,
} from "./palettes.mjs";
import "./harness.css";

type Palette = {
  id: string;
  label: string;
  chassis: string;
  body: string;
  trim: string;
  steam: string;
};

const paletteById = (id: string | null): Palette | null =>
  id ? ((PALETTES as Palette[]).find((p) => p.id === id) ?? null) : null;

/** The wallet-art mechanism: pin the four roles the engine reads. */
const pins = (p: Palette): CSSProperties =>
  ({
    "--color-foreground": p.chassis,
    "--color-primary": p.body,
    "--color-secondary": p.trim,
    "--color-card-border": p.steam,
  }) as CSSProperties;

function Engine({
  palette,
  box,
  probe,
  className,
  style,
}: {
  palette: Palette;
  box: { width: number; height: number };
  probe: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      data-train={probe}
      className={className}
      style={{ ...pins(palette), ...style, display: "block" }}
    >
      <TrainEngine
        style={{ width: box.width, height: box.height, display: "block" }}
      />
    </span>
  );
}

/** Stand-in for Task #1112's dressed mascot: 60px, the size that task moves to. */
function MascotPlaceholder({ isSelf }: { isSelf: boolean }) {
  return (
    <div
      data-probe="mascot-placeholder"
      className={cn(
        "flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full text-[9px] font-black leading-none",
        isSelf
          ? "bg-white/20 text-primary-foreground"
          : "bg-primary/15 text-primary",
      )}
    >
      #1112
    </div>
  );
}

type Treatment = "a" | "b" | "c";

/**
 * Row markup copied verbatim from friends.tsx LeaderboardRow, with exactly two
 * differences: the Avatar is the 60px placeholder, and the treatment decides
 * where (if anywhere) the engine goes.
 *
 * Treatment C adds `relative overflow-hidden` to the row and `relative` to the
 * four existing children. Neither changes layout by a pixel — they only fix
 * paint order, so the absolutely positioned engine stays BEHIND the text
 * instead of over it. That is what shipping would have to do too.
 */
function LeaderboardRow({
  entry,
  index,
  treatment,
  textless,
  probeId,
}: {
  entry: (typeof ROWS)[number];
  index: number;
  treatment: Treatment;
  /** Measurement strip only: the row's own content is set to
   *  `visibility: hidden`, so a pixel sample of the engine hits the engine
   *  composited over the row background instead of a numeral painted on top
   *  of it. Layout, background and engine are identical to the live row. */
  textless?: boolean;
  probeId?: string;
}) {
  const styles = rankStyles(entry.rank);
  const palette = paletteById(entry.palette);
  const bg = treatment === "c" && palette;
  const inline = treatment === "a" && palette;
  const probe = probeId ?? `${treatment}-${entry.key}`;
  const hide = textless ? "invisible" : undefined;
  return (
    <motion.div
      data-row={probe}
      data-rowbg={entry.isSelf ? "self" : "card"}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springs.snappy, delay: index * 0.05 }}
      className={cn(
        "flex items-center gap-3 rounded-2xl p-3 border shadow-sm card-lift",
        entry.isSelf
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card border-card-border",
        bg && "relative overflow-hidden",
      )}
    >
      {bg ? (
        <Engine
          palette={palette}
          box={ENGINE_BOX.background}
          probe={probe}
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
          style={{ opacity: BACKGROUND_TREATMENT_OPACITY }}
        />
      ) : null}

      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-black",
          entry.isSelf ? "bg-white/20 text-primary-foreground" : styles.bg,
          !entry.isSelf && styles.ring,
          bg && "relative",
          hide,
        )}
      >
        {entry.rank <= 3 ? (
          <Medal className="w-5 h-5" />
        ) : (
          <span className="text-sm">{entry.rank}</span>
        )}
      </div>

      <div className={cn(bg && "relative", hide)}>
        <MascotPlaceholder isSelf={entry.isSelf} />
      </div>

      {inline ? (
        <Engine
          palette={palette}
          box={ENGINE_BOX.inline}
          probe={probe}
          className="shrink-0"
        />
      ) : null}

      <div className={cn("min-w-0 flex-1", bg && "relative", hide)}>
        <p className="truncate font-bold leading-tight">
          {entry.name}
          {entry.isSelf && (
            <span className="ml-1.5 text-xs font-bold opacity-80">(You)</span>
          )}
        </p>
        <p
          className={cn(
            "text-xs font-medium",
            entry.isSelf
              ? "text-primary-foreground/80"
              : "text-muted-foreground",
          )}
        >
          Rank #{entry.rank}
        </p>
      </div>

      <div
        data-probe={`xp-${probe}`}
        className={cn(
          "flex items-center gap-1.5 shrink-0",
          bg && "relative",
          hide,
        )}
      >
        <Crown
          className={cn(
            "w-4 h-4",
            entry.isSelf ? "text-amber-300" : "text-amber-400",
          )}
          fill="currentColor"
        />
        <span className="text-lg font-black tabular-nums">{entry.xp}</span>
        <span
          className={cn(
            "text-[10px] font-bold uppercase tracking-wider",
            entry.isSelf ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          XP
        </span>
      </div>
    </motion.div>
  );
}

/** Copied verbatim from friends.tsx. */
function rankStyles(rank: number) {
  switch (rank) {
    case 1:
      return { ring: "text-amber-400", bg: "bg-amber-400/15" };
    case 2:
      return { ring: "text-slate-400", bg: "bg-slate-400/15" };
    case 3:
      return { ring: "text-orange-400", bg: "bg-orange-400/15" };
    default:
      return { ring: "text-muted-foreground", bg: "bg-muted" };
  }
}

function Section({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section data-section={id} className="bg-background px-4 py-4">
      <h2 className="text-sm font-black text-foreground">{title}</h2>
      <p className="mb-3 text-[11px] leading-snug text-muted-foreground">
        {note}
      </p>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Stack({ treatment }: { treatment: Treatment }) {
  return (
    <>
      {ROWS.map((entry, i) => (
        <LeaderboardRow
          key={entry.key}
          entry={entry}
          index={i}
          treatment={treatment}
        />
      ))}
    </>
  );
}

/** Condition 4 reference plate: each provisional livery at full size. */
function References() {
  return (
    <div className="space-y-3">
      {(PALETTES as Palette[]).map((p) => (
        <div
          key={p.id}
          className="flex items-center gap-3 rounded-2xl border border-card-border bg-card p-3"
        >
          <Engine
            palette={p}
            box={ENGINE_BOX.reference}
            probe={`ref-${p.id}`}
            className="shrink-0"
          />
          <p className="text-[11px] font-bold leading-snug text-foreground">
            {p.label}
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * Every provisional livery on the indigo self-row in the background treatment.
 * The main stack only carries the indigo-adjacent skin there (that is the
 * decisive case the owner asked for); this grid gets a reading for all four
 * against the self-row background.
 */
function SelfRowGrid() {
  return (
    <>
      {(PALETTES as Palette[]).map((p, i) => (
        <LeaderboardRow
          key={p.id}
          entry={{
            key: `self-${p.id}`,
            rank: 1,
            name: `You — ${p.id}`,
            isSelf: true,
            xp: 1840,
            palette: p.id,
          }}
          index={i}
          treatment="c"
        />
      ))}
    </>
  );
}

/**
 * Measurement strip. Same treatment-C row, same engine, same backgrounds, with
 * the row's own content hidden so a pixel sample of the engine reads the
 * ENGINE composited over the row background — not an XP numeral painted on top
 * of it. Every livery appears on both backgrounds that matter: the indigo
 * self-row and bg-card.
 */
function MeasurementStrip() {
  return (
    <>
      {(PALETTES as Palette[]).flatMap((p) =>
        [true, false].map((isSelf) => (
          <LeaderboardRow
            key={`${p.id}-${isSelf}`}
            entry={{
              key: `strip-${p.id}`,
              rank: isSelf ? 1 : 4,
              name: p.id,
              isSelf,
              xp: 1840,
              palette: p.id,
            }}
            index={0}
            treatment="c"
            textless
            probeId={`strip-${isSelf ? "self" : "card"}-${p.id}`}
          />
        )),
      )}
    </>
  );
}

export default function Harness() {
  return (
    <main className="min-h-[100dvh] bg-background font-sans text-foreground">
      <Section
        id="reference"
        title="Reference liveries (provisional)"
        note="Full-size engines for the naming test. Provisional swatches only — not named, not priced, not a shipping set."
      >
        <References />
      </Section>

      <Section
        id="treatment-a"
        title="Treatment A — mascot and train side by side"
        note="Engine 64px wide, in flow, between the 60px mascot placeholder and the name column."
      >
        <Stack treatment="a" />
      </Section>

      <Section
        id="treatment-b"
        title="Treatment B — mascot only"
        note="The row as it renders today (with #1112's 60px mascot placeholder). No skin is shown at all."
      >
        <Stack treatment="b" />
      </Section>

      <Section
        id="treatment-c"
        title={`Treatment C — train in the row background (opacity ${BACKGROUND_TREATMENT_OPACITY})`}
        note="Engine 88px wide, absolutely positioned at the trailing edge, zero layout width. Row 1 is the caller's indigo self-row carrying the indigo-adjacent skin; the last row has no skin equipped."
      >
        <Stack treatment="c" />
      </Section>

      <Section
        id="grid"
        title="Treatment C — every livery on the indigo self-row"
        note="What all four provisional liveries look like on the caller's own indigo row."
      >
        <SelfRowGrid />
      </Section>

      <Section
        id="strip"
        title="Measurement strip (row content hidden)"
        note="Identical treatment-C rows with the row's own content set to visibility:hidden, so pixel samples read the engine composited over the row background rather than a numeral painted over the engine. Each livery on the indigo self-row and on bg-card."
      >
        <MeasurementStrip />
      </Section>
    </main>
  );
}
