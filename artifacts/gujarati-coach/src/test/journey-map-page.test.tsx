import { describe, test, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
// THE ONE-PAGER MAP (build 20). Pins: the poster loads from the public folder
// for the active language and falls back to the drawn placeholder when the
// file is missing; the legend draws six zones from the real useJourneyProgress
// against mocked zone payloads, with the same "Stop N of M" numbering the
// boarding pass uses (tracing and story rows counted); a finished zone, the
// current zone and a locked zone each read as words, not colour; every zone
// links to the journey. Mobile twin: __tests__/journey-onepager.test.tsx.
const h = vi.hoisted(() => ({ byZone: {} as Record<number, unknown> }));

vi.mock("@workspace/api-client-react", () => ({
  useListCategoryLessonGroups: (categoryId: number) => h.byZone[categoryId],
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
