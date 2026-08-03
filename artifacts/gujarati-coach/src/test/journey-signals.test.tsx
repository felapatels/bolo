import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// Chunk 6B Story 3: trackside signals on the journey map. Pins:
// (1) seating: one signal in the gap after every odd global stop, none in
//     showroom mode;
// (2) states: upcoming (stop not done, disabled) / active / waved / cleared,
//     re-derived from storage;
// (3) the encounter dialog: rotation picks the game by signal index over the
//     eligible roster, the play link carries cat/ctx/gap, and "Wave me
//     through" records a session-scoped wave;
// (4) auto-wave: a zone under the min floor gets the signalman quip instead
//     of a game;
// (5) the train stops at the signal: an active signal right behind the
//     boardable stop suppresses the rail pulse run.

const h = vi.hoisted(() => ({
  groupsByZone: {} as Record<number, unknown[]>,
  access: null as string | null,
  phraseCount: 5,
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
    data: [1, 2, 3, 4, 5, 6].map((id) => ({
      id,
      title: `Zone ${id}`,
      phraseCount: h.phraseCount,
      iconName: "sparkles",
      polishEnabled: false,
    })),
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useListCategoryLessonGroups: (categoryId: number) => ({
    data: {
      lessonGroups: h.groupsByZone[categoryId] ?? [],
      ...(h.access !== null ? { access: h.access } : {}),
    },
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));

import Journey from "@/pages/journey";
import { JOURNEY_ZONES } from "@/lib/journeyLines";
import { isSignalStopSeen, isSignalWaved } from "@/lib/quick-games";

function renderJourney() {
  const { hook } = memoryLocation({ path: "/journey", record: true });
  return render(
    (<Router hook={hook}>{(<Journey />) as ReactElement}</Router>) as ReactElement,
  );
}

const grp = (id: number, status: string) => ({
  id,
  title: `Stop ${id}`,
  stage: "phrase",
  position: id,
  status,
  phraseCount: 5,
  masteredCount: 0,
});

function setZones(...zones: unknown[][]) {
  h.groupsByZone = {};
  JOURNEY_ZONES.forEach((z, i) => {
    h.groupsByZone[z.id] = zones[i] ?? [grp(9000 + z.id, "locked")];
  });
}

function zoneOf(n: number, base: number, status = "locked") {
  return Array.from({ length: n }, (_, i) => grp(base + i, status));
}

beforeEach(() => {
  h.access = null;
  h.phraseCount = 5;
  h.reduceMotion = false;
  setZones();
  sessionStorage.removeItem("bolo-signal-waved:gu");
  sessionStorage.removeItem("bolo-signal-stop-shown:gu");
  localStorage.removeItem("bolo-signal-cleared:gu");
  localStorage.removeItem("bolo-zone-closeout:gu");
});

describe("signal seating (story 3)", () => {
  test("one signal per gap after every odd global stop, upcoming ones disabled", () => {
    setZones(
      zoneOf(3, 100),
      zoneOf(3, 200),
      zoneOf(3, 300),
      zoneOf(3, 400),
      zoneOf(3, 500),
      zoneOf(3, 600),
    );
    renderJourney();
    // 18 stations -> gaps after stops 1,3,...,17.
    for (let gap = 1; gap < 18; gap += 2) {
      const btn = screen.getByTestId(`trackside-signal-${gap}`);
      expect(btn).toHaveAttribute("data-state", "upcoming");
      expect(btn).toBeDisabled();
    }
    expect(screen.queryByTestId("trackside-signal-2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("trackside-signal-18")).not.toBeInTheDocument();
  });

  test("showroom zones render no interactive signals at all", () => {
    h.access = "teaser";
    setZones(zoneOf(3, 100), zoneOf(3, 200));
    renderJourney();
    expect(screen.queryByTestId("trackside-signal-1")).not.toBeInTheDocument();
  });
});

describe("signal encounter (story 3)", () => {
  test("an active signal opens the encounter with the rotation's game link", () => {
    setZones([grp(101, "completed"), grp(102, "unlocked"), grp(103, "locked")]);
    renderJourney();
    const btn = screen.getByTestId("trackside-signal-1");
    expect(btn).toHaveAttribute("data-state", "active");
    fireEvent.click(btn);
    expect(screen.getByText("Signal ahead")).toBeInTheDocument();
    // Signal index 0 over the full 5-game roster (phraseCount 5) rotates to
    // Ticket Check; the link pins the zone topic and carries the gap ref.
    expect(screen.getByTestId("signal-play-game")).toHaveAttribute(
      "href",
      "/games/ticket-check?cat=1&ctx=signal&gap=1",
    );
  });

  test("gap 3 rotates to the second eligible game", () => {
    setZones(zoneOf(3, 100, "completed"), [
      grp(201, "completed"),
      grp(202, "unlocked"),
      grp(203, "locked"),
    ]);
    renderJourney();
    fireEvent.click(screen.getByTestId("trackside-signal-3"));
    expect(screen.getByTestId("signal-play-game")).toHaveAttribute(
      "href",
      "/games/wrong-platform?cat=1&ctx=signal&gap=3",
    );
  });

  test("wave me through records a session wave and the glyph turns waved", () => {
    setZones([grp(101, "completed"), grp(102, "unlocked"), grp(103, "locked")]);
    renderJourney();
    fireEvent.click(screen.getByTestId("trackside-signal-1"));
    fireEvent.click(screen.getByTestId("signal-wave-through"));
    expect(isSignalWaved("gu", 1)).toBe(true);
    const btn = screen.getByTestId("trackside-signal-1");
    expect(btn).toHaveAttribute("data-state", "waved");
    // Waved signals stay tappable: the unclaimed Chai stays claimable later.
    expect(btn).toBeEnabled();
  });

  test("a cleared signal reads cleared and offers a replay", () => {
    localStorage.setItem("bolo-signal-cleared:gu", "[1]");
    setZones([grp(101, "completed"), grp(102, "unlocked"), grp(103, "locked")]);
    renderJourney();
    const btn = screen.getByTestId("trackside-signal-1");
    expect(btn).toHaveAttribute("data-state", "cleared");
    fireEvent.click(btn);
    expect(screen.getByText("Signal already cleared")).toBeInTheDocument();
    expect(screen.getByTestId("signal-play-game")).toBeInTheDocument();
    expect(screen.queryByTestId("signal-wave-through")).not.toBeInTheDocument();
  });

  test("a zone under the min floor auto-waves with the signalman quip", () => {
    h.phraseCount = 1;
    setZones([grp(101, "completed"), grp(102, "unlocked"), grp(103, "locked")]);
    renderJourney();
    fireEvent.click(screen.getByTestId("trackside-signal-1"));
    expect(screen.getByTestId("signal-autowave-quip")).toHaveTextContent(
      "Not enough phrases here for a game yet. Green flag, straight through!",
    );
    fireEvent.click(screen.getByTestId("signal-carry-on"));
    expect(isSignalWaved("gu", 1)).toBe(true);
  });
});

describe("the train stops at the signal (story 3)", () => {
  test("an active signal right behind the boardable stop suppresses the pulse run", () => {
    setZones([grp(101, "completed"), grp(102, "unlocked"), grp(103, "locked")]);
    const { container } = renderJourney();
    expect(
      container.querySelectorAll('[data-testid="rail-pulse-dot"]'),
    ).toHaveLength(0);
  });

  test("waving that signal releases the train: the pulse run returns", () => {
    sessionStorage.setItem("bolo-signal-waved:gu", "[1]");
    setZones([grp(101, "completed"), grp(102, "unlocked"), grp(103, "locked")]);
    const { container } = renderJourney();
    expect(
      container.querySelectorAll('[data-testid="rail-pulse-dot"]').length,
    ).toBeGreaterThan(0);
  });
});

describe("soft stop (prod hotfix item 3)", () => {
  test("reaching a held signal auto-opens the encounter once per session", () => {
    // Closeout state seeded (returning learner): unseeded state suppresses
    // the soft stop for that first render while the overlay seeds silently.
    localStorage.setItem("bolo-zone-closeout:gu", JSON.stringify({}));
    setZones([grp(101, "completed"), grp(102, "unlocked"), grp(103, "locked")]);
    const first = renderJourney();
    // Auto-opened without any tap.
    expect(screen.getByText("Signal ahead")).toBeInTheDocument();
    expect(isSignalStopSeen("gu", 1)).toBe(true);
    first.unmount();
    // Same session: the stop was already seen, so a fresh mount stays quiet.
    renderJourney();
    expect(screen.queryByText("Signal ahead")).not.toBeInTheDocument();
  });

  test("a waved signal never auto-opens", () => {
    localStorage.setItem("bolo-zone-closeout:gu", JSON.stringify({}));
    sessionStorage.setItem("bolo-signal-waved:gu", "[1]");
    setZones([grp(101, "completed"), grp(102, "unlocked"), grp(103, "locked")]);
    renderJourney();
    expect(screen.queryByText("Signal ahead")).not.toBeInTheDocument();
    expect(isSignalStopSeen("gu", 1)).toBe(false);
  });

  test("a pending zone closeout suppresses the auto-open", () => {
    // Closeout state seeded but zone 1 not yet celebrated -> overlay pending;
    // the held signal behind zone 2's first stop must stay quiet.
    localStorage.setItem("bolo-zone-closeout:gu", JSON.stringify({}));
    setZones(zoneOf(3, 100, "completed"), [
      grp(201, "unlocked"),
      grp(202, "locked"),
      grp(203, "locked"),
    ]);
    renderJourney();
    expect(screen.getByTestId("zone-closeout-overlay")).toBeInTheDocument();
    expect(screen.queryByText("Signal ahead")).not.toBeInTheDocument();
  });
});
