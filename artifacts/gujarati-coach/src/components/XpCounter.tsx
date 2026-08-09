import { useRef, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProgressSummary,
  getGetProgressSummaryQueryKey,
} from "@workspace/api-client-react";
import { useLanguage } from "@/lib/language-context";
import { registerXpCounter, registerXpCounterPop } from "@/lib/xpCounterRef";
import { cn } from "@/lib/utils";

/**
 * Persistent XP progress counter showing today's XP against the daily goal.
 *
 * variant="chrome"  — shown in nav bars (BottomNav, DesktopNav). Slightly
 *                     larger; fills available width.
 * variant="session" — shown inside the practice page header. Compact; fixed
 *                     narrow width so it doesn't crowd other controls.
 *
 * Registers its DOM element with xpCounterRef so Spec 1's arc animation can
 * target it without knowing which variant is mounted. Session wins when both
 * are mounted (web desktop during practice).
 */
export function XpCounter({ variant }: { variant: "chrome" | "session" }) {
  const { activeLang } = useLanguage();
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

  // Invalidate at local midnight so the counter resets without an app restart.
  useEffect(() => {
    if (!activeLang) return;
    const now = new Date();
    const midnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    );
    const ms = midnight.getTime() - now.getTime();
    const timer = setTimeout(() => {
      queryClient.invalidateQueries({
        queryKey: getGetProgressSummaryQueryKey(params),
      });
    }, ms);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, activeLang]);

  const todayXp = summary.data?.todayXp ?? 0;
  const dailyGoal = summary.data?.dailyGoal ?? 10;
  const pct = Math.min(
    100,
    dailyGoal > 0 ? Math.round((todayXp / dailyGoal) * 100) : 0,
  );
  const done = todayXp >= dailyGoal && dailyGoal > 0;

  if (!activeLang) return null;

  const isSession = variant === "session";

  return (
    <motion.div
      ref={elRef}
      key={popKey}
      animate={
        popKey > 0 && !reduceMotion ? { scale: [1, 1.18, 1] } : undefined
      }
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn("flex flex-col gap-0.5", isSession ? "min-w-[72px]" : "w-full")}
      aria-label={`${todayXp} of ${dailyGoal} XP today`}
    >
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            "font-bold tabular-nums leading-none",
            isSession ? "text-[11px]" : "text-xs",
            done ? "text-primary" : "text-muted-foreground",
          )}
        >
          {todayXp}
          <span className="font-medium opacity-50">/{dailyGoal}</span>
        </span>
        <span
          className={cn(
            "font-semibold uppercase tracking-wide leading-none",
            isSession ? "text-[9px]" : "text-[10px]",
            // Half-strength muted grey is a soft touch on a white page and
            // nearly invisible on a dark one, so the dark theme spends more
            // of the ink it has.
            done
              ? "text-primary/70 dark:text-primary"
              : "text-muted-foreground/50 dark:text-muted-foreground/80",
          )}
        >
          XP
        </span>
      </div>
      <div
        className={cn(
          "rounded-full overflow-hidden bg-muted",
          isSession ? "h-1 w-16" : "h-1.5 w-full",
        )}
      >
        <div
          className={cn("h-full rounded-full", done ? "bg-primary" : "bg-primary/40")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </motion.div>
  );
}
