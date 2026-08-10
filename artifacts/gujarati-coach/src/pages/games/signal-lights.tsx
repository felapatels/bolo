// Chunk 6B quick game: Signal Lights (true or false lightning round,
// floor 2). A phrase and a claimed meaning flash up; green light for true,
// red light for false, against a short countdown. Decoys come from the SAME
// category, and the wrong-judgment submission maps to the decoy's id, so
// results stay in-category and ride the frozen listen-and-pick model.

import { useCallback, useEffect, useRef, useState } from "react";
import { useSynthesizeSpeech, type Phrase } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { webHaptic } from "@/lib/haptics";
import { useNativeText } from "@/lib/language-context";
import { quickGameById } from "@/lib/quick-games";
import {
  QuickGameShell,
  quickShuffle,
  type QuickRoundProps,
} from "./quick-game-frame";

const ROUNDS = 10;
const SECONDS_PER_ROUND = 4;
const FEEDBACK_MS = 650;

type LightsQuestion = {
  phrase: Phrase;
  /** Same-category decoy whose English is shown on false rounds and whose id
   *  is the wrong-judgment submission. */
  decoy: Phrase;
  isTrue: boolean;
  shownEnglish: string;
};

function buildPlan(phrases: Phrase[], count: number): LightsQuestion[] {
  const plan: LightsQuestion[] = [];
  let pool = quickShuffle(phrases);
  let poolIdx = 0;
  for (let i = 0; i < count; i++) {
    if (poolIdx >= pool.length) {
      pool = quickShuffle(phrases);
      poolIdx = 0;
    }
    const phrase = pool[poolIdx++]!;
    const decoy = quickShuffle(phrases.filter((p) => p.id !== phrase.id))[0]!;
    const isTrue = Math.random() < 0.5;
    plan.push({ phrase, decoy, isTrue, shownEnglish: isTrue ? phrase.english : decoy.english });
  }
  return plan;
}

function SignalLightsRound({
  phrases,
  api,
  soundOn,
  activeLang,
  activeLanguageName,
  setAudioPlaying,
}: QuickRoundProps) {
  const native = useNativeText();
  const synthesize = useSynthesizeSpeech();
  // Prod hotfix Item 5: the frame's mute toggle now drives real audio here
  // (soundOn arrived in props but was dead code for this game).
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;
  // Hotfix 3 item 7a: playPhrase awaits synthesis, so by the time a clip is
  // ready the round may have advanced or expired. These refs let the resumed
  // async code check the CURRENT round state, not the captured one.
  const roundRef = useRef(api.round);
  roundRef.current = api.round;
  const timedOutRef = useRef(api.timedOut);
  timedOutRef.current = api.timedOut;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCache = useRef(
    new Map<Phrase["id"], { audioBase64: string; format: string }>(),
  );
  const [plan] = useState(() => buildPlan(phrases, ROUNDS));
  const [judged, setJudged] = useState<boolean | null>(null);

  const q = plan[api.round];

  // House pattern (express-listening): synthesize once per phrase, cache the
  // clip, honor the toggle at play time. The clip runs alongside the
  // countdown, so the 4s answer window is untouched. Item 7a: the clip is
  // pinned to the round it was requested for; if synthesis resolves after
  // the round advanced or expired, it never plays.
  const playPhrase = useCallback(
    async (phrase: Phrase, forRound: number) => {
      if (!soundOnRef.current) return;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      try {
        const cached = audioCache.current.get(phrase.id);
        const res =
          cached ??
          (await synthesize.mutateAsync({
            data: {
              text: phrase.nativeScript,
              languageName: activeLanguageName,
              languageCode: activeLang,
            },
          }));
        audioCache.current.set(phrase.id, { audioBase64: res.audioBase64, format: res.format });
        // Item 7a: the round moved on (or timed out) while synthesis was in
        // flight; a late clip must never fire at or after expiry.
        if (roundRef.current !== forRound || timedOutRef.current) return;
        const audio = new Audio(`data:audio/${res.format};base64,${res.audioBase64}`);
        // Item 7b: report live playback so the frame's mute button lights up.
        audio.onended = () => setAudioPlaying(false);
        audio.onpause = () => setAudioPlaying(false);
        audioRef.current = audio;
        setAudioPlaying(true);
        await audio.play();
      } catch {
        setAudioPlaying(false);
        // Audio is a garnish on this game: a failed clip never blocks a round.
      }
    },
    [synthesize, activeLanguageName, activeLang, setAudioPlaying],
  );

  useEffect(() => {
    setJudged(null);
    if (q) playPhrase(q.phrase, api.round);
    // Item 7a: advancing the round silences any clip still playing for the
    // previous one.
    return () => audioRef.current?.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.round]);

  // Stop any playing clip when the game unmounts.
  useEffect(() => () => audioRef.current?.pause(), []);

  // Timeout counts as a wrong judgment: brief flash, then submit the miss.
  useEffect(() => {
    if (!api.timedOut) return;
    // Item 7a: expiry silences the round clip immediately.
    audioRef.current?.pause();
    if (judged !== null || !q) return;
    webHaptic("warning");
    const t = setTimeout(
      () =>
        api.submitRound({ phraseId: q.phrase.id, selectedPhraseId: q.decoy.id, correct: false }),
      FEEDBACK_MS,
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.timedOut, judged]);

  if (!q) return null;
  const answered = judged !== null;
  const wasCorrect = answered && judged === q.isTrue;

  const handleJudge = (saidTrue: boolean) => {
    if (answered || api.timedOut) return;
    api.lockRound();
    setJudged(saidTrue);
    const correct = saidTrue === q.isTrue;
    webHaptic(correct ? "success" : "warning");
    setTimeout(
      () =>
        api.submitRound({
          phraseId: q.phrase.id,
          selectedPhraseId: correct ? q.phrase.id : q.decoy.id,
          correct,
          // A true/false call: the review names the pairing that was on
          // screen and what the phrase actually means.
          review: {
            prompt: `${q.phrase.nativeScript} means "${q.shownEnglish}"`,
            // The prompt carries native script, so its reading leads the sub
            // line; a false pairing then says what the phrase really means.
            promptSub:
              [q.phrase.romanized.trim(), q.isTrue ? "" : `It means "${q.phrase.english}"`]
                .filter(Boolean)
                .join(" · ") || null,
            answer: saidTrue ? "True" : "False",
            correct: q.isTrue ? "True" : "False",
          },
        }),
      FEEDBACK_MS,
    );
  };

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div
        className={cn(
          "flex flex-col items-center gap-2 rounded-3xl border p-6 text-center transition-colors",
          !answered && !api.timedOut && "border-border bg-card",
          (answered || api.timedOut) &&
            (wasCorrect
              ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40"
              : "border-red-400 bg-red-50 dark:bg-red-950/40"),
        )}
      >
        <p style={native.style} dir={native.dir} className="text-2xl font-extrabold leading-snug text-foreground">
          {q.phrase.nativeScript}
        </p>
        {/* Romanized reading under the prompt — same quiet secondary line the
            Speed Round card uses. Empty romanized renders nothing. */}
        {q.phrase.romanized.trim() !== "" && (
          <p className="text-sm text-muted-foreground">{q.phrase.romanized}</p>
        )}
        <p className="text-sm text-muted-foreground">means</p>
        <p className="text-lg font-bold text-foreground">"{q.shownEnglish}"</p>
        {(answered || api.timedOut) && !wasCorrect && (
          <p className="text-xs font-semibold text-red-600">
            {q.isTrue ? "It was true!" : `It means "${q.phrase.english}"`}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => handleJudge(true)}
          disabled={answered || api.timedOut}
          data-testid="signal-lights-true"
          className="flex flex-col items-center gap-1.5 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 font-extrabold text-emerald-700 transition-all hover:border-emerald-400 active:scale-[0.97] dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400"
        >
          <span className="h-4 w-4 rounded-full bg-emerald-500 shadow-[0_0_8px_2px_rgba(16,185,129,0.6)]" />
          True
        </button>
        <button
          onClick={() => handleJudge(false)}
          disabled={answered || api.timedOut}
          data-testid="signal-lights-false"
          className="flex flex-col items-center gap-1.5 rounded-2xl border-2 border-red-300 bg-red-50 p-4 font-extrabold text-red-700 transition-all hover:border-red-400 active:scale-[0.97] dark:border-red-800 dark:bg-red-950/40 dark:text-red-400"
        >
          <span className="h-4 w-4 rounded-full bg-red-500 shadow-[0_0_8px_2px_rgba(239,68,68,0.6)]" />
          False
        </button>
      </div>
    </div>
  );
}

export default function SignalLightsPage() {
  const def = quickGameById("signal-lights")!;
  return (
    <QuickGameShell
      def={def}
      instruction="Green for true, red for false. Quick!"
      secondsPerRound={SECONDS_PER_ROUND}
      totalRounds={() => ROUNDS}
      renderRound={(props) => <SignalLightsRound {...props} />}
    />
  );
}
