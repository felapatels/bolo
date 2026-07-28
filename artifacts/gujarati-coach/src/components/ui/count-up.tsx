/**
 * Count-up number reveal for session summaries (Spec 1 v3 §4.4).
 *
 * Animates from 0 to `value`. ≤700ms. Reduced motion renders the final value
 * instantly.
 */
import { useEffect, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";

export function CountUp({
  value,
  prefix = "",
  suffix = "",
  durationMs = 700,
  className,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  durationMs?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(reduceMotion ? value : 0);

  useEffect(() => {
    if (reduceMotion) {
      setDisplay(value);
      return;
    }
    const controls = animate(0, value, {
      duration: durationMs / 1000,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [value, reduceMotion, durationMs]);

  // Tabular figures + a min-width sized to the final value keep the container
  // from reflowing as the digit count grows (0 → 120 changes width twice).
  const finalText = `${prefix}${value}${suffix}`;
  return (
    <span className={className}>
      <span
        aria-hidden="true"
        style={{
          fontVariantNumeric: "tabular-nums",
          display: "inline-block",
          minWidth: `${finalText.length}ch`,
          textAlign: "center",
        }}
      >
        {prefix}
        {display}
        {suffix}
      </span>
      <span className="sr-only">{finalText}</span>
    </span>
  );
}
