// Shared bazaar dressing: the awning and the toran.
//
// Both are pure decoration, no state, no interaction, always aria-hidden, // and both draw from the fixed INDIA palette rather than theme tokens (see
// lib/india-palette.ts for why). The Bolo Bazaar storefront and the Chai
// wallet share them so a stall looks like a stall wherever it appears.
import { INDIA } from "@/lib/india-palette";

/** Stripe pattern for a market awning, at whatever width the caller gives. */
export const AWNING_STRIPES = `repeating-linear-gradient(90deg, ${INDIA.stripe} 0 22px, ${INDIA.cloth} 22px 44px)`;

/**
 * A striped market awning whose hem is cut into half-round scallops.
 *
 * ONE painted cloth, not a band plus a row of tabs: the stripes and the
 * scallops are the same background, and the hem is carved out of it with a
 * repeating circular mask. Tiling the mask at the stripe width is what keeps
 * every scallop centred on its own stripe, the earlier version laid an
 * independent flex row of rounded blocks under the band, so the two grids
 * drifted apart and the hem read as loose red squares.
 */
export function Awning({
  height = 28,
  stripeWidth = 22,
}: {
  height?: number;
  /** Width of one colour band. The scallops are one stripe wide. */
  stripeWidth?: number;
}) {
  const radius = stripeWidth / 2;
  const maskImage = [
    // the flat top of the awning
    "linear-gradient(#000 0 0)",
    // the hem: one half-round per stripe
    `radial-gradient(circle ${radius}px at ${radius}px 0, #000 99%, transparent 100%)`,
  ].join(", ");
  const maskSize = `100% ${height}px, ${stripeWidth}px ${radius}px`;
  const maskPosition = `0 0, 0 ${height}px`;
  const maskRepeat = "no-repeat, repeat-x";

  return (
    <div
      aria-hidden="true"
      data-testid="awning"
      style={{
        height: height + radius,
        backgroundImage: `repeating-linear-gradient(90deg, ${INDIA.stripe} 0 ${stripeWidth}px, ${INDIA.cloth} ${stripeWidth}px ${stripeWidth * 2}px)`,
        maskImage,
        maskSize,
        maskPosition,
        maskRepeat,
        WebkitMaskImage: maskImage,
        WebkitMaskSize: maskSize,
        WebkitMaskPosition: maskPosition,
        WebkitMaskRepeat: maskRepeat,
      }}
    />
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
