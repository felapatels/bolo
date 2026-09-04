/**
 * MATCH THE LETTER TO ITS SOUND, on the web.
 *
 * The letter stop at position 4 hides the letter and tests the EAR. This shows
 * the letter and tests the EYE, which is the direction a learner actually needs
 * standing in front of a signboard. Same alphabet, same clips, opposite
 * question.
 *
 * TAPPING A LETTER TO HEAR IT IS FREE AND UNLIMITED, and that is the teaching
 * moment rather than a convenience. A learner who plays all six before
 * answering has just done a listening lesson and must not be punished for it.
 *
 * A MATCH GREYS ITS ROWS AND LEAVES THEM WHERE THEY ARE. Every match game that
 * collapses its list trains the learner to answer by POSITION rather than by
 * reading, and hands them the last pair for nothing. Rows never reflow here.
 *
 * MOBILE TWIN: bolo-mobile/app/(app)/(tabs)/games/letter-match.tsx. The shared
 * half is @workspace/script-trace, which owns how many pairs, how many boards,
 * which letters are on them and the order of the two columns, so neither client
 * is the authority. The only deliberate differences are `new Audio` here
 * against playBase64Audio there, and that the miss is said in a border, a
 * weight and an icon on both sides rather than a shake, because the phone's
 * native animation driver is dead in release builds and state must never be in
 * hue alone anyway.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Redirect, useLocation } from "wouter";
import { ArrowLeft, Award, Check } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  completeLetterMatch,
  getGetProgressSummaryQueryKey,
  useSynthesizeSpeech,
} from "@workspace/api-client-react";
import {
  MATCH_BOARD_PAIRS,
  isLetterMatch,
  letterMatchBoards,
  lettersMetBy,
  type LetterMatchBoard,
  type TraceStopCharacter,
} from "@workspace/script-trace";
import { BottomNav } from "@/components/layout/bottom-nav";
import { GameMuteButton, useGameAudio } from "@/components/game-mute-button";
import { useEntitlements } from "@/lib/entitlements";
import { useLanguage, useNativeText } from "@/lib/language-context";
import { webHaptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/** How long a wrong pair stays marked before the board clears it. */
const MISS_MS = 700;

type Marked = { letterId: string; sound: string; right: boolean };

export default function LetterMatchPage() {
  const { isPlus, isLoading } = useEntitlements();
  const { activeLang, activeLanguage } = useLanguage();
  const native = useNativeText();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { soundOn, toggle } = useGameAudio();
  const synthesize = useSynthesizeSpeech();

  // THE WIDEST QUESTION THE LADDER CAN ANSWER. The hub is not scoped to a zone,
  // so the pool is every letter met on journey 1, which is what makes this
  // revision rather than a cold test. Same call the server runs before it will
  // record a game.
  const boards = useMemo(
    () => letterMatchBoards(lettersMetBy(activeLang, 1, Number.MAX_SAFE_INTEGER)),
    [activeLang],
  );

  const [round, setRound] = useState(0);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<TraceStopCharacter | null>(null);
  const [mark, setMark] = useState<Marked | null>(null);
  const [tries, setTries] = useState(0);
  const [firstTry, setFirstTry] = useState(0);
  const [done, setDone] = useState(false);
  const [seconds, setSeconds] = useState(0);
  // Which pairs have already been missed once, so a pair got right on the
  // second go does not score as a first-try match.
  const missedOnce = useRef(new Set<string>());
  const audioEl = useRef<HTMLAudioElement | null>(null);
  const audioCache = useRef(new Map<string, { audioBase64: string; format: string }>());
  const missTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const board: LetterMatchBoard | undefined = boards[round];

  // THE STOPWATCH COUNTS UP AND IS SHOWN, NEVER ENFORCED. A countdown turns a
  // reading exercise into a panic; a stopwatch gives a returning learner
  // something to beat.
  useEffect(() => {
    if (done) return;
    const tick = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(tick);
  }, [done]);

  useEffect(
    () => () => {
      audioEl.current?.pause();
      if (missTimer.current) clearTimeout(missTimer.current);
    },
    [],
  );

  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;

  const speak = useCallback(
    async (char: TraceStopCharacter) => {
      if (!soundOnRef.current) return;
      audioEl.current?.pause();
      audioEl.current = null;
      try {
        // Keyed on the letter's own chapter and glyph, never the language:
        // Devanagari serves nine languages and क sounds the same in all of
        // them. The server's tts_cache still keys on the language name, which
        // is owed work and is why this cache is only per session.
        const key = `${char.chapterId}:${char.char}`;
        const cached = audioCache.current.get(key);
        const res =
          cached ??
          (await synthesize.mutateAsync({
            data: {
              text: char.char,
              languageName: activeLanguage?.name,
              languageCode: activeLang,
            },
          }));
        audioCache.current.set(key, { audioBase64: res.audioBase64, format: res.format });
        const el = new Audio(`data:audio/${res.format};base64,${res.audioBase64}`);
        audioEl.current = el;
        await el.play();
      } catch {
        /* a silent letter is better than a broken page */
      }
    },
    [synthesize, activeLanguage, activeLang],
  );

  const finish = useCallback(
    (right: number, total: number) => {
      setDone(true);
      // Best effort, exactly as the tracing page and the letter stop record
      // theirs: the game is over and the learner is looking at their score, so
      // a network failure must not take the page with it.
      completeLetterMatch({ lang: activeLang, correct: right, total })
        .then(() => {
          queryClient.invalidateQueries({
            queryKey: getGetProgressSummaryQueryKey({ lang: activeLang }),
          });
        })
        .catch(() => {});
    },
    [activeLang, queryClient],
  );

  const pickLetter = useCallback(
    (char: TraceStopCharacter) => {
      if (matched.has(char.id)) return;
      // Tapping a second letter before answering just MOVES the selection and
      // speaks the new one. It is never a wrong answer.
      setPicked(char);
      setMark(null);
      void speak(char);
    },
    [matched, speak],
  );

  const pickSound = useCallback(
    (sound: string) => {
      if (!board || !picked) return;
      if (matched.has(picked.id)) return;
      const right = isLetterMatch(picked, sound);
      webHaptic(right ? "success" : "warning");
      setMark({ letterId: picked.id, sound, right });
      setTries((t) => t + 1);
      if (right) {
        // Only a pair got right at the FIRST attempt scores, or a learner who
        // clicks every sound in turn clears the board and calls it six from six.
        if (!missedOnce.current.has(picked.id)) setFirstTry((n) => n + 1);
        const next = new Set(matched).add(picked.id);
        setMatched(next);
        setPicked(null);
        if (next.size >= board.letters.length) {
          if (round + 1 >= boards.length) {
            finish(
              missedOnce.current.has(picked.id) ? firstTry : firstTry + 1,
              boards.length * MATCH_BOARD_PAIRS,
            );
          } else {
            setRound((r) => r + 1);
            setMatched(new Set());
            setMark(null);
          }
        }
        return;
      }
      // A MISS COSTS NO LIFE AND BREAKS NO STREAK. It says the letter again,
      // which is the one moment the sound and the shape are together, and
      // clears the selection so the next click starts clean.
      missedOnce.current.add(picked.id);
      void speak(picked);
      if (missTimer.current) clearTimeout(missTimer.current);
      missTimer.current = setTimeout(() => {
        setMark(null);
        setPicked(null);
      }, MISS_MS);
    },
    [board, picked, matched, round, boards.length, firstTry, finish, speak],
  );

  if (!isLoading && !isPlus) {
    return <Redirect to="/upgrade" />;
  }

  const total = boards.length * MATCH_BOARD_PAIRS;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background pb-nav lg:pb-8">
      <div className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4 lg:px-6">
          <button
            onClick={() => navigate("/games")}
            aria-label="Back to games"
            data-testid="game-exit-btn"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card transition-colors hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4 text-foreground" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-extrabold leading-none tracking-tight text-foreground">
              Letter Match
            </h1>
            <p className="text-sm text-muted-foreground">
              {done
                ? `${tries} taps`
                : `Board ${round + 1} of ${Math.max(boards.length, 1)} · ${seconds}s`}
            </p>
          </div>
          <GameMuteButton soundOn={soundOn} onToggle={toggle} />
        </div>
      </div>

      {boards.length === 0 ? (
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 pt-16 text-center">
          <h2 className="text-2xl font-extrabold text-foreground">Not enough letters yet</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Trace a few more on the journey and this game opens up.
          </p>
          <button
            onClick={() => navigate("/journey")}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"
          >
            Back to the journey
          </button>
        </div>
      ) : done ? (
        <div
          data-testid="letter-match-done"
          className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 pt-16 text-center"
        >
          <Award className="h-11 w-11 text-primary" />
          <h2 className="text-2xl font-extrabold text-foreground">
            {firstTry} of {total}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            First-try matches, in {seconds} seconds. Playing a letter to hear it
            always costs nothing, so listen as often as you like.
          </p>
          <button
            onClick={() => navigate("/games")}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"
          >
            Back to games
          </button>
        </div>
      ) : board ? (
        <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-6">
          <p className="text-center text-sm text-muted-foreground">
            Click a letter to hear it, then click its sound.
          </p>
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-2.5">
              {board.letters.map((c) => {
                const isMatched = matched.has(c.id);
                const isPicked = picked?.id === c.id;
                const isWrong = mark?.letterId === c.id && !mark.right;
                return (
                  <button
                    key={c.id}
                    type="button"
                    data-testid={`match-letter-${c.id}`}
                    aria-label={isMatched ? `${c.label}, matched` : "Hear this letter"}
                    onClick={() => pickLetter(c)}
                    disabled={isMatched}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-2xl border bg-card py-3.5 transition-all",
                      // MATCHED ROWS GREY IN PLACE AND NEVER LEAVE, which is
                      // what stops the last pair being free.
                      isMatched && "opacity-45",
                      !isMatched && isWrong && "border-2 border-red-500",
                      !isMatched && !isWrong && isPicked && "border-2 border-primary",
                      !isMatched && !isWrong && !isPicked && "border-border hover:border-primary/40",
                    )}
                  >
                    <span
                      style={native.style}
                      dir={native.dir}
                      className="text-2xl leading-tight text-foreground"
                    >
                      {c.char}
                    </span>
                    {isMatched ? <Check className="h-3.5 w-3.5 text-muted-foreground" /> : null}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-1 flex-col gap-2.5">
              {board.sounds.map((sound) => {
                const owner = board.letters.find((c) => c.label === sound);
                const isMatched = owner ? matched.has(owner.id) : false;
                const isWrong = mark?.sound === sound && !mark.right;
                const isRight = mark?.sound === sound && mark.right;
                return (
                  <button
                    key={sound}
                    type="button"
                    data-testid={`match-sound-${sound}`}
                    aria-label={sound}
                    onClick={() => pickSound(sound)}
                    disabled={isMatched}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-2xl border bg-card py-3.5 text-lg font-bold text-foreground transition-all",
                      isMatched && "opacity-45",
                      !isMatched && isWrong && "border-2 border-red-500",
                      !isMatched && !isWrong && isRight && "border-2 border-emerald-500",
                      !isMatched && !isWrong && !isRight && "border-border hover:border-primary/40",
                    )}
                  >
                    {sound}
                    {isMatched ? <Check className="h-3.5 w-3.5 text-muted-foreground" /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      <BottomNav />
    </div>
  );
}
