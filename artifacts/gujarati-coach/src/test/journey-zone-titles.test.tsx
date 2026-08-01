import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// Task #906: journey zone titles come from the categories listing (the same
// source the Phrasebook uses), with the embedded JOURNEY_ZONES titles as a
// loading-state fallback only. Pins the behavior contract:
// (1) a server-side category rename shows up on the map without a client
//     release — and is NOT a hard-stop error anymore;
// (2) while the categories listing has no data, the fallback titles render;
// (3) the id joins stay authoritative (titles resolve by id, not position).
const h = vi.hoisted(() => ({
  cats: undefined as unknown[] | undefined,
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

const GROUPS = [
  {
    id: 101,
    title: "Stop 1",
    stage: "phrase",
    position: 1,
    status: "unlocked",
    phraseCount: 5,
    masteredCount: 0,
  },
];

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  useListCategories: () => ({
    data: h.cats,
    isLoading: h.cats === undefined,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useListCategoryLessonGroups: () => ({
    data: { lessonGroups: GROUPS },
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

beforeEach(() => {
  h.cats = undefined;
});

const cat = (id: number, title: string) => ({
  id,
  title,
  titleNative: null,
  iconName: "HandHeart",
  accent: null,
  phraseCount: 5,
  masteredCount: 0,
});

describe("journey zone titles from categories (task 906)", () => {
  test("a renamed category renders on the map instead of a hard-stop error", () => {
    h.cats = [
      cat(1, "Warm Welcomes"),
      ...JOURNEY_ZONES.slice(1).map((z) => cat(z.id, z.title)),
    ];
    renderJourney();
    // No error screen, and the live title (resolved by id) is on the map.
    expect(screen.queryByText(/couldn't load|went wrong/i)).toBeNull();
    expect(screen.getAllByText(/Warm Welcomes/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Greetings & Manners/)).toBeNull();
  });

  test("fallback titles render while the categories listing has no data", () => {
    h.cats = undefined;
    renderJourney();
    expect(screen.getAllByText(/Greetings & Manners/).length).toBeGreaterThan(0);
  });

  test("titles resolve by id, not by array position", () => {
    // Reverse the listing order — titles must still land on the right zones.
    h.cats = [...JOURNEY_ZONES].reverse().map((z) => cat(z.id, `Live ${z.title}`));
    renderJourney();
    expect(screen.getAllByText(/Live Greetings & Manners/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Live Feelings/).length).toBeGreaterThan(0);
  });
});
