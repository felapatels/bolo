import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// ---------------------------------------------------------------------------
// Tests for the Retake link in the Practice History section of the Progress
// page:
//
//   1. A row with a valid categoryId and phraseId renders a link whose href
//      is /practice/{categoryId}?phrase={phraseId}.
//   2. A row with a null categoryId omits the link entirely.
//   3. A row with a null phraseId omits the link entirely.
//
// The page is rendered through its real implementation so the guard condition
// (`attempt.categoryId != null && attempt.phraseId != null`) is tested for real.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// framer-motion: passthrough — exit animations never finish in jsdom, so replace
// motion.* with plain elements and AnimatePresence with a no-op wrapper.
// ---------------------------------------------------------------------------
vi.mock("framer-motion", () => ({
  motion: new Proxy({} as Record<string, unknown>, {
    get(_t, tag: string) {
      const { forwardRef, createElement } = require("react") as typeof import("react");
      return forwardRef(({ children, ...props }: React.HTMLAttributes<Element> & { children?: React.ReactNode }, ref: React.Ref<Element>) =>
        createElement(tag as string, { ...props, ref }, children),
      );
    },
  }),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReducedMotion: () => false,
}));

// ---------------------------------------------------------------------------
// Heavy sub-components: stub them out so they don't pull in their own data
// fetches or complex deps.
// ---------------------------------------------------------------------------
vi.mock("@/components/mascot", () => ({
  Mascot: () => <div data-testid="mascot" />,
}));

vi.mock("@/components/layout/bottom-nav", () => ({
  BottomNav: () => <nav data-testid="bottom-nav" />,
}));

vi.mock("@/components/badges-gallery", () => ({
  BadgesGallery: () => <div data-testid="badges-gallery" />,
}));

vi.mock("@/components/next-badge-spotlight", () => ({
  NextBadgeSpotlight: () => <div data-testid="next-badge" />,
}));

vi.mock("@/components/advanced-analytics", () => ({
  AdvancedAnalytics: () => <div data-testid="advanced-analytics" />,
}));

vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({
    activeLang: "gu",
    activeLanguage: { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" },
    setActiveLang: vi.fn(),
    isLoading: false,
  }),
  useNativeText: () => ({ style: {}, dir: "ltr" as const, isNastaliq: false }),
}));

// ---------------------------------------------------------------------------
// Mutable hoisted state so each test can specify its own attempts list.
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => ({
  attempts: [] as unknown[],
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetProgressSummary: () => ({
    data: {
      phrasesMastered: 5,
      totalAttempts: 20,
      bestScore: 95,
      currentStreakDays: 3,
    },
    isLoading: false,
  }),
  useListRecentAttempts: () => ({
    data: h.attempts,
    isLoading: false,
  }),
}));

// Imported after all mocks so the page picks up the hoisted state.
import Progress from "@/pages/progress";

function renderPage() {
  const { hook } = memoryLocation({ path: "/progress" });
  return render(
    <Router hook={hook}>
      <Progress />
    </Router>,
  );
}

// A minimal attempt with all fields populated.
const baseAttempt = {
  id: "attempt-1",
  createdAt: "2026-07-25T10:00:00.000Z",
  score: 85,
  nativeScript: "નમસ્તે",
  english: "hello",
  feedback: "Great job!",
  categoryId: 42,
  phraseId: 99,
};

beforeEach(() => {
  h.attempts = [];
});

describe("progress page retake link", () => {
  test("renders a retake link pointing to /practice/{categoryId}?phrase={phraseId} when both ids are present", () => {
    h.attempts = [{ ...baseAttempt, categoryId: 42, phraseId: 99 }];
    renderPage();

    const link = screen.getByRole("link", { name: /retake/i });
    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toBe("/practice/42?phrase=99");
  });

  test("omits the retake link when categoryId is null", () => {
    h.attempts = [{ ...baseAttempt, categoryId: null, phraseId: 99 }];
    renderPage();

    expect(screen.queryByRole("link", { name: /retake/i })).not.toBeInTheDocument();
    // The rest of the row still renders.
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  test("omits the retake link when phraseId is null", () => {
    h.attempts = [{ ...baseAttempt, categoryId: 42, phraseId: null }];
    renderPage();

    expect(screen.queryByRole("link", { name: /retake/i })).not.toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  test("omits the retake link when both ids are null", () => {
    h.attempts = [{ ...baseAttempt, categoryId: null, phraseId: null }];
    renderPage();

    expect(screen.queryByRole("link", { name: /retake/i })).not.toBeInTheDocument();
  });

  test("renders retake links only for rows that have both ids — mixed list", () => {
    h.attempts = [
      { ...baseAttempt, id: "a1", english: "hello", categoryId: 10, phraseId: 5 },
      { ...baseAttempt, id: "a2", english: "thank you", categoryId: null, phraseId: 5 },
      { ...baseAttempt, id: "a3", english: "goodbye", categoryId: 7, phraseId: null },
      { ...baseAttempt, id: "a4", english: "please", categoryId: 3, phraseId: 8 },
    ];
    renderPage();

    const links = screen.getAllByRole("link", { name: /retake/i });
    // Only "hello" (a1) and "please" (a4) rows have both ids.
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute("href")).toBe("/practice/10?phrase=5");
    expect(links[1].getAttribute("href")).toBe("/practice/3?phrase=8");
  });
});
