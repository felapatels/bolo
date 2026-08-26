import { describe, test, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// THE STOP CARD IS PAPER, AND EVERY STOP GETS SOME.
//
// Until 2026-08-26 a card that was not the current stop had NO BACKGROUND AT
// ALL: the class list said `group-hover:bg-accent` and nothing else, so the
// card was transparent until the cursor touched it. That was invisible while
// the map sat on a flat theme, and unreadable the moment the map got painted.
// "Stop 1 of 11 / Completed / 8/10 mastered" rendered as dark text straight
// onto a bazaar. Reported from the web preview with a screenshot.
//
// Nothing failed when it broke, because nothing asserted a card had stock.
// This file does. It pins the CONTRACT, not the colour:
// (1) every stop card carries `.station-card`, which is what picks the stock;
// (2) each card declares exactly one of accessible / ahead, since those choose
//     between the two stocks and a card with neither would fall back to bare;
// (3) at most one card is the current stop, so the active card still dominates
//     a line of cards that now ALL have stock.
//
// jsdom never loads index.css, so a computed background would read empty here.
// The class and the data attributes ARE the assertable half; the stocks
// themselves live beside their comment in index.css.

const h = vi.hoisted(() => ({
  groupsByZone: {} as Record<number, unknown[]>,
  passedIds: [] as string[],
  isPlus: true,
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

vi.mock("@/lib/entitlements", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useEntitlements: () => ({
    isPlus: h.isPlus,
    isAllAccess: h.isPlus,
    isLoading: false,
  }),
}));

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  useListCategories: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useListCategoryLessonGroups: (categoryId: number) => ({
    data: { lessonGroups: h.groupsByZone[categoryId] ?? [] },
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useGetScriptTraceProgress: () => ({
    data: h.passedIds.map((characterId) => ({ characterId, passed: true })),
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));

import Journey from "@/pages/journey";
import { JOURNEY_ZONES } from "@/lib/journeyLines";

function renderJourney() {
  const { hook } = memoryLocation({ path: "/journey", record: true });
  return render(
    (<Router hook={hook}>{(<Journey />) as ReactElement}</Router>) as ReactElement,
  );
}

/** Nine phrase stops per zone. The first is unlocked, so the map draws its
 *  line rather than the showroom stub it falls back to when nothing is open,
 *  and the rest are locked, which is what puts BOTH stocks on the page. */
const grp = (id: number, position: number) => ({
  id,
  title: `Stop ${position + 1}`,
  stage: "phrase",
  position,
  status: position === 0 ? "unlocked" : "locked",
  phraseCount: 10,
  masteredCount: 0,
});

/** Every stop row on the map, link or button. A locked stop is a button (it
 *  opens the dialog), an open one is a link, and both wrap the same card. */
function stopRows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("a, button")].filter((el) =>
    /^Stop \d+ of \d+/.test(el.getAttribute("aria-label") ?? ""),
  );
}

beforeEach(() => {
  h.passedIds = [];
  h.isPlus = true;
  h.groupsByZone = {};
  JOURNEY_ZONES.forEach((z) => {
    h.groupsByZone[z.id] = Array.from({ length: 9 }, (_, i) => grp(z.id * 100 + i, i));
  });
});

describe("the stop card has stock on every stop", () => {
  test("every card carries the paper class, not just the current one", () => {
    renderJourney();
    const rows = stopRows();
    // The fixture opens six zones of nine phrase stops plus their trace and
    // story rows, so a map that drew nothing would fail here before the
    // interesting assertion does.
    expect(rows.length).toBeGreaterThan(6);
    const bare = rows.filter((row) => row.querySelector(".station-card") === null);
    expect(
      bare.map((r) => r.getAttribute("aria-label")),
      "these stop cards render with no stock, so their text sits straight on the painted backdrop",
    ).toEqual([]);
  });

  test("each card declares exactly one stock: accessible or ahead", () => {
    renderJourney();
    const wrong = stopRows()
      .map((row) => row.querySelector(".station-card") as HTMLElement)
      .filter((card) => {
        const open = card.getAttribute("data-accessible") === "true";
        const ahead = card.getAttribute("data-ahead") === "true";
        // Never both, never neither: they are complements, and a card with
        // neither would take the bare `.station-card` fallback while reading
        // as though somebody had chosen it.
        return open === ahead;
      });
    expect(wrong.length, "a stop card claimed both stocks or none").toBe(0);
  });

  test("the fixture puts both stocks on the page", () => {
    renderJourney();
    const cards = stopRows().map(
      (row) => row.querySelector(".station-card") as HTMLElement,
    );
    // Guards the test above from passing vacuously on a page where every stop
    // happens to be open: if a fixture change ever removes the locked stops,
    // the complement check stops proving anything and this says so.
    expect(cards.some((c) => c.getAttribute("data-accessible") === "true")).toBe(true);
    expect(cards.some((c) => c.getAttribute("data-ahead") === "true")).toBe(true);
  });

  test("at most one stop is the current one", () => {
    renderJourney();
    const current = stopRows()
      .map((row) => row.querySelector(".station-card") as HTMLElement)
      .filter((card) => card.getAttribute("data-current") === "true");
    // The current card is the only one that keeps the zone-color border, the
    // roof bar and the glow. Two of them and the hierarchy the paper preserves
    // is gone.
    expect(current.length).toBeLessThanOrEqual(1);
  });
});
