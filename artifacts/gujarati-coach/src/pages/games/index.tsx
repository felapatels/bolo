import { useState } from "react";
import type { CSSProperties } from "react";
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
  BookOpen,
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

/**
 * EXPORTED so the hub's own test reads this list instead of keeping a copy.
 * That copy existed, and on 2026-08-24 it failed three tests on correct
 * behaviour because the storybook moved to All-Access here and not there.
 */
export const GAMES: GameDef[] = [
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
    description: "Drag Chacha-ji onto the phrase that boarded at the wrong platform",
    difficulty: "Beginner",
    plusOnly: false,
    Icon: Shuffle,
  },
  {
    // PART 2, All-Access. Two tiles rather than a difficulty toggle inside
    // one, asked for on 2026-08-25: "split the game into 2 games, it has a lot
    // of content. Add a free version and a Part 2 for All-Access. Show 2
    // different tiles on the games page."
    id: "wrong-platform-2",
    href: "/games/wrong-platform-2",
    title: "Wrong Platform 2",
    description: "Six cards, a closer stray, and no English to lean on",
    difficulty: "Intermediate",
    plusOnly: true,
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
  // The storybook: All-Access, with the journey 1 zone 1 book's first scene
  // open to every plan. plusOnly is FALSE on purpose — the card must not wear a
  // lock chip over a stop that has a free taste, which is the pairing the
  // Script Trace taste was created to fix. The server enforces the line.
  {
    // ALL-ACCESS IN THE HUB, FREE ON THE MAP, and that split is deliberate.
    // Asked for on 2026-08-24: "why is the book game free? it should be gated
    // as All-Access only." A free learner still meets the storybook where it
    // was designed to live, as a stop on their line, where the whole of zone
    // 1's book is the taste and the finished book carries the ask. What
    // All-Access buys is opening it from the Games hub and the other five
    // books. Same arrangement Beat the Train already uses.
    id: "storybook",
    href: "/games/storybook",
    title: "Storybook",
    description: "Read the scene and say the line that fits. Your choices become your book",
    difficulty: "Intermediate",
    plusOnly: true,
    Icon: BookOpen,
  },
  {
    // PAID ONLY, at the owner's direction. Free learners still meet it where it
    // was designed to live, sprung on them between two stops on the map; what
    // All-Access buys is playing it deliberately, and choosing how long.
    id: "emergency",
    href: "/games/emergency",
    title: "Beat the Train",
    description: "The train is coming through. Answer faster than the clock drains",
    difficulty: "Intermediate",
    plusOnly: true,
    Icon: Zap,
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
  // Vocabulary leads so Luggage Match (first card of this group) appears in
  // the top-left slot — matching the mobile hub's ordering.
  {
    id: "vocabulary",
    title: "Vocabulary",
    // Storybook sits LAST rather than first: the featured slot resolves to the
    // first card of this shelf, and which game is featured is a product call,
    // not a side effect of adding one.
    gameIds: [
      "luggage-match",
      "word-match",
      "ticket-check",
      "bolo-quiz",
      "storybook",
    ],
  },
  {
    id: "listening",
    title: "Listening",
    gameIds: ["listen-and-pick", "express-listening", "signal-lights"],
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
 * Per-game color identity. These are NOT pastel tints over the theme card:
 * every tile is a painted enamel signboard in a saturated Indian hue
 * (marigold, kumkum, peacock, jamun, terracotta, rani pink), so the hub reads
 * as a bazaar wall of boards rather than a grid of white cards. Because the
 * tile carries the color, all card text is cream/white and the badges sit on
 * a scrim — the design system's foreground tokens are deliberately not used
 * INSIDE a tile (they would vanish on these backgrounds), exactly as the chai
 * stall and Bolo Bazaar pin their painted colors.
 *
 * Gated cards render in FULL COLOR — the All-Access badge and lock chip carry
 * the gate, never a gray or washed-out tile.
 */
type GameColor = {
  /** Enamel gradient stops (top-left → bottom-right). */
  from: string;
  to: string;
  /** Deeper edge: border and the hard bottom shadow the board sits on. */
  deep: string;
  /** Icon ink on the cream medallion. */
  ink: string;
};

const GAME_COLORS: Record<string, GameColor> = {
  // peacock blue
  "word-match": { from: "#1B7A8F", to: "#0E5567", deep: "#0A3F4D", ink: "#0E5567" },
  // parrot green
  "listen-and-pick": { from: "#2E9E4F", to: "#177038", deep: "#0F5228", ink: "#177038" },
  // turmeric / marigold
  "phrase-builder": { from: "#F0A11B", to: "#D2740A", deep: "#A85700", ink: "#B35F00" },
  // kumkum red
  "speed-round": { from: "#E14434", to: "#B3251D", deep: "#8A1912", ink: "#B3251D" },
  // jamun purple
  "bolo-quiz": { from: "#7B3FA8", to: "#57217D", deep: "#41165F", ink: "#57217D" },
  // terracotta kulhad
  "ticket-check": { from: "#D9702F", to: "#B04A15", deep: "#8A370C", ink: "#B04A15" },
  // rani pink
  "wrong-platform": { from: "#D33A7B", to: "#A81C58", deep: "#821242", ink: "#A81C58" },
  // deep teal
  "luggage-match": { from: "#17897E", to: "#0B5F58", deep: "#084741", ink: "#0B5F58" },
  // express indigo
  "express-listening": { from: "#4453B8", to: "#2A3390", deep: "#1F2670", ink: "#2A3390" },
  // signal green
  "signal-lights": { from: "#3E8E41", to: "#256A2B", deep: "#1A4E1F", ink: "#256A2B" },
};

/** Neutral fallback so an unmapped future game still renders sensibly. */
const FALLBACK_COLOR: GameColor = {
  from: "#5B6474",
  to: "#3E4653",
  deep: "#2C333D",
  ink: "#3E4653",
};

/** The board itself: gradient face, deep edge, and the hard shadow under it. */
function boardStyle(c: GameColor): CSSProperties {
  return {
    backgroundImage: `linear-gradient(150deg, ${c.from} 0%, ${c.to} 100%)`,
    borderColor: c.deep,
    boxShadow: `0 5px 0 ${c.deep}`,
  };
}

/**
 * The vignettes (game-previews.css) are authored against the LIGHT theme
 * tokens. They now sit on a cream medallion inside a saturated board, so the
 * tokens are pinned here rather than inherited — otherwise dark mode would
 * paint dark-theme shapes onto a cream tile.
 */
const MEDALLION_INK: CSSProperties = {
  "--primary": "243 75% 59%",
  "--secondary": "174 84% 32%",
  "--accent": "173 80% 40%",
  "--muted-foreground": "215 16% 47%",
} as CSSProperties;

/** Difficulty is a dot + white label; the hue alone can't carry it on a board. */
const DIFFICULTY_DOT: Record<GameDef["difficulty"], string> = {
  Beginner: "#5BE58A",
  Intermediate: "#FFC93C",
  Advanced: "#FF8A65",
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
    <div className="min-h-[100dvh] bg-background pb-nav lg:pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b-2 border-border bg-background/85 backdrop-blur-md dark:bg-background/80">
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
              <h2 className="mb-3 flex items-center gap-2 text-sm font-extrabold uppercase tracking-[0.14em] text-[#8A4B12] dark:text-muted-foreground">
                <span
                  aria-hidden="true"
                  className="h-3 w-1.5 rounded-full bg-[#E0A93B]"
                />
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
                    <Link
                      key={game.id}
                      href={locked ? "/upgrade" : game.href}
                      className="block"
                    >
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
 * The promoted hero card. Same gate grammar as a grid card (full-color board,
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
  const c = GAME_COLORS[game.id] ?? FALLBACK_COLOR;

  return (
    <Link href={locked ? "/upgrade" : game.href} className="block">
      <motion.div
        data-testid="featured-game"
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={reduceMotion ? { duration: 0.001 } : springs.poppy}
        whileHover={reduceMotion ? undefined : { y: -4, transition: springs.snappy }}
        whileTap={reduceMotion ? undefined : { scale: 0.97, transition: springs.snappy }}
        className="group relative flex cursor-pointer items-center gap-4 overflow-hidden rounded-2xl border-2 p-4 text-white transition-[filter] duration-200 motion-safe:hover:saturate-[1.1]"
        style={boardStyle(c)}
      >
        <div
          className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#FFF8EC] shadow-[inset_0_0_0_3px_rgba(255,255,255,0.6)] lg:h-28 lg:w-28 lg:rounded-3xl"
          style={MEDALLION_INK}
        >
          <GamePreview
            gameId={game.id}
            // The hero runs on its own phase, offset from every grid card's
            // catalog-ordinal phase so it never beats in lockstep with them.
            delay="-0.55s"
            testId="featured-game-preview"
            fallback={<Icon className="h-12 w-12" style={{ color: c.ink }} strokeWidth={2} />}
          />
        </div>

        <div className="relative min-w-0 flex-1 space-y-1">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/70">
            Featured
          </p>
          <h2 className="text-xl font-extrabold leading-tight text-white">{game.title}</h2>
          <p className="text-sm leading-snug text-white/85">{game.description}</p>
          <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
            <DifficultyPill difficulty={game.difficulty} />
            <AccessBadge plusOnly={game.plusOnly} />
            {locked && <LockChip />}
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

/**
 * Free vs All-Access pill. Copy canon: "All-Access", never "Plus".
 * These are enamel badges, not tinted text: solid fill, white ring and a hard
 * shadow so they read as stickers stuck onto the board.
 */
function AccessBadge({ plusOnly }: { plusOnly: boolean }) {
  if (plusOnly) {
    return (
      <span className="flex items-center gap-1 whitespace-nowrap rounded-full bg-gradient-to-b from-[#FFD65A] to-[#F0A202] px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-[#4A2C00] shadow-[0_2px_0_rgba(0,0,0,0.28)] ring-2 ring-white/70">
        <Star className="h-3 w-3 fill-[#4A2C00]" />
        All-Access
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap rounded-full bg-gradient-to-b from-[#4ADE80] to-[#16A34A] px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-[0_2px_0_rgba(0,0,0,0.28)] ring-2 ring-white/70">
      Free
    </span>
  );
}

/** The lock affordance on a gated card. The board behind it stays full color. */
function LockChip() {
  return (
    <span
      className="flex items-center gap-1 whitespace-nowrap rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-white ring-1 ring-white/35"
      data-testid="lock-chip"
    >
      <Lock className="h-3 w-3" />
      Locked
    </span>
  );
}

/** Difficulty on a painted board: white label, hue carried by the dot. */
function DifficultyPill({ difficulty }: { difficulty: GameDef["difficulty"] }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] text-white ring-1 ring-white/30">
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: DIFFICULTY_DOT[difficulty] }}
      />
      {difficulty}
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
  const c = GAME_COLORS[game.id] ?? FALLBACK_COLOR;

  return (
    <div
      className={cn(
        // Hover lift + press compress are handled by the framer-motion wrapper
        // in GamesPage (whileHover / whileTap) so transform feedback lives in
        // ONE place; the CSS here only wakes the board's saturation on hover.
        //
        // aspect-square gives the near-square tile, gated behind the SAME
        // min-[480px] breakpoint as the two-column grid: a square is only
        // near-square when the card is half the row. Below the breakpoint the
        // card is content-height with a modest floor so it can't collapse back
        // to the old slender shape.
        //
        // Padding and gaps are deliberately tight (p-3 / gap-2) so the
        // medallion, title and badges fill the square instead of floating in
        // dead space.
        "group relative flex min-h-[172px] cursor-pointer flex-col gap-2 overflow-hidden rounded-2xl border-2 p-3 text-white transition-[filter] duration-200 motion-safe:hover:saturate-[1.15] min-[480px]:aspect-square min-[480px]:min-h-0",
      )}
      style={boardStyle(c)}
      data-testid={`game-card-${game.id}`}
    >
      {/* Preview medallion + badge row. Gated cards keep FULL-COLOR art and a
          live ambient loop — the All-Access badge and lock chip carry the
          gate, so nothing here is grayed out or paused. */}
      <div className="relative flex items-start justify-between gap-2">
        <div
          className="flex h-[68px] w-[68px] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#FFF8EC] shadow-[inset_0_0_0_3px_rgba(255,255,255,0.6)] min-[480px]:h-20 min-[480px]:w-20 lg:h-28 lg:w-28 lg:rounded-3xl"
          style={MEDALLION_INK}
        >
          <GamePreview
            gameId={game.id}
            delay={previewDelay}
            fallback={
              <Icon
                className="h-9 w-9 lg:h-14 lg:w-14"
                style={{ color: c.ink }}
                strokeWidth={2}
              />
            }
          />
        </div>

        <div className="flex items-center gap-1.5">
          <AccessBadge plusOnly={game.plusOnly} />
        </div>
      </div>

      {/* Title & description */}
      <div className="relative space-y-0.5">
        <h3 className="text-[15px] font-extrabold leading-tight text-white lg:text-lg">
          {game.title}
        </h3>
        <p className="line-clamp-2 text-[12.5px] leading-snug text-white/85 lg:text-sm">
          {game.description}
        </p>
      </div>

      {/* Difficulty chip, plus the lock chip on gated cards. */}
      <div className="relative mt-auto flex flex-wrap items-center gap-1.5">
        <DifficultyPill difficulty={game.difficulty} />
        {locked && <LockChip />}
      </div>
    </div>
  );
}
