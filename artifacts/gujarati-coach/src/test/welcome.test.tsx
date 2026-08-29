import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// THE FIRST-RUN WALKTHROUGH CARDS, build 19 (the Play testers' ask). Mobile
// twin: bolo-mobile/__tests__/welcome-walkthrough.test.tsx, same pins.
const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  mutate: vi.fn(),
  track: vi.fn(),
  /** undefined = still loading. */
  account: undefined as unknown,
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/welcome", h.navigate],
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ getQueryData: vi.fn(() => undefined), setQueryData: vi.fn() }),
}));

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  useUpdateAccountPreferences: () => ({ mutate: h.mutate, isPending: false }),
  getGetAccountQueryKey: () => ["account"],
  useGetAccount: () => h.account,
}));

// Step one is the real picker dialog; here only its open state matters.
vi.mock("@/components/language-picker", () => ({
  LanguagePicker: ({ open }: { open: boolean }) =>
    open ? <div data-testid="language-picker-open" /> : null,
}));

vi.mock("@/lib/analytics", () => ({
  track: (...args: unknown[]) => h.track(...args),
  ANALYTICS_EVENTS: { WALKTHROUGH_FINISHED: "walkthrough_finished" },
}));

vi.mock("@/components/mascot", () => ({
  Mascot: ({ pose }: { pose: string }) => <div data-testid={`mascot-${pose}`} />,
}));

import Welcome from "@/pages/welcome";
import {
  WALKTHROUGH_STEPS,
  firstRunPath,
  hasDismissedWalkthrough,
  WELCOME,
} from "@/lib/walkthrough";

function accountWith(hasChosenLanguage: boolean) {
  return { data: { preferences: { learning: { hasChosenLanguage } } }, isLoading: false };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  h.account = accountWith(true);
});

describe("firstRunPath", () => {
  test("any account that owes the walkthrough goes to the cards, chosen language or not", () => {
    expect(firstRunPath({ hasCompletedTour: false, hasChosenLanguage: false })).toBe(WELCOME);
    expect(firstRunPath({ hasCompletedTour: false, hasChosenLanguage: true })).toBe(WELCOME);
    expect(WELCOME).toBe("/welcome");
  });

  test("a finished account goes nowhere, and so does an OMITTED flag", () => {
    expect(firstRunPath({ hasCompletedTour: true, hasChosenLanguage: false })).toBeNull();
    // Nagging every learner on every visit is the failure to fear.
    expect(firstRunPath({ hasChosenLanguage: false })).toBeNull();
  });
});

describe("step one, the language picker", () => {
  test("opens the picker dialog over card one for an account that has not chosen", () => {
    h.account = accountWith(false);
    render(<Welcome />);
    expect(screen.getByTestId("language-picker-open")).toBeInTheDocument();
    expect(screen.getByTestId("walkthrough-title")).toHaveTextContent(WALKTHROUGH_STEPS[0]!.title);
  });

  test("never opens it for an account that already chose, and waits while loading", () => {
    render(<Welcome />);
    expect(screen.queryByTestId("language-picker-open")).not.toBeInTheDocument();
    h.account = { data: undefined, isLoading: true };
    render(<Welcome />);
    expect(screen.queryByTestId("language-picker-open")).not.toBeInTheDocument();
  });
});

describe("the cards", () => {
  test("four cards, Next walks them, one says Bolo learns you, the last button is Let's go", () => {
    expect(WALKTHROUGH_STEPS).toHaveLength(4);
    // Owner, 2026-08-29: the walkthrough must say Bolo learns from you and
    // gets more accurate and personal as you go.
    expect(WALKTHROUGH_STEPS.map((s) => s.title)).toContain("Bolo learns you");
    render(<Welcome />);
    expect(screen.getByTestId("walkthrough-title")).toHaveTextContent(WALKTHROUGH_STEPS[0]!.title);
    expect(screen.getByTestId(`mascot-${WALKTHROUGH_STEPS[0]!.pose}`)).toBeInTheDocument();
    expect(screen.getAllByTestId("walkthrough-dot")).toHaveLength(3);

    fireEvent.click(screen.getByTestId("walkthrough-next"));
    expect(screen.getByTestId("walkthrough-title")).toHaveTextContent(WALKTHROUGH_STEPS[1]!.title);
    fireEvent.click(screen.getByTestId("walkthrough-next"));
    expect(screen.getByTestId("walkthrough-title")).toHaveTextContent(WALKTHROUGH_STEPS[2]!.title);
    fireEvent.click(screen.getByTestId("walkthrough-next"));
    expect(screen.getByTestId("walkthrough-title")).toHaveTextContent(WALKTHROUGH_STEPS[3]!.title);
    expect(screen.getByTestId("walkthrough-next")).toHaveTextContent("Let's go");

    // Walking the cards writes nothing.
    expect(h.mutate).not.toHaveBeenCalled();
    expect(h.navigate).not.toHaveBeenCalled();
  });

  test("Let's go retires the walkthrough for the account and lands on home", () => {
    render(<Welcome />);
    fireEvent.click(screen.getByTestId("walkthrough-next"));
    fireEvent.click(screen.getByTestId("walkthrough-next"));
    fireEvent.click(screen.getByTestId("walkthrough-next"));
    fireEvent.click(screen.getByTestId("walkthrough-next"));

    expect(h.mutate).toHaveBeenCalledTimes(1);
    expect(h.mutate.mock.calls[0]![0]).toEqual({ data: { hasCompletedTour: true } });
    expect(h.navigate).toHaveBeenCalledWith("/app");
    expect(hasDismissedWalkthrough()).toBe(true);
    expect(h.track).toHaveBeenCalledWith("walkthrough_finished", { reason: "done", step: 3 });
  });

  test("Skip does the same from any card, and says which one", () => {
    render(<Welcome />);
    fireEvent.click(screen.getByTestId("walkthrough-next"));
    fireEvent.click(screen.getByTestId("walkthrough-skip"));

    expect(h.mutate).toHaveBeenCalledTimes(1);
    expect(h.mutate.mock.calls[0]![0]).toEqual({ data: { hasCompletedTour: true } });
    expect(h.navigate).toHaveBeenCalledWith("/app");
    expect(hasDismissedWalkthrough()).toBe(true);
    expect(h.track).toHaveBeenCalledWith("walkthrough_finished", { reason: "skipped", step: 1 });
  });
});
