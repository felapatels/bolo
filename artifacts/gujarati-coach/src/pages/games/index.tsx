import { useState } from "react";
import { Link } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import {
  Gamepad2,
  Link2,
  Headphones,
  Layers,
  Zap,
  Award,
  Lock,
  Star,
  Ticket,
  Shuffle,
  Briefcase,
  FastForward,
  TrafficCone,
} from "lucide-react";
import { useEntitlements } from "@/lib/entitlements";
import { Mascot } from "@/components/mascot";
import { cn } from "@/lib/utils";
import { springs } from "@/lib/motion";
import { GamePreview } from "./game-previews";

type GameDef = {
  id: string;
  href: string;
  title: string;
  description: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  plusOnly: boolean;
  Icon: React.ElementType;
};

const GAMES: GameDef[] = [
  {
    id: "word-match",
    href: "/games/word-match",
    title: "Word Match",
    description: "Match words to their translations before time runs out",
    difficulty: "Beginner",
    plusOnly: true,
    Icon: Link2,
  },
  {
    id: "listen-and-pick",
    href: "/games/listen-and-pick",
    title: "Listen & Pick",
    description: "Hear a word or phrase and choose the right translation",
    difficulty: "Beginner",
    plusOnly: true,
    Icon: Headphones,
  },
  {
    id: "phrase-builder",
    href: "/games/phrase-builder",
    title: "Phrase Builder",
    description: "Arrange word tiles into correct phrases",
    difficulty: "Intermediate",
    plusOnly: true,
    Icon: Layers,
  },
  {
    id: "speed-round",
    href: "/games/speed-round",
    title: "Speed Round",
    description: "Race against the clock to answer as many as you can",
    difficulty: "Intermediate",
    plusOnly: true,
    Icon: Zap,
  },
  // FEATURE FLAG: script-trace hidden until pen animation and scoring are polished
  // {
  //   id: "script-trace",
  //   href: "/games/script-trace",
  //   title: "Script Trace",
  //   description: "Trace native-script characters stroke by stroke",
  //   difficulty: "Advanced",
  //   plusOnly: true,
  //   Icon: PenLine,
  // },
  {
    id: "bolo-quiz",
    href: "/games/bolo-quiz",
    title: "Bolo Quiz",
    description: "A fresh daily quiz to test everything you have learned",
    difficulty: "Advanced",
    plusOnly: true,
    Icon: Award,
  },
  // Chunk 6B quick games: five free, fast rounds that also serve the
  // journey's trackside signals and zone closeouts.
  {
    id: "ticket-check",
    href: "/games/ticket-check",
    title: "Ticket Check",
    description: "Match each ticket to the right native script",
    difficulty: "Beginner",
    plusOnly: false,
    Icon: Ticket,
  },
  {
    id: "wrong-platform",
    href: "/games/wrong-platform",
    title: "Wrong Platform",
    description: "Spot the phrase that boarded at the wrong platform",
    difficulty: "Beginner",
    plusOnly: false,
    Icon: Shuffle,
  },
  {
    id: "luggage-match",
    href: "/games/luggage-match",
    title: "Luggage Match",
    description: "Pair native-script luggage tags with their English twins",
    difficulty: "Beginner",
    plusOnly: false,
    Icon: Briefcase,
  },
  {
    id: "express-listening",
    href: "/games/express-listening",
    title: "Express Listening",
    description: "A faster Listen & Pick where the express waits for no one",
    difficulty: "Intermediate",
    plusOnly: false,
    Icon: FastForward,
  },
  {
    id: "signal-lights",
    href: "/games/signal-lights",
    title: "Signal Lights",
    description: "Call true or false on flashing meanings before time runs out",
    difficulty: "Beginner",
    plusOnly: false,
    Icon: TrafficCone,
  },
];

type GameGroup = {
  id: string;
  title: string;
  /** Curated membership AND order. Never re-sorted at runtime. */
  gameIds: string[];
};

/**
 * The hub's fixed curated shelves. This array is the single source of both
 * group order and within-group card order; nothing downstream sorts, filters
 * by tier, or reorders on entitlement state.
 */
const GAME_GROUPS: GameGroup[] = [
  {
    id: "listening",
    title: "Listening",
    gameIds: ["listen-and-pick", "express-listening", "signal-lights"],
  },
  {
    id: "vocabulary",
    title: "Vocabulary",
    gameIds: ["luggage-match", "word-match", "ticket-check", "bolo-quiz"],
  },
  {
    id: "building",
    title: "Building",
    gameIds: ["wrong-platform", "phrase-builder", "speed-round"],
  },
];

/**
 * Featured slot configuration. Data-driven on purpose: it names WHERE the
 * hero card is sourced from rather than naming a card inline, so the slot can
 * be re-pointed (or later fed from the server) without touching the render.
 * There is deliberately NO rotation logic here.
 */
const FEATURED_SLOT: { groupId: string } = { groupId: "vocabulary" };

const GAMES_BY_ID: Record<string, GameDef> = Object.fromEntries(
  GAMES.map((game) => [game.id, game]),
);

/**
 * The catalog flattened in curated order. Its index doubles as each game's
 * ambient-loop phase offset, so no two vignettes ever pulse in sync.
 */
const ORDERED_GAMES: GameDef[] = GAME_GROUPS.flatMap((group) =>
  group.gameIds.map((id) => GAMES_BY_ID[id]).filter(Boolean),
);

const STAGGER_INDEX: Record<string, number> = Object.fromEntries(
  ORDERED_GAMES.map((game, index) => [game.id, index]),
);

/** The featured card resolves to the first card of the configured group. */
function resolveFeaturedGame(): GameDef | undefined {
  const group = GAME_GROUPS.find((g) => g.id === FEATURED_SLOT.groupId);
  const firstId = group?.gameIds[0];
  return firstId ? GAMES_BY_ID[firstId] : undefined;
}

/**
 * Per-game color identity (one distinct hue per game, drawn from the Tailwind
 * palette). Gated cards render in FULL COLOR — the All-Access badge and lock
 * chip carry the gate, never a gray or washed-out tile.
 */
type GameColor = {
  /** Card background tint. */
  bg: string;
  /** Card border accent (incl. hover deepen). */
  border: string;
  /** Icon bubble background. */
  iconBg: string;
  /** Icon color. */
  iconColor: string;
  /**
   * Press bloom (task 986): a brief border glow in the card's own hue while
   * pressed. motion-safe so reduced motion never flashes it.
   */
  pressGlow: string;
};

const GAME_COLORS: Record<string, GameColor> = {
  "word-match": {
    bg: "bg-sky-50/70 dark:bg-sky-950/25",
    border: "border-sky-200/80 hover:border-sky-300 dark:border-sky-900/60 dark:hover:border-sky-700",
    iconBg: "bg-sky-100 dark:bg-sky-900/50",
    iconColor: "text-sky-600 dark:text-sky-400",
    pressGlow: "motion-safe:active:shadow-[0_0_14px_2px_rgba(56,189,248,0.45)]",
  },
  "listen-and-pick": {
    bg: "bg-emerald-50/70 dark:bg-emerald-950/25",
    border:
      "border-emerald-200/80 hover:border-emerald-300 dark:border-emerald-900/60 dark:hover:border-emerald-700",
    iconBg: "bg-emerald-100 dark:bg-emerald-900/50",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    pressGlow: "motion-safe:active:shadow-[0_0_14px_2px_rgba(52,211,153,0.45)]",
  },
  "phrase-builder": {
    bg: "bg-amber-50/70 dark:bg-amber-950/25",
    border:
      "border-amber-200/80 hover:border-amber-300 dark:border-amber-900/60 dark:hover:border-amber-700",
    iconBg: "bg-amber-100 dark:bg-amber-900/50",
    iconColor: "text-amber-600 dark:text-amber-400",
    pressGlow: "motion-safe:active:shadow-[0_0_14px_2px_rgba(251,191,36,0.45)]",
  },
  "speed-round": {
    bg: "bg-rose-50/70 dark:bg-rose-950/25",
    border:
      "border-rose-200/80 hover:border-rose-300 dark:border-rose-900/60 dark:hover:border-rose-700",
    iconBg: "bg-rose-100 dark:bg-rose-900/50",
    iconColor: "text-rose-600 dark:text-rose-400",
    pressGlow: "motion-safe:active:shadow-[0_0_14px_2px_rgba(251,113,133,0.45)]",
  },
  "bolo-quiz": {
    bg: "bg-violet-50/70 dark:bg-violet-950/25",
    border:
      "border-violet-200/80 hover:border-violet-300 dark:border-violet-900/60 dark:hover:border-violet-700",
    iconBg: "bg-violet-100 dark:bg-violet-900/50",
    iconColor: "text-violet-600 dark:text-violet-400",
    pressGlow: "motion-safe:active:shadow-[0_0_14px_2px_rgba(167,139,250,0.45)]",
  },
  "ticket-check": {
    bg: "bg-orange-50/70 dark:bg-orange-950/25",
    border:
      "border-orange-200/80 hover:border-orange-300 dark:border-orange-900/60 dark:hover:border-orange-700",
    iconBg: "bg-orange-100 dark:bg-orange-900/50",
    iconColor: "text-orange-600 dark:text-orange-400",
    pressGlow: "motion-safe:active:shadow-[0_0_14px_2px_rgba(251,146,60,0.45)]",
  },
  "wrong-platform": {
    bg: "bg-fuchsia-50/70 dark:bg-fuchsia-950/25",
    border:
      "border-fuchsia-200/80 hover:border-fuchsia-300 dark:border-fuchsia-900/60 dark:hover:border-fuchsia-700",
    iconBg: "bg-fuchsia-100 dark:bg-fuchsia-900/50",
    iconColor: "text-fuchsia-600 dark:text-fuchsia-400",
    pressGlow: "motion-safe:active:shadow-[0_0_14px_2px_rgba(232,121,249,0.45)]",
  },
  "luggage-match": {
    bg: "bg-teal-50/70 dark:bg-teal-950/25",
    border:
      "border-teal-200/80 hover:border-teal-300 dark:border-teal-900/60 dark:hover:border-teal-700",
    iconBg: "bg-teal-100 dark:bg-teal-900/50",
    iconColor: "text-teal-600 dark:text-teal-400",
    pressGlow: "motion-safe:active:shadow-[0_0_14px_2px_rgba(45,212,191,0.45)]",
  },
  "express-listening": {
    bg: "bg-cyan-50/70 dark:bg-cyan-950/25",
    border:
      "border-cyan-200/80 hover:border-cyan-300 dark:border-cyan-900/60 dark:hover:border-cyan-700",
    iconBg: "bg-cyan-100 dark:bg-cyan-900/50",
    iconColor: "text-cyan-600 dark:text-cyan-400",
    pressGlow: "motion-safe:active:shadow-[0_0_14px_2px_rgba(34,211,238,0.45)]",
  },
  "signal-lights": {
    bg: "bg-lime-50/70 dark:bg-lime-950/25",
    border:
      "border-lime-200/80 hover:border-lime-300 dark:border-lime-900/60 dark:hover:border-lime-700",
    iconBg: "bg-lime-100 dark:bg-lime-900/50",
    iconColor: "text-lime-600 dark:text-lime-400",
    pressGlow: "motion-safe:active:shadow-[0_0_14px_2px_rgba(163,230,53,0.45)]",
  },
};

/** Neutral fallback so an unmapped future game still renders sensibly. */
const FALLBACK_COLOR: GameColor = {
  bg: "bg-card",
  border: "border-border hover:border-primary/30",
  iconBg: "bg-primary/10",
  iconColor: "text-primary",
  pressGlow: "motion-safe:active:shadow-[0_0_14px_2px_rgba(148,163,184,0.35)]",
};

const DIFFICULTY_CLASSES: Record<GameDef["difficulty"], string> = {
  Beginner: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40",
  Intermediate: "text-amber-600 bg-amber-50 dark:bg-amber-950/40",
  Advanced: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40",
};

export default function GamesPage() {
  const { isPlus, isLoading } = useEntitlements();
  const reduceMotion = useReducedMotion();
  // Fail closed: while entitlements are loading (or undefined), Plus-only
  // tiles render locked rather than briefly unlocked.
  const plusReady = isPlus === true && !isLoading;
  // Task 986 step-in: the card being navigated into scales slightly toward
  // the viewer while the route transitions. State only ever selects the
  // animate target — navigation itself is the Link's default behavior and is
  // never delayed or intercepted.
  const [enteredId, setEnteredId] = useState<string | null>(null);
  const featuredGame = resolveFeaturedGame();

  return (
    <div className="min-h-[100dvh] bg-background pb-28 lg:pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center gap-4 px-4 py-4 lg:px-6">
          <Gamepad2 className="h-7 w-7 shrink-0 text-primary" />
          <div>
            <h1 className="text-xl font-extrabold leading-none tracking-tight text-foreground">
              Games
            </h1>
            <p className="text-sm text-muted-foreground">Play your way to fluency</p>
          </div>
          <div className="ml-auto">
            {/* Task 986: Bolo reacts to the hub opening — one whole-image
                bounce timed to the cascade start, once per mount, never
                looping (canonical mascot rule: whole-image transforms only).
                Reduced motion renders the mascot perfectly still. */}
            <motion.div
              animate={reduceMotion ? undefined : { y: [0, -9, 0], rotate: [0, -7, 4, 0] }}
              transition={reduceMotion ? undefined : { duration: 0.55, delay: 0.08, ease: "easeOut" }}
            >
              <Mascot pose="cheer" size={52} />
            </motion.div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-7 px-4 pt-6 lg:px-6">
        {/* Featured slot — one promoted card above the catalog. Its content
            comes from FEATURED_SLOT, never from hard-coded JSX. */}
        {featuredGame && (
          <FeaturedCard
            game={featuredGame}
            locked={featuredGame.plusOnly && !plusReady}
            reduceMotion={Boolean(reduceMotion)}
          />
        )}

        {/* Curated shelves. Group order and within-group order both come
            straight from GAME_GROUPS and never change at runtime. */}
        <div className="space-y-7" data-testid="games-catalog">
          {GAME_GROUPS.map((group) => (
            <section key={group.id} data-testid={`games-group-${group.id}`}>
              <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wide text-muted-foreground">
                {group.title}
              </h2>
              {/* 2 columns from small-phone widths up (min-[480px]), a single
                  column only on very narrow screens so titles never truncate. */}
              <div className="grid gap-3 min-[480px]:grid-cols-2">
                {/* The promoted card is rendered once, in the featured slot
                    above; it is skipped here so it never appears twice. The
                    remaining cards keep their curated order. */}
                {group.gameIds.filter((id) => id !== featuredGame?.id).map((gameId) => {
                  const game = GAMES_BY_ID[gameId];
                  if (!game) return null;
                  const index = STAGGER_INDEX[game.id] ?? 0;
                  const locked = game.plusOnly && !plusReady;
                  const entered = enteredId === game.id;
                  const Card = (
                    <motion.div
                      // Staggered entrance cascade (task 986: pronounced —
                      // larger rise, scale from 0.9, springs.poppy overshoot).
                      // Cards stay interactive throughout (no pointer-events
                      // gate). Under reduced motion this collapses to an
                      // instant fade and the gesture transforms are dropped.
                      initial={
                        reduceMotion ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.9 }
                      }
                      animate={
                        reduceMotion
                          ? { opacity: 1 }
                          : entered
                            ? { opacity: 1, y: 0, scale: 1.05 }
                            : { opacity: 1, y: 0, scale: 1 }
                      }
                      transition={
                        reduceMotion
                          ? { duration: 0.001 }
                          : entered
                            ? springs.snappy
                            : { ...springs.poppy, delay: index * 0.05 }
                      }
                      // Gesture transitions live on the targets so they never
                      // inherit the entrance's stagger delay.
                      whileHover={
                        reduceMotion
                          ? undefined
                          : { y: -4, scale: 1.02, transition: springs.snappy }
                      }
                      whileTap={
                        reduceMotion ? undefined : { scale: 0.93, transition: springs.snappy }
                      }
                      // Step-in fires only when actually navigating into a
                      // game; the upgrade route keeps the plain press.
                      onClick={
                        locked || reduceMotion ? undefined : () => setEnteredId(game.id)
                      }
                    >
                      <GameCard
                        game={game}
                        locked={locked}
                        // Negative delays start each ambient loop mid-phase,
                        // using the catalog-wide ordinal so no two vignettes
                        // ever pulse in unison.
                        previewDelay={`${-(index * 1.1)}s`}
                      />
                    </motion.div>
                  );

                  // Locked cards are never dead ends: they open the upgrade
                  // route instead of the game.
                  return (
                    <Link key={game.id} href={locked ? "/upgrade" : game.href}>
                      {Card}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

    </div>
  );
}

/**
 * The promoted hero card. Same gate grammar as a grid card (full-color art,
 * All-Access badge, lock chip, always tappable) in a wider layout.
 */
function FeaturedCard({
  game,
  locked,
  reduceMotion,
}: {
  game: GameDef;
  locked: boolean;
  reduceMotion: boolean;
}) {
  const { Icon } = game;
  const colors = GAME_COLORS[game.id] ?? FALLBACK_COLOR;

  return (
    <Link href={locked ? "/upgrade" : game.href}>
      <motion.div
        data-testid="featured-game"
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={reduceMotion ? { duration: 0.001 } : springs.poppy}
        whileHover={reduceMotion ? undefined : { y: -4, transition: springs.snappy }}
        whileTap={reduceMotion ? undefined : { scale: 0.97, transition: springs.snappy }}
        className={cn(
          "group relative flex cursor-pointer items-center gap-4 rounded-2xl border p-5 transition-[box-shadow,border-color,background-color] duration-200 hover:shadow-md",
          colors.bg,
          colors.border,
          colors.pressGlow,
        )}
      >
        <div
          className={cn(
            "flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl",
            colors.iconBg,
          )}
        >
          <GamePreview
            gameId={game.id}
            // The hero runs on its own phase, offset from every grid card's
            // catalog-ordinal phase so it never beats in lockstep with them.
            delay="-0.55s"
            testId="featured-game-preview"
            fallback={
              <Icon className={cn("h-9 w-9", colors.iconColor)} strokeWidth={1.75} />
            }
          />
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
            Featured
          </p>
          <h2 className="text-lg font-extrabold leading-tight text-foreground">
            {game.title}
          </h2>
          <p className="text-sm leading-snug text-muted-foreground">{game.description}</p>
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                DIFFICULTY_CLASSES[game.difficulty],
              )}
            >
              {game.difficulty}
            </span>
            <AccessBadge plusOnly={game.plusOnly} />
            {locked && <LockChip />}
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

/** Free vs All-Access pill. Copy canon: "All-Access", never "Plus". */
function AccessBadge({ plusOnly }: { plusOnly: boolean }) {
  if (plusOnly) {
    return (
      <span className="flex items-center gap-1 whitespace-nowrap rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
        <Star className="h-2.5 w-2.5" />
        All-Access
      </span>
    );
  }
  return (
    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950/40">
      Free
    </span>
  );
}

/** The lock affordance on a gated card. Art behind it stays full color. */
function LockChip() {
  return (
    <span
      className="flex items-center gap-1 whitespace-nowrap rounded-full border border-border bg-background/80 px-2 py-0.5 text-[11px] font-bold text-muted-foreground"
      data-testid="lock-chip"
    >
      <Lock className="h-2.5 w-2.5" />
      Locked
    </span>
  );
}

function GameCard({
  game,
  locked,
  previewDelay,
}: {
  game: GameDef;
  locked: boolean;
  previewDelay?: string;
}) {
  const { Icon } = game;
  const colors = GAME_COLORS[game.id] ?? FALLBACK_COLOR;

  return (
    <div
      className={cn(
        // Hover lift + press compress are handled by the framer-motion wrapper
        // in GamesPage (whileHover / whileTap) so transform feedback lives in
        // ONE place — the CSS here only transitions the non-transform hover
        // affordances (shadow + border tint + saturation), replacing the old
        // `card-lift`. Press adds the per-game border glow (pressGlow).
        //
        // aspect-square gives the near-square tile that replaced the old
        // slender card; justify-between spreads the three content rows across
        // that taller box.
        "group relative flex aspect-square cursor-pointer flex-col justify-between gap-3 rounded-2xl border p-4 transition-[box-shadow,border-color,background-color,filter] duration-200 hover:shadow-md motion-safe:hover:saturate-[1.15]",
        colors.bg,
        colors.border,
        colors.pressGlow,
      )}
      data-testid={`game-card-${game.id}`}
    >
      {/* Preview vignette + badges row. Gated cards keep FULL-COLOR art and a
          live ambient loop — the All-Access badge and lock chip carry the
          gate, so nothing here is grayed out or paused. */}
      <div className="flex items-start justify-between gap-2">
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl",
            colors.iconBg,
          )}
        >
          <GamePreview
            gameId={game.id}
            delay={previewDelay}
            fallback={
              <Icon className={cn("h-6 w-6", colors.iconColor)} strokeWidth={1.75} />
            }
          />
        </div>

        <div className="flex items-center gap-1.5">
          <AccessBadge plusOnly={game.plusOnly} />
        </div>
      </div>

      {/* Title & description */}
      <div className="space-y-1">
        <h3 className="font-bold leading-tight text-foreground">{game.title}</h3>
        <p className="line-clamp-3 text-sm leading-snug text-muted-foreground">
          {game.description}
        </p>
      </div>

      {/* Difficulty chip, plus the lock chip on gated cards. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
            DIFFICULTY_CLASSES[game.difficulty],
          )}
        >
          {game.difficulty}
        </span>
        {locked && <LockChip />}
      </div>
    </div>
  );
}
