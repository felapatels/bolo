import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// Build 31: the journey's progression lock dialog offers the Express test-out
// as a quiet secondary action next to "Keep practicing". These tests guard:
//  - the action renders with the correct deep link (zone + group + mode)
//  - the corrected dialog copy ("before this one", not "before it")
//  - exactly ONE close control (DialogContent's built-in X; the manual
//    duplicate that used to stack on top of it is gone)
// Chunk 4B adds a second action below the stop-level one: the zone-level
// test-out deep link (mode=testout&scope=zone, no group param).
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  categories: undefined as unknown,
}));

vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({
    languages: [{ code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" }],
    activeLang: "gu",
    activeLanguage: { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" },
    setActiveLang: vi.fn(),
    isLoading: false,
  }),
  useNativeText: () => ({ style: {}, dir: "ltr" as const, isNastaliq: false }),
  nativeTextProps: () => ({ style: {}, dir: "ltr" as const }),
}));

vi.mock("@/lib/entitlements", () => ({
  useEntitlements: () => ({ isAllAccess: true, isLoading: false }),
  asUpgradeRequired: () => null,
  upgradeHref: () => "/upgrade",
  upgradeHrefForDenial: () => "/upgrade",
}));

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  useListCategories: () => ({
    data: h.categories,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  // Every zone renders the same two-stop line: stop 1 open, stop 2 locked.
  useListCategoryLessonGroups: () => ({
    data: {
      lessonGroups: [
        {
          id: 900,
          stage: "phrase",
          status: "unlocked",
          position: 1,
          phraseCount: 8,
          masteredCount: 0,
          attemptedCount: 0,
        },
        {
          id: 901,
          stage: "phrase",
          status: "locked",
          position: 2,
          phraseCount: 8,
          masteredCount: 0,
          attemptedCount: 0,
        },
      ],
    },
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));

// Imported after the mocks are declared.
import Journey from "@/pages/journey";
import { JOURNEY_ZONES } from "@/lib/journeyLines";

function renderJourney() {
  const { hook } = memoryLocation({ path: "/journey", record: true });
  const ui = (
    <Router hook={hook}>{(<Journey />) as ReactElement}</Router>
  ) as ReactElement;
  return render(ui);
}

function openProgressionDialog() {
  renderJourney();
  // Zone 1's locked LAST stop; every zone has one, so take the first.
  //
  // "Stop 2 of 2" until 2026-08-23, when a tracing stop was added to every
  // zone. Two phrase stops plus one tracing stop is three, and the tracing
  // stop sits in the middle, so the locked phrase stop is now the third of
  // three. The number moved because a stop was genuinely added, which is what
  // was asked for; nothing about the lock behaviour under test changed.
  const lockedStops = screen.getAllByRole("button", { name: /Stop 3 of 3/ });
  fireEvent.click(lockedStops[0]);
}

beforeEach(() => {
  // The id+title mismatch guard requires a listing that agrees with the
  // embedded zone table, so mirror it exactly.
  h.categories = JOURNEY_ZONES.map((z) => ({
    id: z.id,
    title: z.title,
    titleNative: null,
    iconName: "BookOpen",
    accent: null,
    phraseCount: 8,
    masteredCount: 0,
  }));
});

describe("journey progression lock dialog (build 31 test-out)", () => {
  test("offers the test-out action deep-linked to the locked group in testout mode", () => {
    openProgressionDialog();
    expect(screen.getByText("This stop is still locked")).toBeInTheDocument();
    const testOut = screen.getByTestId("link-test-out");
    expect(testOut).toHaveTextContent("Test out of this stop");
    expect(testOut.getAttribute("href")).toContain("/practice/1?group=901&mode=testout");
    // Keep practicing stays the primary action.
    expect(screen.getByText("Keep practicing")).toBeInTheDocument();
  });

  test("offers the zone-level test-out action below the stop-level one", () => {
    openProgressionDialog();
    const zoneTestOut = screen.getByTestId("link-test-out-zone");
    expect(zoneTestOut).toHaveTextContent("Test out of this whole zone");
    expect(zoneTestOut).toHaveTextContent(
      "One phrase from each stop. Pass to unlock everything here.",
    );
    expect(zoneTestOut.getAttribute("href")).toContain(
      "/practice/1?mode=testout&scope=zone",
    );
    // Ordering: the stop-level action stays first in the DOM.
    const stopTestOut = screen.getByTestId("link-test-out");
    expect(
      stopTestOut.compareDocumentPosition(zoneTestOut) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("dialog copy reads 'finish the stop before this one to board here'", () => {
    openProgressionDialog();
    expect(
      screen.getByText(/finish the stop before this one to board here/),
    ).toBeInTheDocument();
  });

  test("renders exactly one close control (no stacked duplicate X)", () => {
    openProgressionDialog();
    const closeButtons = screen.getAllByRole("button", { name: /close/i });
    expect(closeButtons).toHaveLength(1);
  });
});
