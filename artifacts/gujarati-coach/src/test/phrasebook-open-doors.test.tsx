import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// WHICH DOORS ARE OPEN, BEFORE THE TAP.
//
// The Phrasebook drew twelve identical tiles and the only way to learn which
// were shut was to tap one. The phrases route serves only phrases in unlocked
// lesson groups and a journey stop IS a lesson group, so a topic can hold ten
// phrases and hand over none. Chat 9 fixed the copy a learner met AFTER
// tapping; this is the half that lets them not tap.
//
// The field is optional on purpose: an older server never gated the list, so
// its absence has to keep behaving exactly as this page did before.
//
// Mobile twin: bolo-mobile/__tests__/phrasebook-open-doors.test.tsx.

const h = vi.hoisted(() => ({
  track: vi.fn(),
  cats: {
    data: [] as unknown[] | undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    isFetching: false,
  },
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
}));

vi.mock("@/lib/analytics", async () => {
  const { ANALYTICS_EVENTS: events } = await import("@/lib/analyticsEvents");
  return { track: h.track, ANALYTICS_EVENTS: events };
});

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  useListCategories: () => h.cats,
}));

import Phrasebook from "@/pages/phrasebook";

const cat = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  title: `Topic ${id}`,
  titleNative: null,
  iconName: "BookOpen",
  accent: null,
  phraseCount: 10,
  masteredCount: 2,
  ...over,
});

function renderPhrasebook() {
  const { hook } = memoryLocation({ path: "/phrasebook", record: true });
  return render(
    (<Router hook={hook}>{(<Phrasebook />) as ReactElement}</Router>) as ReactElement,
  );
}

beforeEach(() => {
  h.cats = {
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    isFetching: false,
  };
});

describe("the topic list says which doors are open", () => {
  test("a topic serving nothing yet reads shut, and says where it opens", () => {
    h.cats.data = [cat(1, { openPhraseCount: 0 })];
    renderPhrasebook();
    expect(screen.getByTestId("phrasebook-shut-1")).toBeInTheDocument();
    // A locked door with no directions is the version of this the learner
    // already had. It has to point at the journey.
    expect(screen.getByTestId("phrasebook-tile-1")).toHaveTextContent(
      /Ride the journey to open this topic/,
    );
    // And the percentage is replaced rather than sitting there reading 20% on
    // a topic that will not open a single phrase.
    expect(screen.getByTestId("phrasebook-tile-1")).not.toHaveTextContent("20%");
  });

  test("a part-open topic counts what still waits down the line", () => {
    h.cats.data = [cat(2, { openPhraseCount: 4 })];
    renderPhrasebook();
    expect(screen.queryByTestId("phrasebook-shut-2")).toBeNull();
    expect(screen.getByTestId("phrasebook-ahead-2")).toHaveTextContent(
      /6 more wait further down the line/,
    );
  });

  test("one remaining phrase is singular", () => {
    h.cats.data = [cat(3, { phraseCount: 10, openPhraseCount: 9 })];
    renderPhrasebook();
    expect(screen.getByTestId("phrasebook-ahead-3")).toHaveTextContent(
      /1 more waits further down the line/,
    );
  });

  test("a fully open topic says nothing extra at all", () => {
    h.cats.data = [cat(4, { openPhraseCount: 10 })];
    renderPhrasebook();
    expect(screen.queryByTestId("phrasebook-shut-4")).toBeNull();
    expect(screen.queryByTestId("phrasebook-ahead-4")).toBeNull();
  });

  test("an older server, which never gated the list, still reads fully open", () => {
    // THE COMPATIBILITY CASE, and it is the one that would ship silently
    // wrong: absent must not read as zero, or every topic would draw shut
    // against a server that has no opinion.
    h.cats.data = [cat(5)];
    renderPhrasebook();
    expect(screen.queryByTestId("phrasebook-shut-5")).toBeNull();
    expect(screen.queryByTestId("phrasebook-ahead-5")).toBeNull();
    expect(screen.getByTestId("phrasebook-tile-5")).not.toHaveAttribute("data-shut");
  });

  test("an empty topic is not a shut one", () => {
    // Zero phrases and zero open is a topic with no content yet, which is a
    // different thing from a topic the journey has not reached.
    h.cats.data = [cat(6, { phraseCount: 0, masteredCount: 0, openPhraseCount: 0 })];
    renderPhrasebook();
    expect(screen.queryByTestId("phrasebook-shut-6")).toBeNull();
  });
});
