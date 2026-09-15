// THE VOICE BARS' FEED, for a game that records through hooks/useSpeakAndScore.
//
// Owner, 2026-09-14, on Last Call in the simulator: "add a voice visualizer to
// that game so you know that your voice is getting recognized". The mobile twin
// wires it inline in last-call.tsx and answer-back.tsx; web keeps one copy here
// for both games.
//
// IT IS WEB PRACTICE'S WIRING, restated rather than invented (practice.tsx,
// "Spec D2: live input amplitude"): one requestAnimationFrame loop reads the
// recorder's amplitude into a MotionValue, so the bars move without React
// renders, and React state holds only the two slow facts, the reduced-motion
// level segments and the can't-hear-you flag. Practice still carries its own
// inline copy, which also drives its mascot; if its thresholds move, these move
// with them.

import { useEffect, useState } from "react";
import { useMotionValue, type MotionValue } from "framer-motion";
import { prefersReducedMotion } from "@/lib/motionPrefs";

/** At or under this the take reads as silent (practice's value). */
const QUIET_AMPLITUDE = 0.04;
/** This long silent while recording and the hint shows (Spec D2 rule 7). */
const NO_INPUT_MS = 1500;

export function useInputLevel(
  recording: boolean,
  getAmplitude: () => number,
): {
  /** Live level, 0..1, for SoundWavePulse's amplitude prop. */
  amplitude: MotionValue<number>;
  /** 0..5 lit segments, only under reduced motion, where the bars must not dance. */
  level: number;
  /** True after NO_INPUT_MS of near-silence: most likely a muted or wrong mic. */
  noInput: boolean;
} {
  const amplitude = useMotionValue(0);
  const [level, setLevel] = useState(0);
  const [noInput, setNoInput] = useState(false);

  useEffect(() => {
    if (!recording) {
      amplitude.set(0);
      setLevel(0);
      setNoInput(false);
      return;
    }
    let raf = 0;
    let lastLoudAt = performance.now();
    const loop = () => {
      const amp = getAmplitude();
      // Re-read each frame, as practice does, so a preference change mid-take
      // swaps the bars and the segments at once.
      if (!prefersReducedMotion()) {
        amplitude.set(amp);
      } else {
        amplitude.set(0);
        setLevel(Math.min(5, Math.round(Math.min(1, amp) * 5)));
      }
      const now = performance.now();
      if (amp > QUIET_AMPLITUDE) lastLoudAt = now;
      setNoInput(now - lastLoudAt > NO_INPUT_MS);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [recording, getAmplitude, amplitude]);

  return { amplitude, level, noInput };
}
