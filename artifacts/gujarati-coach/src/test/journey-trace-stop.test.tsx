import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// The tracing stop AS DRAWN. Everything that existed before this file tested
// the ladder (lib/script-trace) or the journey without one, so the stop shipped
// to bolo-india.app reading:
//
//     Stop 5 of 10
//     Now boarding · undefined phrases
//
// in every zone of all 22 languages, and said nothing about tracing. The card
// had simply fallen through to the phrase-stop line, and a tracing stop has no
// phrases. Nothing failed, because nothing rendered the card.
//
// These tests render it. Pins:
// (1) the stop reads as a tracing stop and NEVER prints "undefined";
// (2) its link carries the ladder's journey and zone ORDINAL, not a category id;
// (3) the copy counts real progress once characters have been passed.

const h = vi.hoisted(() => ({
  groupsByZone: {} as Record<number, unknown[]>,
  passedIds: [] as string[],
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
  useEntitlements: () => ({ isAllAccess: true, isLoading: false }),
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
  // The map derives each tracing stop's status from the characters already
  // passed, keyed per character rather than per stop (a trace stop has no row).
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
import { traceStopFor } from "@workspace/script-trace";

function renderJourney() {
  const { hook } = memoryLocation({ path: "/journey", record: true });
  return render(
    (<Router hook={hook}>{(<Journey />) as ReactElement}</Router>) as ReactElement,
  );
}

/** Nine phrase stops per zone, so the tracing stop lands at 5 of 10. The first
 *  is unlocked: a map where nothing at all is open renders its showroom stub
 *  instead of the line. */
const grp = (id: number, position: number) => ({
  id,
  title: `Stop ${position + 1}`,
  stage: "phrase",
  position,
  status: position === 0 ? "unlocked" : "locked",
  phraseCount: 10,
  masteredCount: 0,
});

beforeEach(() => {
  h.passedIds = [];
  h.groupsByZone = {};
  JOURNEY_ZONES.forEach((z) => {
    h.groupsByZone[z.id] = Array.from({ length: 9 }, (_, i) => grp(z.id * 100 + i, i));
  });
});

/** The tracing stop's card, found by the link it opens. */
function traceCard(zone: number): HTMLElement {
  const want = `/games/script-trace?journey=1&zone=${zone}`;
  const links = [...document.querySelectorAll("a")];
  const link = links.find((a) => a.getAttribute("href") === want);
  expect(
    link,
    `no tracing stop for zone ${zone}. Links present: ${links
      .map((a) => a.getAttribute("href"))
      .join(", ")}`,
  ).toBeDefined();
  return link as HTMLElement;
}

describe("the tracing stop as the journey map draws it", () => {
  test("never prints 'undefined' anywhere on the map", () => {
    renderJourney();
    // The whole page, not just the card: the fall-through that produced
    // "undefined phrases" would have been caught by exactly this.
    expect(document.body.textContent).not.toMatch(/undefined/i);
  });

  test("reads as a tracing stop, counting its own characters", () => {
    renderJourney();
    const stop = traceStopFor("gu", 1, 1)!;
    expect(stop.characters.length).toBeGreaterThan(0);

    const card = traceCard(1);
    // Numbered like every other stop: added to the zone, never substituted, so
    // nine phrase stops become ten rows and tracing sits in the middle.
    expect(card).toHaveTextContent("Stop 5 of 10");
    expect(card).toHaveTextContent(`Trace ${stop.characters.length} letters`);
    // And it says which kind of stop it is, which the number alone does not.
    expect(within(card).getByText("Trace")).toBeInTheDocument();
    // It is never "Now boarding": that belongs to the learner's current stop,
    // and two of them in one zone is the confusion this replaced.
    expect(card).not.toHaveTextContent("Now boarding");
    expect(card).not.toHaveTextContent("phrases");
  });

  test("links by the ladder's journey and zone ordinal, not by category id", () => {
    renderJourney();
    // journeyLines.ts is explicit that journey 1's category ids are 1-6 only
    // because those rows were inserted first, while journey 2's landed at
    // 277-282. The ordinal is what the ladder is indexed by.
    for (const zone of [1, 2, 3, 4, 5, 6]) {
      expect(traceCard(zone)).toBeInTheDocument();
    }
  });

  test("counts real progress once characters have been passed", () => {
    const stop = traceStopFor("gu", 1, 1)!;
    h.passedIds = stop.characters.slice(0, 3).map((c) => c.id);
    renderJourney();
    expect(traceCard(1)).toHaveTextContent(
      `3 of ${stop.characters.length} letters traced`,
    );
  });

  test("says so when every character in the stop is traced", () => {
    const stop = traceStopFor("gu", 1, 1)!;
    h.passedIds = stop.characters.map((c) => c.id);
    renderJourney();
    expect(traceCard(1)).toHaveTextContent(
      `All ${stop.characters.length} letters traced`,
    );
  });
});
