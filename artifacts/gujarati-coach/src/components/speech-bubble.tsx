import { cn } from "@/lib/utils";

/**
 * A line from Bolo, in a bubble with a tail pointing at the bird beside it.
 *
 * Ported in build 23 from mobile's components/SpeechBubble.tsx (build 22, the
 * owner's Progress mockup: "Nice work, Alex! You're 6 phrases away from
 * Phrase Master."). The tail is a rotated square drawn twice, border colour
 * under card colour, so the bubble's hairline carries round the point. Pass a
 * nested <span> to colour a word.
 *
 * Mobile twin: bolo-mobile/components/SpeechBubble.tsx. Keep the three tails
 * in step: 'right' for a bird beside the bubble, 'up' for a bird above it (a
 * header too tight to seat the bubble beside the bird, the Leaderboard),
 * 'down' for a bird below it (the paywall).
 */
const TAIL = 12;

export function SpeechBubble({
  children,
  className,
  testId,
  tail = "right",
}: {
  children: React.ReactNode;
  className?: string;
  testId?: string;
  tail?: "right" | "up" | "down";
}) {
  const outer: React.CSSProperties =
    tail === "up"
      ? { top: -TAIL / 2, right: 22 - 0.75 }
      : tail === "down"
        ? { bottom: -TAIL / 2, left: "50%", marginLeft: -(TAIL + 1.5) / 2 }
        : { right: -TAIL / 2, top: "50%", marginTop: -(TAIL + 1.5) / 2 };
  const inner: React.CSSProperties =
    tail === "up"
      ? { top: -TAIL / 2 + 1, right: 22 }
      : tail === "down"
        ? { bottom: -TAIL / 2 + 1, left: "50%", marginLeft: -TAIL / 2 }
        : { right: -TAIL / 2 + 1, top: "50%", marginTop: -TAIL / 2 };
  return (
    <div className={cn("relative w-fit max-w-full", className)} data-testid={testId}>
      <div className="rounded-[14px] border border-card-border bg-card px-3.5 py-2.5 text-[13px] font-semibold leading-[19px] text-foreground shadow-[0_2px_6px_rgba(26,19,56,0.06)]">
        {children}
      </div>
      <span
        aria-hidden
        className="pointer-events-none absolute rotate-45 rounded-[2px] bg-card-border"
        style={{ width: TAIL + 1.5, height: TAIL + 1.5, ...outer }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute rotate-45 rounded-[2px] bg-card"
        style={{ width: TAIL, height: TAIL, ...inner }}
      />
    </div>
  );
}
