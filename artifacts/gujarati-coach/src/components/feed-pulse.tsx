/**
 * THE GREEN PULSE. A dot beside the feed that flares when a new moment lands,
 * so a surface that is otherwise static tells the learner it is live.
 * Asked for 2026-08-26: "add a little green pulse every time the feed is
 * updated on homescreen and feed page so it feels alive."
 *
 * Mobile twin: components/FeedPulse.tsx. Keep the rule below in step.
 *
 * IT FIRES ON A CHANGE, NEVER ON FIRST SIGHT. Pulsing the first time the feed
 * loads would fire on every page open and would mean nothing; pulsing when the
 * newest id differs from the one already on screen means something arrived
 * while the learner was looking at it. That is the difference between a live
 * signal and decoration.
 *
 * The mobile twin carries a long note about useNativeDriver that does not apply
 * here: the web has no such trap, and this is a plain CSS animation.
 */
import { useEffect, useRef, useState } from "react";

/** How long the dot stays up after a new moment lands. */
export const PULSE_HOLD_MS = 4200;

/**
 * True while a newly arrived feed id is worth flaring about.
 *
 * `latestId` is the id of the newest entry the caller can see. FeedEntry.id is
 * stable across reads and prefixed by source, so it is safe to compare; nothing
 * here should ever compare createdAt, which two projected entries can share.
 */
export function useFeedPulse(latestId: string | null | undefined): boolean {
  const seen = useRef<string | null>(null);
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    if (!latestId) return;
    // First sight is not an update. Record it and stay quiet.
    if (seen.current === null) {
      seen.current = latestId;
      return;
    }
    if (seen.current === latestId) return;
    seen.current = latestId;
    setPulsing(true);
    const t = window.setTimeout(() => setPulsing(false), PULSE_HOLD_MS);
    return () => window.clearTimeout(t);
  }, [latestId]);

  return pulsing;
}

/**
 * The dot itself. Renders nothing when idle: a permanently visible dot would
 * stop carrying information within a day, and the point is that its appearance
 * IS the message.
 *
 * aria-hidden on purpose. It says nothing a screen reader user can act on, and
 * the content it announces is already in the list underneath it.
 */
export function FeedPulseDot({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    // A fixed box so the dot appearing never shifts the text beside it.
    <span
      data-testid="feed-pulse"
      aria-hidden="true"
      className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center"
    >
      <span className="h-2.5 w-2.5 rounded-full bg-success motion-safe:animate-pulse" />
    </span>
  );
}
