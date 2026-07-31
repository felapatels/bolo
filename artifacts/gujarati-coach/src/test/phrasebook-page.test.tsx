import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// Task #906: the /phrasebook library page. Pins the behavior contract:
// (1) every topic renders as a card deep-linking to /learn/:id, with the
//     mastered/total line the home grid used to show;
// (2) the header links back to /app;
// (3) opening the page fires phrasebook_opened exactly once;
// (4) loading shows skeletons; a failed fetch shows a retry, an empty
//     library shows the empty note.
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

const CATS = [
  { id: 1, title: "Greetings & Manners", titleNative: "સ્વાગત", iconName: "HandHeart", accent: "#f59e0b", phraseCount: 5, masteredCount: 2 },
  { id: 2, title: "Family", titleNative: null, iconName: "Users", accent: null, phraseCount: 6, masteredCount: 0 },
  { id: 3, title: "Numbers 1-10", titleNative: null, iconName: "Hash", accent: null, phraseCount: 10, masteredCount: 10 },
  { id: 4, title: "Food & Eating", titleNative: null, iconName: "Utensils", accent: null, phraseCount: 7, masteredCount: 1 },
];

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

vi.mock("@/lib/analytics", async () => {
  const { ANALYTICS_EVENTS: events } = await import("@/lib/analyticsEvents");
  return {
    initAnalytics: vi.fn(),
    identifyUser: vi.fn(),
    track: h.track,
    trackOnce: vi.fn(),
    ANALYTICS_EVENTS: events,
  };
});

vi.mock("@workspace/api-client-react", async () => {
  const { apiClientMockDefaults } = await import(
    "@/test-helpers/api-client-mock"
  );
  return {
    ...apiClientMockDefaults,
    useListCategories: () => h.cats,
  getListCategoriesQueryKey: () => ["categories"],
  };
});

import Phrasebook from "@/pages/phrasebook";
import { ANALYTICS_EVENTS } from "@/lib/analyticsEvents";

function renderPage() {
  const { hook } = memoryLocation({ path: "/phrasebook", record: true });
  return render(
    (<Router hook={hook}>{(<Phrasebook />) as ReactElement}</Router>) as ReactElement,
  );
}

beforeEach(() => {
  h.track.mockClear();
  h.cats = {
    data: [...CATS],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    isFetching: false,
  };
});

describe("phrasebook page (task 906)", () => {
  test("lists every topic as a card linking to /learn/:id with mastery line", () => {
    renderPage();
    for (const cat of CATS) {
      const title = screen.getByText(cat.title);
      expect(title.closest("a")).toHaveAttribute("href", `/learn/${cat.id}`);
    }
    expect(screen.getByText("2/5 phrases mastered")).toBeInTheDocument();
    // A fully mastered topic celebrates instead of showing 100%.
    expect(screen.getByText("Done!")).toBeInTheDocument();
    // Native-script subtitle carries over from the old grid.
    expect(screen.getByText("સ્વાગત")).toBeInTheDocument();
  });

  test("header links back to /app", () => {
    renderPage();
    const back = screen.getByText("Home").closest("a");
    expect(back).toHaveAttribute("href", "/app");
    expect(screen.getByRole("heading", { name: "Phrasebook" })).toBeInTheDocument();
  });

  test("opening a topic fires topic_opened with the phrasebook source", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("phrasebook-topic-1"));
    expect(h.track).toHaveBeenCalledWith(ANALYTICS_EVENTS.TOPIC_OPENED, {
      categoryId: 1,
      language: "gu",
      source: "phrasebook",
    });
  });

  test("fires phrasebook_opened exactly once on mount", () => {
    renderPage();
    const fired = h.track.mock.calls.filter(
      (c) => c[0] === ANALYTICS_EVENTS.PHRASEBOOK_OPENED,
    );
    expect(fired).toHaveLength(1);
    expect(fired[0]![1]).toMatchObject({ language: "gu" });
  });

  test("loading, error, and empty states", () => {
    h.cats = { ...h.cats, data: undefined, isLoading: true };
    const first = renderPage();
    expect(screen.queryByText("Greetings & Manners")).toBeNull();
    first.unmount();

    h.cats = { ...h.cats, data: undefined, isLoading: false, isError: true };
    const second = renderPage();
    expect(screen.getByText("Try again")).toBeInTheDocument();
    second.unmount();

    h.cats = { ...h.cats, data: [], isLoading: false, isError: false };
    renderPage();
    expect(
      screen.getByText("No topics available for this language yet."),
    ).toBeInTheDocument();
  });
});
