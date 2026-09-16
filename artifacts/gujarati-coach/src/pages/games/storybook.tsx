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
import { ArrowLeft, BookOpen, Lock, RotateCcw, Share2, Volume2, VolumeX } from "lucide-react";
import * as Sentry from "@sentry/react";
import {
  getGetStoryBookQueryKey,
  useGetAccount,
  useGetStoryBook,
  useSynthesizeSpeech,
  useNarrateStoryLine,
} from "@workspace/api-client-react";
import {
  chooseScene,
  firstPlayableScene,
  outcomeStillId,
  playableSceneCount,
  setupStillId,
  storyBookFor,
  storyEnding,
  storyShareFileName,
  storySharePlan,
  STORY_PUNCHLINE_MS,
  STORY_SHARE_CTA,
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
import { applySpeechRate } from "@/lib/speechRatePref";
import {
  clearStoryBook,
  loadStoryBook,
  saveStoryBook,
} from "@/lib/story-ledger";
import { composeStoryShareImage, shareStoryImage } from "@/lib/story-share-image";

/** One concept resolved into this language, as the server returned it. */
type StoryPhrase = {
  concept: string;
  phraseId: number;
  nativeScript: string;
  romanized: string;
  english: string;
};

/**
 * ?journey=&zone=, defaulting to the zone that carries the free taste.
 *
 * `fromStop` is whether a journey was named at all: the map's stop link always
 * names one and the Games hub opens the book bare. It decides where every way
 * out goes (owner, on the phone, 2026-09-14: "when i click the back arrow on
 * the storybook stop, it takes me back to homescreen"). Here every exit was a
 * link to /games, so a stop reader was sent to the hub rather than the map.
 * Beat the Train already split its back link this way.
 */
function useZoneParams(): { journey: number; zone: number; fromStop: boolean } {
  const search = useSearch();
  return useMemo(() => {
    const params = new URLSearchParams(search);
    const j = Number(params.get("journey"));
    const z = Number(params.get("zone"));
    return {
      journey: Number.isInteger(j) && j > 0 ? j : 1,
      zone: Number.isInteger(z) && z > 0 ? z : 1,
      fromStop: params.has("journey"),
    };
  }, [search]);
}

/** Where the book's ways out go: the map from a stop, the hub from the hub. */
type StoryExit = { href: string; label: string };

function storyExit(fromStop: boolean): StoryExit {
  return fromStop
    ? { href: "/journey", label: "Back to the journey" }
    : { href: "/games", label: "Back to Games" };
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

/**
 * One of the three lines.
 *
 * THERE IS NO CHOSEN STATE ANY MORE, and it is not a simplification for its
 * own sake. A pick turns the page in the same tick (owner, 2026-09-15: "there
 * is an additional screen in between that's useless"), so this card is
 * unmounted before a lit border, a tick or a revealed meaning could be looked
 * at. The revealed meaning was real content and it moved rather than went: it
 * is on the carried YOU SAID line on the next beat, which is also where it is
 * useful, beside the picture of what that line caused.
 *
 * NOTHING EVER WENT RED HERE and nothing does now: a line that does not fit is
 * not a buzzer, it is a different thing to have said, and the story carries on
 * from it.
 */
function ChoiceCard({
  phrase,
  onPick,
  onSpeak,
  soundOn,
  disabled = false,
}: {
  phrase: StoryPhrase;
  onPick: () => void;
  onSpeak: () => void;
  soundOn: boolean;
  /**
   * True while a punchline holds the frame (2026-09-16). The board under it is
   * the scene just answered, so a second tap would answer it twice, and a tap
   * on its speaker would queue a third voice ahead of the next page's
   * narration.
   */
  disabled?: boolean;
}) {
  const native = useNativeText();

  return (
    <div
      className={cn(
        "relative flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-all",
        disabled ? "opacity-60" : "hover:border-primary/40 hover:bg-primary/5",
      )}
    >
      <button
        type="button"
        onClick={onPick}
        disabled={disabled}
        data-testid={`story-choice-${phrase.concept}`}
        className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left"
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
      </button>

      {soundOn && (
        <button
          type="button"
          onClick={onSpeak}
          disabled={disabled}
          aria-label={`Hear this line`}
          data-testid={`story-speak-${phrase.concept}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-muted"
        >
          <Volume2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/**
 * WHAT A PICK DOES FIRST: the punchline takes the whole frame.
 *
 * THE MAD-LIB RULING, owner 2026-09-16: "it seems boring". The game is meant to
 * play like a mad lib, where picking a line that does not fit makes something
 * funny happen. Since 2026-09-15 a pick turned the page in the same tick and
 * the outcome still rode beside the next page's YOU SAID line as an 84px
 * thumbnail, which is a joke told too small to land. So the outcome now OWNS
 * the frame for STORY_PUNCHLINE_MS, with a quick comic punch-in, and then the
 * story moves on by itself.
 *
 * NO NEXT BUTTON, and that is a ruling rather than an omission: the owner
 * removed one on 2026-09-15 and must not get it back. The beat ends on a timer.
 * A tap on the picture ends it early, for the learner who has already laughed.
 *
 * REDUCED MOTION KEEPS THE BEAT AND DROPS THE SHAKE. The hold is time to look,
 * not motion; the punch-in and the wobble are exactly what the setting is for.
 *
 * A STILL THAT WAS NEVER DRAWN leaves no grey hole: the brief fills the frame
 * instead, the same fallback the page itself uses.
 */
function Punchline({
  stillId,
  situation,
  onSkip,
}: {
  stillId: string;
  situation: string;
  onSkip: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const [failed, setFailed] = useState(false);

  return (
    <button
      type="button"
      onClick={onSkip}
      data-testid="story-punchline"
      className="absolute inset-0 z-30 block overflow-hidden rounded-2xl bg-[#f8f1e0] text-left dark:bg-[#26201a]"
    >
      <motion.div
        key={stillId}
        className="h-full w-full"
        initial={reduceMotion ? false : { scale: 1.22, rotate: -2.5 }}
        animate={
          reduceMotion
            ? undefined
            : { scale: [1.22, 0.96, 1.03, 1], rotate: [-2.5, 2, -1, 0] }
        }
        transition={reduceMotion ? undefined : { duration: 0.5, ease: "easeOut" }}
      >
        {failed ? (
          <div className="flex h-full w-full items-center justify-center overflow-auto border-2 border-dashed border-amber-300 px-5 py-4 text-center dark:border-amber-700">
            <p className="text-sm font-semibold leading-relaxed text-foreground">
              {situation}
            </p>
          </div>
        ) : (
          <img
            src={`${import.meta.env.BASE_URL}story/${stillId}.webp`}
            alt={situation}
            onError={() => setFailed(true)}
            className="h-full w-full object-cover"
          />
        )}
      </motion.div>
      <span className="sr-only">Tap to carry on</span>
    </button>
  );
}

/**
 * THE LINE JUST SAID, carried onto the next beat.
 *
 * SCRIPT, READING AND MEANING, AND NO PICTURE since 2026-09-16. The outcome
 * still rode here as a thumbnail from 2026-09-15, with its brief as visible
 * prose beside it. The picture has now had the whole frame for a beat (see
 * Punchline), so a thumbnail of it one second later is a repeat, and the brief
 * was only ever alt text; book 1's briefs are now commissioning prose for an
 * illustrator ("the viewer", "the bottom edge of the picture"), which reads
 * wrong as story text.
 */
function SaidLine({ phrase }: { phrase: StoryPhrase }) {
  const native = useNativeText();

  return (
    <div
      data-testid="story-said"
      className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-2.5"
    >
      <p className="min-w-0 flex-1 text-sm text-muted-foreground">
        You said{" "}
        <span
          style={native.style}
          dir={native.dir}
          className="font-semibold text-foreground"
        >
          {phrase.nativeScript}
        </span>
        {phrase.romanized.trim() !== "" && (
          <span className="text-muted-foreground"> ({phrase.romanized})</span>
        )}
        {" · "}
        <span className="italic">&ldquo;{phrase.english}&rdquo;</span>
      </p>
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
function TasteEnd({ exit }: { exit: StoryExit }) {
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
        href={exit.href}
        className="text-sm text-muted-foreground underline-offset-2 hover:underline"
      >
        {exit.label}
      </Link>
    </div>
  );
}

// ─── The book ────────────────────────────────────────────────────────────────

/**
 * One picture on the finished book's strip, or nothing at all.
 *
 * A still that was never drawn leaves NO box (2026-09-16): the strip is only
 * pictures and lines, and a grey rectangle in it reads as a broken book. The
 * brief is kept for a screen reader either way, since it is the only form the
 * picture takes for one.
 */
/** Where this page serves a still from. The strip and the share picture both
 *  ask here, so the picture can only ever hold what the screen shows. */
function storyStillSrc(stillId: string): string {
  return `${import.meta.env.BASE_URL}story/${stillId}.webp`;
}

function StripStill({
  stillId,
  situation,
  testId,
  className,
}: {
  stillId: string;
  situation: string;
  testId: string;
  className: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="sr-only">{situation}</span>;
  return (
    <img
      data-testid={testId}
      src={storyStillSrc(stillId)}
      alt={situation}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

/**
 * SHARE YOUR STORY: the finished book as one tall picture (owner, 2026-09-16:
 * "add a share button to share the story once its done as an image file").
 *
 * What goes in is storySharePlan's answer, never this component's; the drawing
 * is lib/story-share-image.ts. The phone twin is
 * bolo-mobile/components/story/StoryShareButton.tsx.
 *
 * NO PERSONAL DATA: the plan is the book, the lines and the domain, read from
 * window.location.host so a fork prints its own address. A failure is
 * reported and the button comes back; nothing is thrown at the learner.
 */
function ShareStoryButton({
  book,
  entries,
  phrasesByConcept,
}: {
  book: StoryBook;
  entries: LedgerEntry[];
  phrasesByConcept: Map<string, StoryPhrase>;
}) {
  const native = useNativeText();
  const [busy, setBusy] = useState(false);
  const share = async () => {
    if (busy) return;
    setBusy(true);
    let stage = "compose";
    try {
      const plan = storySharePlan(
        book,
        entries,
        (concept) => phrasesByConcept.get(concept),
        typeof window !== "undefined" ? window.location.host : null,
      );
      const ui = getComputedStyle(document.body).fontFamily || "sans-serif";
      const blob = await composeStoryShareImage(plan, storyStillSrc, {
        ui,
        script: (native.style.fontFamily as string | undefined) ?? ui,
        dir: native.dir,
        nastaliq: native.isNastaliq,
      });
      stage = "share";
      await shareStoryImage(blob, storyShareFileName(plan));
    } catch (err) {
      Sentry.captureException(
        err instanceof Error ? err : new Error(`story share ${stage} failed: ${String(err)}`),
        { tags: { storyShare: stage, bookId: book.id } },
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      onClick={() => void share()}
      disabled={busy}
      aria-busy={busy}
      data-testid="story-share"
      className="flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-primary bg-card px-4 py-3 font-bold text-primary transition-all hover:bg-primary/5 active:scale-[0.98] disabled:opacity-60"
    >
      <Share2 className="h-4 w-4" />
      {busy ? "Making your picture…" : STORY_SHARE_CTA}
    </button>
  );
}

/**
 * What the learner said, in order, AS THE PICTURES IT CAUSED. NOT a score.
 *
 * A PICTURE STRIP since 2026-09-16, the mad-lib ruling (owner: "it seems
 * boring"). This screen listed each scene's English brief as small print above
 * the line said, which made the finished book a page of illustrator's notes.
 * The book is now the ending the read earned (storyEnding, only where a book's
 * ending art exists), then every outcome picture the learner actually caused,
 * each with the line that caused it. The briefs survive only as alt text.
 *
 * The branches converge, so the story is the same shape for everybody; what
 * makes the book theirs is which line they said at each beat. That is why this
 * screen has no total and no pass mark, and why a line that did not fit is
 * listed exactly like one that did. The ending is chosen by how many lines did
 * not fit, and it says so only in pictures.
 */
function TheBook({
  book,
  entries,
  phrasesByConcept,
  onAgain,
  exit,
  limited = false,
}: {
  book: StoryBook;
  entries: LedgerEntry[];
  phrasesByConcept: Map<string, StoryPhrase>;
  onAgain: () => void;
  exit: StoryExit;
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
  const ending = storyEnding(book, entries);
  return (
    <div className="flex flex-1 flex-col gap-5 px-4 py-6" data-testid="story-book">
      <div className="text-center">
        <BookOpen className="mx-auto mb-2 h-7 w-7 text-primary" />
        <h2 className="text-2xl font-extrabold text-foreground">Your book</h2>
        <p className="mt-1 text-sm text-muted-foreground">{book.title}</p>
      </div>

      {/* READ IT AGAIN IS AT THE TOP, with the share beside it (owner,
          2026-09-16: "the play again button, put it on the top of that summary
          screen"). It sat under the whole strip and the upsell, a long scroll
          from the moment a learner wants it. The upsell stays AFTER the strip,
          because the strip is still the argument. */}
      <div className="flex gap-3" data-testid="story-book-actions">
        <button
          onClick={onAgain}
          data-testid="story-again"
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
        >
          <RotateCcw className="h-4 w-4" />
          Read it again
        </button>
        <ShareStoryButton book={book} entries={entries} phrasesByConcept={phrasesByConcept} />
      </div>

      {ending && (
        <StripStill
          key={ending.stillId}
          testId="story-ending"
          stillId={ending.stillId}
          situation={ending.situation}
          className="aspect-[3/2] w-full rounded-2xl object-cover shadow-md"
        />
      )}

      {/* A STRIP, NOT A LIST OF THUMBNAILS. Each panel is the picture first and
          the line under it, like a comic read top to bottom; two across once
          the column is wide enough for two pictures to still read. */}
      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {entries.map((entry, i) => {
          const scene = book.scenes.find((s) => s.id === entry.sceneId);
          const choice = scene?.choices.find((c) => c.concept === entry.concept);
          const phrase = phrasesByConcept.get(entry.concept);
          return (
            <li
              key={`${entry.sceneId}-${i}`}
              data-testid="story-book-entry"
              className="flex flex-col gap-2 overflow-hidden rounded-2xl border border-border bg-card"
            >
              {choice?.outcome && (
                <StripStill
                  testId="story-book-still"
                  stillId={outcomeStillId(entry.sceneId, entry.concept)}
                  situation={choice.outcome.situation}
                  className="aspect-[3/2] w-full object-cover"
                />
              )}
              <div className="min-w-0 px-4 pb-3 pt-1">
                <p
                  style={native.style}
                  dir={native.dir}
                  className="text-lg leading-snug text-foreground"
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
              </div>
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

      <Link
        href={exit.href}
        className="text-center text-sm text-muted-foreground underline-offset-2 hover:underline"
      >
        {exit.label}
      </Link>
    </div>
  );
}

// ─── The page ────────────────────────────────────────────────────────────────

export default function StorybookPage() {
  const { activeLang, activeLanguage } = useLanguage();
  const reduceMotion = useReducedMotion();
  const { journey, zone, fromStop } = useZoneParams();
  const exit = storyExit(fromStop);
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
  }, [book, activeLang]);

  // THE SCENE THIS LANGUAGE CAN ACTUALLY BE SHOWN, which is not always the one
  // `sceneId` names. A scene whose concepts the corpus lacks is stepped over
  // rather than dead-ending the reader on the not-ready screen (owner, on a
  // TestFlight build of the SEA fork in Tagalog, 2026-09-15: "this isn't ok").
  // Never a partial board either way: a scene showing two of its three lines
  // reads as broken rather than as short.
  const resolved =
    book && activeLang
      ? firstPlayableScene(book.scenes, sceneId, activeLang, has)
      : null;
  const scene = resolved?.scene ?? null;

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

  /**
   * ONE VOICE AT A TIME, IN THE ORDER IT WAS ASKED FOR.
   *
   * THE QUEUE IS PART OF REMOVING THE MIDDLE PAGE, not a tidy-up. A pick used
   * to turn the page on the SECOND click, so the learner's line and the next
   * beat's narration were separated by a click and could never collide. Now a
   * pick turns the page itself, and both requests fire in the same tick onto
   * the one audio element they deliberately share: whichever synthesis resolved
   * last won and the other was cut off mid-word, at random. Chaining them keeps
   * the order they were asked in, which is YOUR line, then the page you turned
   * to.
   *
   * A LINK RESOLVES WHEN ITS CLIP STOPS BEING AUDIBLE, by any route: ended,
   * paused (which is how leaving the page drains the queue), an error, or a
   * play() that was refused, which is every play under jsdom.
   */
  const voiceRef = useRef<Promise<void>>(Promise.resolve());
  const enqueueVoice = useCallback((task: () => Promise<void>) => {
    const next = voiceRef.current.then(task, task);
    voiceRef.current = next.then(
      () => undefined,
      () => undefined,
    );
  }, []);

  const playToEnd = useCallback((audio: HTMLAudioElement): Promise<void> => {
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      audio.onended = finish;
      audio.onpause = finish;
      audio.onerror = finish;
      try {
        // jsdom's play() is a not-implemented stub that returns UNDEFINED
        // rather than a promise, so `.catch` on it is a TypeError and every
        // link in the chain would break at the first clip. The old code
        // awaited it, which tolerated undefined by accident; this has to
        // tolerate it on purpose.
        const started = audio.play() as Promise<void> | undefined;
        if (started && typeof started.then === "function") {
          void started.catch(finish);
        } else {
          finish();
        }
      } catch {
        finish();
      }
    });
  }, []);

  const speak = useCallback(
    (phrase: StoryPhrase) => {
      if (!soundOn) return;
      const key = `${phrase.phraseId}:${ttsVoice}`;
      enqueueVoice(async () => {
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
          applySpeechRate(audio);
          await playToEnd(audio);
        } catch {
          // A line that will not speak still reads. Silence is the fallback,
          // not an error screen: playCue is wired at 22 sites the same way.
        }
      });
    },
    [
      soundOn,
      ttsVoice,
      synthesize,
      activeLang,
      activeLanguage,
      enqueueVoice,
      playToEnd,
    ],
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
    (text: string) => {
      if (!soundOn) return;
      const line = text.trim();
      if (!line) return;
      enqueueVoice(async () => {
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
          await playToEnd(audio);
        } catch {
          // A story that will not speak still reads, and the picture is still
          // there. Same contract as speak: silence is the fallback, never an
          // error screen over the top of the book.
        }
      });
    },
    [soundOn, narrateApi, enqueueVoice, playToEnd],
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

  /**
   * THE PUNCHLINE ON SCREEN, or null between beats (2026-09-16, the mad-lib
   * ruling: "it seems boring"). While it is set the frame shows the outcome
   * still full size and the board under it cannot be answered.
   *
   * THE ADVANCE WAITS IN A REF, NOT IN STATE. What the pick decided (the next
   * scene, the paywall beat or the finished book) is computed at the pick,
   * against the board the learner actually answered, and applied when the beat
   * ends. Recomputing it at the end of the beat would read whatever `scene` and
   * `data` hold 3.5 seconds later.
   */
  const [punchline, setPunchline] = useState<{
    stillId: string;
    situation: string;
  } | null>(null);
  const pendingAdvanceRef = useRef<(() => void) | null>(null);
  const punchlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (punchlineTimerRef.current) clearTimeout(punchlineTimerRef.current);
      punchlineTimerRef.current = null;
      pendingAdvanceRef.current = null;
    },
    [],
  );

  /**
   * End the beat: by its timer, or early by a tap on the picture.
   *
   * THE NEXT PAGE'S NARRATION IS ASKED FOR HERE AND NOT BEFORE, because
   * advancing is what changes the Book's still and the Book narrates on that
   * change. So the chain documented at enqueueVoice (7ecd67d7) still holds, it
   * is just longer: the learner's line was queued at the pick, and the
   * narration joins the queue behind it now. A skip that lands while the line
   * is still speaking therefore waits for the line to finish rather than
   * cutting it off mid-word.
   */
  const endPunchline = useCallback(() => {
    if (punchlineTimerRef.current) clearTimeout(punchlineTimerRef.current);
    punchlineTimerRef.current = null;
    const advance = pendingAdvanceRef.current;
    pendingAdvanceRef.current = null;
    setPunchline(null);
    advance?.();
  }, []);

  /**
   * A PICK IS THE PUNCHLINE, AND THE PUNCHLINE TURNS THE PAGE. There is still
   * no Next button on this page.
   *
   * Owner, off a TestFlight build, 2026-09-15: "after you make a selection, you
   * don't need the one screen in the middle... there is an additional screen in
   * between that's useless." That page held until Next was pressed. What
   * replaced it turned the page in the same tick and shrank the outcome to a
   * thumbnail, and the owner then found the game boring (2026-09-16: "it seems
   * boring"), because a mad lib is only funny if you SEE what your line did.
   * So the outcome takes the frame for STORY_PUNCHLINE_MS and the page turns
   * BY ITSELF afterwards. A beat is not a page: nothing waits on the learner.
   *
   * WHAT ELSE THIS DOES, and both halves matter. It carries the line forward
   * into the YOU SAID line. And it asks for the next scene THIS LANGUAGE CAN
   * CARRY rather than trusting `taken.next` to resolve, so a book whose later
   * scenes name a word the corpus lacks ends properly on the finished book
   * instead of dropping the reader on the not-ready screen with their
   * part-written story thrown away.
   */
  const choose = useCallback(
    (concept: string, phrase: StoryPhrase) => {
      if (!scene || !book || !activeLang) return;
      // Not tappable during a beat. The cards are disabled too; this catches a
      // second click that lands before the render that disables them.
      if (pendingAdvanceRef.current) return;
      const taken = chooseScene(scene, concept);
      if (!taken) return;
      const choice = scene.choices.find((c) => c.concept === concept) ?? null;
      const next = [...entries, taken.entry];
      setEntries(next);
      setLastSaid(phrase);
      webHaptic("success");
      speak(phrase);

      const onward =
        taken.next === null
          ? null
          : firstPlayableScene(book.scenes, taken.next, activeLang, has);

      let advance: () => void;
      if (onward) {
        const onwardId = onward.scene.id;
        advance = () => setSceneId(onwardId);
      } else if (taken.next !== null && data?.limited === true) {
        // THE TWO WAYS A STORY CAN STOP, and they must not be confused. A
        // `limited` response means the server served the taste's concepts
        // only, so the scenes past it cannot resolve BECAUSE THEY WERE NOT PAID
        // FOR: that is the paywall beat, and the page falls into it by holding
        // the id that will not resolve. Anything else is the story genuinely
        // running out, which is a finished book. Selling somebody a book that
        // does not exist in their language is the worse of the two mistakes,
        // and telling a paying reader their story is unfinished when it just
        // ended is the other one.
        const heldId = taken.next;
        advance = () => setSceneId(heldId);
      } else {
        // SAVED AT THE PICK, not when the beat ends: a learner who leaves
        // during the last punchline has still finished the book, and comes
        // back to it rather than to page one.
        saveStoryBook(book.id, activeLang, next);
        advance = () => {
          setFinished(true);
          setSceneId(null);
        };
      }

      // A line with no authored outcome has no punchline to show, so it turns
      // the page at once, which is how every pick behaved on 2026-09-15.
      if (!choice?.outcome) {
        advance();
        return;
      }
      pendingAdvanceRef.current = advance;
      setPunchline({
        stillId: outcomeStillId(scene.id, concept),
        situation: choice.outcome.situation,
      });
      punchlineTimerRef.current = setTimeout(endPunchline, STORY_PUNCHLINE_MS);
    },
    [scene, book, activeLang, entries, has, speak, data, endPunchline],
  );

  const readAgain = useCallback(() => {
    if (!book || !activeLang) return;
    clearStoryBook(book.id, activeLang);
    if (punchlineTimerRef.current) clearTimeout(punchlineTimerRef.current);
    punchlineTimerRef.current = null;
    pendingAdvanceRef.current = null;
    setPunchline(null);
    setEntries([]);
    setFinished(false);
    // Starting over must clear the carried line too, or the first page of a
    // fresh read opens with "You said" above it quoting the previous read.
    setLastSaid(null);
    setSceneId(book.startId);
  }, [book, activeLang]);

  const beat = entries.length + 1;
  // THE PIPS COUNT WHAT THIS LANGUAGE WILL ACTUALLY BE SHOWN, not the book's
  // scene count. Since 2026-09-15 a scene the corpus cannot carry is skipped
  // rather than dead-ending the reader, so a five-pip rail over a three-beat
  // run would leave two pips unfilled forever and read as a story that broke
  // rather than one that ended.
  const totalBeats =
    book && activeLang
      ? playableSceneCount(book.scenes, book.startId, activeLang, has)
      : 0;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background pb-nav lg:pb-8">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-3 border-b border-border px-4 py-4">
        <Link
          href={exit.href}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-muted"
          aria-label={exit.label}
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
            exit={exit}
            limited={data?.limited === true}
          />
        )}

        {/* THE TASTE RAN OUT. A scene that will not resolve on a `limited`
            response is the learner reaching the end of what they were given,
            which is a different thing from a language whose corpus is thin. */}
        {book && !isLoading && !finished && !resolved && data?.limited && (
          <TasteEnd exit={exit} />
        )}

        {/* The corpus is short in this language. No offer, because there is
            nothing here to sell them: the rest of this book does not exist in
            their language at all.

            WHAT IT TAKES TO REACH THIS NOW, since 2026-09-15: NOT ONE scene of
            this book resolves. It used to be any single scene, which is how the
            owner got a full-screen "not ready in Tagalog yet" and a Back button
            on the SEA fork ("this isn't ok"), on a book whose other four scenes
            were fine. Against India's seeded corpus this is reachable for no
            book in any of the 22 languages: every one of the 132 pairs carries
            at least one playable scene. It stays because production is not the
            seed and a book authored from rarer concepts could still land here. */}
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
              href={exit.href}
              className="text-sm text-primary underline-offset-2 hover:underline"
            >
              {exit.label}
            </Link>
          </div>
        )}

        {book && !isLoading && !finished && resolved && (
          <div className="relative flex flex-1 flex-col gap-4 px-4 py-4">
            {/* Sits over the scene rather than instead of it, so the picture is
                already mounted and zooming when the cover clears. */}
            {!opened && <BookOpening onDone={openBook} />}
            <div className="flex items-center justify-center gap-1.5">
              {Array.from({ length: totalBeats }, (_, i) => (
                <span
                  key={i}
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

            {/* THE PAGE IS THE SCENE YOU ARE ON, and only ever that.

                IT USED TO BE THE CONSEQUENCE FOR ONE CLICK. Picking a line
                swapped this frame for the outcome still and held there until
                Next was pressed, which is the page the owner removed on
                2026-09-15 ("there is an additional screen in between that's
                useless"). The consequence itself was NOT removed with it. It
                rode as a thumbnail beside YOU SAID for a day, and since
                2026-09-16 (the mad-lib ruling, "it seems boring") it covers
                this frame for a timed beat instead: see Punchline. Either way
                the 2026-08-24 report stays answered ("it doesn't really adjust
                based on my selection").

                EVERY BEAT IS STILL A PAGE TURNING. The scene lives on the page,
                so advancing swings the next one in on a left-hand hinge rather
                than cutting to it. Keyed on the still id, which now changes
                once per beat rather than twice.

                ENTER-ONLY, deliberately. An exit animation would need
                AnimatePresence, which keeps a child mounted until that exit
                completes, and framer-motion never completes one under jsdom.
                The page arriving reads as a turn on its own; the page leaving
                would have cost every test that renders this screen. */}
            <div className="relative">
              <Book
                testId="story-scene"
                stillId={setupStillId(resolved.scene.id)}
                situation={resolved.scene.situation}
                narrate={narrate}
                soundOn={soundOn}
              />
              {/* THE PUNCHLINE COVERS THE PAGE, IT DOES NOT REPLACE IT
                  (2026-09-16). The Book underneath keeps the scene just
                  answered, so its still does not change during the beat and
                  it asks for no narration; the next page's narration starts
                  when the beat ends and the Book turns. */}
              {punchline && (
                <Punchline
                  key={punchline.stillId}
                  stillId={punchline.stillId}
                  situation={punchline.situation}
                  onSkip={endPunchline}
                />
              )}
            </div>

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

            {/* WHAT YOU SAID, AND WHAT CAME OF IT, carried onto the next beat
                rather than given a page of its own. Script, reading and meaning
                together: the script is what they are learning to recognise, the
                reading is how to say it, and the English is what makes the
                picture land. Any one of the three alone leaves a gap. The
                consequence is no longer here: it had the whole frame for a beat
                before this line appeared (2026-09-16); see SaidLine. */}
            {lastSaid && <SaidLine phrase={lastSaid} />}

            <div className="flex flex-col gap-3">
              {resolved.choices.map((choice) => {
                const phrase = phrasesByConcept.get(choice.concept);
                if (!phrase) return null;
                return (
                  <ChoiceCard
                    key={choice.concept}
                    phrase={phrase}
                    soundOn={soundOn}
                    disabled={punchline !== null}
                    onPick={() => choose(choice.concept, phrase)}
                    onSpeak={() => speak(phrase)}
                  />
                );
              })}
            </div>

            {/* THERE IS NO NEXT BUTTON HERE ANY MORE. It existed to leave the
                consequence page, and picking a line turns the page itself since
                2026-09-15 (owner, off a TestFlight build: "there is an
                additional screen in between that's useless"). On the last beat
                it said "Finish the story"; the last pick now reaches the
                finished book directly.

                STILL NONE after 2026-09-16, when the punchline beat arrived. A
                beat that needed a press to leave would be the removed page
                back under another name, so it ends on a timer, and a tap on the
                picture only makes it end sooner. */}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
