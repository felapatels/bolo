import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Text that shows its first few lines and expands on request.
 *
 * Written for the practice result card, where the coach's spoken feedback runs
 * to seven or eight lines on a phone and pushes the action buttons below the
 * fold, the learner had to scroll to reach "Next" after every single attempt.
 * The words are worth reading, so they are clamped rather than shortened.
 *
 * The toggle only appears when the text actually overflows, measured after
 * layout. jsdom reports zero for both heights, so the toggle is absent in
 * tests unless the metrics are stubbed.
 */
export function ClampedText({
  text,
  lines = 4,
  className,
  moreLabel = "Read more",
  lessLabel = "Show less",
  "data-testid": testId,
}: {
  text: string;
  lines?: number;
  className?: string;
  moreLabel?: string;
  lessLabel?: string;
  "data-testid"?: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    // A new attempt means new feedback: re-collapse and re-measure.
    setExpanded(false);
    const el = ref.current;
    if (!el) return;
    setOverflows(el.scrollHeight - el.clientHeight > 1);
  }, [text, lines]);

  return (
    <div className={className}>
      <p
        ref={ref}
        data-testid={testId}
        data-expanded={expanded || undefined}
        style={
          expanded
            ? undefined
            : {
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: lines,
                overflow: "hidden",
              }
        }
      >
        {text}
      </p>
      {overflows && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          data-testid={testId ? `${testId}-toggle` : undefined}
          className={cn(
            "mt-0.5 text-xs font-bold text-primary underline-offset-2",
            "hover:underline focus-visible:underline",
          )}
        >
          {expanded ? lessLabel : moreLabel}
        </button>
      )}
    </div>
  );
}
