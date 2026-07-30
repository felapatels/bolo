import { describe, test, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";

// ---------------------------------------------------------------------------
// TourAutoLauncher, post-B1-gate removal (product decision, July 30 2026):
// fresh accounts land directly on home with the seeded default language and
// the tour fires on first home load — hasChosenLanguage no longer holds it.
// /choose-language stays a blocked route so a learner who navigates there
// manually never gets the tour over the selection screen.
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

describe("TourAutoLauncher first-home-load behavior", () => {
  test("a fresh account (hasChosenLanguage=false) launches the tour on home — no gate, no hold", () => {
    h.accountData = accountWith();
    render(<TourAutoLauncher />);
    expect(h.startTour).toHaveBeenCalledTimes(1);
  });

  test("launches for accounts that already chose a language", () => {
    h.accountData = accountWith({ hasChosenLanguage: true });
    render(<TourAutoLauncher />);
    expect(h.startTour).toHaveBeenCalledTimes(1);
  });

  test("never launches on /choose-language (still a blocked route)", () => {
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
