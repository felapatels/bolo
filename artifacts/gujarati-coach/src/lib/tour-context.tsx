import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TourStep {
  /** Short heading shown in the overlay card. */
  title: string;
  /** One or two sentences of body copy for this step. */
  body: string;
  /**
   * Wouter path to navigate to when this step becomes active.
   * Omit for steps that should stay on whatever page is currently showing.
   */
  route?: string;
  /** Which bottom-nav / sidebar tab to visually highlight for this step. */
  navHighlight?: "home" | "chat" | "games" | "progress";
  /**
   * Where on screen to anchor the tour card for this step.
   *
   * - "top"    — below the header, useful when content lives in the lower half
   * - "center" — vertically centred (default)
   * - "bottom" — just above the bottom nav, useful when pointing at a nav tab
   */
  cardPosition?: "top" | "center" | "bottom";
}

// ---------------------------------------------------------------------------
// The real welcome tour — a quick feature walkthrough for first-time learners.
// Keep copy short, warm, and in Bolo's friendly voice. Plus-only features are
// labelled honestly so free learners aren't surprised later.
// ---------------------------------------------------------------------------
export const TOUR_STEPS: TourStep[] = [
  {
    title: "Welcome to Bolo! 👋",
    body: "Bolo! helps you reconnect with your heritage language through short, enjoyable daily sessions. Here's a quick look around!",
    route: "/app",
    navHighlight: "home",
    cardPosition: "center",
  },
  {
    title: "Pick a topic 🗂️",
    body: "The cards on your home screen are bite-sized lessons — greetings, family, food and more. Tap one to learn real phrases, then practice saying them out loud.",
    route: "/app",
    navHighlight: "home",
    cardPosition: "top",
  },
  {
    title: "Chat with Bolo 🦜",
    body: "Tap \"Chat with Bolo\" to have a real conversation with your parrot coach. Speak (or listen) at your own pace — Bolo keeps it friendly and simple.",
    route: "/chat",
    navHighlight: "chat",
    cardPosition: "center",
  },
  {
    title: "Play your way to fluency 🎮",
    body: "The Games tab has six mini games: Word Match, Listen & Pick, Phrase Builder, and Speed Round are free — plus Script Trace and Bolo Quiz for Plus members.",
    route: "/games",
    navHighlight: "games",
    cardPosition: "bottom",
  },
  {
    title: "Watch yourself grow 📈",
    body: "Your streak, XP and badges live on the Progress tab. With Plus, smart review sessions bring back your trickiest phrases right when you need them.",
    route: "/progress",
    navHighlight: "progress",
    cardPosition: "bottom",
  },
  {
    title: "You're all set! 🎉",
    body: "That's the grand tour! Start with any topic that catches your eye — a few minutes a day is all it takes. Happy learning!",
    route: "/app",
    navHighlight: "home",
    cardPosition: "center",
  },
];

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type TourContextValue = {
  isOpen: boolean;
  currentStep: number;
  steps: TourStep[];
  /** The navHighlight value of the current step, or undefined if none. */
  currentNavHighlight: TourStep["navHighlight"];
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
  const [, setLocation] = useLocation();

  // Store the caller's completion callback in a ref so startTour needn't be
  // re-created every time (avoids triggering downstream effects).
  const onDoneRef = useRef<(() => void) | undefined>(undefined);

  // Navigate to the active step's route whenever the step changes and tour is open.
  useEffect(() => {
    if (!isOpen) return;
    const step = steps[currentStep];
    if (step?.route) {
      setLocation(step.route);
    }
  }, [isOpen, currentStep, steps, setLocation]);

  const finishTour = useCallback(() => {
    setIsOpen(false);
    onDoneRef.current?.();
  }, []);

  const startTour = useCallback(
    (opts?: { steps?: TourStep[]; onDone?: () => void }) => {
      const newSteps = opts?.steps ?? TOUR_STEPS;
      setSteps(newSteps);
      setCurrentStep(0);
      onDoneRef.current = opts?.onDone;
      setIsOpen(true);
      // Navigate to the first step's route immediately.
      const firstRoute = newSteps[0]?.route;
      if (firstRoute) {
        setLocation(firstRoute);
      }
    },
    [setLocation],
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

  const currentNavHighlight = steps[currentStep]?.navHighlight;

  // Expose stable references to consumers.
  const value: TourContextValue = {
    isOpen,
    currentStep,
    steps,
    currentNavHighlight,
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
  currentNavHighlight: undefined,
  startTour: () => {},
  nextStep: () => {},
  prevStep: () => {},
  skipTour: () => {},
};

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  return ctx ?? NOOP_TOUR;
}
