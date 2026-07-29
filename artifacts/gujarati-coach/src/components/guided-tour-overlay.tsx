import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTour } from "@/lib/tour-context";
import { springs } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Mascot } from "@/components/mascot";

const NAV_HIGHLIGHT_LABELS: Record<string, string> = {
  home: "Home",
  chat: "Bolo (Chat)",
  games: "Games",
  progress: "Progress",
};

/**
 * Returns Tailwind positioning classes for the tour card based on where the
 * step wants to anchor itself on screen.
 *
 * - top    → below the page header so content below is fully visible
 * - center → vertically centred (default, good for full-page steps)
 * - bottom → just above the bottom nav so nav-tab highlights are visible;
 *            falls back to centered on desktop where nav lives in the sidebar
 */
function cardPositionClasses(pos: "top" | "center" | "bottom" | undefined) {
  switch (pos) {
    case "top":
      return "top-20 sm:top-24";
    case "bottom":
      // On desktop (lg+) there is no bottom nav — center the card instead.
      return "bottom-24 lg:bottom-auto lg:top-1/2 lg:-translate-y-1/2";
    case "center":
    default:
      return "top-1/2 -translate-y-1/2";
  }
}

/**
 * Full-screen overlay that renders the guided tour.
 *
 * Mount this once at the app root — it reads all state from `TourContext` and
 * renders nothing when the tour is closed. Navigation between pages is handled
 * inside TourProvider; this component is purely presentational.
 *
 * The card re-mounts (with entry animation) whenever its `cardPosition`
 * changes between steps, so it visually travels to the relevant screen area.
 * Bolo the parrot hovers above the card and swaps poses with a springy
 * entrance on each step advance.
 */
export function GuidedTourOverlay() {
  const { isOpen, currentStep, steps, nextStep, prevStep, skipTour, currentNavHighlight } =
    useTour();

  // Respect the OS-level reduced-motion preference: framer-motion springs keep
  // playing under the global CSS reset, so gate them explicitly here.
  const reduceMotion = useReducedMotion();

  const step = steps[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;
  const total = steps.length;

  const highlightLabel = currentNavHighlight
    ? NAV_HIGHLIGHT_LABELS[currentNavHighlight]
    : null;

  // Changing the key causes the card to unmount + remount with its entry
  // animation whenever the desired screen position changes between steps.
  const cardKey = `tour-card-${step?.cardPosition ?? "center"}`;

  // Current pose — fall back to "wave" if a custom step doesn't specify one.
  const mascotPose = step?.mascotPose ?? "wave";
  // Final step celebrates; all others use the gentle float.
  const mascotIdle = isLast ? "cheer" : "float";

  return (
    <AnimatePresence>
      {isOpen && step && (
        <>
          {/* Backdrop — light tint only, no blur, so the page behind is readable */}
          <motion.div
            key="tour-backdrop"
            className="fixed inset-0 z-[200] bg-black/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={skipTour}
            aria-hidden="true"
          />

          {/* Card — repositions per step via cardKey remount */}
          <motion.div
            key={cardKey}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tour-title"
            aria-describedby="tour-body"
            className={cn(
              "fixed inset-x-4 z-[201] mx-auto max-w-sm",
              "overflow-visible rounded-3xl border border-card-border bg-card shadow-2xl",
              cardPositionClasses(step.cardPosition),
            )}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.97 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
            transition={reduceMotion ? { duration: 0.15 } : springs.bouncy}
          >
            {/* Bolo the parrot — floats centered above the card's top edge */}
            <div className="absolute inset-x-0 -top-14 flex justify-center" aria-hidden="true">
              {/* No keyed remount per step anymore — the rigged mascot
                  spring-morphs its body parts between the step poses. */}
              <Mascot pose={mascotPose} size={104} idle={mascotIdle} />
            </div>

            {/* Card content — padded on top to clear the mascot overlap */}
            <div className="p-6 pt-16">
              {/* Header row */}
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  {/* Step dots */}
                  <div className="flex gap-1.5" aria-hidden="true">
                    {steps.map((_, i) => (
                      <span
                        key={i}
                        className={cn(
                          "h-2 rounded-full transition-all duration-300",
                          i === currentStep
                            ? "w-5 bg-primary"
                            : "w-2 bg-muted-foreground/30",
                        )}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {currentStep + 1} / {total}
                  </span>
                </div>

                <button
                  onClick={skipTour}
                  aria-label="Skip tour"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Step content */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 12 }}
                  animate={reduceMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -12 }}
                  transition={reduceMotion ? { duration: 0.1 } : springs.snappy}
                >
                  <h2
                    id="tour-title"
                    className="mb-2 text-xl font-black tracking-tight text-foreground"
                  >
                    {step.title}
                  </h2>
                  <p
                    id="tour-body"
                    className="text-sm leading-relaxed text-muted-foreground"
                  >
                    {step.body}
                  </p>

                  {/* Nav highlight hint */}
                  {highlightLabel && (
                    <p className="mt-3 hidden text-xs font-semibold text-primary/80 lg:block">
                      👈 See the <span className="font-black">{highlightLabel}</span> section in the sidebar
                    </p>
                  )}
                  {highlightLabel && (
                    <p className="mt-3 text-xs font-semibold text-primary/80 lg:hidden">
                      👇 See the <span className="font-black">{highlightLabel}</span> tab below
                    </p>
                  )}
                </motion.div>
              </AnimatePresence>

              {/* Navigation */}
              <div className="mt-6 flex items-center gap-2">
                {!isFirst && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={prevStep}
                    aria-label="Previous step"
                    className="shrink-0"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                )}

                <Button
                  onClick={isLast ? skipTour : nextStep}
                  className="flex-1"
                  size="sm"
                >
                  {isLast ? (
                    "Get started"
                  ) : (
                    <>
                      Next
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </>
                  )}
                </Button>

                {!isLast && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={skipTour}
                    className="shrink-0 text-muted-foreground"
                  >
                    Skip
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
