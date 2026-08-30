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
  // isPlus is what places the free taste. A mock that omitted it read as
  // undefined, i.e. Free, and silently plan-locked five of the six stops.
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
  h.isPlus = true;
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

/** A plan-locked tracing stop is a button, not a link: it opens the dialog. */
function lockedTraceCards(): HTMLElement[] {
  return [...document.querySelectorAll("button")].filter((b) =>
    /tracing stop/.test(b.getAttribute("aria-label") ?? ""),
  );
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
    // WAS "Stop 5 of 10", the mid-zone break. Zone 1 moved to stop 2 on
    // 2026-08-23 and the free taste is the reason: a Free learner gets exactly
    // one phrase stop before the paywall, so a tracing stop halfway down zone 1
    // sits behind stops they cannot open. Every LATER zone is still the middle,
    // which the next assertion holds.
    // "of 11", not "of 10", since 2026-08-24: the STORY stop joined the map
    // and sits directly after this one, so every zone carrying a book is one
    // row longer. The tracing stop's own POSITION is unchanged, which is the
    // half that matters here and is why only the total moved.
    // INVERTED 2026-08-29 (build 18, web parity with mobile's build 17): the
    // chalkboard prints no "Stop n of m". The numbered badge on the rail says
    // the number and the card's label still announces it, which is what the
    // aria label pins here; the visible text is the slate's own.
    expect(card.getAttribute("aria-label")).toMatch(/^Stop 2 of 11:/);
    expect(card).not.toHaveTextContent("Stop 2 of 11");
    expect(traceCard(2).getAttribute("aria-label")).toMatch(/^Stop 5 of 11:/);
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
    // THE TICKET COUNTS IN ITS FOOT ROW (build 23, the phone's build 22 trace
    // card): "3/8" beside the dot row and a Continue, where the chalkboard
    // printed "3 of 8 letters traced".
    expect(traceCard(1)).toHaveTextContent(`3/${stop.characters.length}`);
    expect(traceCard(1)).toHaveTextContent("Continue");
  });

  // A ZONE THE LEARNER ALREADY OWNS CARRIES NO TASTE CHIP. Hindi's fare zones
  // 1 and 2 serve free in full (owner ruling 2026-08-24), so every station is
  // plan-visible and "Free taste" advertises a sample of something already
  // theirs. Reported from a device 2026-08-25. The map derives this from the
  // payload rather than from a hardcoded language list, so a future widening
  // of the free tier needs no change here. The default fixture is exactly that
  // shape: nine stations, none plan-locked.
  test("a zone the learner already owns outright shows no taste chip", () => {
    h.isPlus = false;
    renderJourney();
    expect(within(traceCard(1)).queryByText("Free taste")).toBeNull();
  });

  test("a Free learner gets zone 1's tracing stop and nothing past it", () => {
    // The free taste: three characters of journey 1 zone 1, in every language,
    // matching the promise the voice lessons already make. Before this every
    // non-Plus learner who tapped ANY tracing stop was bounced to /upgrade from
    // a card that deliberately never showed a lock.
    h.isPlus = false;
    // PLAN-LOCKED STOPS, BECAUSE THAT IS WHAT A FREE LEARNER IS ACTUALLY SENT.
    // Added 2026-08-25 when the taste chip learned to ask whether the zone is
    // already included. This fixture had no planLocked anywhere, which is the
    // payload shape of a PLUS learner, and under the new rule it read as "this
    // zone is free in full" and dropped the chip. Production confirms the real
    // shape: Gujarati greetings positions 2 and 3 carry 0 free rows of 10, so
    // the server reports them planLocked.
    for (const zoneId of Object.keys(h.groupsByZone)) {
      const groups = h.groupsByZone[Number(zoneId)] as Record<string, unknown>[];
      for (const pos of [1, 2]) {
        groups[pos] = { ...groups[pos], planLocked: true, phraseCount: 0 };
      }
    }
    renderJourney();

    // Zone 1 is open, and says it is a taste rather than looking like a bug.
    const card = traceCard(1);
    // "of 11" for the same reason as above: the story stop is a row too. On
    // the label since build 18: the chalkboard prints no stop number.
    expect(card.getAttribute("aria-label")).toMatch(/^Stop 2 of 11:/);
    expect(within(card).getByText("Free taste")).toBeInTheDocument();

    // Every later zone is All-Access, and is a button (the lock dialog), not a
    // link. An honest lock beats a card that opens onto the paywall.
    const locked = lockedTraceCards();
    expect(locked).toHaveLength(5);
    for (const b of locked) {
      // The chip is uppercased by CSS; the DOM text is title case.
      expect(b).toHaveTextContent("All-Access");
      expect(b).toHaveTextContent("Trace");
    }
    for (const zone of [2, 3, 4, 5, 6]) {
      expect(
        [...document.querySelectorAll("a")].some(
          (a) =>
            a.getAttribute("href") === `/games/script-trace?journey=1&zone=${zone}`,
        ),
        `zone ${zone} must not be openable`,
      ).toBe(false);
    }
  });

  test("a paying learner sees no lock on any tracing stop", () => {
    h.isPlus = true;
    renderJourney();
    expect(lockedTraceCards()).toHaveLength(0);
    for (const zone of [1, 2, 3, 4, 5, 6]) expect(traceCard(zone)).toBeInTheDocument();
  });

  test("says so when every character in the stop is traced", () => {
    const stop = traceStopFor("gu", 1, 1)!;
    h.passedIds = stop.characters.map((c) => c.id);
    renderJourney();
    // Every letter traced reads as the full fraction on the ticket (build 23).
    const n = stop.characters.length;
    expect(traceCard(1)).toHaveTextContent(`${n}/${n}`);
  });
});
