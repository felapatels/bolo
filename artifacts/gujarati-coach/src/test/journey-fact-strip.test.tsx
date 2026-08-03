import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// Hotfix 3 item 6: the postcard's live "Did you know?" fact strip. New file
// because the strip is a genuinely new interactive auto-cycling surface with
// its own motion contract. Pins:
// (1) the strip leads with today's daily pick (factRotationForZone parity);
// (2) tapping advances to the next fact in the rotation immediately;
// (3) the strip auto-advances after the cycle interval (crossfade swap);
// (4) reduced motion: NO auto-cycling, but tap still advances instantly.

const h = vi.hoisted(() => ({
  groupsByZone: {} as Record<number, unknown[]>,
  reduceMotion: false as boolean | null,
}));

vi.mock("framer-motion", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useReducedMotion: () => h.reduceMotion,
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
}));

import Journey from "@/pages/journey";
import { JOURNEY_LINES, JOURNEY_ZONES } from "@/lib/journeyLines";
import { factRotationForZone } from "@/lib/india-facts";

function renderJourney() {
  const { hook } = memoryLocation({ path: "/journey", record: true });
  return render(
    (<Router hook={hook}>{(<Journey />) as ReactElement}</Router>) as ReactElement,
  );
}

const grp = (id: number) => ({
  id,
  title: `Stop ${id}`,
  stage: "phrase",
  position: id,
  status: "locked",
  phraseCount: 5,
  masteredCount: 0,
});

beforeEach(() => {
  h.reduceMotion = false;
  h.groupsByZone = {};
  JOURNEY_ZONES.forEach((z) => {
    h.groupsByZone[z.id] = [grp(9000 + z.id)];
  });
});

/** The zone-0 rotation exactly as journey.tsx computes it (salt 1): geoName
 *  comes from the active line's positional zone names, lineName from the
 *  line itself (mocked language is gu -> Gujarat Express). */
function zone0Rotation(): string[] {
  const line = JOURNEY_LINES.gu!;
  return factRotationForZone({
    zoneIndex: 0,
    geoName: line.zones[0],
    lineName: line.lineName,
    salt: 1,
  });
}

describe("postcard live fact strip (Hotfix 3 item 6)", () => {
  test("leads with today's pick and a tap advances to the next fact (reduced motion: instant)", () => {
    h.reduceMotion = true;
    renderJourney();
    const rotation = zone0Rotation();
    const strip = screen.getByTestId("postcard-fact-0");
    expect(strip).toHaveTextContent(rotation[0]!);
    fireEvent.click(strip);
    expect(strip).toHaveTextContent(rotation[1]!);
    fireEvent.click(strip);
    expect(strip).toHaveTextContent(rotation[2]!);
  });

  test("auto-advances to the next fact after the cycle interval", () => {
    vi.useFakeTimers();
    try {
      renderJourney();
      const rotation = zone0Rotation();
      const strip = screen.getByTestId("postcard-fact-0");
      expect(strip).toHaveTextContent(rotation[0]!);
      // One full cycle (6s) plus the crossfade swap (250ms).
      act(() => vi.advanceTimersByTime(6000));
      act(() => vi.advanceTimersByTime(250));
      expect(strip).toHaveTextContent(rotation[1]!);
    } finally {
      vi.useRealTimers();
    }
  });

  test("reduced motion: the strip never auto-cycles", () => {
    h.reduceMotion = true;
    vi.useFakeTimers();
    try {
      renderJourney();
      const rotation = zone0Rotation();
      const strip = screen.getByTestId("postcard-fact-0");
      act(() => vi.advanceTimersByTime(13_000));
      expect(strip).toHaveTextContent(rotation[0]!);
    } finally {
      vi.useRealTimers();
    }
  });
});
