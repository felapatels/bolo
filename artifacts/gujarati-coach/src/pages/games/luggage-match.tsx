// Chunk 6B quick game: Luggage Match (pairs, floor 4, capped at 6 pairs).
// Two racks of luggage tags: native script on the left, English on the
// right. Pair them up. Rides the frozen word-match correctness model: a
// pair matched on the FIRST try submits the phrase matched to itself; a
// pair that took a wrong attempt first submits the wrongly paired
// counterpart's id (in-category, so validation passes unchanged).

import { useMemo, useState } from "react";
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

const MAX_PAIRS = 6;

function pairCount(phrases: Phrase[]): number {
  return Math.min(MAX_PAIRS, phrases.length);
}

function LuggageMatchRound({ phrases, api }: QuickRoundProps) {
  const native = useNativeText();
  const board = useMemo(() => {
    const chosen = quickShuffle(phrases).slice(0, pairCount(phrases));
    return {
      pairs: chosen,
      left: quickShuffle(chosen),
      right: quickShuffle(chosen),
    };
    // Built once per mount; the shell remounts the round via gameKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [leftPick, setLeftPick] = useState<number | null>(null);
  const [rightPick, setRightPick] = useState<number | null>(null);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [shakeIds, setShakeIds] = useState<Set<number>>(new Set());
  // First wrong counterpart per native-side phrase id (first try only).
  const [firstWrong] = useState(() => new Map<number, number>());

  const tryResolve = (leftId: number | null, rightId: number | null) => {
    if (leftId === null || rightId === null) return;
    api.lockRound();
    if (leftId === rightId) {
      webHaptic("success");
      setMatched((prev) => new Set(prev).add(leftId));
      setLeftPick(null);
      setRightPick(null);
      api.submitRound({
        phraseId: leftId,
        selectedPhraseId: firstWrong.get(leftId) ?? leftId,
        correct: !firstWrong.has(leftId),
      });
    } else {
      webHaptic("warning");
      if (!firstWrong.has(leftId)) firstWrong.set(leftId, rightId);
      setShakeIds(new Set([leftId, rightId]));
      setTimeout(() => {
        setShakeIds(new Set());
        setLeftPick(null);
        setRightPick(null);
      }, 450);
    }
  };

  const tagClass = (picked: boolean, done: boolean, shaking: boolean) =>
    cn(
      "relative flex min-h-[56px] w-full items-center justify-center rounded-xl border-2 p-2 text-center text-sm font-semibold transition-all active:scale-[0.97]",
      done
        ? "border-emerald-400 bg-emerald-50 opacity-70 dark:bg-emerald-950/40"
        : picked
          ? "border-primary bg-primary/10"
          : "border-border bg-card hover:border-primary/40",
      shaking && "border-red-400 bg-red-50 dark:bg-red-950/40",
    );

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          {board.left.map((p) => (
            <button
              key={`l-${p.id}`}
              disabled={matched.has(p.id)}
              onClick={() => {
                if (shakeIds.size > 0) return;
                const next = leftPick === p.id ? null : p.id;
                setLeftPick(next);
                tryResolve(next, rightPick);
              }}
              className={tagClass(leftPick === p.id, matched.has(p.id), shakeIds.has(p.id) && leftPick === p.id)}
            >
              {/* luggage tag hole */}
              <span className="absolute left-1.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border border-border bg-background" />
              <span style={native.style} dir={native.dir} className="leading-snug text-foreground">
                {p.nativeScript}
              </span>
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {board.right.map((p) => (
            <button
              key={`r-${p.id}`}
              disabled={matched.has(p.id)}
              onClick={() => {
                if (shakeIds.size > 0) return;
                const next = rightPick === p.id ? null : p.id;
                setRightPick(next);
                tryResolve(leftPick, next);
              }}
              className={tagClass(rightPick === p.id, matched.has(p.id), shakeIds.has(p.id) && rightPick === p.id)}
            >
              <span className="absolute right-1.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border border-border bg-background" />
              <span className="leading-snug text-foreground">{p.english}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LuggageMatchPage() {
  const def = quickGameById("luggage-match")!;
  return (
    <QuickGameShell
      def={def}
      instruction="Pair each luggage tag with its English twin"
      totalRounds={pairCount}
      renderRound={(props) => <LuggageMatchRound {...props} />}
    />
  );
}
