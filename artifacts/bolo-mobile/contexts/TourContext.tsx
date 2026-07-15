import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { View } from 'react-native';

export interface TourStep {
  title: string;
  body: string;
  /**
   * Optional ref to a View on screen. When provided, the tour overlay will
   * spotlight (cut a transparent hole around) that element while dimming the
   * rest of the screen. Steps without a ref fall back to the full-screen
   * caption card.
   */
  highlightRef?: React.RefObject<View>;
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
  /**
   * Register a highlight ref for a specific step by index.
   *
   * Call this from the screen that owns the UI element you want spotlighted.
   * The ref is merged into the step at the given index; it does NOT replace
   * the full step so title/body are preserved.
   *
   * Example:
   * ```tsx
   * const streakRef = useRef<View>(null);
   * const { registerHighlightRef } = useTour();
   * useEffect(() => { registerHighlightRef(1, streakRef); }, []);
   * // …
   * <View ref={streakRef}>…</View>
   * ```
   */
  registerHighlightRef: (stepIndex: number, ref: React.RefObject<View>) => void;
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
  // Mutable step list so we can attach refs without triggering re-renders for
  // unrelated consumers. We keep a parallel state counter so GuidedTour re-
  // renders when a ref is registered.
  const stepsRef = useRef<TourStep[]>(TOUR_STEPS.map((s) => ({ ...s })));
  const [, setRefVersion] = useState(0);

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
      if (next >= stepsRef.current.length) {
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

  const registerHighlightRef = useCallback(
    (stepIndex: number, ref: React.RefObject<View>) => {
      if (stepIndex < 0 || stepIndex >= stepsRef.current.length) return;
      stepsRef.current[stepIndex] = {
        ...stepsRef.current[stepIndex],
        highlightRef: ref,
      };
      // Nudge consumers (GuidedTour) to re-read the step list.
      setRefVersion((v) => v + 1);
    },
    [],
  );

  return (
    <TourContext.Provider
      value={{
        isOpen,
        steps: stepsRef.current,
        currentIndex,
        openTour,
        goNext,
        skip,
        registerHighlightRef,
      }}
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
