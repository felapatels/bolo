import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';

export interface TourStep {
  title: string;
  body: string;
}

/**
 * Placeholder step list — replace with real content once individual product
 * features stabilize. Two trivial steps so the scaffold is obviously
 * unfinished and the tour still exercises the full open → next → done flow.
 */
export const TOUR_STEPS: TourStep[] = [
  {
    title: 'Welcome to Bolo! 🙏',
    body: 'Bolo helps you speak Indian languages through short, daily practice sessions.',
  },
  {
    title: "You're all set!",
    body: 'Tap around to explore. You can replay this tour anytime from Settings.',
  },
];

interface TourContextValue {
  isOpen: boolean;
  steps: TourStep[];
  currentIndex: number;
  /** Open (or re-open) the tour, always starting from step 0. */
  openTour: () => void;
  /**
   * Advance to the next step. On the final step this closes the tour and
   * calls the `onDone` callback supplied to `TourProvider`.
   */
  goNext: () => void;
  /**
   * Skip the tour from any step — behaves identically to finishing it:
   * closes the overlay and calls `onDone`.
   */
  skip: () => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({
  children,
  onDone,
}: {
  children: React.ReactNode;
  /**
   * Called when the tour is completed (last step → Next) or skipped.
   * Use this to persist the "tour completed" flag via the account API.
   */
  onDone?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Stable ref so goNext/skip always see the latest onDone without
  // needing it as a useCallback dependency.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const openTour = useCallback(() => {
    setCurrentIndex(0);
    setIsOpen(true);
  }, []);

  const closeAndNotify = useCallback(() => {
    setIsOpen(false);
    setCurrentIndex(0);
    onDoneRef.current?.();
  }, []);

  const goNext = useCallback(() => {
    setCurrentIndex((i) => {
      const next = i + 1;
      if (next >= TOUR_STEPS.length) {
        // Schedule close after state settles (avoids updating one component
        // while another is still rendering the current step).
        setTimeout(() => closeAndNotify(), 0);
        return i;
      }
      return next;
    });
  }, [closeAndNotify]);

  const skip = useCallback(() => {
    closeAndNotify();
  }, [closeAndNotify]);

  return (
    <TourContext.Provider
      value={{ isOpen, steps: TOUR_STEPS, currentIndex, openTour, goNext, skip }}
    >
      {children}
    </TourContext.Provider>
  );
}

/** Access the guided-tour engine. Must be called inside `<TourProvider>`. */
export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used within a TourProvider');
  return ctx;
}
