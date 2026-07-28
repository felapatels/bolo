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

  return (
    <span className={className} aria-label={`${prefix}${value}${suffix}`}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}
