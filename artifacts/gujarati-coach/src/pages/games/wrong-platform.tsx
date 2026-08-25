// Wrong Platform: odd one out, played by dragging Chacha-ji onto the stray.
//
// Each round boards three (or five) phrases from the chosen topic plus ONE
// stray that wandered in from another topic; the learner drops the chaiwala on
// the stray. The stray's id is NEVER submitted (it would fail the server's
// in-category validation): each round is scored through a unique in-category
// anchor phrase instead, riding the frozen listen-and-pick model. A correct
// drop submits the anchor matched to itself; a wrong one submits the anchor
// matched to a different in-category id.
//
// TWO GAMES FROM ONE FILE, 2026-08-25: "split the game into 2 games, it has a
// lot of content. Add a free version and a Part 2 for All-Access." Part 2 is
// not simply longer. It draws its stray from a NEIGHBOURING topic and hides
// the English, which is the difference between a category quiz and a language
// one: with the English showing, the script and the romanization are
// decoration and the round is answerable without reading a word of the
// language.
//
// THE STRAY USED TO COME FROM ONE FIXED TOPIC. `strayCategory` was the first
// category that was not yours, every round, all six of them, so a learner who
// noticed had solved the game. Both parts now alternate between two source
// topics, chosen by distance from the topic being played.
import { useEffect, useMemo, useRef, useState } from "react";
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

/** What separates the free game from the paid one. */
export type WrongPlatformPart = 1 | 2;

const PARTS: Record<
  WrongPlatformPart,
  {
    rounds: number;
    /** Cards on the board, stray included. */
    options: number;
    /** Part 1 shows the meaning; Part 2 makes you read the language. */
    showEnglish: boolean;
    /**
     * How far the stray's topic sits from the one being played, measured in
     * roster positions. Part 1 goes as far away as it can, so the odd card is
     * obvious once you understand the rule; Part 2 takes the neighbours, where
     * telling them apart is a real judgement.
     */
    strayDistance: "far" | "near";
  }
> = {
  1: { rounds: 6, options: 4, showEnglish: true, strayDistance: "far" },
  2: { rounds: 8, options: 6, showEnglish: false, strayDistance: "near" },
};

type PlatformQuestion = {
  /** Unique in-category anchor this round is scored through. */
  anchor: Phrase;
  /** The in-category phrases (anchor first before shuffling). */
  locals: Phrase[];
  stray: Phrase;
  options: Phrase[];
};

function buildPlan(
  locals: Phrase[],
  strays: Phrase[],
  count: number,
  localsPerRound: number,
): PlatformQuestion[] {
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
    const others = quickShuffle(locals.filter((p) => p.id !== anchor.id)).slice(
      0,
      localsPerRound - 1,
    );
    const stray = strayPool[i % strayPool.length]!;
    const roundLocals = [anchor, ...others];
    plan.push({
      anchor,
      locals: roundLocals,
      stray,
      options: quickShuffle([...roundLocals, stray]),
    });
  }
  return plan;
}

/**
 * The two topics a part draws its strays from, by distance in roster order.
 *
 * Two rather than one so a run does not repeat the same source topic every
 * round, and deterministic so a reload does not reshuffle the difficulty.
 */
function strayCategoryIds(
  categories: { id: number; phraseCount: number }[],
  playingId: number,
  distance: "far" | "near",
): number[] {
  const playingIdx = categories.findIndex((c) => c.id === playingId);
  const others = categories
    .map((c, i) => ({ c, gap: playingIdx < 0 ? i : Math.abs(i - playingIdx) }))
    .filter(({ c }) => c.id !== playingId && c.phraseCount >= 1)
    .sort((a, b) => (distance === "far" ? b.gap - a.gap : a.gap - b.gap));
  return others.slice(0, 2).map(({ c }) => c.id);
}

function WrongPlatformRound({
  phrases,
  api,
  activeLang,
  part,
}: QuickRoundProps & { part: WrongPlatformPart }) {
  const cfg = PARTS[part];
  const native = useNativeText();
  const categoryId = phrases[0]?.categoryId ?? 0;
  const { data: categories } = useListCategories({ lang: activeLang });
  const strayIds = useMemo(
    () => strayCategoryIds(categories ?? [], categoryId, cfg.strayDistance),
    [categories, categoryId, cfg.strayDistance],
  );
  // TWO FIXED QUERIES, never a loop: hook count must not vary between renders.
  // A part with only one other topic available gets one and is none the worse.
  const strayA = useListCategoryPhrases(strayIds[0] ?? 0, activeLang, {
    query: {
      enabled: strayIds.length > 0,
      queryKey: getListCategoryPhrasesQueryKey(strayIds[0] ?? 0, activeLang),
    },
  });
  const strayB = useListCategoryPhrases(strayIds[1] ?? 0, activeLang, {
    query: {
      enabled: strayIds.length > 1,
      queryKey: getListCategoryPhrasesQueryKey(strayIds[1] ?? 0, activeLang),
    },
  });

  const strays = useMemo(
    () => [...(strayA.data ?? []), ...(strayB.data ?? [])],
    [strayA.data, strayB.data],
  );
  const [plan, setPlan] = useState<PlatformQuestion[] | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    if (plan === null && strays.length > 0) {
      setPlan(buildPlan(phrases, strays, cfg.rounds, cfg.options - 1));
    }
  }, [plan, strays, phrases, cfg.rounds, cfg.options]);

  useEffect(() => {
    setPicked(null);
  }, [api.round]);

  // ── The drag rig ─────────────────────────────────────────────────────────
  // Pointer events, not HTML5 drag-and-drop: the latter has no usable touch
  // story and cannot render a custom image reliably. The cards keep their own
  // click handler as well, which is not a fallback for convenience but the
  // only route a keyboard or screen-reader user has: a drop target that can
  // only be reached by dragging is not reachable at all.
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const cardUnder = (clientX: number, clientY: number): number | null => {
    for (let i = 0; i < cardRefs.current.length; i++) {
      const el = cardRefs.current[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (
        clientX >= r.left &&
        clientX <= r.right &&
        clientY >= r.top &&
        clientY <= r.bottom
      ) {
        return i;
      }
    }
    return null;
  };

  if (strayIds.length === 0) {
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
      api.submitRound({
        phraseId: q.anchor.id,
        selectedPhraseId: q.anchor.id,
        correct: true,
      });
      return;
    }
    // Wrong pick is always one of the locals; map it to an in-category id
    // that differs from the anchor.
    const pickedPhrase = q.options[pickIdx]!;
    const wrongId =
      pickedPhrase.id !== q.anchor.id
        ? pickedPhrase.id
        : q.locals.find((p) => p.id !== q.anchor.id)!.id;
    api.submitRound({
      phraseId: q.anchor.id,
      selectedPhraseId: wrongId,
      correct: false,
      // The round asks which card came from another topic, so the review has
      // to name the stray: the anchor the round is SCORED through would read
      // as the wrong answer entirely.
      review: {
        prompt: "Which one boarded at the wrong platform?",
        promptSub: q.options.map((p) => p.english).join(" · "),
        answer: pickedPhrase.english,
        correct: q.stray.english,
      },
    });
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
      <div
        className={cn(
          "grid gap-3",
          cfg.options > 4 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2",
        )}
      >
        {q.options.map((p, idx) => {
          let cardClass = "border-border bg-card hover:border-primary/40 hover:bg-primary/5";
          if (answered && idx === strayIdx) {
            cardClass = "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40";
          } else if (answered && !wasCorrect && idx === picked) {
            cardClass = "border-red-400 bg-red-50 dark:bg-red-950/40";
          } else if (!answered && hover === idx) {
            cardClass = "border-primary bg-primary/10";
          }
          return (
            <button
              key={`${p.id}-${idx}`}
              ref={(el) => {
                cardRefs.current[idx] = el;
              }}
              data-testid={`platform-card-${idx}`}
              onClick={() => handlePick(idx)}
              disabled={answered}
              className={cn(
                "relative flex min-h-[88px] flex-col items-center justify-center gap-1 rounded-2xl border p-3 text-center transition-all active:scale-[0.97]",
                cardClass,
              )}
            >
              <span
                style={native.style}
                dir={native.dir}
                className="text-base font-semibold leading-snug text-foreground"
              >
                {p.nativeScript}
              </span>
              {p.romanized.trim() !== "" && (
                <span className="text-xs font-medium text-muted-foreground">
                  {p.romanized}
                </span>
              )}
              {/* PART 2 HIDES THE MEANING. With the English on the card the
                  round is "which of these four English words is the odd one
                  out", which needs no language at all. */}
              {cfg.showEnglish && (
                <span className="text-xs text-muted-foreground">{p.english}</span>
              )}
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

      {/* Chacha-ji waits below the board until he is dragged onto a card. */}
      {!answered && (
        <div className="flex items-center justify-center pt-1">
          <img
            src={`${import.meta.env.BASE_URL}stall/chachaji.png`}
            alt="Chacha-ji"
            data-testid="chachaji-token"
            draggable={false}
            onPointerDown={(e) => {
              if (answered) return;
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              setDrag({ x: 0, y: 0 });
            }}
            onPointerMove={(e) => {
              if (!drag) return;
              const el = e.currentTarget.getBoundingClientRect();
              setDrag({ x: e.movementX + drag.x, y: e.movementY + drag.y });
              setHover(cardUnder(e.clientX, e.clientY ?? el.top));
            }}
            onPointerUp={(e) => {
              if (!drag) return;
              const over = cardUnder(e.clientX, e.clientY);
              setDrag(null);
              setHover(null);
              if (over !== null) handlePick(over);
            }}
            onPointerCancel={() => {
              setDrag(null);
              setHover(null);
            }}
            style={{
              touchAction: "none",
              transform: drag ? `translate(${drag.x}px, ${drag.y}px)` : undefined,
            }}
            className="h-20 w-20 cursor-grab select-none object-contain active:cursor-grabbing"
          />
        </div>
      )}

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

const HOW_TO_PLAY: Record<WrongPlatformPart, string[]> = {
  1: [
    "Three of these boarded at your topic. One wandered in from somewhere else.",
    "Drag Chacha-ji, the chaiwala, onto the card that does not belong. You can also just tap it.",
    "Six rounds, no clock. Get one wrong and he will show you which card it was.",
  ],
  2: [
    "Same idea, harder line. Six cards now, and the stray comes from a NEIGHBOURING topic rather than a distant one.",
    "The English is hidden, so you are reading the script and the romanization rather than the meaning.",
    "Drag Chacha-ji, the chaiwala, onto the card that does not belong. Eight rounds.",
  ],
};

export function makeWrongPlatformPage(part: WrongPlatformPart) {
  const id = part === 1 ? "wrong-platform" : "wrong-platform-2";
  return function WrongPlatformPage() {
    const def = quickGameById(id)!;
    return (
      <QuickGameShell
        def={def}
        instruction="Drag Chacha-ji onto the card that boarded at the wrong platform."
        howToPlay={HOW_TO_PLAY[part]}
        // SILENT: the odd-one-out is read, never heard.
        usesAudio={false}
        totalRounds={() => PARTS[part].rounds}
        renderRound={(props) => <WrongPlatformRound {...props} part={part} />}
      />
    );
  };
}

export default makeWrongPlatformPage(1);
