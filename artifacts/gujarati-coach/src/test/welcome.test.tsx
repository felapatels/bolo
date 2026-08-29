import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// THE FIRST-RUN WALKTHROUGH CARDS, build 19 (the Play testers' ask). Mobile
// twin: bolo-mobile/__tests__/welcome-walkthrough.test.tsx, same pins.
const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  mutate: vi.fn(),
  track: vi.fn(),
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
  CHOOSER_THEN_WELCOME,
  WELCOME,
} from "@/lib/walkthrough";

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe("firstRunPath", () => {
  test("a fresh account goes to the chooser, asked to continue to the cards", () => {
    expect(firstRunPath({ hasCompletedTour: false, hasChosenLanguage: false })).toBe(
      CHOOSER_THEN_WELCOME,
    );
    expect(CHOOSER_THEN_WELCOME).toBe("/choose-language?next=welcome");
  });

  test("an account that already chose goes straight to the cards", () => {
    expect(firstRunPath({ hasCompletedTour: false, hasChosenLanguage: true })).toBe(WELCOME);
  });

  test("a finished account goes nowhere, and so does an OMITTED flag", () => {
    expect(firstRunPath({ hasCompletedTour: true, hasChosenLanguage: false })).toBeNull();
    // Nagging every learner on every visit is the failure to fear.
    expect(firstRunPath({ hasChosenLanguage: false })).toBeNull();
  });
});

describe("the cards", () => {
  test("three cards, Next walks them, the last button is Let's go", () => {
    expect(WALKTHROUGH_STEPS).toHaveLength(3);
    render(<Welcome />);
    expect(screen.getByTestId("walkthrough-title")).toHaveTextContent(WALKTHROUGH_STEPS[0]!.title);
    expect(screen.getByTestId(`mascot-${WALKTHROUGH_STEPS[0]!.pose}`)).toBeInTheDocument();
    expect(screen.getAllByTestId("walkthrough-dot")).toHaveLength(2);

    fireEvent.click(screen.getByTestId("walkthrough-next"));
    expect(screen.getByTestId("walkthrough-title")).toHaveTextContent(WALKTHROUGH_STEPS[1]!.title);
    fireEvent.click(screen.getByTestId("walkthrough-next"));
    expect(screen.getByTestId("walkthrough-title")).toHaveTextContent(WALKTHROUGH_STEPS[2]!.title);
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

    expect(h.mutate).toHaveBeenCalledTimes(1);
    expect(h.mutate.mock.calls[0]![0]).toEqual({ data: { hasCompletedTour: true } });
    expect(h.navigate).toHaveBeenCalledWith("/app");
    expect(hasDismissedWalkthrough()).toBe(true);
    expect(h.track).toHaveBeenCalledWith("walkthrough_finished", { reason: "done", step: 2 });
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
