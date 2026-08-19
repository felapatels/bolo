import { useRef, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProgressSummary,
  getGetProgressSummaryQueryKey,
} from "@workspace/api-client-react";
import {
  dailyTrainClassMeter,
  msUntilNextLocalDay,
} from "@workspace/train-class";
import { useLanguage } from "@/lib/language-context";
import { registerXpCounter, registerXpCounterPop } from "@/lib/xpCounterRef";
import { cn } from "@/lib/utils";

/**
 * Persistent XP strip showing today's XP against the next daily train class.
 *
 * It used to divide today's XP by `dailyGoal`, which is an ATTEMPTS target, so
 * it read things like "254/10 XP" with the bar clamped full. The denominator
 * now comes from the shared ladder in @workspace/train-class, which is the ONE
 * place any of these numbers are derived — nothing here re-derives a class, a
 * denominator or a fill from the raw XP. `dailyGoal` is untouched and still
 * correct on its other surfaces (the home attempts line, the Day Streak arc,
 * the MilestoneToast).
 *
 * variant="chrome"  — shown in nav bars (BottomNav, DesktopNav). Slightly
 *                     larger; fills available width.
 * variant="session" — shown inside the practice/review page header. Compact;
 *                     fixed narrow width so it doesn't crowd other controls.
 *
 * Registers its DOM element with xpCounterRef so Spec 1's arc animation can
 * target it without knowing which variant is mounted. Session wins when both
 * are mounted (web desktop during practice).
 */
export function XpCounter({ variant }: { variant: "chrome" | "session" }) {
  const { activeLang, timezone } = useLanguage();
  const queryClient = useQueryClient();
  const elRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  // Incremented each time the XP arc lands; keys a one-shot scale pop.
  const [popKey, setPopKey] = useState(0);

  const params = { lang: activeLang };
  const summary = useGetProgressSummary(params, {
    query: {
      enabled: !!activeLang,
      queryKey: getGetProgressSummaryQueryKey(params),
    },
  });

  // Register position for Spec 1 arc targeting.
  useEffect(() => {
    registerXpCounter(variant, elRef.current);
    registerXpCounterPop(variant, () => setPopKey((k) => k + 1));
    return () => {
      registerXpCounter(variant, null);
      registerXpCounterPop(variant, null);
    };
  }, [variant]);

  // Invalidate at the LEARNER'S local midnight so the strip resets without an
  // app restart. This used to read the device's own calendar fields, which is
  // the wrong moment for anyone whose stored zone is not their device's; the
  // boundary now comes from the same shared helper mobile uses, against the
  // stored zone the server buckets todayXp with.
  useEffect(() => {
    if (!activeLang) return;
    const timer = setTimeout(() => {
      queryClient.invalidateQueries({
        queryKey: getGetProgressSummaryQueryKey(params),
      });
    }, msUntilNextLocalDay(timezone));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, activeLang, timezone]);

  const meter = dailyTrainClassMeter(summary.data?.todayXp ?? 0);

  if (!activeLang) return null;

  const isSession = variant === "session";
  // A class in hand is the state worth colouring, the way "goal hit" used to
  // be. Below the first rung the strip stays muted.
  const held = meter.heldClass !== null;

  const label = meter.atTop
    ? `${meter.heldClass} class — ${meter.xp} XP today, top class reached`
    : meter.heldClass
      ? `${meter.xp} of ${meter.target} XP today, ${meter.heldClass} class`
      : `${meter.xp} of ${meter.target} XP today`;

  // `pushRight` is for the nav variant's inline placement only: that row runs
  // the full width of the floating pill and the raised Bolo circle breaks
  // through its middle, so a name sitting straight after the numbers
  // disappears behind the bird. At the top of the ladder the name replaces the
  // numbers, so it stays where they were.
  const classBadge = (pushRight: boolean) => (
    <span
      data-testid="xp-train-class"
      className={cn(
        "font-semibold uppercase tracking-wide leading-none truncate",
        isSession ? "text-[9px]" : "text-[10px]",
        // Shrink-wrap either way: a full-width box would sit over the
        // raised Bolo circle even when the ink does not.
        pushRight ? "ml-auto pl-1" : "self-start",
        "text-primary/80 dark:text-primary",
      )}
    >
      {meter.heldClass}
    </span>
  );

  return (
    <motion.div
      ref={elRef}
      key={popKey}
      animate={
        popKey > 0 && !reduceMotion ? { scale: [1, 1.18, 1] } : undefined
      }
      transition={{ duration: 0.3, ease: "easeOut" }}
      // The session variant's minimum grew from 72px: the denominator is now
      // up to three digits ("254/400") where it used to be one or two, and the
      // class name sits on its own line beneath it. 84px holds "254/400 XP" at
      // 11px tabular without wrapping and is still narrower than the header's
      // language chip + gear pair.
      className={cn(
        "flex flex-col gap-0.5",
        isSession ? "min-w-[84px]" : "w-full",
      )}
      aria-label={label}
      data-testid="xp-counter"
    >
      {meter.atTop ? (
        // Top of the ladder: nothing further to fill, so the class name stands
        // alone — no bar, no fraction.
        classBadge(false)
      ) : (
        <>
          <div className="flex items-baseline gap-1">
            <span
              className={cn(
                "font-bold tabular-nums leading-none",
                isSession ? "text-[11px]" : "text-xs",
                held ? "text-primary" : "text-muted-foreground",
              )}
            >
              {meter.xp}
              <span className="font-medium opacity-50">/{meter.target}</span>
            </span>
            <span
              className={cn(
                "font-semibold uppercase tracking-wide leading-none",
                isSession ? "text-[9px]" : "text-[10px]",
                // Half-strength muted grey is a soft touch on a white page and
                // nearly invisible on a dark one, so the dark theme spends more
                // of the ink it has.
                held
                  ? "text-primary/70 dark:text-primary"
                  : "text-muted-foreground/50 dark:text-muted-foreground/80",
              )}
            >
              XP
            </span>
            {/* The nav variant has the width to carry the class name inline. */}
            {!isSession && meter.heldClass ? classBadge(true) : null}
          </div>
          {/* The compact variant drops it to its own line instead: inline it
              would push "254/400 XP Superfast" past 110px in a 320px header
              that also holds the back arrow, the phrase counter, the language
              chip and the settings gear. */}
          {isSession && meter.heldClass ? classBadge(false) : null}
          <div
            data-testid="xp-meter-bar"
            className={cn(
              "rounded-full overflow-hidden bg-muted",
              isSession ? "h-1 w-16" : "h-1.5 w-full",
            )}
          >
            <div
              className={cn(
                "h-full rounded-full",
                held ? "bg-primary" : "bg-primary/40",
              )}
              style={{ width: `${meter.fill * 100}%` }}
            />
          </div>
        </>
      )}
    </motion.div>
  );
}
