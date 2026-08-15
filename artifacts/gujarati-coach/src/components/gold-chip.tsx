/**
 * The gold status pill.
 *
 * One shape, three surfaces: the language picker's All-Access chip, and now the
 * First Class chip on leaderboard and feed rows. The gradient, the ring and the
 * brown-on-gold text were settled on the picker; typing them a third time is how
 * two golds end up half a shade apart.
 *
 * Gold means STATUS SOMEBODY PAID FOR, and nothing else. A leaderboard position
 * is not bought, which is why rank stays indigo.
 */
import { Star } from "lucide-react";

export function GoldChip({
  children,
  testId,
  ariaLabel,
}: {
  children: React.ReactNode;
  testId?: string;
  ariaLabel?: string;
}) {
  return (
    <span
      data-testid={testId}
      aria-label={ariaLabel}
      className="inline-flex w-fit items-center gap-0.5 whitespace-nowrap rounded-full bg-gradient-to-b from-[#FFD65A] to-[#F0A202] px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-[#4A2C00] shadow-[0_1px_0_rgba(0,0,0,0.28)] ring-1 ring-white/70"
    >
      <Star className="h-2 w-2 fill-[#4A2C00]" />
      {children}
    </span>
  );
}

/**
 * First Class, on a friend's row. Renders only while the window is open — the
 * server sends a boolean and never an expiry, so there is nothing to count down.
 */
export function FirstClassChip() {
  return (
    <GoldChip testId="row-first-class" ariaLabel="First Class">
      First Class
    </GoldChip>
  );
}
