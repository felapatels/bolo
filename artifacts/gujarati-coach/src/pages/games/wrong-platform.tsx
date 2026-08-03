// Chunk 6B quick game: Wrong Platform (odd one out, floor 3).
// Each round boards three phrases from the chosen topic plus ONE stray that
// wandered in from another topic; the learner spots the stray. The stray's
// id is NEVER submitted (it would fail the server's in-category validation):
// each round is scored through a unique in-category anchor phrase instead,
// riding the frozen listen-and-pick model. Correct spot submits the anchor
// matched to itself; a wrong pick submits the anchor matched to a different
// in-category id.

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import {
  useListCategories,
  useListCategoryPhrases,
  getListCategoryPhrasesQueryKey,
  type Phrase,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { webHaptic } from "@/lib/haptics";
import { useLanguage, useNativeText } from "@/lib/language-context";
import { quickGameById } from "@/lib/quick-games";
import {
  QuickGameShell,
  quickShuffle,
  type QuickRoundProps,
} from "./quick-game-frame";

const ROUNDS = 6;

type PlatformQuestion = {
  /** Unique in-category anchor this round is scored through. */
  anchor: Phrase;
  /** The three in-category phrases (anchor first before shuffling). */
  locals: Phrase[];
  stray: Phrase;
  options: Phrase[];
};

function buildPlan(locals: Phrase[], strays: Phrase[], count: number): PlatformQuestion[] {
  const plan: PlatformQuestion[] = [];
  let pool = quickShuffle(locals);
  let poolIdx = 0;
  const strayPool = quickShuffle(strays);
  for (let i = 0; i < count; i++) {
    if (poolIdx >= pool.length) {
      pool = quickShuffle(locals);
      poolIdx = 0;
    }
    const anchor = pool[poolIdx++]!;
    const others = quickShuffle(locals.filter((p) => p.id !== anchor.id)).slice(0, 2);
    const stray = strayPool[i % strayPool.length]!;
    const roundLocals = [anchor, ...others];
    plan.push({ anchor, locals: roundLocals, stray, options: quickShuffle([...roundLocals, stray]) });
  }
  return plan;
}

function WrongPlatformRound({ phrases, api, activeLang }: QuickRoundProps) {
  const native = useNativeText();
  const categoryId = phrases[0]?.categoryId ?? 0;
  const { data: categories } = useListCategories({ lang: activeLang });
  const strayCategory = (categories ?? []).find(
    (c) => c.id !== categoryId && c.phraseCount >= 1,
  );
  const strayQuery = useListCategoryPhrases(strayCategory?.id ?? 0, activeLang, {
    query: {
      enabled: !!strayCategory,
      queryKey: getListCategoryPhrasesQueryKey(strayCategory?.id ?? 0, activeLang),
    },
  });

  const strays = strayQuery.data ?? [];
  const [plan, setPlan] = useState<PlatformQuestion[] | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    if (plan === null && strays.length > 0) {
      setPlan(buildPlan(phrases, strays, ROUNDS));
    }
  }, [plan, strays, phrases]);

  useEffect(() => {
    setPicked(null);
  }, [api.round]);

  if (!strayCategory) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 text-center text-sm text-muted-foreground">
        This game needs phrases from a second topic. Play another game for now.
      </div>
    );
  }
  if (!plan) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const q = plan[api.round];
  if (!q) return null;
  const answered = picked !== null;
  const strayIdx = q.options.findIndex((p) => p.id === q.stray.id);
  const wasCorrect = answered && picked === strayIdx;

  const submitFor = (pickIdx: number) => {
    const correct = pickIdx === strayIdx;
    if (correct) {
      api.submitRound({ phraseId: q.anchor.id, selectedPhraseId: q.anchor.id, correct: true });
      return;
    }
    // Wrong pick is always one of the three locals; map it to an
    // in-category id that differs from the anchor.
    const pickedPhrase = q.options[pickIdx]!;
    const wrongId =
      pickedPhrase.id !== q.anchor.id
        ? pickedPhrase.id
        : q.locals.find((p) => p.id !== q.anchor.id)!.id;
    api.submitRound({ phraseId: q.anchor.id, selectedPhraseId: wrongId, correct: false });
  };

  const handlePick = (idx: number) => {
    if (answered) return;
    api.lockRound();
    setPicked(idx);
    const correct = idx === strayIdx;
    webHaptic(correct ? "success" : "warning");
    if (correct) {
      setTimeout(() => submitFor(idx), 700);
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        {q.options.map((p, idx) => {
          let cardClass = "border-border bg-card hover:border-primary/40 hover:bg-primary/5";
          if (answered && idx === strayIdx) {
            cardClass = "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40";
          } else if (answered && !wasCorrect && idx === picked) {
            cardClass = "border-red-400 bg-red-50 dark:bg-red-950/40";
          }
          return (
            <button
              key={`${p.id}-${idx}`}
              onClick={() => handlePick(idx)}
              disabled={answered}
              className={cn(
                "relative flex min-h-[88px] flex-col items-center justify-center gap-1 rounded-2xl border p-3 text-center transition-all active:scale-[0.97]",
                cardClass,
              )}
            >
              <span style={native.style} dir={native.dir} className="text-base font-semibold leading-snug text-foreground">
                {p.nativeScript}
              </span>
              <span className="text-xs text-muted-foreground">{p.english}</span>
              {answered && idx === strayIdx && (
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

      {answered && !wasCorrect && (
        <button
          onClick={() => submitFor(picked!)}
          data-testid="wrong-platform-continue"
          className="flex items-center justify-center rounded-2xl bg-primary px-6 py-3.5 font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
        >
          Tap to continue
        </button>
      )}
    </div>
  );
}

export default function WrongPlatformPage() {
  const def = quickGameById("wrong-platform")!;
  return (
    <QuickGameShell
      def={def}
      instruction="One of these boarded at the wrong platform. Spot the stray!"
      totalRounds={() => ROUNDS}
      renderRound={(props) => <WrongPlatformRound {...props} />}
    />
  );
}
