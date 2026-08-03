// Chunk 6B quick game: Signal Lights (true or false lightning round,
// floor 2). A phrase and a claimed meaning flash up; green light for true,
// red light for false, against a short countdown. Decoys come from the SAME
// category, and the wrong-judgment submission maps to the decoy's id, so
// results stay in-category and ride the frozen listen-and-pick model.

import { useEffect, useState } from "react";
import { type Phrase } from "@workspace/api-client-react";
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

function SignalLightsRound({ phrases, api }: QuickRoundProps) {
  const native = useNativeText();
  const [plan] = useState(() => buildPlan(phrases, ROUNDS));
  const [judged, setJudged] = useState<boolean | null>(null);

  const q = plan[api.round];

  useEffect(() => {
    setJudged(null);
  }, [api.round]);

  // Timeout counts as a wrong judgment: brief flash, then submit the miss.
  useEffect(() => {
    if (!api.timedOut || judged !== null || !q) return;
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
