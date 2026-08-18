// Chunk 6B quick game: Express Listening (listen-and-pick at 1.25x audio,
// timed, floor 4). The express does not wait: each clip plays fast and the
// round has a countdown. Rides the frozen listen-and-pick model. A timeout
// scores as a miss (an in-category distractor id, never the target).

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Volume2, X } from "lucide-react";
import { useGetAccount, useSynthesizeSpeech, type Phrase } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { webHaptic } from "@/lib/haptics";
import { useNativeText } from "@/lib/language-context";
import { quickGameById } from "@/lib/quick-games";
import {
  QuickGameShell,
  quickShuffle,
  type QuickRoundProps,
} from "./quick-game-frame";

const ROUNDS = 8;
const CHOICES = 4;
const SECONDS_PER_ROUND = 7;
const PLAYBACK_RATE = 1.25;

type ExpressQuestion = { phrase: Phrase; choices: Phrase[]; correctIdx: number };

function buildPlan(phrases: Phrase[], count: number): ExpressQuestion[] {
  const plan: ExpressQuestion[] = [];
  let pool = quickShuffle(phrases);
  let poolIdx = 0;
  for (let i = 0; i < count; i++) {
    if (poolIdx >= pool.length) {
      pool = quickShuffle(phrases);
      poolIdx = 0;
    }
    const phrase = pool[poolIdx++]!;
    const distractors = quickShuffle(phrases.filter((p) => p.id !== phrase.id)).slice(
      0,
      CHOICES - 1,
    );
    const choices = quickShuffle([phrase, ...distractors]);
    plan.push({ phrase, choices, correctIdx: choices.findIndex((c) => c.id === phrase.id) });
  }
  return plan;
}

function ExpressListeningRound({
  phrases,
  api,
  soundOn,
  activeLang,
  activeLanguageName,
}: QuickRoundProps) {
  const native = useNativeText();
  const synthesize = useSynthesizeSpeech();
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;

  // The chosen TTS voice rides the cache key (see below); the account query is
  // almost always already in cache, this only needs the preference.
  const account = useGetAccount();
  const ttsVoice = account.data?.preferences.learning.ttsVoice ?? "auto";

  const [plan] = useState(() => buildPlan(phrases, ROUNDS));
  const [picked, setPicked] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Key is `${phrase.id}:${ttsVoice}`, matching mobile's five audio games: on
  // phrase id alone, changing the voice mid-session replays the old voice's
  // clip forever.
  const audioCache = useRef(new Map<string, { audioBase64: string; format: string }>());
  // Round-pinning: the live round index, read by the async playback path to
  // tell whether the round that asked for this clip is still on screen.
  const roundRef = useRef(api.round);
  roundRef.current = api.round;

  const q = plan[api.round];

  const playPhrase = useCallback(
    async (phrase: Phrase) => {
      if (!soundOnRef.current) return;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setIsPlaying(true);
      // Captured BEFORE the await: a synthesis that resolves after the round
      // advanced must not play its clip over the new question.
      const capturedRound = roundRef.current;
      try {
        const cacheKey = `${phrase.id}:${ttsVoice}`;
        const cached = audioCache.current.get(cacheKey);
        const res =
          cached ??
          (await synthesize.mutateAsync({
            data: {
              text: phrase.nativeScript,
              languageName: activeLanguageName,
              languageCode: activeLang,
            },
          }));
        // Banked regardless of whether it is still wanted: a late clip is
        // worth keeping, it is only the playback that is stale.
        audioCache.current.set(cacheKey, { audioBase64: res.audioBase64, format: res.format });
        if (roundRef.current !== capturedRound) {
          setIsPlaying(false);
          return;
        }
        const audio = new Audio(`data:audio/${res.format};base64,${res.audioBase64}`);
        // The express tempo: every clip plays fast.
        audio.playbackRate = PLAYBACK_RATE;
        audioRef.current = audio;
        audio.onended = () => setIsPlaying(false);
        await audio.play();
      } catch {
        setIsPlaying(false);
      }
    },
    [synthesize, activeLanguageName, activeLang, ttsVoice],
  );

  useEffect(() => {
    setPicked(null);
    if (q) playPhrase(q.phrase);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.round]);

  if (!q) return null;
  const answered = picked !== null;
  const wasCorrect = answered && picked === q.correctIdx;
  const missed = api.timedOut && !answered;

  const handlePick = (idx: number) => {
    if (answered || api.timedOut) return;
    api.lockRound();
    setPicked(idx);
    const correct = idx === q.correctIdx;
    webHaptic(correct ? "success" : "warning");
    if (correct) {
      setTimeout(
        () => api.submitRound({ phraseId: q.phrase.id, selectedPhraseId: q.choices[idx]!.id, correct: true }),
        700,
      );
    }
  };

  const submitMiss = () => {
    const wrongChoice = q.choices.find((c) => c.id !== q.phrase.id)!;
    api.submitRound({
      phraseId: q.phrase.id,
      selectedPhraseId: answered ? q.choices[picked!]!.id : wrongChoice.id,
      correct: false,
      // The prompt was a clip, so the review has to say what the clip WAS;
      // a round that ran out carries no answer at all.
      review: {
        prompt: "Which phrase was in the clip?",
        promptSub: `It means "${q.phrase.english}"`,
        answer: answered ? q.choices[picked!]!.nativeScript : null,
        answerSub: answered ? q.choices[picked!]!.romanized.trim() || null : null,
        correct: q.phrase.nativeScript,
        correctSub: q.phrase.romanized.trim() || null,
      },
    });
  };

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-border bg-card p-5">
        <button
          onClick={() => playPhrase(q.phrase)}
          disabled={isPlaying || missed}
          className={cn(
            "flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-white shadow-lg transition-all hover:opacity-90 active:scale-95",
            isPlaying && "animate-pulse opacity-70",
          )}
          aria-label="Play audio"
        >
          <Volume2 className="h-7 w-7" />
        </button>
        <p className="text-xs text-muted-foreground">{isPlaying ? "Playing fast…" : "Tap to replay"}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {q.choices.map((choice, idx) => {
          let cardClass = "border-border bg-card hover:border-primary/40 hover:bg-primary/5";
          if ((answered || missed) && idx === q.correctIdx) {
            cardClass = "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40";
          } else if (answered && !wasCorrect && idx === picked) {
            cardClass = "border-red-400 bg-red-50 dark:bg-red-950/40";
          }
          return (
            <button
              key={choice.id}
              onClick={() => handlePick(idx)}
              disabled={answered || missed}
              className={cn(
                "relative flex min-h-[80px] flex-col items-center justify-center gap-0.5 rounded-2xl border p-3 text-center font-semibold transition-all active:scale-[0.97]",
                cardClass,
              )}
            >
              <span style={native.style} dir={native.dir} className="text-base leading-snug text-foreground">
                {choice.nativeScript}
              </span>
              {/* MEANING ONLY under the script (owner ruling, Aug 12, 2026).
                  The romanized reading used to sit here (86bfb6fe), but it
                  spells out what the clip just said: a learner could win every
                  round by matching Latin letters to sounds, without reading the
                  script or knowing the word. The always-visible romanization
                  ruling still holds on READING surfaces; a listening game is
                  the exception because the clip is the question.
                  Mobile's listen-and-pick.tsx has said this since 5ddaa082 and
                  its comment claimed "Web matches" while this file still showed
                  romanized. Now it does match. */}
              {choice.english.trim() !== "" && (
                <span className="text-xs font-medium text-muted-foreground">{choice.english}</span>
              )}
              {(answered || missed) && idx === q.correctIdx && (
                <span className="absolute right-2 top-2">
                  <Check className="h-4 w-4 text-emerald-600" />
                </span>
              )}
              {answered && !wasCorrect && idx === picked && (
                <span className="absolute right-2 top-2">
                  <X className="h-4 w-4 text-red-600" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {missed && (
        <p className="text-center text-sm font-semibold text-red-600">
          Too slow! The express rolled on.
        </p>
      )}

      {((answered && !wasCorrect) || missed) && (
        <button
          onClick={submitMiss}
          data-testid="express-listening-continue"
          className="flex items-center justify-center rounded-2xl bg-primary px-6 py-3.5 font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
        >
          Tap to continue
        </button>
      )}
    </div>
  );
}

export default function ExpressListeningPage() {
  const def = quickGameById("express-listening")!;
  return (
    <QuickGameShell
      def={def}
      instruction="Listen fast and pick the matching phrase"
      secondsPerRound={SECONDS_PER_ROUND}
      // The clip IS the prompt here: the four choices render native script
      // only, so with sound off the round is unanswerable. Entry is refused
      // rather than started.
      requiresAudio

      totalRounds={() => ROUNDS}
      renderRound={(props) => <ExpressListeningRound {...props} />}
    />
  );
}
