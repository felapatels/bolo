import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { FREE_ENTITLEMENTS } from "./fixtures";

// The paywall reads the locked surface's intent from the query string
// (?plan=plus or ?plan=family) and preselects the matching plan card. The
// One Language tier is no longer sold on web — legacy ?plan=one_language
// links must land on the All-Access card instead of erroring.

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
  beginAllAccessCheckout: vi.fn(),
  beginFamilyCheckout: vi.fn(),
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
    expect(card("Family")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText(/Start 7-day free trial/i)).toBeInTheDocument();
  });

  test("?plan=plus preselects All-Access", () => {
    renderAt("/upgrade?plan=plus");

    expect(card("All-Access")).toHaveAttribute("aria-pressed", "true");
    expect(card("Family")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText(/Start 7-day free trial/i)).toBeInTheDocument();
  });

  test("?plan=family preselects Family", () => {
    renderAt("/upgrade?plan=family");

    expect(card("Family")).toHaveAttribute("aria-pressed", "true");
    expect(card("All-Access")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText(/Get the Family plan/i)).toBeInTheDocument();
  });

  test("the One Language tier is no longer sold on web", () => {
    renderAt("/upgrade");

    expect(screen.queryByText("One Language")).not.toBeInTheDocument();
    expect(screen.queryByText(/Pick a language first/i)).not.toBeInTheDocument();
  });

  test("legacy ?plan=one_language links land on the All-Access card", () => {
    renderAt("/upgrade?plan=one_language&lang=hi");

    expect(card("All-Access")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("One Language")).not.toBeInTheDocument();
    // The CTA is the real trial checkout, never a language prompt.
    expect(screen.getByText(/Start 7-day free trial/i)).toBeInTheDocument();
  });

  test("shows the store-ladder monthly prices", () => {
    renderAt("/upgrade");

    // Monthly is the default interval: Plus $12.99/mo, Family $19.99/mo.
    expect(screen.getByText("$12.99")).toBeInTheDocument();
    expect(screen.getByText("$19.99")).toBeInTheDocument();
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
