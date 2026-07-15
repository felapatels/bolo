import { useState } from "react";
import { motion } from "framer-motion";
import { useReducedMotion } from "framer-motion";
import { Lightbulb } from "lucide-react";
import { pickFact } from "@/lib/india-facts";

/**
 * Replaces a bare spinner in primary loading spots with an animated India fun
 * fact card. The fact is picked once on mount (stable for the duration of the
 * load) and never repeats back-to-back across the session.
 *
 * Respects the OS "prefers-reduced-motion" setting: when motion is reduced
 * the card appears instantly without the fade-up entrance animation.
 */
export function FunFactLoader({ className }: { className?: string }) {
  // Pick once on mount so the fact doesn't re-roll if the parent re-renders
  // while still loading.
  const [fact] = useState<string>(pickFact);
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduceMotion
          ? { duration: 0.001 }
          : { duration: 0.45, ease: "easeOut", delay: 0.15 }
      }
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary/70">
          <Lightbulb className="w-3.5 h-3.5" />
          <span>Did you know?</span>
        </div>
        <p className="text-sm font-medium text-muted-foreground leading-relaxed max-w-xs">
          {fact}
        </p>
      </div>
    </motion.div>
  );
}

/**
 * A standalone section-level loader: shows a fun fact centered in a padded
 * container, replacing a bare spinner in lists/tabs that are still fetching.
 */
export function FunFactSectionLoader() {
  return (
    <div className="flex justify-center py-10">
      <FunFactLoader className="max-w-sm px-4" />
    </div>
  );
}
