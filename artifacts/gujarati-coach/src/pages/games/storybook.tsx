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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearch } from "wouter";
import { ArrowLeft, BookOpen, Check, Lock, RotateCcw, Volume2 } from "lucide-react";
import {
  getGetStoryBookQueryKey,
  useGetAccount,
  useGetStoryBook,
  useSynthesizeSpeech,
} from "@workspace/api-client-react";
import {
  chooseScene,
  outcomeStillId,
  resolveScene,
  setupStillId,
  storyBookFor,
  STORY_TEASER_END,
  type LedgerEntry,
  type StoryBook,
} from "@workspace/story";
import { BottomNav } from "@/components/layout/bottom-nav";
import { GameMuteButton, useGameAudio } from "@/components/game-mute-button";
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
function SceneFrame({
  stillId,
  situation,
  testId = "story-scene",
}: {
  stillId: string;
  situation: string;
  testId?: string;
}) {
  const [failed, setFailed] = useState(false);

  // THE BRIEF IS THE FALLBACK, NOT THE DESIGN. The situation sentence is
  // already the illustrator's brief and the alt text, so an image that has not
  // been generated yet, or fails to load, degrades to the same information in
  // the only other form it exists in. It is not a placeholder anybody should
  // see for long: without the picture there is no scene, and the game is
  // "read the picture, say the line that fits".
  if (failed) {
    return (
      <div
        data-testid={testId}
        className="relative flex min-h-[180px] w-full items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed border-amber-300 bg-amber-50 px-6 py-8 text-center dark:border-amber-700 dark:bg-amber-950/30"
      >
        <p className="text-base font-semibold leading-relaxed text-foreground">
          {situation}
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid={testId}
      className="relative w-full overflow-hidden rounded-3xl border border-border bg-muted"
    >
      <img
        src={`${import.meta.env.BASE_URL}story/${stillId}.webp`}
        alt={situation}
        onError={() => setFailed(true)}
        className="aspect-[3/2] w-full object-cover"
      />
    </div>
  );
}

// ─── One line the learner can say ────────────────────────────────────────────

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
}: {
  book: StoryBook;
  entries: LedgerEntry[];
  phrasesByConcept: Map<string, StoryPhrase>;
  onAgain: () => void;
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

  // ── Turning a page ───────────────────────────────────────────────────────
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
    setSceneId(book.startId);
  }, [book, activeLang]);

  const beat = entries.length + 1;
  const totalBeats = book?.scenes.length ?? 0;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background pb-nav lg:pb-8">
      <div className="flex items-center gap-3 border-b border-border px-4 py-4">
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
        <GameMuteButton soundOn={soundOn} onToggle={toggleSound} />
        <BookOpen className="h-6 w-6 text-primary" />
      </div>

      <div className="flex flex-1 flex-col">
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
          <div className="flex flex-1 flex-col gap-4 px-4 py-4">
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
            {(() => {
              const chosen =
                picked === null
                  ? null
                  : resolved.choices.find((c) => c.concept === picked) ?? null;
              const outcome = chosen?.outcome ?? null;
              return outcome ? (
                <SceneFrame
                  key={`outcome-${resolved.scene.id}-${picked}`}
                  testId="story-outcome"
                  stillId={outcomeStillId(resolved.scene.id, picked!)}
                  situation={outcome.situation}
                />
              ) : (
                <SceneFrame
                  key={`setup-${resolved.scene.id}`}
                  stillId={setupStillId(resolved.scene.id)}
                  situation={resolved.scene.situation}
                />
              );
            })()}

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
