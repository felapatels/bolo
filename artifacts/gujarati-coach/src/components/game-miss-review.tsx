// The shared "what did I get wrong" review for the games' end screens.
//
// Every game ends on a score (6 / 8 correct) that used to be a dead number:
// the learner could see they missed two, never which two. Each game collects
// its own misses as GameMiss records while the run plays out and hands them to
// this pair of pieces:
//
//   MissReviewCta      the secondary "See what you missed" button
//   MissReviewDialog   the list itself
//
// End screens own the open state, so the score card can open the same dialog
// (tapping the 6/8 is the affordance most learners reach for first). Games
// with a perfect run render neither piece — there is nothing to review.
//
// A miss is described in the learner's own terms, not in ids: the prompt they
// saw, what they answered, and what the answer was. Games that time out or let
// a round lapse pass answer: null, which reads as "no answer" rather than
// pretending they chose something.

import { Check, ListChecks, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type GameMiss = {
  /** What the learner was asked — the prompt as it appeared on screen. */
  prompt: string;
  /** Optional second line under the prompt (romanization, native script, a hint). */
  promptSub?: string | null;
  /** What the learner answered. Null when the round lapsed with no answer. */
  answer: string | null;
  /** The answer that was expected. */
  correct: string;
  /** Romanized readings for the two lines above, when the value is native
   *  script. Section 10j: script never appears without its reading. Empty or
   *  null renders nothing — several scripts have no romanization. */
  answerSub?: string | null;
  correctSub?: string | null;
  /** Overrides for the two row labels. A game that is not answered in words
   *  (Script Trace is traced, not typed) reads better as "Your best 32 / 100"
   *  and "Pass mark 40" than as "You said" / "Answer". */
  answerLabel?: string;
  correctLabel?: string;
};

export function MissReviewCta({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  if (count <= 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="miss-review-cta"
      className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-6 py-3.5 font-bold text-foreground transition-all hover:bg-muted active:scale-[0.98]"
    >
      <ListChecks className="h-4 w-4" />
      See what you missed
    </button>
  );
}

export function MissReviewDialog({
  misses,
  open,
  onOpenChange,
}: {
  misses: GameMiss[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto rounded-2xl" data-testid="miss-review-dialog">
        <DialogHeader>
          <DialogTitle>What you missed</DialogTitle>
          <DialogDescription>
            {misses.length === 1
              ? "One to work on. Play again to have another go at it."
              : `${misses.length} to work on. Play again to have another go at them.`}
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-3">
          {misses.map((miss, i) => (
            <li
              key={i}
              data-testid="miss-review-row"
              className="rounded-2xl border border-border bg-card p-4"
            >
              <p className="font-bold text-foreground">{miss.prompt}</p>
              {miss.promptSub ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{miss.promptSub}</p>
              ) : null}
              <div className="mt-3 flex flex-col gap-1.5 text-sm">
                <p className="flex items-start gap-2 text-red-600 dark:text-red-400">
                  <X className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <span className="text-muted-foreground">{miss.answerLabel ?? "You said"} </span>
                    <span className="font-semibold">
                      {miss.answer ?? "nothing — the round ran out"}
                    </span>
                    {miss.answer && miss.answerSub?.trim() ? (
                      <span className="block text-xs font-medium text-muted-foreground">
                        {miss.answerSub}
                      </span>
                    ) : null}
                  </span>
                </p>
                <p className="flex items-start gap-2 text-emerald-600 dark:text-emerald-400">
                  <Check className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <span className="text-muted-foreground">{miss.correctLabel ?? "Answer"} </span>
                    <span className="font-semibold">{miss.correct}</span>
                    {miss.correctSub?.trim() ? (
                      <span className="block text-xs font-medium text-muted-foreground">
                        {miss.correctSub}
                      </span>
                    ) : null}
                  </span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
