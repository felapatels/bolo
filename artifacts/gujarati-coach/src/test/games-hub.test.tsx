import { describe, test, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type React from "react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// ---------------------------------------------------------------------------
// Guards the /games hub after the Build 35 redesign:
//   - a featured slot above the catalog, sourced from the curated groups
//   - the promoted hero is NOT gated, and does NOT also render in the grid
//   - three curated groups whose order (and within-group order) is fixed
//   - five gated games / five free games on web
//   - every gated card renders locked AND stays tappable to /upgrade
//   - no card renders an energy or quick/deep chip (difficulty chip only)
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({ isPlus: false as boolean | undefined, isLoading: false }));

vi.mock("@/lib/entitlements", () => ({
  useEntitlements: () => ({ isPlus: h.isPlus, isLoading: h.isLoading }),
}));

vi.mock("@/components/mascot", () => ({ Mascot: () => null }));
// The hero's language line is the LanguagePicker's trigger; the picker
// itself (the dialog, the entitlement reads) is another file's test.
vi.mock("@/components/language-picker", () => ({
  LanguagePicker: ({ trigger }: { trigger?: React.ReactNode }) => <>{trigger}</>,
}));
// The hero's language line reads the language context and the learner's
// current city; neither has a provider here.
vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({
    activeLang: "gu",
    activeLanguage: { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" },
    languages: [],
    setActiveLang: () => {},
    isLoading: false,
  }),
}));
vi.mock("@/lib/useJourneyProgress", () => ({
  useJourneyProgress: () => ({ current: null, doneCount: 0, isLoading: false, planBlocked: false }),
}));

import GamesPage from "@/pages/games/index";
import { GAMES as REAL_GAMES } from "@/pages/games/index";

/**
 * THE PHONE'S ORDER, which the hub renders as ONE grid since 2026-08-30 (the
 * owner: "games page needs update on web to match new mobile one"). The
 * curated shelves and the promoted Featured card went with it. Express
 * Listening is web-only and sits beside its listening sibling; Chacha-ji's
 * call is mobile-only and absent.
 */
const HUB_ORDER = [
  "luggage-match",
  "word-match",
  "signal-lights",
  "phrase-builder",
  "speed-round",
  "bolo-quiz",
  "ticket-check",
  "storybook",
  "emergency",
  "listen-and-pick",
  "express-listening",
  "wrong-platform",
  "wrong-platform-2",
];

/**
 * THE ROSTER, READ FROM THE PAGE ITSELF rather than copied.
 *
 * This used to be a hand-maintained duplicate, and on 2026-08-24 it did what a
 * duplicate always does: the storybook moved from free to All-Access in the
 * real list, this copy still said free, and three tests failed on correct
 * behaviour. A fixture that has to be edited every time the product changes is
 * not testing the product, it is testing whether somebody remembered.
 *
 * Titles and hrefs stay derived too, so a renamed game cannot pass here while
 * being wrong on screen.
 */
const GAME_META: Record<string, { title: string; href: string; plusOnly: boolean }> =
  Object.fromEntries(
    REAL_GAMES.map((g) => [g.id, { title: g.title, href: g.href, plusOnly: g.plusOnly }]),
  );

const ALL_IDS = REAL_GAMES.map((g) => g.id);

/** Every game is in the grid now: there is no promoted card to lift out. */
const GRID_IDS = ALL_IDS;

const LAST_PLAYED_KEY = "bolo.games.lastPlayed";

const GATED_IDS = ALL_IDS.filter((id) => GAME_META[id].plusOnly);
const FREE_IDS = ALL_IDS.filter((id) => !GAME_META[id].plusOnly);

function renderPage() {
  const { hook } = memoryLocation({ path: "/games" });
  return render(
    <Router hook={hook}>
      <GamesPage />
    </Router>,
  );
}

/** Everything below the featured slot. */
function catalog() {
  return screen.getByTestId("games-catalog");
}

/** The wrapping <a> for a catalog card, found from its card test id. */
function cardLink(gameId: string) {
  const link = within(catalog())
    .getByTestId(`game-card-${gameId}`)
    .closest("a");
  expect(link).not.toBeNull();
  return link!;
}

beforeEach(() => {
  h.isPlus = false;
  h.isLoading = false;
});

describe("Games hub grid", () => {
  test("renders every game once, as one grid in the phone's order", () => {
    renderPage();
    const rendered = Array.from(
      catalog().querySelectorAll("[data-testid^='game-card-']"),
    ).map((el) => el.getAttribute("data-testid")!.replace("game-card-", ""));
    expect(rendered).toEqual(HUB_ORDER);
    // Nothing in the roster is lost by the ordering.
    expect([...rendered].sort()).toEqual([...ALL_IDS].sort());
    // The shelves and the promoted card are gone.
    expect(catalog().querySelectorAll("[data-testid^='games-group-']")).toHaveLength(0);
    expect(screen.queryByTestId("featured-game")).toBeNull();
  });

  test("the hero carries the words, the painting and the language line", () => {
    renderPage();
    const hero = screen.getByTestId("games-hero");
    expect(within(hero).getByText("Games")).toBeTruthy();
    expect(within(hero).getByText("Play your way to fluency")).toBeTruthy();
    // INVERTED, build 29: the hero is the film now, its own first frame as poster.
    const film = hero.querySelector("video")!;
    expect(film.getAttribute("poster")).toContain("games/hero-first.jpg");
    expect(film.querySelector("source")!.getAttribute("src")).toContain("games/hero.mp4");
    // A button, the picker's trigger, never a link to /choose-language:
    // that page redirects an account that has already chosen.
    const line = screen.getByTestId("games-language-line");
    expect(line.tagName).toBe("BUTTON");
    expect(line).toHaveTextContent("Gujarati");
  });

  test("every tile shows its painting, or a gradient where no painting exists", () => {
    renderPage();
    for (const id of GRID_IDS) {
      const card = within(catalog()).getByTestId(`game-card-${id}`);
      const img = card.querySelector("img");
      if (id === "express-listening") {
        expect(img).toBeNull();
      } else {
        expect(img!.getAttribute("src")).toContain(`games/${id}.png`);
      }
    }
  });
});

describe("Games hub continue playing", () => {
  beforeEach(() => {
    localStorage.removeItem(LAST_PLAYED_KEY);
  });

  test("with nothing remembered there is no band", () => {
    renderPage();
    expect(screen.queryByTestId("games-continue")).toBeNull();
  });

  test("the last game opened comes back wide, with Play again, and stays in the grid", () => {
    localStorage.setItem(LAST_PLAYED_KEY, "ticket-check");
    renderPage();
    const band = screen.getByTestId("games-continue");
    expect(within(band).getByText("Continue playing".toUpperCase())).toBeTruthy();
    const card = within(band).getByTestId("continue-ticket-check");
    expect(within(card).getByText("Ticket Check")).toBeTruthy();
    expect(within(card).getByText("Play again")).toBeTruthy();
    expect(card.getAttribute("href")).toBe(GAME_META["ticket-check"].href);
    // The phone keeps the game in the grid too; the band is a shortcut.
    expect(within(catalog()).getByTestId("game-card-ticket-check")).toBeTruthy();
  });

  test("a remembered gated game offers Unlock and the upgrade route to a free learner", () => {
    localStorage.setItem(LAST_PLAYED_KEY, "word-match");
    renderPage();
    const card = screen.getByTestId("continue-word-match");
    expect(within(card).getByText("Unlock")).toBeTruthy();
    expect(card.getAttribute("href")).toBe("/upgrade");
  });

  test("opening a free game from the grid remembers it", () => {
    renderPage();
    fireEvent.click(cardLink("ticket-check"));
    expect(localStorage.getItem(LAST_PLAYED_KEY)).toBe("ticket-check");
    expect(screen.getByTestId("games-continue")).toBeTruthy();
  });

  test("an unknown remembered id renders no band", () => {
    localStorage.setItem(LAST_PLAYED_KEY, "no-such-game");
    renderPage();
    expect(screen.queryByTestId("games-continue")).toBeNull();
  });
});

describe("Games hub gating", () => {
  test("every game is on exactly one side of the line", () => {
    // COUNTED FROM THE ROSTER, not asserted as 5 and 6. The literals were wrong
    // within a day: the storybook went All-Access on 2026-08-24 at the owner's
    // direction and the count moved with it.
    //
    // THE ARGUMENT THAT USED TO SIT HERE IS WORTH KEEPING, because it was a real
    // decision and it has now been reversed: the storybook was free in the hub
    // because "a card that wears a lock over a playable first scene is the exact
    // pairing the Script Trace taste was created to remove". What changed is
    // that the taste grew from one scene to the whole zone 1 book and moved to
    // stop 4 so a free learner meets it ON THE MAP. The hub card is now the paid
    // door and the map is the free one, which is the split Beat the Train uses.
    expect(GATED_IDS.length + FREE_IDS.length).toBe(ALL_IDS.length);
    expect(GATED_IDS.filter((id) => FREE_IDS.includes(id))).toEqual([]);
    expect(GAME_META["storybook"]!.plusOnly).toBe(true);
    expect(GATED_IDS).toEqual(
      expect.arrayContaining([
        "word-match",
        "listen-and-pick",
        "phrase-builder",
        "speed-round",
        "bolo-quiz",
      ]),
    );
  });

  test("free user: all five gated cards render locked and stay tappable to /upgrade", () => {
    renderPage();
    for (const id of GATED_IDS) {
      const card = within(catalog()).getByTestId(`game-card-${id}`);
      // The gate is legible on the card itself.
      expect(within(card).getByText("All-Access")).toBeTruthy();
      expect(within(card).getByTestId("lock-chip")).toBeTruthy();
      // Never a dead end.
      expect(cardLink(id).getAttribute("href")).toBe("/upgrade");
    }
  });

  test("free user: the free cards in the grid open their own game", () => {
    renderPage();
    for (const id of FREE_IDS) {
      const card = within(catalog()).getByTestId(`game-card-${id}`);
      expect(within(card).getByText("Free")).toBeTruthy();
      expect(within(card).queryByTestId("lock-chip")).toBeNull();
      expect(cardLink(id).getAttribute("href")).toBe(GAME_META[id].href);
    }
  });

  test("gated cards keep full-color art: no grayscale or dimming classes", () => {
    renderPage();
    for (const id of GATED_IDS) {
      const card = within(catalog()).getByTestId(`game-card-${id}`);
      const cls = card.className;
      expect(cls).not.toMatch(/grayscale/);
      expect(cls).not.toMatch(/\bopacity-(?:[0-8]?\d)\b/);
      expect(cls).not.toMatch(/saturate-\[0/);
    }
  });

  test("links every game to its own route for All-Access members", () => {
    h.isPlus = true;
    renderPage();
    for (const id of GRID_IDS) {
      expect(cardLink(id).getAttribute("href")).toBe(GAME_META[id].href);
      expect(
        within(catalog()).queryByTestId(`game-card-${id}`)!.querySelector(
          "[data-testid='lock-chip']",
        ),
      ).toBeNull();
    }
  });

  test("fails closed: gated tiles stay locked while entitlements are loading, even if isPlus is already true", () => {
    h.isPlus = true;
    h.isLoading = true;
    renderPage();
    for (const id of GRID_IDS) {
      const expectedHref = GAME_META[id].plusOnly ? "/upgrade" : GAME_META[id].href;
      expect(cardLink(id).getAttribute("href")).toBe(expectedHref);
    }
  });

  test("fails closed: gated tiles stay locked when isPlus is undefined", () => {
    h.isPlus = undefined;
    h.isLoading = false;
    renderPage();
    for (const id of GRID_IDS) {
      const expectedHref = GAME_META[id].plusOnly ? "/upgrade" : GAME_META[id].href;
      expect(cardLink(id).getAttribute("href")).toBe(expectedHref);
    }
  });
});

describe("Games hub chips", () => {
  test("every card renders exactly one difficulty chip", () => {
    renderPage();
    for (const id of GRID_IDS) {
      const card = within(catalog()).getByTestId(`game-card-${id}`);
      const difficulties = within(card).queryAllByText(
        /^(Beginner|Intermediate|Advanced)$/,
      );
      expect(difficulties).toHaveLength(1);
    }
  });

  test("no card renders an energy or quick/deep chip", () => {
    renderPage();
    for (const id of GRID_IDS) {
      const card = within(catalog()).getByTestId(`game-card-${id}`);
      expect(within(card).queryByText(/energy/i)).toBeNull();
      expect(within(card).queryByText(/^\s*(quick|deep)\s*$/i)).toBeNull();
    }
  });

  test("copy canon: the hub says All-Access and never Plus", () => {
    renderPage();
    expect(screen.queryAllByText(/\bPlus\b/)).toHaveLength(0);
    expect(screen.queryAllByText("All-Access").length).toBeGreaterThan(0);
  });
});

describe("Games hub vignettes", () => {
  test("only the five games with vignette assets render one", () => {
    renderPage();
    for (const id of ["word-match", "listen-and-pick", "phrase-builder", "speed-round", "bolo-quiz"]) {
      const preview = within(catalog()).getByTestId(`game-preview-${id}`);
      expect(preview.getAttribute("aria-hidden")).toBe("true");
    }
    // The quick games have no vignette; their medallions keep the static
    // icon. luggage-match is a tile again (the promoted slot is gone).
    for (const id of [
      "luggage-match",
      "ticket-check",
      "wrong-platform",
      "express-listening",
      "signal-lights",
    ]) {
      expect(within(catalog()).queryByTestId(`game-preview-${id}`)).toBeNull();
    }
  });

  test("vignette loops are staggered: no two share a phase offset", () => {
    renderPage();
    const delays = Array.from(
      catalog().querySelectorAll("[data-testid^='game-preview-']"),
    ).map((el) => (el as HTMLElement).style.getPropertyValue("--gv-delay"));
    expect(delays).toHaveLength(5);
    expect(new Set(delays).size).toBe(delays.length);
  });
});
