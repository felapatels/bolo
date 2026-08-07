// Shared bazaar dressing: the awning and the toran.
//
// Both are pure decoration — no state, no interaction, always aria-hidden —
// and both draw from the fixed INDIA palette rather than theme tokens (see
// lib/india-palette.ts for why). The Bolo Bazaar storefront and the Chai
// wallet share them so a stall looks like a stall wherever it appears.
import { INDIA } from "@/lib/india-palette";

/** Stripe pattern for a market awning, at whatever width the caller gives. */
export const AWNING_STRIPES = `repeating-linear-gradient(90deg, ${INDIA.stripe} 0 22px, ${INDIA.cloth} 22px 44px)`;

/**
 * A striped awning with its scalloped hem. `scallops` sets how many half-rounds
 * the hem is cut into — fewer for a narrow tile, more for a full-width shop.
 */
export function Awning({
  height = 28,
  hemHeight = 12,
  scallops = 16,
  stripeWidth = 22,
}: {
  height?: number;
  hemHeight?: number;
  scallops?: number;
  stripeWidth?: number;
}) {
  return (
    <div aria-hidden="true">
      <div
        style={{
          height,
          backgroundImage: `repeating-linear-gradient(90deg, ${INDIA.stripe} 0 ${stripeWidth}px, ${INDIA.cloth} ${stripeWidth}px ${stripeWidth * 2}px)`,
        }}
      />
      <div className="flex w-full">
        {Array.from({ length: scallops }).map((_, i) => (
          <span
            key={i}
            className="flex-1 rounded-b-full"
            style={{
              height: hemHeight,
              background: i % 2 === 0 ? INDIA.stripe : INDIA.cloth,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** A toran of marigolds on a thread, the way a shop dresses for a festival. */
export function MarigoldString({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`} aria-hidden="true">
      <span className="h-px flex-1" style={{ background: INDIA.gold }} />
      {Array.from({ length: 7 }).map((_, i) => (
        <span
          key={i}
          className="block rounded-full"
          style={{
            width: i % 2 === 0 ? 8 : 5,
            height: i % 2 === 0 ? 8 : 5,
            background: i % 2 === 0 ? INDIA.gold : INDIA.stripe,
          }}
        />
      ))}
      <span className="h-px flex-1" style={{ background: INDIA.gold }} />
    </div>
  );
}
