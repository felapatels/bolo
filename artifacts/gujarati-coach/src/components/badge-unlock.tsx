import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import type { EarnedBadge } from "@workspace/api-client-react";
import { Confetti } from "@/components/ui/confetti";
import { Mascot } from "@/components/mascot";
import { getBadgeIcon } from "@/lib/badge-icons";

// Full-screen "Badge unlocked!" celebration shown the moment one or more badges
// are newly earned. Fires confetti and names each badge. Dismissed by tapping
// or by the parent clearing `badges`.
export function BadgeUnlock({
  badges,
  onDismiss,
}: {
  badges: EarnedBadge[];
  onDismiss: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const active = badges.length > 0;

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onDismiss}
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm p-6"
        >
          <Confetti active={active} />

          <Mascot pose="cheer" size={128} idle="cheer" className="mb-3" />

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm font-black uppercase tracking-[0.2em] text-secondary mb-6"
          >
            {badges.length > 1 ? "Badges unlocked!" : "Badge unlocked!"}
          </motion.p>

          <div className="flex flex-col items-center gap-4 w-full max-w-sm">
            {badges.map((badge, i) => {
              const Icon = getBadgeIcon(badge.iconName);
              return (
                <motion.div
                  key={badge.key}
                  initial={
                    reduceMotion
                      ? { opacity: 0 }
                      : { opacity: 0, scale: 0.6, y: 20 }
                  }
                  animate={
                    reduceMotion
                      ? { opacity: 1 }
                      : { opacity: 1, scale: 1, y: 0 }
                  }
                  transition={
                    reduceMotion
                      ? { duration: 0.2 }
                      : {
                          delay: 0.15 + i * 0.18,
                          type: "spring",
                          stiffness: 220,
                          damping: 16,
                        }
                  }
                  className="flex flex-col items-center text-center bg-white rounded-3xl px-6 py-6 w-full border border-card-border shadow-lg"
                >
                  <div className="mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-secondary text-white shadow-lg shadow-secondary/40">
                    <Icon className="h-10 w-10" />
                  </div>
                  <p className="text-2xl font-black text-foreground">
                    {badge.title}
                  </p>
                  <p className="mt-1 text-sm font-medium text-muted-foreground">
                    {badge.description}
                  </p>
                </motion.div>
              );
            })}
          </div>

          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: reduceMotion ? 0 : 0.4 + badges.length * 0.18 }}
            onClick={onDismiss}
            className="mt-8 bg-primary text-primary-foreground font-black text-lg px-10 py-4 rounded-2xl shadow-[0_6px_0_hsl(var(--primary-shadow))] active:translate-y-1.5 active:shadow-[0_0px_0_hsl(var(--primary-shadow))] transition-all"
          >
            Awesome!
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
