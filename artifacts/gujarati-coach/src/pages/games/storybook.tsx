// The storybook: a scene, three lines, and the choice becomes the learner's own
// book. The clip game and the storybook are ONE engine (@workspace/story); only
// the scene renderer differs between the three content tiers, and this page is
// the Tier 1 renderer.
//
// WHAT THIS PAGE DOES NOT DECIDE. Which line fits, what order the lines appear
// in, where the story goes next, and when a scene cannot be shown at all are
// every one of them the library's answers, not this file's. The phone's twin
// must call the same functions or the two will disagree about a learner's
// story within a week, which is exactly what happened to the stroke engine
// before it was extracted.
//
// NOT A QUICK GAME, so it does not ride QuickGameShell: there is no topic
// picker (the book carries its own vocabulary), no phrase pool, no round timer
// and no score. The result screen is a BOOK, not a scorecard, because a line
// that does not fit is a different thing to have said rather than a wrong
// answer, and the ledger records what was said.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useSearch } from "wouter";
import { ArrowLeft, BookOpen, Check, Lock, RotateCcw, Volume2, VolumeX } from "lucide-react";
import {
  getGetStoryBookQueryKey,
  useGetAccount,
  useGetStoryBook,
  useSynthesizeSpeech,
  useNarrateStoryLine,
} from "@workspace/api-client-react";
import {
  chooseScene,
  outcomeStillId,
  resolveScene,
  setupStillId,
  storyBookFor,
  STORY_TEASER_END,
  STORY_TASTE_BOOK_DONE,
  type LedgerEntry,
  type StoryBook,
} from "@workspace/story";
import { motion, useReducedMotion } from "framer-motion";
import { BottomNav } from "@/components/layout/bottom-nav";
import { useGameAudio } from "@/components/game-mute-button";
import { Mascot } from "@/components/mascot";
import { cn } from "@/lib/utils";
import { webHaptic } from "@/lib/haptics";
import { useLanguage, useNativeText } from "@/lib/language-context";
import {
  clearStoryBook,
  loadStoryBook,
  saveStoryBook,
} from "@/lib/story-ledger";

/** One concept resolved into this language, as the server returned it. */
type StoryPhrase = {
  concept: string;
  phraseId: number;
  nativeScript: string;
  romanized: string;
  english: string;
};

/** ?journey=&zone=, defaulting to the zone that carries the free taste. */
function useZoneParams(): { journey: number; zone: number } {
  const search = useSearch();
  return useMemo(() => {
    const params = new URLSearchParams(search);
    const j = Number(params.get("journey"));
    const z = Number(params.get("zone"));
    return {
      journey: Number.isInteger(j) && j > 0 ? j : 1,
      zone: Number.isInteger(z) && z > 0 ? z : 1,
    };
  }, [search]);
}

// ─── Opening the book ───────────────────────────────────────────────────────

/**
 * The book opens.
 *
 * ONCE PER VISIT, not once per scene. The gesture says "a story is starting",
 * and a story that starts five times has not started at all. Every later beat
 * is a page turning inside a book that is already open, which the scene
 * crossfade already reads as.
 *
 * WHAT IT IS MADE OF. A cover swings away on a Y-axis hinge under perspective,
 * so it reads as a hard cover rather than a card sliding off, and two page
 * leaves sweep behind it slightly out of step, because real pages never fall
 * together. The whole thing is 900ms: long enough to register as a book, short
 * enough that the second visit is not a wait.
 *
 * IT COVERS THE SCENE, IT DOES NOT REPLACE IT. The picture is mounted and
 * already zooming underneath, so the moment the cover clears there is a live
 * scene behind it rather than a pop-in.
 *
 * NO EXIT FADE, and not for taste. AnimatePresence keeps a child mounted until
 * its exit animation completes, and framer-motion does not complete one under
 * jsdom, so the cover would sit over the scene forever in every test that
 * renders this page. The cover swinging off its hinge IS the exit; a fade on
 * top of it was redundant anyway.
 *
 * REDUCED MOTION GETS NOTHING. Not a faster flip, not a fade: a hinge swinging
 * at the reader is exactly the vestibular trigger the setting exists for. The
 * page simply starts open, which is the honest still frame of this animation.
 */
function BookOpening({ onDone }: { onDone: () => void }) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      onDone();
      return;
    }
    const t = setTimeout(onDone, 900);
    return () => clearTimeout(t);
  }, [reduceMotion, onDone]);

  if (reduceMotion) return null;

  return (
    <motion.div
      data-testid="story-book-opening"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-3xl"
      style={{ perspective: 1200 }}
    >
      {/* Two leaves, deliberately out of step. Pages never fall together. */}
      {[0, 0.12].map((delay, i) => (
        <motion.div
          key={i}
          className="absolute inset-y-0 left-0 w-1/2 origin-left rounded-l-3xl border-r border-amber-200/60 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950"
          style={{ transformStyle: "preserve-3d" }}
          initial={{ rotateY: 0 }}
          animate={{ rotateY: -165 }}
          transition={{ duration: 0.75, delay, ease: [0.4, 0, 0.2, 1] }}
        />
      ))}
      {/* The cover, last to clear. */}
      <motion.div
        className="absolute inset-0 origin-left rounded-3xl bg-gradient-to-br from-amber-700 to-amber-900 shadow-2xl"
        style={{ transformStyle: "preserve-3d" }}
        initial={{ rotateY: 0 }}
        animate={{ rotateY: -170 }}
        transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="absolute inset-4 rounded-2xl border-2 border-amber-300/40" />
      </motion.div>
    </motion.div>
  );
}

// ─── The scene's picture ─────────────────────────────────────────────────────

/**
 * The scene, rendered.
 *
 * THE ART DOES NOT EXIST YET and this is the honest placeholder for it: the
 * situation sentence, which is already the illustrator's brief AND the alt text
 * a screen reader will read once there is a picture. It is not a hole in the
 * page, it is the same information in the only form currently authored.
 *
 * `media.ref` is carried on the scene and deliberately unused here. When the
 * Tier 1 stills land under public/story/ this becomes an <img> keyed on it and
 * nothing else on the page changes.
 */
/**
 * The book the page is bound into.
 *
 * WHY THIS EXISTS AS CHROME RATHER THAN AS THE ANIMATION. The turn was already
 * here: the scene swung in on a left-hand hinge from the day it was built. It
 * still did not read as a book, because a rectangle rotating in empty space is
 * a transition, not a page. What was missing is the thing it turns AGAINST.
 *
 * Reported 2026-08-24: "I imagined an actual book, and the image being the
 * page, then the page flipping for the next screen."
 *
 * Three parts, and each is doing a job rather than decorating:
 *   the SPINE on the left, which is the axis the page already rotates around,
 *     so the hinge now has something visible to hinge on;
 *   the FORE EDGE on the right, two thin slivers, which say there are more
 *     pages after this one, so the turn implies a book rather than a slideshow;
 *   the PAPER, warm and off-white, with the picture inset inside a margin, so
 *     the image reads as an illustration printed on a page instead of a card
 *     floating on the app's background.
 *
 * The lines stay BELOW the board and unchanged, at the owner's direction: the
 * book is the picture, the three lines are the app.
 */
/**
 * Pretend words on the left leaf.
 *
 * Wavy strokes, not text. They read as a page of writing at a glance and as
 * nothing at all on inspection, which is exactly right: the story is the
 * picture and the three lines, and real prose on that leaf would be prose to
 * translate into 22 languages. Drawn rather than typed for the same reason.
 */
function Scribbles() {
  const rows = [9, 7, 10, 8, 10, 6];
  return (
    <div
      aria-hidden
      className="absolute inset-0 flex flex-col justify-center gap-[6%] px-[10%] py-[9%]"
    >
      {rows.map((seg, i) => {
        const span = i === rows.length - 1 ? 50 : 100;
        const step = span / seg;
        let d = "";
        for (let n = 0; n < seg; n++) {
          const x = n * step;
          d += `M${x.toFixed(2)} 6 q ${(step * 0.2).toFixed(2)} -3.4 ${(step * 0.39).toFixed(2)} 0 t ${(step * 0.39).toFixed(2)} 0 `;
        }
        return (
          <svg key={i} viewBox="0 0 100 12" preserveAspectRatio="none" className="block w-full">
            <path
              d={d}
              fill="none"
              strokeWidth={2.4}
              strokeLinecap="round"
              className="stroke-stone-400/70 dark:stroke-stone-600/70"
            />
          </svg>
        );
      })}
    </div>
  );
}

/**
 * The storybook, as an actual book.
 *
 * REPORTED 2026-08-24, twice, and the second time was the useful one: "I
 * imagined an actual book, and the image being the page, then the page flipping
 * for the next screen", then "this is huge on standard web window" and "the
 * book should start small and then after zoom, I will only see the right page
 * with photo".
 *
 * THE THREE THINGS THAT MAKE IT WORK, and the first version had none of them.
 *
 * 1. A FRAME THAT CLIPS. Everything happens inside a fixed 3:2 box with
 *    overflow hidden. The first attempt scaled the book in open page flow, so
 *    the zoom covered the caption above it and the mute button below it. Two
 *    separate bug reports, one cause.
 *
 * 2. LANDSCAPE PAGES. Each leaf is 3:2, the same shape the stills are
 *    generated at, so the spread is 3:1 and ONE PAGE FILLS A 3:2 FRAME EXACTLY
 *    at scale 2. The first version used portrait pages, where pushing in on a
 *    page either crops the illustration or letterboxes it. The geometry had to
 *    change, not the numbers.
 *
 * 3. IT HOLDS BEFORE IT MOVES. 1.5 seconds on the whole small book, then a slow
 *    2-second push. "Too fast to tell its even a book" was the note on the
 *    quick version, and it was right: the point of showing a book is lost if
 *    nobody has time to see one.
 *
 * The origin is the RIGHT page's centre, so the push lands on the picture and
 * nothing else. The rest state carries a compensating shift so the small book
 * still sits in the middle of its frame rather than off to one side.
 */
function Book({
  stillId,
  situation,
  testId = "story-scene",
  narrate,
  soundOn = false,
}: {
  stillId: string;
  situation: string;
  testId?: string;
  narrate?: (text: string) => void;
  soundOn?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const reduceMotion = useReducedMotion();
  const src = (id: string) => `${import.meta.env.BASE_URL}story/${id}.webp`;

  // The leaf that turns away is simply the page this component showed LAST.
  // Reading it from a ref during the render where `stillId` changed gives the
  // outgoing page for free, with no prop threaded down from the page and no
  // second copy of the truth to keep in step.
  const prevRef = useRef<string | null>(null);
  const prevStillId = prevRef.current !== stillId ? prevRef.current : null;
  useEffect(() => {
    prevRef.current = stillId;
  }, [stillId]);

  // NARRATION IS ON BY DEFAULT NOW, on both the scene and its consequence.
  // It began as an opt-in "Hear the Story" button; the owner changed their mind
  // on 2026-08-24 and asked for sound on by default with a mute, so the control
  // below the book reads "Mute the Story" instead.
  //
  // Keyed on the still, so a beat narrates once and a re-render does not replay
  // it. `narrate` is left out of the deps deliberately: it is a useCallback
  // that changes with the mute state and would otherwise fire the clip again on
  // an unrelated render. The mute check lives inside `narrate`, so muting skips
  // SYNTHESIS and not merely playback.
  useEffect(() => {
    if (narrate && soundOn) narrate(situation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stillId, soundOn]);

  // THE BRIEF IS THE FALLBACK, NOT THE DESIGN. The situation sentence is
  // already the illustrator's brief and the alt text, so a picture that has not
  // been generated, or fails to load, degrades to the same information in the
  // only other form it exists in.
  if (failed) {
    return (
      <div
        data-testid={testId}
        className="relative flex min-h-[180px] w-full items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed border-amber-300 bg-amber-50 px-6 py-8 text-center dark:border-amber-700 dark:bg-amber-950/30"
      >
        <p className="text-base font-semibold leading-relaxed text-foreground">{situation}</p>
      </div>
    );
  }

  return (
    <div
      data-testid={testId}
      className="relative mx-auto aspect-[3/2] w-full overflow-hidden rounded-2xl bg-stone-200 shadow-inner dark:bg-stone-950"
    >
      <div className="absolute inset-0 grid place-items-center" style={{ perspective: 2200 }}>
        <motion.div
          // Keyed on the still, so a new beat pulls back to the whole book and
          // pushes in again rather than continuing the previous move.
          key={stillId}
          className="w-full"
          style={{ transformOrigin: "75% 50%" }}
          initial={reduceMotion ? { scale: 1.98, x: "-25%" } : { scale: 0.72, x: "-7%" }}
          animate={{ scale: 1.98, x: "-25%" }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { duration: 2, delay: 1.5, ease: [0.34, 0.06, 0.2, 1] }
          }
        >
          <div className="relative grid aspect-[3/1] w-full grid-cols-2 rounded-l-[4px] rounded-r-lg bg-gradient-to-b from-[#1f5060] to-[#143b47] p-[1.1%] shadow-[0_16px_34px_-18px_rgba(30,22,12,.6)]">
            <div className="relative overflow-hidden rounded-l-[3px] bg-[#f8f1e0] shadow-[inset_-14px_0_18px_-15px_rgba(0,0,0,.5)] dark:bg-[#26201a]">
              <Scribbles />
            </div>
            <div className="relative overflow-hidden rounded-r-[5px] bg-[#f8f1e0] shadow-[inset_14px_0_18px_-15px_rgba(0,0,0,.5)] dark:bg-[#26201a]">
              <img
                src={src(stillId)}
                alt={situation}
                onError={() => setFailed(true)}
                className="h-full w-full object-cover"
              />
            </div>
            {/* The binding. The gutter shadow is what makes paper look bound
                rather than printed. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-[1.1%] left-1/2 z-10 w-[2.2%] -translate-x-1/2"
              style={{
                background:
                  "linear-gradient(90deg,transparent,rgba(0,0,0,.22) 45%,rgba(0,0,0,.3) 50%,rgba(0,0,0,.22) 55%,transparent)",
              }}
            />
            {/* The leaf that turns away, carrying the page you just left. Only
                ever the RIGHT half, because that is the only leaf that moves in
                a book you read left to right. */}
            {prevStillId !== null && !reduceMotion && (
              <motion.div
                key={`leaf-${stillId}`}
                aria-hidden
                className="pointer-events-none absolute inset-y-[1.1%] left-1/2 right-[1.1%] z-20 overflow-hidden rounded-r-[5px] bg-[#f8f1e0] shadow-[-12px_0_22px_-14px_rgba(0,0,0,.6)] dark:bg-[#26201a]"
                style={{ transformOrigin: "left center", backfaceVisibility: "hidden" }}
                initial={{ rotateY: 0, opacity: 1 }}
                animate={{ rotateY: -170, opacity: 0 }}
                transition={{ duration: 0.95, ease: [0.42, 0.02, 0.28, 1] }}
              >
                <img src={src(prevStillId)} alt="" className="h-full w-full object-cover" />
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function ChoiceCard({
  phrase,
  state,
  onPick,
  onSpeak,
  soundOn,
}: {
  phrase: StoryPhrase;
  state: "open" | "chosen" | "passed";
  onPick: () => void;
  onSpeak: () => void;
  soundOn: boolean;
}) {
  const native = useNativeText();
  const answered = state !== "open";

  return (
    <div
      className={cn(
        "relative flex items-center gap-3 rounded-2xl border p-4 transition-all",
        state === "open" &&
          "border-border bg-card hover:border-primary/40 hover:bg-primary/5",
        // NOTHING GOES RED. A line that does not fit is not a buzzer: the story
        // carries on from it and the book records that it was said. The chosen
        // card is simply the lit one, whether or not it fitted.
        state === "chosen" && "border-primary bg-primary/5",
        state === "passed" && "border-border bg-card opacity-40",
      )}
    >
      <button
        type="button"
        onClick={onPick}
        disabled={answered}
        data-testid={`story-choice-${phrase.concept}`}
        className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left disabled:cursor-default"
      >
        <span
          style={native.style}
          dir={native.dir}
          className="text-xl leading-snug text-foreground"
        >
          {phrase.nativeScript}
        </span>
        {/* The reading rides under the script from the first look: the pairing
            IS the lesson, and hiding it until after the pick makes the choice a
            guess. Languages with no romanization render no empty slot. */}
        {phrase.romanized.trim() !== "" && (
          <span className="text-xs font-medium text-muted-foreground">
            {phrase.romanized}
          </span>
        )}
        {/* The MEANING is the reveal. Before the pick the learner is reading the
            picture, which is the whole mechanic; showing the English up front
            turns it into a matching exercise. */}
        {state === "chosen" && (
          <span className="pt-1 text-sm font-semibold text-primary">
            {phrase.english}
          </span>
        )}
      </button>

      {soundOn && (
        <button
          type="button"
          onClick={onSpeak}
          aria-label={`Hear this line`}
          data-testid={`story-speak-${phrase.concept}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-muted"
        >
          <Volume2 className="h-4 w-4" />
        </button>
      )}
      {state === "chosen" && (
        <Check className="absolute right-2 top-2 h-4 w-4 text-primary" />
      )}
    </div>
  );
}

// ─── The end of the free taste ───────────────────────────────────────────────

/**
 * The paywall beat, which fires ONLY when the taste ran out.
 *
 * A scene also resolves to null when the language's corpus is simply too thin
 * to carry it, and offering to sell somebody a book that does not exist in
 * their language is the worse of the two mistakes. `limited` from the server is
 * what tells the two apart. Copy lives in @workspace/story so the phone's twin
 * cannot word it differently.
 */
function TasteEnd() {
  return (
    <div
      data-testid="story-taste-end"
      className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center"
    >
      <Mascot pose="thumbsup" size={96} />
      <div>
        <h2 className="text-2xl font-extrabold text-foreground">
          {STORY_TEASER_END.title}
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          {STORY_TEASER_END.body}
        </p>
      </div>
      <Link
        href="/upgrade"
        data-testid="story-taste-upgrade"
        className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-8 py-3.5 font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
      >
        <Lock className="h-4 w-4" />
        {STORY_TEASER_END.cta}
      </Link>
      <Link
        href="/games"
        className="text-sm text-muted-foreground underline-offset-2 hover:underline"
      >
        Back to Games
      </Link>
    </div>
  );
}

// ─── The book ────────────────────────────────────────────────────────────────

/**
 * What the learner said, in order. NOT a score.
 *
 * The branches converge, so the story is the same shape for everybody; what
 * makes the book theirs is which line they said at each beat. That is why this
 * screen has no total and no pass mark, and why a line that did not fit is
 * listed exactly like one that did.
 */
function TheBook({
  book,
  entries,
  phrasesByConcept,
  onAgain,
  limited = false,
}: {
  book: StoryBook;
  entries: LedgerEntry[];
  phrasesByConcept: Map<string, StoryPhrase>;
  onAgain: () => void;
  /**
   * The reader is on the free taste and has just finished the one book it
   * opens.
   *
   * THIS IS THE ASK, AND IT ONLY EXISTS BECAUSE THE TASTE GREW. While the taste
   * was one scene, a free learner hit STORY_TEASER_END mid-story and never
   * reached this screen, so this screen never needed to sell anything. Now they
   * finish, and without this the whole of zone 1 is given away with no offer
   * attached anywhere.
   *
   * It sits AFTER the ledger rather than before it, because the ledger is the
   * argument. Asking above it would be asking before showing.
   */
  limited?: boolean;
}) {
  const native = useNativeText();
  return (
    <div className="flex flex-1 flex-col gap-5 px-4 py-6" data-testid="story-book">
      <div className="text-center">
        <BookOpen className="mx-auto mb-2 h-7 w-7 text-primary" />
        <h2 className="text-2xl font-extrabold text-foreground">Your book</h2>
        <p className="mt-1 text-sm text-muted-foreground">{book.title}</p>
      </div>

      <ol className="flex flex-col gap-3">
        {entries.map((entry, i) => {
          const scene = book.scenes.find((s) => s.id === entry.sceneId);
          const phrase = phrasesByConcept.get(entry.concept);
          return (
            <li
              key={`${entry.sceneId}-${i}`}
              className="rounded-2xl border border-border bg-card p-4"
            >
              {scene && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {scene.situation}
                </p>
              )}
              <p
                style={native.style}
                dir={native.dir}
                className="pt-2 text-lg leading-snug text-foreground"
              >
                {phrase?.nativeScript ?? entry.concept}
              </p>
              {phrase && phrase.romanized.trim() !== "" && (
                <p className="text-xs font-medium text-muted-foreground">
                  {phrase.romanized}
                </p>
              )}
              {phrase && (
                <p className="pt-1 text-sm text-muted-foreground">
                  {phrase.english}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      {limited && (
        <div
          data-testid="story-book-upsell"
          className="flex flex-col items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-5 text-center"
        >
          <h3 className="text-lg font-extrabold text-foreground">
            {STORY_TASTE_BOOK_DONE.title}
          </h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            {STORY_TASTE_BOOK_DONE.body}
          </p>
          <Link
            href="/upgrade"
            data-testid="story-book-upgrade"
            className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-8 py-3 font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
          >
            <Lock className="h-4 w-4" />
            {STORY_TASTE_BOOK_DONE.cta}
          </Link>
        </div>
      )}

      <button
        onClick={onAgain}
        data-testid="story-again"
        className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3.5 font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
      >
        <RotateCcw className="h-4 w-4" />
        Read it again
      </button>
      <Link
        href="/games"
        className="text-center text-sm text-muted-foreground underline-offset-2 hover:underline"
      >
        Back to Games
      </Link>
    </div>
  );
}

// ─── The page ────────────────────────────────────────────────────────────────

export default function StorybookPage() {
  const { activeLang, activeLanguage } = useLanguage();
  const native = useNativeText();
  const reduceMotion = useReducedMotion();
  const { journey, zone } = useZoneParams();
  const { soundOn, toggle: toggleSound } = useGameAudio();

  const book = useMemo(() => storyBookFor(journey, zone), [journey, zone]);

  const bookParams = useMemo(
    () => ({ lang: activeLang, journey, zone }),
    [activeLang, journey, zone],
  );
  const { data, isLoading } = useGetStoryBook(bookParams, {
    query: {
      queryKey: getGetStoryBookQueryKey(bookParams),
      // A zone with no book is a 404 by design and there is nothing to retry.
      enabled: Boolean(activeLang && book),
      retry: false,
    },
  });

  const phrasesByConcept = useMemo(() => {
    const map = new Map<string, StoryPhrase>();
    for (const p of data?.phrases ?? []) map.set(p.concept, p);
    return map;
  }, [data]);

  /** The engine's corpus probe: did this concept come back at all. */
  const has = useCallback(
    (_lang: string, concept: string) => phrasesByConcept.has(concept),
    [phrasesByConcept],
  );

  const [sceneId, setSceneId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [finished, setFinished] = useState(false);
  /** The book is shut until the opening animation clears it. Once per visit. */
  const [opened, setOpened] = useState(false);
  const openBook = useCallback(() => setOpened(true), []);

  // Open on the book's own start, and restore a finished book rather than
  // silently making the learner read it again.
  useEffect(() => {
    if (!book || !activeLang) return;
    const saved = loadStoryBook(book.id, activeLang);
    if (saved.length > 0) {
      setEntries(saved);
      setFinished(true);
      setSceneId(null);
    } else {
      setSceneId(book.startId);
    }
    setPicked(null);
  }, [book, activeLang]);

  const scene = book?.scenes.find((s) => s.id === sceneId) ?? null;
  const resolved =
    scene && activeLang ? resolveScene(scene, activeLang, has) : null;

  // ── Audio ────────────────────────────────────────────────────────────────
  const synthesize = useSynthesizeSpeech();
  const account = useGetAccount();
  const ttsVoice = account.data?.preferences.learning.ttsVoice ?? "auto";
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cache = useRef(new Map<string, { audioBase64: string; format: string }>());

  useEffect(
    () => () => {
      audioRef.current?.pause();
      audioRef.current = null;
    },
    [],
  );

  const speak = useCallback(
    async (phrase: StoryPhrase) => {
      if (!soundOn) return;
      const key = `${phrase.phraseId}:${ttsVoice}`;
      try {
        audioRef.current?.pause();
        let clip = cache.current.get(key);
        if (!clip) {
          const res = await synthesize.mutateAsync({
            data: {
              text: phrase.nativeScript,
              languageCode: activeLang,
              languageName: activeLanguage?.name ?? activeLang,
            },
          });
          clip = { audioBase64: res.audioBase64, format: res.format };
          cache.current.set(key, clip);
        }
        const audio = new Audio(
          `data:audio/${clip.format};base64,${clip.audioBase64}`,
        );
        audioRef.current = audio;
        await audio.play();
      } catch {
        // A line that will not speak still reads. Silence is the fallback, not
        // an error screen: playCue is wired at 22 sites the same way.
      }
    },
    [soundOn, ttsVoice, synthesize, activeLang, activeLanguage],
  );

  // ── The narrator ─────────────────────────────────────────────────────────
  //
  // SHARES audioRef WITH speak ON PURPOSE. Tapping a line mid-narration should
  // stop the narrator, and starting a new frame should stop whatever was
  // playing. Two refs would give a learner two voices at once, in two
  // languages, which is the exact collision the setup/outcome split above is
  // trying to avoid.
  //
  // THE MUTE CHECK IS FIRST, before the cache and before the request, so a
  // muted learner never causes a synthesis. Narration is billed per character
  // on first play and cached forever after, so a clip generated and not heard
  // is pure waste.
  //
  // The local cache is keyed on the TEXT ALONE, unlike the phrase cache above
  // which keys on voice too. The narrator is one fixed voice for everyone, so
  // there is nothing else for the key to carry.
  const narrateApi = useNarrateStoryLine();
  const narrationCache = useRef(new Map<string, { audioBase64: string; format: string }>());
  const narrate = useCallback(
    async (text: string) => {
      if (!soundOn) return;
      const line = text.trim();
      if (!line) return;
      try {
        audioRef.current?.pause();
        let clip = narrationCache.current.get(line);
        if (!clip) {
          const res = await narrateApi.mutateAsync({ data: { text: line } });
          clip = { audioBase64: res.audioBase64, format: res.format };
          narrationCache.current.set(line, clip);
        }
        const audio = new Audio(
          `data:audio/${clip.format};base64,${clip.audioBase64}`,
        );
        audioRef.current = audio;
        await audio.play();
      } catch {
        // A story that will not speak still reads, and the picture is still
        // there. Same contract as speak: silence is the fallback, never an
        // error screen over the top of the book.
      }
    },
    [soundOn, narrateApi],
  );

  // ── Turning a page ───────────────────────────────────────────────────────
  /**
   * The line said on the beat just gone, kept ALIVE ACROSS THE ADVANCE.
   *
   * Reported 2026-08-24: "The 'you said' isn't showing on the next page. It
   * shouldn't be its own page, but it should just show up above the next set of
   * answers." It used to be derived from `picked`, which resets on advance, so
   * it vanished at exactly the moment it became useful. The story reads as one
   * conversation when the line you just said is still on screen above the three
   * you are choosing between next.
   */
  const [lastSaid, setLastSaid] = useState<StoryPhrase | null>(null);

  const advance = useCallback(() => {
    if (!scene || !picked || !book || !activeLang) return;
    const taken = chooseScene(scene, picked);
    if (!taken) return;
    const next = [...entries, taken.entry];
    setEntries(next);
    setPicked(null);
    if (taken.next === null) {
      setFinished(true);
      setSceneId(null);
      saveStoryBook(book.id, activeLang, next);
      return;
    }
    setSceneId(taken.next);
  }, [scene, picked, book, activeLang, entries]);

  const readAgain = useCallback(() => {
    if (!book || !activeLang) return;
    clearStoryBook(book.id, activeLang);
    setEntries([]);
    setFinished(false);
    setPicked(null);
    // Starting over must clear the carried line too, or the first page of a
    // fresh read opens with "You said" above it quoting the previous read.
    setLastSaid(null);
    setSceneId(book.startId);
  }, [book, activeLang]);

  const beat = entries.length + 1;
  const totalBeats = book?.scenes.length ?? 0;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background pb-nav lg:pb-8">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-3 border-b border-border px-4 py-4">
        <Link
          href="/games"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-muted"
          aria-label="Back to Games"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-extrabold text-foreground">
            {book?.title ?? "Storybook"}
          </h1>
          {activeLanguage && (
            <p className="text-xs text-muted-foreground">{activeLanguage.name}</p>
          )}
        </div>
        {/* NO GameMuteButton HERE, and it is a deliberate exception to the
            convention every other game follows. This page gained a labelled
            "Mute the Story" control between the book and the answers, at the
            owner's request, and two controls for one piece of state is worse
            than an inconsistent header: a learner who mutes with one and sees
            the other still showing a speaker has been told the app is broken.
            The state itself is unchanged and still useGameAudio, so muting
            here mutes every other game too. */}
        <BookOpen className="h-6 w-6 text-primary" />
      </div>

      {/* THE PAGE HAD NO COLUMN AT ALL, which is why the owner's desktop
          showed one enormous picture and none of the answers: "storybook is
          super zoomed on the web", "can't see the answers" (build 29).

          The scene frame is `aspect-[3/2] w-full`, so with nothing capping
          the width it took the whole window, about 2000px on the owner's
          screen, and stood 1300 tall. Everything under it, the caption and
          the answer buttons, went below the fold. Every other screen in this
          app is a centred column and this one simply never got one: practice
          has seven width caps, this file had three and none of them on its
          container.

          max-w-2xl is practice's own column, so the storybook now reads at
          the same measure as the rest of the app, and a phone is unchanged
          because the column IS the window there. */}
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
        {!book && (
          <div
            className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center"
            data-testid="story-no-book"
          >
            <BookOpen className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              There is no story in this zone yet.
            </p>
          </div>
        )}

        {book && isLoading && (
          <div className="flex flex-1 items-center justify-center gap-3">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-sm text-muted-foreground">Opening the book…</span>
          </div>
        )}

        {book && !isLoading && finished && (
          <TheBook
            book={book}
            entries={entries}
            phrasesByConcept={phrasesByConcept}
            onAgain={readAgain}
            limited={data?.limited === true}
          />
        )}

        {/* THE TASTE RAN OUT. A scene that will not resolve on a `limited`
            response is the learner reaching the end of what they were given,
            which is a different thing from a language whose corpus is thin. */}
        {book && !isLoading && !finished && !resolved && data?.limited && (
          <TasteEnd />
        )}

        {/* The corpus is short in this language. No offer, because there is
            nothing here to sell them: the rest of this book does not exist in
            their language at all. */}
        {book && !isLoading && !finished && !resolved && !data?.limited && (
          <div
            className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center"
            data-testid="story-short"
          >
            <BookOpen className="h-8 w-8 text-muted-foreground" />
            <p className="max-w-sm text-sm text-muted-foreground">
              This story is not ready in{" "}
              {activeLanguage?.name ?? "this language"} yet.
            </p>
            <Link
              href="/games"
              className="text-sm text-primary underline-offset-2 hover:underline"
            >
              Back to Games
            </Link>
          </div>
        )}

        {book && !isLoading && !finished && resolved && (
          <div className="relative flex flex-1 flex-col gap-4 px-4 py-4">
            {/* Sits over the scene rather than instead of it, so the picture is
                already mounted and zooming when the cover clears. */}
            {!opened && <BookOpening onDone={openBook} />}
            <div className="flex items-center justify-center gap-1.5">
              {book.scenes.map((s, i) => (
                <span
                  key={s.id}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i < beat - 1
                      ? "w-6 bg-primary"
                      : i === beat - 1
                        ? "w-6 bg-primary/60"
                        : "w-3 bg-border",
                  )}
                />
              ))}
            </div>

            {/* THE PICTURE IS THE CONSEQUENCE. Before the tap it shows the
                moment; after it, it shows WHAT HAPPENED BECAUSE YOU SAID THAT.
                The graph still converges, so the story rejoins on the next
                beat, but the choice is now visible, which it was not.

                Reported 2026-08-24: "it doesn't really adjust based on my
                selection". It did adjust, in the ledger, where nobody could
                see it. The joke lives entirely in the image so it lands in all
                22 languages without a word being translated. */}
            {/* EVERY BEAT IS A PAGE TURNING. The scene lives on the page, so
                advancing swings the next one in on a left-hand hinge rather
                than cutting to it. Keyed on the still id, so it fires for BOTH
                transitions that happen here: setup to consequence when you tap
                a line, and consequence to the next setup when you press Next.

                ENTER-ONLY, deliberately. An exit animation would need
                AnimatePresence, which keeps a child mounted until that exit
                completes, and framer-motion never completes one under jsdom.
                The page arriving reads as a turn on its own; the page leaving
                would have cost every test that renders this screen. */}
            {(() => {
              const chosen =
                picked === null
                  ? null
                  : resolved.choices.find((c) => c.concept === picked) ?? null;
              const outcome = chosen?.outcome ?? null;
              const said = picked === null ? null : phrasesByConcept.get(picked);
              const turnKey = outcome
                ? outcomeStillId(resolved.scene.id, picked!)
                : setupStillId(resolved.scene.id);
              const stillId = outcome
                ? outcomeStillId(resolved.scene.id, picked!)
                : setupStillId(resolved.scene.id);
              return (
                <Book
                  testId={outcome ? "story-outcome" : "story-scene"}
                  stillId={stillId}
                  situation={outcome ? outcome.situation : resolved.scene.situation}
                  narrate={narrate}
                  soundOn={soundOn}
                />
              );
            })()}

            {/* MUTE, not "hear". Sound is on by default and this turns it off,
                which is the owner's decision of 2026-08-24 reversing an earlier
                opt-in button. It sits between the book and the answers because
                that is where they asked for it, and because a control over the
                picture competes with the picture. */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={toggleSound}
                aria-pressed={!soundOn}
                data-testid="story-mute"
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-bold transition-colors",
                  soundOn
                    ? "border-border bg-card text-foreground hover:bg-muted"
                    : "border-primary bg-primary text-white",
                )}
              >
                {soundOn ? (
                  <Volume2 className="h-4 w-4" />
                ) : (
                  <VolumeX className="h-4 w-4" />
                )}
                {soundOn ? "Mute the Story" : "Unmute the Story"}
              </button>
            </div>

            {/* WHAT YOU SAID, carried onto the next beat rather than given a
                page of its own. Script, reading and meaning together: the
                script is what they are learning to recognise, the reading is
                how to say it, and the English is what makes the picture land.
                Any one of the three alone leaves a gap. */}
            {lastSaid && (
              <p
                data-testid="story-said"
                className="rounded-2xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-center text-sm text-muted-foreground"
              >
                You said{" "}
                <span
                  style={native.style}
                  dir={native.dir}
                  className="font-semibold text-foreground"
                >
                  {lastSaid.nativeScript}
                </span>
                {lastSaid.romanized.trim() !== "" && (
                  <span className="text-muted-foreground"> ({lastSaid.romanized})</span>
                )}
                {" \u00b7 "}
                <span className="italic">&ldquo;{lastSaid.english}&rdquo;</span>
              </p>
            )}

            <div className="flex flex-col gap-3">
              {resolved.choices.map((choice) => {
                const phrase = phrasesByConcept.get(choice.concept);
                if (!phrase) return null;
                return (
                  <ChoiceCard
                    key={choice.concept}
                    phrase={phrase}
                    state={
                      picked === null
                        ? "open"
                        : picked === choice.concept
                          ? "chosen"
                          : "passed"
                    }
                    soundOn={soundOn}
                    onPick={() => {
                      setPicked(choice.concept);
                      setLastSaid(phrase);
                      webHaptic("success");
                      void speak(phrase);
                    }}
                    onSpeak={() => void speak(phrase)}
                  />
                );
              })}
            </div>

            {picked !== null && (
              <button
                onClick={advance}
                data-testid="story-next"
                className="flex items-center justify-center rounded-2xl bg-primary px-6 py-3.5 font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
              >
                {beat >= totalBeats ? "Finish the story" : "Next"}
              </button>
            )}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
