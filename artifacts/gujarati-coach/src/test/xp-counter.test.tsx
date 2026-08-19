/**
 * Web XP strip component tests, the three visual states of the daily train
 * class ladder.
 *
 * The strip used to render `todayXp / dailyGoal`, an XP total over an ATTEMPTS
 * target, which read "254/10 XP" with the bar clamped full. It now renders
 * whatever the shared ladder in @workspace/train-class returns, and re-derives
 * nothing itself.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const h = vi.hoisted(() => ({ todayXp: 0 }));

vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({
    languages: [],
    activeLang: "gu",
    activeLanguage: undefined,
    timezone: "Asia/Kolkata",
    setActiveLang: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
  }),
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetProgressSummary: () => ({ data: { todayXp: h.todayXp } }),
  getGetProgressSummaryQueryKey: (params: unknown) => ["progress", params],
}));

import { XpCounter } from "@/components/XpCounter";

beforeEach(() => {
  cleanup();
  h.todayXp = 0;
});

describe("XpCounter, below the first rung (no class yet)", () => {
  test("fills toward Local and names no class", () => {
    h.todayXp = 40;
    render(<XpCounter variant="chrome" />);

    expect(screen.getByTestId("xp-counter")).toHaveTextContent("40/100");
    expect(screen.queryByTestId("xp-train-class")).not.toBeInTheDocument();
    expect(screen.getByTestId("xp-meter-bar")).toBeInTheDocument();
    expect(screen.getByLabelText("40 of 100 XP today")).toBeInTheDocument();
  });

  test("never names the goal it used to divide by", () => {
    h.todayXp = 254;
    render(<XpCounter variant="chrome" />);
    // The old bug: an attempts goal of 10 as the denominator.
    expect(screen.getByTestId("xp-counter")).not.toHaveTextContent("254/10");
  });
});

describe("XpCounter, mid-ladder (a class in hand)", () => {
  test("shows the held class beside the next rung", () => {
    h.todayXp = 254;
    render(<XpCounter variant="chrome" />);

    expect(screen.getByTestId("xp-counter")).toHaveTextContent("254/400");
    expect(screen.getByTestId("xp-train-class")).toHaveTextContent("Superfast");
    expect(screen.getByTestId("xp-meter-bar")).toBeInTheDocument();
    expect(
      screen.getByLabelText("254 of 400 XP today, Superfast class"),
    ).toBeInTheDocument();
  });

  test("the bar fill matches the visible fraction, never pinned full", () => {
    h.todayXp = 254;
    render(<XpCounter variant="chrome" />);

    const fill = screen.getByTestId("xp-meter-bar").firstElementChild;
    expect(fill).toHaveStyle({ width: `${(254 / 400) * 100}%` });
  });
});

describe("XpCounter, top of the ladder", () => {
  test("renders the class name alone: no bar, no fraction", () => {
    h.todayXp = 900;
    render(<XpCounter variant="chrome" />);

    expect(screen.getByTestId("xp-train-class")).toHaveTextContent("Shatabdi");
    expect(screen.queryByTestId("xp-meter-bar")).not.toBeInTheDocument();
    // Name only: no fraction, no "XP" unit, nothing else in the element.
    expect(screen.getByTestId("xp-counter").textContent).toBe("Shatabdi");
    expect(
      screen.getByLabelText("Shatabdi class, 900 XP today, top class reached"),
    ).toBeInTheDocument();
  });
});

describe("XpCounter, compact session variant", () => {
  test("carries the class name too, so the top state is never empty", () => {
    h.todayXp = 254;
    render(<XpCounter variant="session" />);
    expect(screen.getByTestId("xp-train-class")).toHaveTextContent("Superfast");

    cleanup();
    h.todayXp = 900;
    render(<XpCounter variant="session" />);
    expect(screen.getByTestId("xp-train-class")).toHaveTextContent("Shatabdi");
  });

  test("reserves room for a three-digit-over-three-digit fraction", () => {
    h.todayXp = 254;
    render(<XpCounter variant="session" />);
    // Widened from the old min-w-[72px], which was sized when the denominator
    // was the one- or two-digit attempts goal.
    expect(screen.getByTestId("xp-counter").className).toContain(
      "min-w-[84px]",
    );
  });
});
