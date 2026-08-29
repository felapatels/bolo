import { describe, test, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
// THE ONE-PAGER MAP (build 20). Pins: the poster loads from the public folder
// for the active language and falls back to the drawn placeholder when the
// file is missing; the legend draws six zones from the real useJourneyProgress
// against mocked zone payloads, with the same "Stop N of M" numbering the
// boarding pass uses (tracing and story rows counted); a finished zone, the
// current zone and a locked zone each read as words, not colour; every zone
// links to the journey. Mobile twin: __tests__/journey-onepager.test.tsx.
const h = vi.hoisted(() => ({ byZone: {} as Record<number, unknown>, greeting: undefined as unknown, boards: null as unknown }));
const BOX = (x: number, y: number, w = 0.25, h = 0.1) => ({ x, y, w, h });
const HINDI_BOARDS = {
  size: [1080, 1935],
  title: BOX(0.36, 0.02, 0.46, 0.1),
  greeting: BOX(0.025, 0.11, 0.25, 0.23),
  bottom: BOX(0.04, 0.92, 0.92, 0.07),
  badge: BOX(0.03, 0, 0.1, 0.085),
  zones: [BOX(0.66, 0.23), BOX(0.04, 0.42), BOX(0.63, 0.48), BOX(0.04, 0.64), BOX(0.64, 0.69), BOX(0.04, 0.78)],
  numbers: [BOX(0.64, 0.22, 0.05, 0.03), BOX(0.02, 0.4, 0.05, 0.03), BOX(0.61, 0.47, 0.05, 0.03), BOX(0.02, 0.63, 0.05, 0.03), BOX(0.62, 0.68, 0.05, 0.03), BOX(0.02, 0.77, 0.05, 0.03)],
  signs: [BOX(0.44, 0.16, 0.18, 0.07), BOX(0.39, 0.37, 0.18, 0.05), BOX(0.42, 0.52, 0.17, 0.05), BOX(0.41, 0.62, 0.17, 0.05), BOX(0.42, 0.73, 0.17, 0.05), BOX(0.42, 0.82, 0.18, 0.06)],
};

vi.mock("@workspace/api-client-react", () => ({
  useListCategoryLessonGroups: (categoryId: number) => h.byZone[categoryId],
  useListCategoryPhrases: () => ({ data: h.greeting, isLoading: false, isError: false }),
  getListCategoryPhrasesQueryKey: (id: number, lang: string) => ["phrases", id, lang],
}));
vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({
    languages: [{ code: "hi", name: "Hindi", nativeName: "हिन्दी" }],
    activeLang: "hi",
    activeLanguage: { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
    setActiveLang: vi.fn(),
    isLoading: false,
  }),
  useNativeText: () => ({ style: {}, dir: "ltr" as const, isNastaliq: false }),
  nativeTextProps: () => ({ style: {}, dir: "ltr" as const }),
}));

import JourneyMap, { zoneDotsDone, zoneStatusCopy } from "@/pages/map";

function group(position: number, status: string, stage: "phrase" | "sentence" = "phrase") {
  return {
    id: position,
    position,
    status,
    stage,
    masteredCount: 0,
    phraseCount: 10,
    attemptedCount: status === "in_progress" ? 2 : 0,
    planLocked: false,
  };
}
function zonePayload(groups: unknown[]) {
  return { data: { lessonGroups: groups, access: null }, isLoading: false, isError: false };
}
function nine(statusFor: (i: number) => string) {
  return Array.from({ length: 9 }, (_, i) => group(i + 1, statusFor(i), i < 4 ? "phrase" : "sentence"));
}
function renderMap() {
  const { hook } = memoryLocation({ path: "/map" });
  return render(
    <Router hook={hook}>
      <JourneyMap />
    </Router>,
  );
}

beforeEach(() => {
  h.boards = null;
  h.greeting = [{ id: 1, nativeScript: "नमस्ते", romanized: "namaste", english: "hello" }];
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: h.boards != null, json: async () => h.boards })));
  h.byZone = {
    1: zonePayload(nine(() => "completed")),
    2: zonePayload(nine((i) => (i < 2 ? "completed" : i === 2 ? "in_progress" : "locked"))),
    3: zonePayload(Array.from({ length: 7 }, (_, i) => group(i + 1, "locked", i < 2 ? "phrase" : "sentence"))),
    4: zonePayload(nine(() => "locked")),
    5: zonePayload(nine(() => "locked")),
    6: zonePayload(nine(() => "locked")),
  };
});

describe("the one-pager map", () => {
  test("names the line, loads the poster from the public folder, and draws six zones", () => {
    renderMap();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ganga Line");
    const poster = screen.getByTestId("map-poster") as HTMLImageElement;
    expect(poster.getAttribute("src")).toBe("/journey/maps/hi.jpg");
    for (let i = 0; i < 6; i += 1) {
      expect(screen.getByTestId(`map-zone-${i}`).getAttribute("href")).toBe("/journey");
    }
    expect(screen.getByText("11 of 52 lessons done")).toBeInTheDocument();
  });

  test("numbers the current stop the way the boarding pass does, tracing and story rows included", () => {
    renderMap();
    // Zone 2, graded index 2 of 9: the tracing and story rows land after the
    // fourth graded stop, so this is still row 3 of 11.
    expect(screen.getByTestId("map-zone-1-status")).toHaveTextContent("Stop 3 of 11");
    expect(screen.getByTestId("map-zone-0-status")).toHaveTextContent("All 11 stops done");
    expect(screen.getByTestId("map-zone-2-status")).toHaveTextContent("9 stops, locked");
    expect(screen.getByTestId("map-zone-5-status")).toHaveTextContent("11 stops, locked");
    expect(screen.getByText("New Delhi")).toBeInTheDocument();
    expect(screen.getByText("Varanasi")).toBeInTheDocument();
  });

  test("falls back to the drawn placeholder when the poster is missing", () => {
    renderMap();
    fireEvent.error(screen.getByTestId("map-poster"));
    expect(screen.queryByTestId("map-poster")).toBeNull();
    expect(screen.getByTestId("map-poster-fallback")).toBeInTheDocument();
    expect(screen.getByText("1. New Delhi")).toBeInTheDocument();
    expect(screen.getByText("6. Varanasi")).toBeInTheDocument();
  });

  test('says "Finding your train..." while the payloads load', () => {
    h.byZone[4] = { data: undefined, isLoading: true, isError: false };
    renderMap();
    expect(screen.getByText("Finding your train...")).toBeInTheDocument();
    expect(screen.queryByTestId("map-zone-0")).toBeNull();
  });
});

describe("the words on the poster", () => {
  test("writes the title, the greeting from the API, the zones, numbers, signs and tagline on the boards", async () => {
    h.boards = HINDI_BOARDS;
    renderMap();
    await screen.findByTestId("map-words");
    expect(screen.getByTestId("map-word-title")).toHaveTextContent("HINDI");
    expect(screen.getByText("GANGA LINE · JOURNEY 1")).toBeInTheDocument();
    expect(screen.getByTestId("map-word-greeting")).toHaveTextContent("नमस्ते");
    expect(screen.getByText("(namaste)")).toBeInTheDocument();
    expect(screen.getByTestId("map-word-zone-0")).toHaveTextContent("Greetings & Manners");
    expect(screen.getByText("Count, learn and use numbers in Hindi.")).toBeInTheDocument();
    ["NEW DELHI", "ALIGARH", "KANPUR CENTRAL", "PRAYAGRAJ", "MIRZAPUR", "VARANASI"].forEach((city, i) => {
      expect(screen.getByTestId(`map-word-sign-${i}`)).toHaveTextContent(city);
    });
    expect(screen.getByText("Learn a little every day, speak with confidence, and make Hindi a part of your life.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/journey/maps/hi.json");
  });

  test("writes the city in its own script above the Latin name, and draws the zone icons into empty medallions", async () => {
    h.boards = {
      ...HINDI_BOARDS,
      iconsPainted: false,
      medallions: [BOX(0.86, 0.3, 0.09, 0.05), BOX(0.24, 0.45, 0.09, 0.05), BOX(0.82, 0.52, 0.09, 0.05), BOX(0.24, 0.66, 0.09, 0.05), BOX(0.83, 0.72, 0.09, 0.05), BOX(0.24, 0.81, 0.09, 0.05)],
    };
    renderMap();
    await screen.findByTestId("map-words");
    expect(screen.getByTestId("map-word-sign-native-0")).toHaveTextContent("नई दिल्ली");
    expect(screen.getByTestId("map-word-sign-native-5")).toHaveTextContent("वाराणसी");
    expect(screen.getByTestId("map-word-sign-0")).toHaveTextContent("NEW DELHI");
    for (let i = 0; i < 6; i += 1) expect(screen.getByTestId(`map-icon-${i}`)).toBeInTheDocument();
  });

  test("draws no icons over painted medallions", async () => {
    h.boards = HINDI_BOARDS;
    renderMap();
    await screen.findByTestId("map-words");
    expect(screen.queryByTestId("map-icon-0")).toBeNull();
  });

  test("writes nothing over a poster that has no boards file", async () => {
    renderMap();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByTestId("map-words")).toBeNull();
  });
});

describe("the legend helpers", () => {
  const base = { zoneIndex: 0, geoName: "Anand", stopCount: 11, gradedCount: 9, doneCount: 0, currentStopNumber: null, allDone: false, locked: false };
  test("word the state rather than colour it", () => {
    expect(zoneStatusCopy({ ...base, currentStopNumber: 5 })).toBe("Stop 5 of 11");
    expect(zoneStatusCopy({ ...base, doneCount: 9, allDone: true })).toBe("All 11 stops done");
    expect(zoneStatusCopy({ ...base, locked: true })).toBe("11 stops, locked");
    expect(zoneStatusCopy(base)).toBe("11 stops");
    expect(zoneStatusCopy({ ...base, stopCount: 0, gradedCount: 0 })).toBe("Not open yet");
  });
  test("fill the dots before the current stop, or all of a finished zone", () => {
    expect(zoneDotsDone({ ...base, currentStopNumber: 5 })).toBe(4);
    expect(zoneDotsDone({ ...base, doneCount: 9, allDone: true })).toBe(11);
    expect(zoneDotsDone(base)).toBe(0);
  });
});
