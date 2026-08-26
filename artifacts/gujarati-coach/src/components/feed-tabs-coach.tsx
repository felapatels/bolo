/**
 * THE FIRST-RUN TOUR OF THE FEED'S TABS. Asked for 2026-08-26: "the first time
 * they access the feed screen, lets show popup's pointing to each tab and
 * telling them what each shows. Only shown on their first load of that page."
 *
 * Mobile twin: components/FeedTabsCoach.tsx. Keep the copy in step.
 *
 * IT POINTS BY SELECTING, NOT BY MEASURING. Anchoring a caret to a tab means
 * measuring that tab's position, which moves whenever the tab list changes and
 * again on every resize. Instead each step SWITCHES to the tab it describes:
 * the tab strip's own active styling becomes the pointer, and the card sits
 * under the strip. Nothing to measure and nothing to keep in sync.
 *
 * FLEX IS NOT ALWAYS THERE, so the steps are built from the tabs actually on
 * screen. A learner with a bare Bolo gets one step about the Feed and is done,
 * and the tour never describes a tab they cannot see.
 *
 * ONCE PER BROWSER. The flag is written when the tour is DISMISSED, not when it
 * opens, so a reload mid-tour gives it back rather than losing it.
 */
import { useCallback, useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";

const SEEN_KEY = "bolo.feedTabsCoachSeen";

/** What each tab is for, in the learner's words rather than the schema's. */
const COPY: Record<string, { title: string; body: string }> = {
  feed: {
    title: "Feed",
    body: "Where everyone stands this week, and the moments as they happen. Your XP and your streak are both on every row.",
  },
  flex: {
    title: "Flex",
    body: "Bolo in what you bought. This tab only exists while she is wearing something, so it is yours as long as you keep her dressed.",
  },
};

export interface CoachStep {
  value: string;
  label: string;
}

/**
 * Reads the flag once on mount. Returns null while unknown, so nothing flashes
 * open and closed for somebody who has already seen it.
 */
export function useFeedTabsCoach(): {
  pending: boolean | null;
  dismiss: () => void;
} {
  const [pending, setPending] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setPending(!window.localStorage.getItem(SEEN_KEY));
    } catch {
      // Storage can throw outright in a private window. It must not cost the
      // learner the page.
      setPending(false);
    }
  }, []);

  const dismiss = useCallback(() => {
    setPending(false);
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Losing the flag means the tour runs once more. That is the safe way to
      // fail: the other direction silently eats somebody's only showing.
    }
  }, []);

  return { pending, dismiss };
}

export function FeedTabsCoach({
  steps,
  onStep,
  onDone,
}: {
  /** The tabs actually on screen, in the order they appear. */
  steps: CoachStep[];
  /** Selects the tab being described, which is what does the pointing. */
  onStep: (value: string) => void;
  onDone: () => void;
}) {
  const [i, setI] = useState(0);
  const step = steps[i];

  // Select the described tab as each step opens.
  useEffect(() => {
    if (step) onStep(step.value);
  }, [step, onStep]);

  if (!step) return null;
  const copy = COPY[step.value];
  if (!copy) return null;

  const last = i === steps.length - 1;
  const advance = () => (last ? onDone() : setI((n) => n + 1));

  return (
    // Clicking the scrim advances too. A tour that can only be dismissed by
    // finding the one right button is a tour people close the tab on.
    <div
      data-testid="feed-tabs-coach"
      role="dialog"
      aria-label={copy.title}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-5 pt-56"
      onClick={advance}
    >
      <div className="w-full max-w-md space-y-2.5 rounded-3xl border border-card-border bg-card p-5 shadow-xl">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15">
            <ArrowUp className="h-4 w-4 text-primary" />
          </span>
          <p className="flex-1 text-lg font-black text-foreground">
            {copy.title}
          </p>
          {steps.length > 1 && (
            <span className="text-xs text-muted-foreground">
              {i + 1} of {steps.length}
            </span>
          )}
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {copy.body}
        </p>
        <Button className="rounded-full font-black" onClick={advance}>
          {last ? "Got it" : "Next"}
        </Button>
      </div>
    </div>
  );
}
