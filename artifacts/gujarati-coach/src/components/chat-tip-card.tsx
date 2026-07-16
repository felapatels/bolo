import { useState, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Lightbulb } from "lucide-react";
import { INDIA_FACTS } from "@/lib/india-facts";

const ROTATE_INTERVAL_MS = 4000;

/**
 * Rotating tip card shown under Bolo while the server is processing a reply.
 * Cycles through India fun facts every 4 s with a gentle fade transition.
 * Under prefers-reduced-motion the card appears instantly and never rotates.
 */
export function ChatTipCard() {
  const reduceMotion = useReducedMotion();
  const [idx, setIdx] = useState<number>(
    () => Math.floor(Math.random() * INDIA_FACTS.length),
  );

  useEffect(() => {
    if (reduceMotion) return;
    const id = setInterval(() => {
      setIdx((prev) => (prev + 1) % INDIA_FACTS.length);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [reduceMotion]);

  return (
    <div className="mx-4 mb-2">
      <AnimatePresence mode="wait">
        <motion.div
          key={idx}
          initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? {} : { opacity: 0, y: -6 }}
          transition={
            reduceMotion ? { duration: 0.001 } : { duration: 0.4, ease: "easeOut" }
          }
          className="rounded-xl border border-card-border bg-white p-3"
        >
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary/70">
            <Lightbulb className="h-3 w-3" />
            <span>Did you know?</span>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {INDIA_FACTS[idx]}
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
