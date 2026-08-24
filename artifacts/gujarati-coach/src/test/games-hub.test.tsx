import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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

import GamesPage from "@/pages/games/index";

/**
 * The curated shelves, in the exact order the hub must render them.
 * Vocabulary leads so Luggage Match — the hero, and the first card of that
 * group — takes the top-left slot, matching the mobile hub's ordering.
 */
const GROUPS: Array<{ id: string; title: string; gameIds: string[] }> = [
  {
    id: "vocabulary",
    title: "Vocabulary",
    // Storybook joined this shelf LAST, chat 5, so the hero (the first card of
    // this group) is unchanged by its arrival.
    gameIds: [
      "luggage-match",
      "word-match",
      "ticket-check",
      "bolo-quiz",
      "storybook",
    ],
  },
  {
    id: "listening",
    title: "Listening",
    gameIds: ["listen-and-pick", "express-listening", "signal-lights"],
  },
  {
    id: "building",
    title: "Building",
    gameIds: ["wrong-platform", "phrase-builder", "speed-round"],
  },
];

const GAME_META: Record<string, { title: string; href: string; plusOnly: boolean }> = {
  "word-match": { title: "Word Match", href: "/games/word-match", plusOnly: true },
  "listen-and-pick": {
    title: "Listen & Pick",
    href: "/games/listen-and-pick",
    plusOnly: true,
  },
  "phrase-builder": {
    title: "Phrase Builder",
    href: "/games/phrase-builder",
    plusOnly: true,
  },
  "speed-round": { title: "Speed Round", href: "/games/speed-round", plusOnly: true },
  "bolo-quiz": { title: "Bolo Quiz", href: "/games/bolo-quiz", plusOnly: true },
  "ticket-check": { title: "Ticket Check", href: "/games/ticket-check", plusOnly: false },
  "wrong-platform": {
    title: "Wrong Platform",
    href: "/games/wrong-platform",
    plusOnly: false,
  },
  "luggage-match": {
    title: "Luggage Match",
    href: "/games/luggage-match",
    plusOnly: false,
  },
  "express-listening": {
    title: "Express Listening",
    href: "/games/express-listening",
    plusOnly: false,
  },
  "signal-lights": {
    title: "Signal Lights",
    href: "/games/signal-lights",
    plusOnly: false,
  },
  // plusOnly FALSE with the server holding the line: the journey 1 zone 1 book
  // opens its first scene to every plan, so a lock chip here would advertise a
  // wall the learner does not hit until scene 2.
  storybook: { title: "Storybook", href: "/games/storybook", plusOnly: false },
};

const ALL_IDS = GROUPS.flatMap((g) => g.gameIds);

/**
 * The hero is the first card of the Vocabulary group. It is deliberately a
 * FREE game: with all five vignette-bearing games gated, a locked hero over a
 * hub whose every animated card is locked reads as a paywall menu.
 */
const FEATURED_ID = "luggage-match";

/** The grid renders every game EXCEPT the promoted hero (no duplicate). */
const GRID_IDS = ALL_IDS.filter((id) => id !== FEATURED_ID);

/** A group's cards as the grid renders them, hero removed. */
function gridIdsFor(group: { gameIds: string[] }) {
  return group.gameIds.filter((id) => id !== FEATURED_ID);
}

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

describe("Games hub grouping", () => {
  test("renders the three groups in fixed order", () => {
    renderPage();
    const rendered = Array.from(
      catalog().querySelectorAll("[data-testid^='games-group-']"),
    ).map((el) => el.getAttribute("data-testid"));
    expect(rendered).toEqual([
      "games-group-vocabulary",
      "games-group-listening",
      "games-group-building",
    ]);
  });

  test("each group renders its heading and its games in the curated order", () => {
    renderPage();
    for (const group of GROUPS) {
      const section = screen.getByTestId(`games-group-${group.id}`);
      expect(within(section).getByText(group.title)).toBeTruthy();

      const order = Array.from(
        section.querySelectorAll("[data-testid^='game-card-']"),
      ).map((el) => el.getAttribute("data-testid")!.replace("game-card-", ""));
      // Curated order is preserved for the cards that remain after the hero
      // is lifted out of its group.
      expect(order).toEqual(gridIdsFor(group));
    }
  });

  test("the catalog holds the ten non-promoted games, and hero plus grid is all eleven", () => {
    renderPage();
    const rendered = Array.from(
      catalog().querySelectorAll("[data-testid^='game-card-']"),
    ).map((el) => el.getAttribute("data-testid")!.replace("game-card-", ""));
    expect(rendered).toEqual(GRID_IDS);
    expect(rendered).toHaveLength(10);
    // Nothing was lost by promoting one card out of the grid.
    expect([...rendered, FEATURED_ID].sort()).toEqual([...ALL_IDS].sort());
  });
});

describe("Games hub featured slot", () => {
  test("promotes the first card of the Vocabulary group", () => {
    renderPage();
    const featured = screen.getByTestId("featured-game");
    expect(within(featured).getByText(GAME_META[FEATURED_ID].title)).toBeTruthy();
    expect(within(featured).getByText("Featured")).toBeTruthy();
  });

  test("the promoted game does NOT also render in the grid below", () => {
    renderPage();
    // No duplicate card...
    expect(within(catalog()).queryByTestId(`game-card-${FEATURED_ID}`)).toBeNull();
    // ...and no duplicate title anywhere on the page.
    expect(screen.queryAllByText(GAME_META[FEATURED_ID].title)).toHaveLength(1);
  });

  test("the hero is a non-gated card: free to a free user, never a lock", () => {
    renderPage();
    expect(GAME_META[FEATURED_ID].plusOnly).toBe(false);
    const featured = screen.getByTestId("featured-game");
    expect(within(featured).getByText("Free")).toBeTruthy();
    expect(within(featured).queryByText("All-Access")).toBeNull();
    expect(within(featured).queryByTestId("lock-chip")).toBeNull();
    expect(featured.closest("a")!.getAttribute("href")).toBe(
      GAME_META[FEATURED_ID].href,
    );
  });

  test("the hero opens its own game for All-Access members too", () => {
    h.isPlus = true;
    renderPage();
    const featured = screen.getByTestId("featured-game");
    expect(featured.closest("a")!.getAttribute("href")).toBe(
      GAME_META[FEATURED_ID].href,
    );
    expect(within(featured).queryByTestId("lock-chip")).toBeNull();
  });
});

describe("Games hub gating", () => {
  test("web splits five gated / six free", () => {
    // Six free since the storybook landed: it is All-Access with a free taste,
    // and a card that wears a lock over a playable first scene is the exact
    // pairing the Script Trace taste was created to remove.
    expect(GATED_IDS).toHaveLength(5);
    expect(FREE_IDS).toHaveLength(6);
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
    // The fifth free game is the hero, covered by the featured-slot tests.
    for (const id of FREE_IDS.filter((id) => id !== FEATURED_ID)) {
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
    // Nor does the featured slot.
    const featured = screen.getByTestId("featured-game");
    expect(within(featured).queryByText(/energy/i)).toBeNull();
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
    // The quick games have no vignette; they keep their static icons.
    // (luggage-match is one of them, and is now the hero rather than a tile.)
    for (const id of [
      "ticket-check",
      "wrong-platform",
      "express-listening",
      "signal-lights",
    ]) {
      expect(within(catalog()).queryByTestId(`game-preview-${id}`)).toBeNull();
    }
    // The hero has no vignette either, so it renders no preview handle at all.
    expect(screen.queryByTestId("featured-game-preview")).toBeNull();
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
