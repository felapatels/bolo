import { Link, useLocation } from "wouter";
import { Gamepad2, Link2, Headphones, Layers, Zap, Award, Lock, Star } from "lucide-react";
import { useEntitlements } from "@/lib/entitlements";
import { Mascot } from "@/components/mascot";
import { cn } from "@/lib/utils";

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

const DIFFICULTY_CLASSES: Record<GameDef["difficulty"], string> = {
  Beginner: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40",
  Intermediate: "text-amber-600 bg-amber-50 dark:bg-amber-950/40",
  Advanced: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40",
};

export default function GamesPage() {
  const { isPlus } = useEntitlements();

  return (
    <div className="min-h-[100dvh] bg-background pb-24 lg:pb-8">
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

      {/* Game grid */}
      <div className="mx-auto max-w-2xl px-4 pt-6 lg:px-6">
        <div className="grid gap-3 sm:grid-cols-2">
          {GAMES.map((game) => {
            const locked = game.plusOnly && !isPlus;
            const Card = (
              <GameCard key={game.id} game={game} locked={locked} />
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

function GameCard({ game, locked }: { game: GameDef; locked: boolean }) {
  const { Icon } = game;

  return (
    <div
      className={cn(
        "group relative flex cursor-pointer flex-col gap-3 rounded-2xl border border-border bg-card p-4 card-lift hover:border-primary/30 hover:bg-muted/40",
        locked && "opacity-80"
      )}
    >
      {/* Icon + badges row */}
      <div className="flex items-start justify-between gap-2">
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-xl",
            locked ? "bg-muted" : "bg-primary/10"
          )}
        >
          <Icon
            className={cn("h-6 w-6", locked ? "text-muted-foreground" : "text-primary")}
            strokeWidth={1.75}
          />
        </div>

        <div className="flex items-center gap-1.5">
          {/* Free / Plus pill */}
          {game.plusOnly ? (
            <span className="flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
              <Star className="h-2.5 w-2.5" />
              Plus
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
