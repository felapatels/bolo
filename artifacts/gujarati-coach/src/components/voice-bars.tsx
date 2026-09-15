// The voice bars for Last Call and Answer Back (owner, 2026-09-14: "add a
// voice visualizer to that game so you know that your voice is getting
// recognized"). Fed by hooks/useInputLevel.ts. Mobile twin: components/Waveform.
//
// Under reduced motion the bars must not dance, but proof the mic is live must
// not disappear either (practice's Spec D2 rule 6), so five dots fill with the
// level instead. A lit dot is FILLED and an unlit one is a hollow ring: the two
// differ by shape, not only by colour (owner, standing rule).

import { useReducedMotion, type MotionValue } from "framer-motion";
import { SoundWavePulse } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function VoiceBars({
  amplitude,
  level,
  className,
}: {
  amplitude: MotionValue<number>;
  /** 0..5, read only under reduced motion. */
  level: number;
  /** Sets the colour through currentColor, e.g. "text-white". */
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) {
    return (
      <div className={cn("flex items-center gap-1", className)} role="img" aria-label="Microphone level">
        {[1, 2, 3, 4, 5].map((seg) => (
          <span
            key={seg}
            className={cn("h-2 w-2 rounded-full", seg <= level ? "bg-current" : "border border-current")}
          />
        ))}
      </div>
    );
  }
  return <SoundWavePulse className={className} size={22} bars={7} amplitude={amplitude} />;
}
