/**
 * THE FIRST-RUN TOUR OF THE FEED'S TABS. Asked for 2026-08-26: "the first time
 * they access the feed screen, lets show popup's pointing to each tab and
 * telling them what each shows. Only shown on their first load of that page."
 *
 * Mobile twin: components/FeedTabsCoach.tsx. Keep the copy in step.
 *
 * IT NOW POINTS BY MEASURING, AND IT USED TO REFUSE TO. The original note here
 * argued that anchoring a caret means measuring a tab, which moves with the tab
 * list and on every resize, so each step merely SELECTED the tab it described
 * and let the strip's active styling do the pointing. The card sat at a fixed
 * offset, centred, identical on every step.
 *
 * That is not pointing, and the owner said so on 2026-08-26: "each isn't really
 * pointing to the right option". With two tabs and one motionless card, every
 * step looked the same and the arrow indicated nothing.
 *
 * The measuring objection was answerable rather than fatal. It reads the ACTIVE
 * tab, which the step has just selected, so there is no separate source of
 * truth to drift from, and it re-measures on resize. Mobile computes the same
 * anchor instead of measuring, because its strip is flex:1 segments at a known
 * padding and gap, so the arithmetic is exact and cheaper than a layout pass.
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
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const step = steps[i];

  // Select the described tab as each step opens.
  useEffect(() => {
    if (step) onStep(step.value);
  }, [step, onStep]);

  // Then measure it. A frame later, because the strip has to re-render with the
  // new active tab before it has a box worth reading.
  useEffect(() => {
    if (!step) return;
    const measure = () => {
      const el = document.querySelector<HTMLElement>(
        '[role="tab"][data-state="active"]',
      );
      if (!el) return;
      const r = el.getBoundingClientRect();
      setAnchor({ x: r.left + r.width / 2, y: r.bottom });
    };
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [step]);

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
      className="fixed inset-0 z-50 bg-black/45"
      onClick={advance}
    >
      {/* THE CARET IS THE POINTING. It sits on the bottom edge of the tab the
          step describes, so two steps never look alike. Until the first
          measurement lands there is no caret rather than one parked at a
          guess. */}
      {anchor && (
        <span
          data-testid="feed-tabs-coach-caret"
          className="pointer-events-none absolute h-3 w-3 rotate-45 border-l border-t border-card-border bg-card"
          style={{ left: anchor.x - 6, top: anchor.y + 8 }}
          aria-hidden
        />
      )}
      <div
        className="absolute left-1/2 w-[min(28rem,calc(100%-2.5rem))] -translate-x-1/2 space-y-2.5 rounded-3xl border border-card-border bg-card p-5 shadow-xl"
        style={{ top: anchor ? anchor.y + 13 : undefined, ...(anchor ? {} : { top: "14rem" }) }}
      >
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
