import { describe, test, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";

// ---------------------------------------------------------------------------
// TourAutoLauncher × B1 language step: the sequence is selection → home → tour.
// Regression for the fresh-account race found by qa/b1-skip-probe.mjs on
// July 30 2026: on a truly fresh account (tour not completed AND language not
// chosen) the launcher used to fire while location was still /app, and
// startTour's step-1 navigation (/app) landed in the same commit as the
// LanguageChoiceGate's Redirect to /choose-language — the two navigations
// cancelled out and the learner got the tour over a blank page instead of the
// language step. The launcher must hold until the step is resolved (explicit
// choice server-side, or the session skip marker).
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => ({
  isSignedIn: true as boolean,
  accountData: undefined as any,
  location: "/app" as string,
  startTour: vi.fn(),
  updatePrefs: vi.fn(),
}));

vi.mock("wouter", () => ({
  useLocation: () => [h.location, vi.fn()],
}));

vi.mock("@clerk/react", () => ({
  useUser: () => ({ isSignedIn: h.isSignedIn }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    getQueryData: vi.fn(() => h.accountData),
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetAccount: () => ({ data: h.accountData }),
  getGetAccountQueryKey: () => ["account"],
  useUpdateAccountPreferences: () => ({
    mutate: h.updatePrefs,
    isPending: false,
  }),
}));

vi.mock("@/lib/tour-context", () => ({
  useTour: () => ({ startTour: h.startTour }),
  TOUR_STEPS: [{ route: "/app" }],
}));

import { TourAutoLauncher } from "@/components/tour-auto-launcher";

function accountWith(learning: Partial<Record<string, unknown>> = {}) {
  return {
    preferences: {
      learning: {
        activeLanguage: "hi",
        hasCompletedTour: false,
        hasChosenLanguage: false,
        timezone: "UTC",
        ...learning,
      },
    },
  };
}

beforeEach(() => {
  h.startTour.mockClear();
  h.updatePrefs.mockClear();
  h.isSignedIn = true;
  h.location = "/app";
  window.sessionStorage.clear();
});

describe("TourAutoLauncher language-step precondition", () => {
  test("truly fresh account (no tour, language step unresolved) does NOT auto-launch", () => {
    h.accountData = accountWith();
    render(<TourAutoLauncher />);
    expect(h.startTour).not.toHaveBeenCalled();
  });

  test("launches once the language is explicitly chosen", () => {
    h.accountData = accountWith({ hasChosenLanguage: true });
    render(<TourAutoLauncher />);
    expect(h.startTour).toHaveBeenCalledTimes(1);
  });

  test("launches when the step was skipped this session (marker set)", () => {
    window.sessionStorage.setItem("bolo.langStepSkipped", "1");
    h.accountData = accountWith();
    render(<TourAutoLauncher />);
    expect(h.startTour).toHaveBeenCalledTimes(1);
  });

  test("never launches on /choose-language even with the marker set", () => {
    window.sessionStorage.setItem("bolo.langStepSkipped", "1");
    h.location = "/choose-language";
    h.accountData = accountWith();
    render(<TourAutoLauncher />);
    expect(h.startTour).not.toHaveBeenCalled();
  });

  test("completed tour never re-launches regardless of language state", () => {
    h.accountData = accountWith({
      hasCompletedTour: true,
      hasChosenLanguage: true,
    });
    render(<TourAutoLauncher />);
    expect(h.startTour).not.toHaveBeenCalled();
  });
});
