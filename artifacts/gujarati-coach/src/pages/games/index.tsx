import { Link, useLocation } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { Gamepad2, Link2, Headphones, Layers, Zap, Award, Lock, Star } from "lucide-react";
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
    plusOnly: false,
    Icon: Link2,
  },
  {
    id: "listen-and-pick",
    href: "/games/listen-and-pick",
    title: "Listen & Pick",
    description: "Hear a word or phrase and choose the right translation",
    difficulty: "Beginner",
    plusOnly: false,
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
];

/**
 * Per-game color identity (one distinct hue per game, drawn from the Tailwind
 * palette). Locked (Plus-only) cards keep the SAME hue at reduced opacity so
 * the hub stays colorful while the gate stays obvious — no gray boxes.
 */
type GameColor = {
  /** Card background tint. */
  bg: string;
  /** Card border accent (incl. hover deepen). */
  border: string;
  /** Icon bubble background when unlocked. */
  iconBg: string;
  /** Icon color when unlocked. */
  iconColor: string;
  /** Icon bubble background when locked — same hue, washed out. */
  lockedBg: string;
  /** Icon color when locked — same hue, reduced opacity. */
  lockedIconColor: string;
};

const GAME_COLORS: Record<string, GameColor> = {
  "word-match": {
    bg: "bg-sky-50/70 dark:bg-sky-950/25",
    border: "border-sky-200/80 hover:border-sky-300 dark:border-sky-900/60 dark:hover:border-sky-700",
    iconBg: "bg-sky-100 dark:bg-sky-900/50",
    iconColor: "text-sky-600 dark:text-sky-400",
    lockedBg: "bg-sky-100/50 dark:bg-sky-900/25",
    lockedIconColor: "text-sky-600/60 dark:text-sky-400/50",
  },
  "listen-and-pick": {
    bg: "bg-emerald-50/70 dark:bg-emerald-950/25",
    border:
      "border-emerald-200/80 hover:border-emerald-300 dark:border-emerald-900/60 dark:hover:border-emerald-700",
    iconBg: "bg-emerald-100 dark:bg-emerald-900/50",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    lockedBg: "bg-emerald-100/50 dark:bg-emerald-900/25",
    lockedIconColor: "text-emerald-600/60 dark:text-emerald-400/50",
  },
  "phrase-builder": {
    bg: "bg-amber-50/70 dark:bg-amber-950/25",
    border:
      "border-amber-200/80 hover:border-amber-300 dark:border-amber-900/60 dark:hover:border-amber-700",
    iconBg: "bg-amber-100 dark:bg-amber-900/50",
    iconColor: "text-amber-600 dark:text-amber-400",
    lockedBg: "bg-amber-100/50 dark:bg-amber-900/25",
    lockedIconColor: "text-amber-600/60 dark:text-amber-400/50",
  },
  "speed-round": {
    bg: "bg-rose-50/70 dark:bg-rose-950/25",
    border:
      "border-rose-200/80 hover:border-rose-300 dark:border-rose-900/60 dark:hover:border-rose-700",
    iconBg: "bg-rose-100 dark:bg-rose-900/50",
    iconColor: "text-rose-600 dark:text-rose-400",
    lockedBg: "bg-rose-100/50 dark:bg-rose-900/25",
    lockedIconColor: "text-rose-600/60 dark:text-rose-400/50",
  },
  "bolo-quiz": {
    bg: "bg-violet-50/70 dark:bg-violet-950/25",
    border:
      "border-violet-200/80 hover:border-violet-300 dark:border-violet-900/60 dark:hover:border-violet-700",
    iconBg: "bg-violet-100 dark:bg-violet-900/50",
    iconColor: "text-violet-600 dark:text-violet-400",
    lockedBg: "bg-violet-100/50 dark:bg-violet-900/25",
    lockedIconColor: "text-violet-600/60 dark:text-violet-400/50",
  },
};

/** Neutral fallback so an unmapped future game still renders sensibly. */
const FALLBACK_COLOR: GameColor = {
  bg: "bg-card",
  border: "border-border hover:border-primary/30",
  iconBg: "bg-primary/10",
  iconColor: "text-primary",
  lockedBg: "bg-muted",
  lockedIconColor: "text-muted-foreground",
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
            <Mascot pose="cheer" size={52} />
          </div>
        </div>
      </div>

      {/* Game grid — 2 columns from small-phone widths up (min-[480px]), a
          single column only on very narrow screens so titles never truncate. */}
      <div className="mx-auto max-w-2xl px-4 pt-6 lg:px-6">
        <div className="grid gap-3 min-[480px]:grid-cols-2">
          {GAMES.map((game, index) => {
            const locked = game.plusOnly && !plusReady;
            const Card = (
              <motion.div
                className="h-full"
                // Staggered entrance cascade: one quick sweep across the grid.
                // Cards stay interactive throughout (no pointer-events gate).
                // Under reduced motion this collapses to an instant fade and
                // the hover/tap transforms are dropped entirely.
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
                animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                transition={
                  reduceMotion
                    ? { duration: 0.001 }
                    : { ...springs.bouncy, delay: index * 0.06 }
                }
                // Gesture transitions live on the targets so they never
                // inherit the entrance's stagger delay.
                whileHover={
                  reduceMotion ? undefined : { y: -2, transition: springs.snappy }
                }
                whileTap={
                  reduceMotion ? undefined : { scale: 0.96, transition: springs.snappy }
                }
              >
                <GameCard
                  game={game}
                  locked={locked}
                  // Negative delays start each loop mid-phase so the five
                  // previews never pulse in unison.
                  previewDelay={`${-(index * 1.1)}s`}
                />
              </motion.div>
            );

            if (locked) {
              return (
                <Link key={game.id} href="/upgrade">
                  {Card}
                </Link>
              );
            }

            return (
              <Link key={game.id} href={game.href}>
                {Card}
              </Link>
            );
          })}
        </div>
      </div>

    </div>
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
        // affordances (shadow + border tint), replacing the old `card-lift`.
        "group relative flex h-full cursor-pointer flex-col gap-3 rounded-2xl border p-4 transition-[box-shadow,border-color,background-color] duration-200 hover:shadow-md",
        colors.bg,
        colors.border,
        // Locked: same hue, washed out — colorful but obviously gated.
        locked && "opacity-80 saturate-[0.85]"
      )}
    >
      {/* Preview vignette + badges row. Locked cards keep the dimmed tile
          treatment but still play their preview: it sells the game. */}
      <div className="flex items-start justify-between gap-2">
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl",
            locked ? colors.lockedBg : colors.iconBg
          )}
        >
          <GamePreview
            gameId={game.id}
            delay={previewDelay}
            fallback={
              <Icon
                className={cn("h-6 w-6", locked ? colors.lockedIconColor : colors.iconColor)}
                strokeWidth={1.75}
              />
            }
          />
        </div>

        <div className="flex items-center gap-1.5">
          {/* Free / All-Access pill */}
          {game.plusOnly ? (
            <span className="flex items-center gap-1 whitespace-nowrap rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
              <Star className="h-2.5 w-2.5" />
              All-Access
            </span>
          ) : (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950/40">
              Free
            </span>
          )}
          {/* Lock icon */}
          {locked && (
            <Lock className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Title & description */}
      <div className="space-y-1">
        <h3 className="font-bold leading-tight text-foreground">{game.title}</h3>
        <p className="text-sm leading-snug text-muted-foreground">{game.description}</p>
      </div>

      {/* Difficulty badge */}
      <span
        className={cn(
          "self-start rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
          DIFFICULTY_CLASSES[game.difficulty]
        )}
      >
        {game.difficulty}
      </span>
    </div>
  );
}
