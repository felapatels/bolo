import { AnimatePresence, motion } from "framer-motion";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTour } from "@/lib/tour-context";
import { springs } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Full-screen overlay that renders the guided tour.
 *
 * Mount this once at the app root — it reads all state from `TourContext` and
 * renders nothing when the tour is closed. Individual steps are scaffold
 * placeholders; real feature-specific content will be dropped in here once the
 * relevant features stabilise.
 */
export function GuidedTourOverlay() {
  const { isOpen, currentStep, steps, nextStep, prevStep, skipTour } =
    useTour();

  const step = steps[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;
  const total = steps.length;

  return (
    <AnimatePresence>
      {isOpen && step && (
        <>
          {/* Backdrop */}
          <motion.div
            key="tour-backdrop"
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            // Clicking the backdrop acts as skip so the user can't get trapped.
            onClick={skipTour}
            aria-hidden="true"
          />

          {/* Card */}
          <motion.div
            key="tour-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tour-title"
            aria-describedby="tour-body"
            className={cn(
              "fixed inset-x-4 bottom-8 z-[201] mx-auto max-w-sm",
              "rounded-3xl border border-card-border bg-card p-6 shadow-2xl",
              "sm:bottom-1/2 sm:translate-y-1/2",
            )}
            initial={{ opacity: 0, y: 32, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={springs.bouncy}
          >
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
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={springs.snappy}
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
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
