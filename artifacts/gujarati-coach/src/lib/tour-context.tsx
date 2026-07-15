import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TourStep {
  /** Short heading shown in the overlay card. */
  title: string;
  /** One or two sentences of body copy for this step. */
  body: string;
}

// ---------------------------------------------------------------------------
// Placeholder steps — real content is deferred until product features settle.
// Replace these with actual step descriptions once the relevant features are
// stable and ready for new-user orientation.
// ⚠️  PLACEHOLDER — do not ship these as real tour content.
// ---------------------------------------------------------------------------
export const TOUR_STEPS: TourStep[] = [
  {
    title: "Welcome to Bolo! 👋",
    body: "Bolo! helps you reconnect with your heritage language through short, enjoyable daily sessions.",
  },
  {
    title: "You're all set!",
    body: "Explore at your own pace. You can replay this tour any time from Account → Learning.",
  },
];

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type TourContextValue = {
  isOpen: boolean;
  currentStep: number;
  steps: TourStep[];
  /** Open the tour. Pass `onDone` to receive a callback when it finishes or is skipped. */
  startTour: (opts?: { steps?: TourStep[]; onDone?: () => void }) => void;
  nextStep: () => void;
  prevStep: () => void;
  /** Skip (or finish) the tour — behaves identically to reaching the last step. */
  skipTour: () => void;
};

const TourContext = createContext<TourContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function TourProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState<TourStep[]>(TOUR_STEPS);

  // Store the caller's completion callback in a ref so startTour needn't be
  // re-created every time (avoids triggering downstream effects).
  const onDoneRef = useRef<(() => void) | undefined>(undefined);

  const finishTour = useCallback(() => {
    setIsOpen(false);
    onDoneRef.current?.();
  }, []);

  const startTour = useCallback(
    (opts?: { steps?: TourStep[]; onDone?: () => void }) => {
      setSteps(opts?.steps ?? TOUR_STEPS);
      setCurrentStep(0);
      onDoneRef.current = opts?.onDone;
      setIsOpen(true);
    },
    [],
  );

  const nextStep = useCallback(
    (stepsLen: number, current: number) => {
      if (current < stepsLen - 1) {
        setCurrentStep((s) => s + 1);
      } else {
        finishTour();
      }
    },
    [finishTour],
  );

  const prevStep = useCallback(() => {
    setCurrentStep((s) => Math.max(0, s - 1));
  }, []);

  // Expose stable references to consumers.
  const value: TourContextValue = {
    isOpen,
    currentStep,
    steps,
    startTour,
    nextStep: () => nextStep(steps.length, currentStep),
    prevStep,
    skipTour: finishTour,
  };

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

// No-op fallback returned when useTour is called outside TourProvider (e.g. in
// isolated test renders). The tour simply never opens; no runtime error is thrown.
const NOOP_TOUR: TourContextValue = {
  isOpen: false,
  currentStep: 0,
  steps: [],
  startTour: () => {},
  nextStep: () => {},
  prevStep: () => {},
  skipTour: () => {},
};

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  return ctx ?? NOOP_TOUR;
}
