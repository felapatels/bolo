import { ArrowDown, ArrowUp } from "lucide-react";

/**
 * Places moved since this browser last looked: an arrow AND a number, never
 * the colour alone (the owner is partially colour blind; the shape and the
 * digit carry it, the green and red only agree). Nothing at all for no
 * movement, so a still board is a quiet one.
 *
 * Mobile twin: components/leaderboard/RankDelta.tsx.
 */
export function RankDelta({ delta, size = 13 }: { delta: number | undefined; size?: number }) {
  if (!delta) return null;
  const up = delta > 0;
  const Arrow = up ? ArrowUp : ArrowDown;
  const places = Math.abs(delta);
  return (
    <span
      className={`inline-flex items-center gap-px font-extrabold ${up ? "text-success" : "text-destructive"}`}
      style={{ fontSize: size }}
      aria-label={`${up ? "up" : "down"} ${places} ${places === 1 ? "place" : "places"}`}
      data-testid={`rank-delta-${up ? "up" : "down"}`}
    >
      <Arrow style={{ width: size, height: size }} />
      {places}
    </span>
  );
}
