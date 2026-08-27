/**
 * A number that counts up to itself once, on arrival.
 *
 * Mobile twin: bolo-mobile/components/CountUpText.tsx, which the practice and
 * review summaries have used since Spec 1 v3 §4.4. Ported here on 2026-08-27 by
 * the parity sweep the owner asked for, after the home stats bar gained the
 * count-up on mobile: "I like that the progress page counts up the numbers when
 * it loads, have the home stats bar do the same."
 *
 * TWO THINGS THAT LOOK OPTIONAL AND ARE NOT, both learned on the mobile twin:
 *
 * 1. TABULAR FIGURES. Proportional digits are different widths, so a number
 *    climbing through them jitters sideways the whole way up. `tabular-nums`
 *    makes every digit the same width and the count sits still.
 *
 * 2. A RESERVED WIDTH. Without it a cell counting 0 to 358 is one character
 *    wide when it starts and three when it lands, and in a four-cell flex row
 *    that reflows its neighbours for the whole animation.
 *
 *    THIS IS THE ONE PLACE THE TWO PLATFORMS DIVERGE, on purpose. The mobile
 *    twin reserves the width with an invisible Text carrying the final value,
 *    because React Native has no `ch` unit. On the web that trick puts the
 *    number in the DOM TWICE, which is not merely untidy: it broke
 *    home-stats-banner's `getByText`, and a test that cannot find one node is
 *    telling the truth about a screen reader that would find two. Under
 *    `tabular-nums` every digit is exactly 1ch, so the digit COUNT is all the
 *    width reservation needs, and nothing is duplicated.
 *
 * IT COUNTS ONCE, ON MOUNT. A later refetch that changes the value must not
 * replay the animation at somebody who is reading the page, so the effect runs
 * for the mount and the displayed number simply follows the prop after that.
 *
 * Reduced motion renders the final value immediately: this is decoration on a
 * number that is already correct.
 */
import React from "react";
import { useReducedMotion } from "framer-motion";

const DURATION_MS = 700;

export function CountUpNumber({
  value,
  className,
  durationMs = DURATION_MS,
}: {
  value: number;
  className?: string;
  durationMs?: number;
}) {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = React.useState(reduceMotion ? value : 0);
  // The value to count TO, read at animation time, so a refetch mid-count lands
  // on the new number rather than the stale one.
  const target = React.useRef(value);
  target.current = value;
  // Whether the one count has already been spent.
  const counted = React.useRef(false);

  React.useEffect(() => {
    if (reduceMotion || counted.current) {
      setShown(target.current);
      return;
    }
    counted.current = true;
    const started = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - started) / durationMs, 1);
      // Same ease-out cubic the mobile twin uses, so the two feel alike.
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(eased * target.current));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Mount only, deliberately: see "IT COUNTS ONCE" above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion, durationMs]);

  // After the one count is spent, follow the prop.
  React.useEffect(() => {
    if (counted.current) setShown(value);
  }, [value]);

  return (
    <span
      className={`inline-block text-left tabular-nums ${className ?? ""}`}
      // The final value's digit count, in digit widths. Negative numbers are
      // not a thing on this row, but the sign would be counted too if they were.
      style={{ minWidth: `${String(value).length}ch` }}
    >
      {shown}
    </span>
  );
}
