import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// ---------------------------------------------------------------------------
// Guards the "Plan" stat cell in the Phrase Builder and Speed Round setup
// screens. The cell reads from useEntitlements and must show "All-Access"
// when the learner is on All-Access and "Free" when they are on the free
// plan. A loading flash that starts on "Free" and flips would mislead; this
// test suite pins both branches so a regression surfaces immediately.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({ isPlus: false, isLoading: false }));

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  useListCategories: () => ({ data: [{ id: 1, title: "Basics" }], isLoading: false }),
  useListCategoryPhrases: () => ({ data: [], isLoading: false }),
  useRecordGameSession: () => ({ mutate: vi.fn() }),
  useGetProgressSummary: vi.fn(() => ({ data: undefined, isLoading: false })),
    getGetProgressSummaryQueryKey: () => ["progress-summary"],
}));

vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({
    activeLang: "gu",
    activeLanguage: { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" },
    languages: [],
    setActiveLang: vi.fn(),
    isLoading: false,
  }),
  useNativeText: () => ({ dir: "ltr" as const, style: {} }),
}));

vi.mock("@/lib/entitlements", () => ({
  useEntitlements: () => ({ isPlus: h.isPlus, isLoading: h.isLoading }),
  asUpgradeRequired: () => null,
  upgradeHref: () => "/upgrade",
  upgradeHrefForDenial: () => "/upgrade",
}));

vi.mock("@/components/mascot", () => ({ Mascot: () => null }));
vi.mock("@/components/ui/confetti", () => ({ Confetti: () => null }));
vi.mock("@/components/layout/bottom-nav", () => ({ BottomNav: () => null }));

// Import pages after mocks.
import PhraseBuilderPage from "@/pages/games/phrase-builder";
import SpeedRoundPage from "@/pages/games/speed-round";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage(element: React.ReactElement) {
  const { hook } = memoryLocation({ path: "/games" });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Router hook={hook}>{element}</Router>
    </QueryClientProvider>,
  );
}

/** Find the value cell that sits directly above the "Plan" label. */
function getPlanValue() {
  // There is exactly one element with the text "Plan" on the setup screen.
  const label = screen.getByText("Plan");
  // The value is in the sibling <p> that precedes the label inside the same
  // parent <div>. parentElement is the cell; firstElementChild is the value.
  const cell = label.parentElement!;
  return cell.firstElementChild!.textContent;
}

beforeEach(() => {
  h.isPlus = false;
  h.isLoading = false;
});

// ---------------------------------------------------------------------------
// Phrase Builder
// ---------------------------------------------------------------------------

describe("Phrase Builder setup screen, plan label", () => {
  test('shows "All-Access" when the learner is subscribed', () => {
    h.isPlus = true;
    renderPage(<PhraseBuilderPage />);

    expect(getPlanValue()).toBe("All-Access");
    expect(screen.queryByText("Free")).toBeNull();
  });

  test('shows "Free" during the loading window before entitlements resolve', () => {
    // isLoading=true keeps the root page from redirecting to /upgrade so the
    // setup screen stays mounted, this is the flash window the task guards.
    h.isPlus = false;
    h.isLoading = true;
    renderPage(<PhraseBuilderPage />);

    expect(getPlanValue()).toBe("Free");
    expect(screen.queryByText("All-Access")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Speed Round
// ---------------------------------------------------------------------------

describe("Speed Round setup screen, plan label", () => {
  test('shows "All-Access" when the learner is subscribed', () => {
    h.isPlus = true;
    renderPage(<SpeedRoundPage />);

    expect(getPlanValue()).toBe("All-Access");
    expect(screen.queryByText("Free")).toBeNull();
  });

  test('shows "Free" during the loading window before entitlements resolve', () => {
    h.isPlus = false;
    h.isLoading = true;
    renderPage(<SpeedRoundPage />);

    expect(getPlanValue()).toBe("Free");
    expect(screen.queryByText("All-Access")).toBeNull();
  });
});
