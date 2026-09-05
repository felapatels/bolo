/**
 * THE GAMES HUB, to the owner's games mockup (build 21 on mobile: "big
 * images, very colorful etc", "a hero header up top"; here 2026-08-30 on the
 * owner's "games page needs update on web to match new mobile one").
 *
 * Three bands, as on the phone. A HERO across the top: the painting from
 * lib/game-art (Bolo in it with his controller, so no mascot overlay), a
 * cream wash over its left half for the words, and the language line, which
 * is the language switch. CONTINUE PLAYING: the last game this browser
 * opened, wide, with its picture and a Play again button. ALL GAMES: one
 * two-column grid in the phone's order, each tile a 4:3 painting with the
 * access pill in its corner and the vignette medallion overlapping its foot,
 * then the title, the description and the difficulty.
 *
 * WHAT WENT: the curated shelves (Vocabulary, Listening, Building) and the
 * promoted Featured card. The phone never had them and the mockup has one
 * grid; games-hub.test.tsx moved with it.
 *
 * Gated cards render in FULL COLOUR under a light dim: the All-Access badge
 * and the lock chip carry the gate, never a grey tile, and a locked card is
 * never a dead end: it opens the upgrade route.
 */
import { useState } from "react";
import type { CSSProperties } from "react";
import { Link } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import {
  Link2,
  Headphones,
  Layers,
  Zap,
  Award,
  Volume2,
  Lock,
  Star,
  Ticket,
  Shuffle,
  Briefcase,
  FastForward,
  TrafficCone,
  BookOpen,
  MapPin,
  ChevronDown,
  ArrowRight,
} from "lucide-react";
import { useEntitlements } from "@/lib/entitlements";
import { useGetGamePlays } from "@workspace/api-client-react";
import { gameTasteLabel, gameTasteState, isTasteGame } from "@workspace/game-taste";
import { cn } from "@/lib/utils";
import { springs } from "@/lib/motion";
import { useLanguage } from "@/lib/language-context";
import { getJourneyLine } from "@/lib/journeyLines";
import { useJourneyProgress } from "@/lib/useJourneyProgress";
import { GAMES_HERO_FILM, GAMES_HERO_POSTER, gameArt } from "@/lib/game-art";
import { readLastPlayedGame, writeLastPlayedGame } from "@/lib/last-played-game";
import { LanguagePicker } from "@/components/language-picker";
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
  /**
   * Where Script Trace would sit if it were not feature-flagged off above, and
   * for the same reason the phone puts it there: it is the other half of the
   * same lesson. Tracing teaches the hand; this is the only game in the hub
   * that asks somebody to READ.
   *
   * All-Access with no taste, matching the server. The free taste for reading
   * already exists on the journey at stop 4 of zone 1, in every language; a
   * second free door onto the same alphabet from here would not be a taste, it
   * would be the feature.
   */
  {
    id: "letter-match",
    href: "/games/letter-match",
    title: "Letter Match",
    description: "Pair each letter with the sound it makes.",
    difficulty: "Intermediate",
    plusOnly: true,
    Icon: Volume2,
  },
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

/**
 * THE PHONE'S ORDER (bolo-mobile app/(app)/(tabs)/games/index.tsx GAMES), with
 * the web-only Express Listening beside its listening sibling, and Chacha-ji's
 * call left out because the call has no web door. Anything in GAMES that this
 * list forgets is appended rather than lost.
 */
export const HUB_ORDER = [
  "luggage-match",
  "word-match",
  "signal-lights",
  "phrase-builder",
  "speed-round",
  "letter-match",
  "bolo-quiz",
  "ticket-check",
  "storybook",
  "emergency",
  "listen-and-pick",
  "express-listening",
  "wrong-platform",
  "wrong-platform-2",
];

const GAMES_BY_ID: Record<string, GameDef> = Object.fromEntries(
  GAMES.map((game) => [game.id, game]),
);

/**
 * The catalog in the hub's order. Its index doubles as each game's
 * ambient-loop phase offset, so no two vignettes ever pulse in sync.
 */
const ORDERED_GAMES: GameDef[] = [
  ...HUB_ORDER.map((id) => GAMES_BY_ID[id]).filter(Boolean),
  ...GAMES.filter((g) => !HUB_ORDER.includes(g.id)),
];

const STAGGER_INDEX: Record<string, number> = Object.fromEntries(
  ORDERED_GAMES.map((game, index) => [game.id, index]),
);

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
  // saffron, for the picture book
  storybook: { from: "#E08A1E", to: "#B5650E", deep: "#8C4A05", ink: "#9A5510" },
  // signal red, for the train you have to beat
  emergency: { from: "#D64545", to: "#A62B2B", deep: "#7E1F1F", ink: "#A62B2B" },
  // rani pink again, for the second platform
  "wrong-platform-2": { from: "#D33A7B", to: "#A81C58", deep: "#821242", ink: "#A81C58" },
};

/** Neutral fallback so an unmapped future game still renders sensibly. */
const FALLBACK_COLOR: GameColor = {
  from: "#5B6474",
  to: "#3E4653",
  deep: "#2C333D",
  ink: "#3E4653",
};

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
  // THE FREE TASTE (owner ruling, 2026-09-04): three hub plays of each game
  // that was free, then the card locks. The twin of the phone's, down to the
  // failure direction: unknown leaves a card OPEN, because the server refuses
  // the record past three whatever this says, and failing closed would draw a
  // lock over a game the learner still has plays on.
  const { data: gamePlays } = useGetGamePlays();
  const taste = (id: string) => {
    if (isPlus === true || !isTasteGame(id) || !gamePlays) return null;
    return gameTasteState({
      plusOnly: false,
      isPlus: false,
      playsUsed: gamePlays.plays[id] ?? 0,
    });
  };
  const tasteLabelFor = (id: string) => {
    const t = taste(id);
    return t ? gameTasteLabel(t) : null;
  };
  /** Shut: an All-Access game without Plus, or a taste that is spent. */
  const isLocked = (game: GameDef) =>
    (game.plusOnly && !plusReady) || taste(game.id)?.playable === false;
  // Task 986 step-in: the card being navigated into scales slightly toward
  // the viewer while the route transitions. State only ever selects the
  // animate target; navigation itself is the Link's default behavior and is
  // never delayed or intercepted.
  const [enteredId, setEnteredId] = useState<string | null>(null);
  const { activeLang, activeLanguage } = useLanguage();
  const line = getJourneyLine(activeLang);
  // The learner's current city for the hero's "Hindi · New Delhi" line: the
  // same journey read the home pass makes, cached between the two.
  const journey = useJourneyProgress(activeLang, line.zones);
  const city = journey.current ? journey.current.geoName : line.zones[0];

  // THE LAST GAME PLAYED, read once per mount; a game opened from this hub
  // becomes the one offered on the way back out of it.
  const [lastPlayed, setLastPlayed] = useState<string | null>(() => readLastPlayedGame());
  const continueGame = lastPlayed ? (GAMES_BY_ID[lastPlayed] ?? null) : null;
  const remember = (id: string) => {
    writeLastPlayedGame(id);
    setLastPlayed(id);
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-nav lg:pb-8">
      <div className="mx-auto max-w-2xl px-4 lg:px-6">
        <GamesHero language={activeLanguage?.name ?? "Your language"} city={city} />

        {continueGame && (
          <section className="mt-2.5" data-testid="games-continue">
            <SectionEyebrow>Continue playing</SectionEyebrow>
            <ContinueCard
              game={continueGame}
              locked={isLocked(continueGame)}
              onPlay={() => remember(continueGame.id)}
            />
          </section>
        )}

        <section className="mt-5">
          <SectionEyebrow>All games</SectionEyebrow>
          {/* One grid, the phone's order. Two columns at every width, as on
              the phone; the tiles are pictures first and the titles are one
              line, so nothing truncates before 320px. */}
          <div className="grid grid-cols-2 gap-2.5" data-testid="games-catalog">
            {ORDERED_GAMES.map((game) => {
              const index = STAGGER_INDEX[game.id] ?? 0;
              const locked = isLocked(game);
              const entered = enteredId === game.id;
              const Card = (
                <motion.div
                  // Staggered entrance cascade (task 986: pronounced, a
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
                    tasteLabel={tasteLabelFor(game.id)}
                    // Negative delays start each ambient loop mid-phase,
                    // using the catalog-wide ordinal so no two vignettes
                    // ever pulse in unison.
                    previewDelay={`${-(index * 1.1)}s`}
                  />
                </motion.div>
              );

              // Locked cards are never dead ends: they open the upgrade
              // route instead of the game. An open card is remembered for
              // the Continue playing band.
              return (
                <Link
                  key={game.id}
                  href={locked ? "/upgrade" : game.href}
                  onClick={locked ? undefined : () => remember(game.id)}
                  className="block"
                >
                  {Card}
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * THE HERO. The painting, a cream wash over its left half for the words, and
 * Bolo on the right, in the picture. Bleeds to the column's edges (the
 * screen's, on a phone); the grid below keeps the column. Anchored a third of
 * the way from left to centre, as on the phone: the words keep the pale left
 * and the parrot keeps his face.
 */
function GamesHero({ language, city }: { language: string; city: string }) {
  return (
    <div
      data-testid="games-hero"
      className="relative -mx-4 h-[236px] overflow-hidden lg:-mx-6 lg:h-[280px] lg:rounded-b-3xl"
    >
      {/* THE PAINTING BECAME A FILM (build 29, the owner's clip). Poster is the
          film's own first frame; reduced motion holds it, since CSS cannot stop
          autoplay. Mobile twin: app/(app)/(tabs)/games/index.tsx. */}
      {typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? (
        <img
          src={GAMES_HERO_POSTER}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: "80% 50%" }}
        />
      ) : (
        <video
          data-testid="games-hero-film"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: "80% 50%" }}
          poster={GAMES_HERO_POSTER}
          autoPlay
          muted
          loop
          playsInline
          aria-hidden="true"
        >
          <source src={GAMES_HERO_FILM} type="video/mp4" />
        </video>
      )}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to right, rgba(251,243,230,0.66) 0%, rgba(251,243,230,0.4) 50%, rgba(251,243,230,0) 82%)",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background: "linear-gradient(to bottom, rgba(251,243,230,0) 72%, hsl(var(--background)) 100%)",
        }}
      />
      <div className="absolute left-5 right-[150px] top-10 lg:top-14">
        <h1
          className="text-[40px] font-extrabold leading-none tracking-[-0.8px]"
          style={{ color: "#1E1633" }}
        >
          Games
        </h1>
        <p className="mt-1 text-base" style={{ color: "#4B4368" }}>
          Play your way to fluency
        </p>
        {/* THE LANGUAGE LINE IS THE LANGUAGE SWITCH: the line already names
            the language, so it opens the same picker the home globe opens
            (the modal with search and the Recent row), never the first-run
            step at /choose-language, which redirects an account that has
            already chosen. */}
        <LanguagePicker
          trigger={
            <button
              type="button"
              data-testid="games-language-line"
              aria-label={`Learning ${language}. Change language`}
              className="mt-3.5 inline-flex items-center gap-1.5 text-sm font-semibold"
              style={{ color: "#4F46E5" }}
            >
              <MapPin className="h-3.5 w-3.5" />
              <span>
                {language}
                <span style={{ color: "#8A83B3" }}>{"  ·  "}</span>
                {city}
              </span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          }
        />
      </div>
    </div>
  );
}

/** The small violet caption over each band, with the mockup's spark. */
function SectionEyebrow({ children }: { children: string }) {
  return (
    <h2 className="mb-2.5 flex items-center gap-1.5">
      <span className="text-xs font-extrabold tracking-[1.6px]" style={{ color: "#4F46E5" }}>
        {children.toUpperCase()}
      </span>
      <span aria-hidden="true" className="text-xs" style={{ color: "#D9A21B" }}>
        ✦
      </span>
    </h2>
  );
}

/**
 * CONTINUE PLAYING: the last game this browser remembers, wide, its picture
 * at the left and a Play again button at the right. No personal best and no
 * level yet (see lib/last-played-game.ts).
 */
function ContinueCard({
  game,
  locked,
  onPlay,
}: {
  game: GameDef;
  locked: boolean;
  onPlay: () => void;
}) {
  const gc = GAME_COLORS[game.id] ?? FALLBACK_COLOR;
  const art = gameArt(game.id);
  return (
    <Link
      href={locked ? "/upgrade" : game.href}
      onClick={locked ? undefined : onPlay}
      data-testid={`continue-${game.id}`}
      aria-label={`Continue playing ${game.title}`}
      className="flex gap-3 rounded-[18px] border border-border bg-card p-2.5 shadow-[0_4px_10px_rgba(30,22,51,0.08)]"
    >
      <div className="h-[93px] w-[124px] shrink-0 overflow-hidden rounded-xl bg-[#E9E4F5]">
        {art ? (
          <img src={art} alt="" aria-hidden="true" className="h-full w-full object-cover" />
        ) : (
          <div
            aria-hidden="true"
            className="h-full w-full"
            style={{ backgroundImage: `linear-gradient(150deg, ${gc.from} 0%, ${gc.to} 100%)` }}
          />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <div className="flex items-center gap-1.5" style={{ color: gc.ink }}>
          <game.Icon className="h-3 w-3" />
          <span className="text-[10px] font-extrabold tracking-[1.2px]">{game.title.toUpperCase()}</span>
        </div>
        <p className="truncate text-lg font-extrabold text-foreground">{game.title}</p>
        <p className="truncate text-xs text-muted-foreground">{game.description}</p>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <DifficultyPill difficulty={game.difficulty} gc={gc} />
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-[7px] text-[13px] font-extrabold text-white",
              locked ? "bg-muted-foreground" : "bg-[#4F46E5]",
            )}
          >
            {locked ? "Unlock" : "Play again"}
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

/** Free vs All-Access pill: FREE in green, ALL-ACCESS in gold with its star.
 *  Copy canon: "All-Access", never "Plus".
 *
 *  A card under the free taste (2026-09-04) says how many plays are left
 *  instead of a bare FREE, and says it in WORDS rather than by changing
 *  colour: the pill stays green either way, so the state reads without
 *  needing to see the hue. */
function AccessBadge({ plusOnly, tasteLabel }: { plusOnly: boolean; tasteLabel: string | null }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[3px] rounded-full border-2 border-white/85 px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.4px]",
        plusOnly ? "bg-[#F5B31B] text-[#4A2C00]" : "bg-[#22C55E] text-white",
      )}
    >
      {plusOnly && <Star className="h-2.5 w-2.5" />}
      {plusOnly ? "All-Access" : (tasteLabel ?? "Free")}
    </span>
  );
}

function LockChip() {
  return (
    <span
      data-testid="lock-chip"
      className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-border"
    >
      <Lock className="h-2.5 w-2.5 text-muted-foreground" />
    </span>
  );
}

/** The difficulty, a dot and a word on a tint of the game's own hue. */
function DifficultyPill({ difficulty, gc }: { difficulty: GameDef["difficulty"]; gc: GameColor }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.6px]"
      style={{ backgroundColor: `${gc.from}1F`, borderColor: `${gc.from}55`, color: gc.ink }}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: DIFFICULTY_DOT[difficulty] }}
      />
      {difficulty}
    </span>
  );
}

/**
 * A tile: the painting 4:3 with the access pill in its corner and the
 * vignette medallion overlapping its foot (the same looping preview as
 * before, on its cream disc, a picture-in-picture rather than the whole face
 * of the card), then the words in ink on ivory, then the difficulty and,
 * on a gated card, the lock chip.
 */
function GameCard({
  game,
  locked,
  tasteLabel,
  previewDelay,
}: {
  game: GameDef;
  locked: boolean;
  /** What the free taste has to say about this card, or null if nothing. */
  tasteLabel: string | null;
  previewDelay: string;
}) {
  const gc = GAME_COLORS[game.id] ?? FALLBACK_COLOR;
  const art = gameArt(game.id);
  return (
    <div
      data-testid={`game-card-${game.id}`}
      className="overflow-hidden rounded-[18px] border border-border bg-card shadow-[0_4px_14px_rgba(30,22,51,0.08)]"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#E9E4F5]">
        {art ? (
          <img
            src={art}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{ backgroundImage: `linear-gradient(150deg, ${gc.from} 0%, ${gc.to} 100%)` }}
          />
        )}
        {/* Locked games keep their colour (an All-Access card is a promise,
            not a broken tile) and take a light dim so the lock reads. */}
        {locked && <div aria-hidden="true" className="absolute inset-0 bg-[rgba(30,22,51,0.28)]" />}
        <div className="absolute right-2 top-2">
          <AccessBadge plusOnly={game.plusOnly} tasteLabel={tasteLabel} />
        </div>
        <div
          className="absolute -bottom-2 left-2.5 flex h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-full border-[3px] border-white bg-[#FFF8EC]"
          style={MEDALLION_INK}
        >
          <GamePreview
            gameId={game.id}
            delay={previewDelay}
            fallback={<game.Icon className="h-6 w-6" style={{ color: gc.ink }} />}
          />
        </div>
      </div>
      <div className="px-3 pt-3.5">
        <h3 className="truncate text-base font-extrabold text-foreground">{game.title}</h3>
        <p className="line-clamp-2 text-xs leading-4 text-muted-foreground">{game.description}</p>
      </div>
      <div className="flex items-center justify-between gap-1.5 px-3 pb-3 pt-2.5">
        <DifficultyPill difficulty={game.difficulty} gc={gc} />
        {locked && <LockChip />}
      </div>
    </div>
  );
}
