import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";
import { FREE_ENTITLEMENTS } from "./fixtures";

// The paywall reads the locked surface's intent from the query string
// (?plan=one_language&lang=xx or ?plan=plus) and preselects the matching plan so
// the learner lands on the cheapest card that unlocks what they tapped.

const h = vi.hoisted(() => ({
  entitlements: undefined as unknown,
}));

vi.mock("@clerk/react", () => ({
  useUser: () => ({ isSignedIn: true, user: { firstName: "Test" } }),
}));

vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({
    languages: [
      { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" },
      { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
    ],
    activeLang: "gu",
    setActiveLang: vi.fn(),
    isLoading: false,
  }),
  nativeTextProps: () => ({ style: {}, dir: "ltr" as const }),
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetEntitlements: () => ({ data: h.entitlements, isLoading: false }),
    useGetProgressSummary: vi.fn(() => ({ data: undefined, isLoading: false })),
    getGetProgressSummaryQueryKey: vi.fn(() => ['progress-summary']),
  getGetEntitlementsQueryKey: () => ["entitlements"],
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
}));

vi.mock("@/lib/billing", () => ({
  beginOneLanguageCheckout: vi.fn(),
  beginAllAccessCheckout: vi.fn(),
}));

// Imported after the mocks are declared.
import Upgrade from "@/pages/upgrade";

function renderAt(path: string) {
  const { hook } = memoryLocation({ path });
  return render(
    <Router hook={hook}>
      <Upgrade />
    </Router>,
  );
}

function card(title: string) {
  return screen.getByText(title).closest("button")!;
}

beforeEach(() => {
  h.entitlements = FREE_ENTITLEMENTS;
});

describe("Paywall plan preselection", () => {
  test("defaults to All-Access when no intent is passed", () => {
    renderAt("/upgrade");

    expect(card("All-Access")).toHaveAttribute("aria-pressed", "true");
    expect(card("One Language")).toHaveAttribute("aria-pressed", "false");
  });

  test("?plan=plus preselects All-Access", () => {
    renderAt("/upgrade?plan=plus");

    expect(card("All-Access")).toHaveAttribute("aria-pressed", "true");
    expect(card("One Language")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText(/Start 7-day free trial/i)).toBeInTheDocument();
  });

  test("?plan=one_language preselects One Language without a language yet", () => {
    renderAt("/upgrade?plan=one_language");

    expect(card("One Language")).toHaveAttribute("aria-pressed", "true");
    expect(card("All-Access")).toHaveAttribute("aria-pressed", "false");
    // No language pre-picked, so the CTA nudges the learner to choose one.
    expect(screen.getByText(/Pick a language first/i)).toBeInTheDocument();
  });

  test("?plan=one_language&lang=hi preselects One Language and pre-picks Hindi", () => {
    renderAt("/upgrade?plan=one_language&lang=hi");

    expect(card("One Language")).toHaveAttribute("aria-pressed", "true");
    // A language is already chosen, so the CTA is ready to go.
    expect(screen.getByText(/Get One Language/i)).toBeInTheDocument();
    expect(screen.queryByText(/Pick a language first/i)).not.toBeInTheDocument();
  });

  test("ignores an already-unlocked language in the deep link", () => {
    // Gujarati is already free on this snapshot, so it can't be the One Language
    // pick — the paywall falls back to prompting for a choice.
    renderAt("/upgrade?plan=one_language&lang=gu");

    expect(card("One Language")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Pick a language first/i)).toBeInTheDocument();
  });
});

describe("Trial banner (daily cap arrival)", () => {
  test("shows the trial banner when reason=daily_lesson_limit", () => {
    renderAt("/upgrade?plan=plus&reason=daily_lesson_limit");

    // The banner contains text that is unique to it (not the plan card or CTA).
    expect(
      screen.getByText(/You qualify for a/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/All-Access plan is pre-selected below/i),
    ).toBeInTheDocument();
  });

  test("hides the trial banner when reason=language_locked", () => {
    renderAt("/upgrade?plan=plus&reason=language_locked");

    expect(screen.queryByText(/You qualify for a/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/All-Access plan is pre-selected below/i),
    ).not.toBeInTheDocument();
  });

  test("hides the trial banner when no reason param is present", () => {
    renderAt("/upgrade?plan=plus");

    expect(screen.queryByText(/You qualify for a/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/All-Access plan is pre-selected below/i),
    ).not.toBeInTheDocument();
  });
});
