/**
 * THE LETTER STOP, position 4 of every zone. Hear the sound, pick the sound.
 *
 * Tracing at stop 2 teaches the hand and nothing in fourteen games ever taught
 * the eye: a learner could draw થ eight times and still not know it says "tha".
 * This is the other direction, and it is the only screen in the app that asks
 * somebody to READ.
 *
 * THE LETTER IS NEVER SHOWN WHILE THE QUESTION IS OPEN. That is the whole point
 * of the ear version and the whole difference from the tracing stop two rows
 * above it. It is revealed the moment an answer lands, because seeing the shape
 * beside the sound you just chose is the teaching, and hiding it afterwards
 * would be withholding the lesson rather than protecting the question.
 *
 * WHAT THIS PAGE DOES NOT DECIDE. Its position on the map, the questions, the
 * wrong answers, the length and the pass mark all come from letter-stops.ts in
 * @workspace/script-trace. This file owns the hand movements and the noise.
 *
 * MOBILE TWIN: bolo-mobile/app/(app)/(tabs)/games/letter-stop.tsx. The two are
 * hand-maintained, as every pair in this repo is, and the shared half is the
 * lib rather than a component. Two differences are deliberate and neither is
 * drift: the phone uses a PanResponder where this uses pointer events, and the
 * phone has no `prefers-reduced-motion` equivalent to read, because nothing
 * here animates on either platform. The native animation driver is dead in the
 * app's release builds, so the phone says state in a border, a weight and an
 * icon, and this says it the same way rather than reaching for a transition
 * the phone cannot have.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Redirect, useLocation, useSearch } from "wouter";
import { ArrowLeft, Award, Check, RotateCcw, Volume2, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  completeLetterStop,
  getGetProgressSummaryQueryKey,
  useSynthesizeSpeech,
} from "@workspace/api-client-react";
import {
  LETTER_CHOICES_FIRST,
  LETTER_CHOICES_SEEN,
  LETTER_STOP_LENGTH,
  LETTER_STOP_PASS,
  letterDistractorsFor,
  letterStopFor,
  type LetterStop,
  type TraceStopCharacter,
} from "@workspace/script-trace";
import { BottomNav } from "@/components/layout/bottom-nav";
import { GameMuteButton, useGameAudio } from "@/components/game-mute-button";
import { useEntitlements } from "@/lib/entitlements";
import { useLanguage, useNativeText } from "@/lib/language-context";
import { useTraceStopProgress } from "@/lib/useTraceStopProgress";
import { pickTargetByStroke, type GesturePoint } from "@/lib/gesture-answer";
import { webHaptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/**
 * How far a pointer must travel before the grid claims the gesture as a slash.
 * Same value ticket-check uses, and for the same reason: below it the gesture
 * is still a click and belongs to whichever row it started on.
 */
const SLASH_SLOP = 8;

/** How long the right answer stays on screen before the next letter. */
const FEEDBACK_MS = 1100;

/**
 * One question. `requeued` is the second showing of a letter that was missed:
 * it teaches and it does NOT score, which is what "no life lost" has to mean if
 * the pass mark is still to mean anything.
 */
type Ask = { char: TraceStopCharacter; requeued: boolean };

function shuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

// ─── The run ──────────────────────────────────────────────────────────────────

function LetterRun({
  stop,
  soundOn,
  metBefore,
  onEnd,
}: {
  stop: LetterStop;
  soundOn: boolean;
  /**
   * Letters the learner has already passed at the tracing stop.
   *
   * THIS IS WHAT MAKES THE FOURTH CHOICE MEAN ANYTHING. The rule is four
   * choices "once the learner has had this letter right before", and reading
   * that as right-before-in-this-run makes it unreachable: a letter is asked
   * once, and a missed one comes back UNSEEN precisely because it was missed.
   * Tracing progress is the honest record of having met a letter, the server
   * has stored it since 2026-08-23, and the journey map already reads it
   * through the same hook.
   */
  metBefore: ReadonlySet<string>;
  onEnd: (correct: number, total: number) => void;
}) {
  const native = useNativeText();
  const { activeLang, activeLanguage } = useLanguage();
  const synthesize = useSynthesizeSpeech();

  // The voice belongs in the audio cache key because a new voice genuinely is a
  // new clip. The LANGUAGE does not: Devanagari serves nine languages and क
  // sounds the same in all of them, so a language-keyed cache stores it nine
  // times identically. Keyed on script and the letter here, per session.
  //
  // OWED, AND IT IS SERVER WORK: `tts_cache` still keys on the language NAME
  // the client sends, so the nine-way duplication is real one layer down. That
  // cache is at 98% of a 10 GiB database and climbing a gigabyte a month, which
  // is why the spec called it out. Pre-warming all 529 clips once per voice is
  // the other half and is not here either.
  const audioCache = useRef(new Map<string, { audioBase64: string; format: string }>());
  const audioEl = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  const asks = useRef<Ask[]>(
    stop.characters.slice(0, LETTER_STOP_LENGTH).map((char) => ({ char, requeued: false })),
  );
  const [askIndex, setAskIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  // Letters the learner has met properly: traced and passed before today, plus
  // anything read correctly since this run began. Seeded once; the set the hook
  // returns is rebuilt on every fetch and must not reshuffle a live question.
  const seen = useRef(new Set<string>(metBefore));

  const ask = asks.current[askIndex];
  const answered = picked !== null;

  /**
   * The choices, built ONCE per question and held, because rebuilding them on a
   * re-render would reshuffle the rows under a pointer already moving.
   */
  const choices = useMemo(() => {
    if (!ask) return [];
    const count = seen.current.has(ask.char.id) ? LETTER_CHOICES_SEEN : LETTER_CHOICES_FIRST;
    const wrong = letterDistractorsFor(ask.char, stop.pool, count - 1);
    return shuffle([ask.char, ...wrong]);
    // askIndex identifies the question and the char is derived from it, so
    // depending on `ask` as well would only reshuffle on an unrelated render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askIndex, stop]);

  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;
  const askIndexRef = useRef(askIndex);
  askIndexRef.current = askIndex;

  const speak = useCallback(
    async (char: TraceStopCharacter) => {
      if (!soundOnRef.current) return;
      audioEl.current?.pause();
      audioEl.current = null;
      const at = askIndexRef.current;
      setPlaying(true);
      try {
        const key = `${stop.script}:${char.char}`;
        const cached = audioCache.current.get(key);
        const res =
          cached ??
          (await synthesize.mutateAsync({
            data: {
              // The letter's own sound, which for અ is the vowel and not
              // "a-kaar". The learner is being taught to decode; the name of
              // the letter is a different fact and a later one.
              text: char.char,
              // THE SCRIPT, NOT THE LANGUAGE, and the server keys the cache on
              // it: Devanagari serves nine languages and क sounds the same in
              // all of them, so a language-keyed letter stores one identical
              // clip nine times against a tts_cache at 98% of a 10 GiB ceiling.
              script: stop.script,
              languageName: activeLanguage?.name,
              languageCode: activeLang,
            },
          }));
        audioCache.current.set(key, { audioBase64: res.audioBase64, format: res.format });
        if (askIndexRef.current !== at) {
          setPlaying(false);
          return;
        }
        const el = new Audio(`data:audio/${res.format};base64,${res.audioBase64}`);
        audioEl.current = el;
        el.onended = () => setPlaying(false);
        await el.play();
      } catch {
        setPlaying(false);
      }
    },
    [synthesize, activeLanguage, activeLang, stop.script],
  );

  // A listening question that arrives silent reads as broken, so it plays
  // itself on arrival and replays on click, uncapped: listening again is the
  // lesson and must never cost anything.
  useEffect(() => {
    if (ask) void speak(ask.char);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askIndex]);

  // The clip AND the pending advance, both torn down. A timer that fires after
  // this page has gone would call onEnd for a run the learner walked out of.
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      audioEl.current?.pause();
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    },
    [],
  );

  const answer = useCallback(
    (id: string) => {
      if (answered || !ask) return;
      const right = id === ask.char.id;
      setPicked(id);
      // The outcome in the hand as well as on the screen, which matters most to
      // the learner who cannot read the border colour.
      webHaptic(right ? "success" : "warning");
      if (right) {
        seen.current.add(ask.char.id);
        // Only a FIRST showing scores. A re-queued letter is the teaching half
        // of "no life lost"; letting it score would mean eight wrong answers
        // could still pass, which is not a pass mark.
        if (!ask.requeued) setCorrect((c) => c + 1);
      } else {
        // Say it again with the answer on screen, which is the one moment the
        // sound and the shape are together.
        void speak(ask.char);
        if (!ask.requeued) {
          asks.current = [...asks.current, { char: ask.char, requeued: true }];
        }
      }
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      advanceTimer.current = setTimeout(() => {
        setPicked(null);
        if (askIndexRef.current + 1 >= asks.current.length) {
          onEnd(
            // correct is one render behind its own setState, so the answer just
            // given is added here rather than read back.
            right && !ask.requeued ? correct + 1 : correct,
            Math.min(stop.characters.length, LETTER_STOP_LENGTH),
          );
        } else {
          setAskIndex((i) => i + 1);
        }
      }, FEEDBACK_MS);
    },
    [answered, ask, correct, onEnd, speak, stop.characters.length],
  );

  // ── The slash, on every third question ────────────────────────────────────
  //
  // "Mix it up" was a ruling about VARIETY, not a ban on multiple choice, so
  // this stop is the plain version on purpose and the variety lives across
  // questions rather than inside one. Every third letter the rows are struck
  // through instead of clicked, using the same geometry ticket-check punches
  // its tickets with. A click still works on a slash question: taking it away
  // would be a new rule to learn rather than a change of pace.
  const slashing = askIndex % 3 === 2;
  const gridRef = useRef<HTMLDivElement | null>(null);
  const drawing = useRef(false);
  const stroke = useRef<GesturePoint[]>([]);
  const [underPointer, setUnderPointer] = useState<number | null>(null);

  const toGrid = (e: { clientX: number; clientY: number }): GesturePoint => {
    const box = gridRef.current?.getBoundingClientRect();
    return { x: e.clientX - (box?.left ?? 0), y: e.clientY - (box?.top ?? 0) };
  };

  const targets = () => {
    const box = gridRef.current?.getBoundingClientRect();
    if (!box || !gridRef.current) return [];
    return Array.from(gridRef.current.querySelectorAll("[data-letter-idx]")).map((el) => {
      const r = el.getBoundingClientRect();
      return {
        id: Number((el as HTMLElement).dataset.letterIdx),
        rect: { x: r.left - box.left, y: r.top - box.top, width: r.width, height: r.height },
      };
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (answered || !slashing) return;
    drawing.current = true;
    stroke.current = [toGrid(e)];
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing.current || answered) return;
    const p = toGrid(e);
    const first = stroke.current[0];
    if (
      first &&
      stroke.current.length === 1 &&
      Math.abs(p.x - first.x) <= SLASH_SLOP &&
      Math.abs(p.y - first.y) <= SLASH_SLOP
    ) {
      // Still inside the slop: this is a click so far, so do not claim it.
      return;
    }
    stroke.current.push(p);
    setUnderPointer(pickTargetByStroke(stroke.current, targets(), "slash"));
  };

  const endStroke = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const hit =
      stroke.current.length > 1 ? pickTargetByStroke(stroke.current, targets(), "slash") : null;
    stroke.current = [];
    setUnderPointer(null);
    // Null is a normal outcome: they drew across empty space and have not
    // answered. Let them draw again rather than marking anything.
    if (hit !== null) {
      const choice = choices[hit];
      if (choice) answer(choice.id);
    }
  };

  if (!ask) return null;

  const asked = Math.min(stop.characters.length, LETTER_STOP_LENGTH);
  // First showings only, so the counter never reads "9 / 8" once a letter has
  // been put back in the pile.
  const position = Math.min(
    asks.current.slice(0, askIndex + 1).filter((a) => !a.requeued).length,
    asked,
  );

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-6">
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            data-testid="letter-progress"
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.round((position / asked) * 100)}%` }}
          />
        </div>
        <span className="w-12 text-right text-xs font-semibold tabular-nums text-muted-foreground">
          {position} / {asked}
        </span>
      </div>

      <h2 className="text-center text-lg font-bold text-foreground">
        {slashing ? "Strike through the sound you hear" : "What sound does this make?"}
      </h2>

      {/* THE SPEAKER IS THE QUESTION. */}
      <button
        type="button"
        data-testid="letter-speaker-card"
        aria-label="Hear the letter again"
        onClick={() => void speak(ask.char)}
        className={cn(
          "flex h-32 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 bg-card transition-colors",
          playing ? "border-primary" : "border-border hover:border-primary/40",
        )}
      >
        <Volume2 className="h-11 w-11 text-primary" />
        <span className="text-xs text-muted-foreground">
          {soundOn ? "Click to hear it again" : "Sound is off"}
        </span>
      </button>

      {/* THE ANSWER, REVEALED. Once a choice has landed the letter itself comes
          up beside its sound: that pairing is what the stop exists to teach and
          holding it back would be withholding the lesson. */}
      {answered ? (
        <div
          data-testid="letter-reveal"
          className="flex items-center justify-center gap-3 rounded-2xl border border-border bg-card py-2"
        >
          <span
            style={native.style}
            dir={native.dir}
            className="text-4xl leading-tight text-foreground"
          >
            {ask.char.char}
          </span>
          <span className="text-sm font-semibold text-muted-foreground">
            says &ldquo;{ask.char.label}&rdquo;
          </span>
        </div>
      ) : null}

      <div
        ref={gridRef}
        className="flex flex-col gap-2.5"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onPointerLeave={endStroke}
      >
        {choices.map((choice, idx) => {
          const isAnswer = answered && choice.id === ask.char.id;
          const isWrongPick = answered && choice.id === picked && picked !== ask.char.id;
          const struck = !answered && underPointer === idx;
          return (
            <button
              key={choice.id}
              type="button"
              data-letter-idx={idx}
              data-testid={`letter-choice-${idx}`}
              aria-label={choice.label}
              onClick={() => answer(choice.id)}
              disabled={answered}
              className={cn(
                // STATE IS NEVER IN HUE ALONE. The border thickens on the right
                // answer and on the row under a pointer, and a tick or a cross
                // rides on the end, so the row reads the same to a learner who
                // cannot separate the green from the red.
                "relative flex items-center justify-center rounded-2xl border bg-card py-4 text-xl font-bold text-foreground transition-all active:scale-[0.98]",
                isAnswer && "border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40",
                isWrongPick && "border-2 border-red-500 bg-red-50 dark:bg-red-950/40",
                struck && "border-2 border-primary bg-primary/5",
                !isAnswer && !isWrongPick && !struck && "border-border hover:border-primary/40",
              )}
            >
              {choice.label}
              {isAnswer ? (
                <Check className="absolute right-3 h-5 w-5 text-emerald-600" />
              ) : null}
              {isWrongPick ? <X className="absolute right-3 h-5 w-5 text-red-600" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── The page ─────────────────────────────────────────────────────────────────

/** The stop named by `?journey=&zone=`, or null when the URL names none. */
function useLetterStopFromUrl(languageCode: string): LetterStop | null {
  const search = useSearch();
  return useMemo(() => {
    const params = new URLSearchParams(search);
    const zone = Number(params.get("zone"));
    if (!Number.isInteger(zone) || zone < 1) return null;
    // Journey defaults to 1 so an older link still resolves, matching the
    // tracing page beside it.
    const journeyRaw = Number(params.get("journey") ?? "1");
    const journey = Number.isInteger(journeyRaw) && journeyRaw > 0 ? journeyRaw : 1;
    return letterStopFor(languageCode, journey, zone);
  }, [search, languageCode]);
}

export default function LetterStopPage() {
  const { isPlus, isLoading } = useEntitlements();
  const { activeLang, activeLanguage } = useLanguage();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { soundOn, toggle } = useGameAudio();
  // The letters this learner has already traced and passed, which is what
  // raises a question from three choices to four. Same hook the journey map
  // reads for the tracing row's own progress, so there is one fetch and one
  // idea of what "met" means.
  const { passedCharacterIds } = useTraceStopProgress(activeLang);
  const stop = useLetterStopFromUrl(activeLang);
  const [result, setResult] = useState<{ correct: number; total: number } | null>(null);
  const [runKey, setRunKey] = useState(0);

  // THE FREE TASTE: journey 1 zone 1, in every language, exactly as tracing at
  // stop 2 and the story at stop 3 already are. The server route derives the
  // same condition inline rather than through a shared helper, on purpose, so
  // neither side learns a new rule.
  const tasting = !isPlus && stop !== null && stop.journey === 1 && stop.zone === 1;

  const finish = useCallback(
    (correct: number, total: number) => {
      setResult({ correct, total });
      if (!stop) return;
      // Best effort, exactly as the tracing page records its own progress: the
      // run is over and the learner is looking at their score, so a network
      // failure must not take the page with it.
      completeLetterStop({
        lang: activeLang,
        journey: stop.journey,
        zone: stop.zone,
        correct,
        total,
      })
        .then(() => {
          queryClient.invalidateQueries({
            queryKey: getGetProgressSummaryQueryKey({ lang: activeLang }),
          });
        })
        .catch(() => {});
    },
    [stop, activeLang, queryClient],
  );

  // Everything past the taste is still paid.
  if (!isLoading && !isPlus && !tasting) {
    return <Redirect to="/upgrade" />;
  }

  const asked = stop ? Math.min(stop.characters.length, LETTER_STOP_LENGTH) : 0;
  const passMark = Math.min(LETTER_STOP_PASS, asked);
  const passed = result !== null && result.correct >= passMark;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background pb-nav lg:pb-8">
      <div className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4 lg:px-6">
          <button
            onClick={() => navigate("/journey")}
            aria-label="Back to the journey map"
            data-testid="game-exit-btn"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card transition-colors hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4 text-foreground" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-extrabold leading-none tracking-tight text-foreground">
              {stop?.title ?? "Letters"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {!stop
                ? (activeLanguage?.name ?? "This language")
                : tasting
                  ? `Free taste · ${asked} letters`
                  : `Zone ${stop.zone} · ${asked} letters`}
            </p>
          </div>
          <GameMuteButton soundOn={soundOn} onToggle={toggle} />
        </div>
      </div>

      {!stop ? (
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 pt-16 text-center">
          <h2 className="text-2xl font-extrabold text-foreground">No letters here yet</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            This zone has no letter stop in {activeLanguage?.name ?? "this language"}.
          </p>
          <button
            onClick={() => navigate("/journey")}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"
          >
            Back to journey
          </button>
        </div>
      ) : result ? (
        <div
          data-testid="letter-stop-done"
          className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 pt-16 text-center"
        >
          {passed ? (
            <Award className="h-11 w-11 text-primary" />
          ) : (
            <RotateCcw className="h-11 w-11 text-muted-foreground" />
          )}
          <h2 className="text-2xl font-extrabold text-foreground">
            {result.correct} of {result.total}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {passed
              ? "You can read these letters now. That is the half tracing never taught."
              : `${passMark} of ${result.total} clears this stop. The letters stay, so another run is all it takes.`}
          </p>
          <button
            onClick={() => {
              if (passed) {
                navigate("/journey");
                return;
              }
              setResult(null);
              setRunKey((k) => k + 1);
            }}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"
          >
            {passed ? "Back to journey" : "Try again"}
          </button>
          {passed ? null : (
            <button
              onClick={() => navigate("/journey")}
              className="text-sm text-muted-foreground underline-offset-2 hover:underline"
            >
              Back to journey
            </button>
          )}
        </div>
      ) : (
        <LetterRun
          key={runKey}
          stop={stop}
          soundOn={soundOn}
          metBefore={passedCharacterIds}
          onEnd={finish}
        />
      )}

      <BottomNav />
    </div>
  );
}
