import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// ---------------------------------------------------------------------------
// Guards the /games hub after the animated preview vignettes replaced the
// static icon tiles: all five game cards must still render their titles,
// stay wrapped in working links (locked cards route to /upgrade, unlocked
// ones to the game), and each card must carry its preview vignette.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({ isPlus: false }));

vi.mock("@/lib/entitlements", () => ({
  useEntitlements: () => ({ isPlus: h.isPlus, isLoading: false }),
}));

vi.mock("@/components/mascot", () => ({ Mascot: () => null }));

import GamesPage from "@/pages/games/index";

const ALL_GAMES: Array<{ title: string; href: string; plusOnly: boolean }> = [
  { title: "Word Match", href: "/games/word-match", plusOnly: false },
  { title: "Listen & Pick", href: "/games/listen-and-pick", plusOnly: false },
  { title: "Phrase Builder", href: "/games/phrase-builder", plusOnly: true },
  { title: "Speed Round", href: "/games/speed-round", plusOnly: true },
  { title: "Bolo Quiz", href: "/games/bolo-quiz", plusOnly: true },
];

function renderPage() {
  const { hook } = memoryLocation({ path: "/games" });
  return render(
    <Router hook={hook}>
      <GamesPage />
    </Router>,
  );
}

/** The wrapping <a> for a game card, found from its visible title. */
function cardLink(title: string) {
  const link = screen.getByText(title).closest("a");
  expect(link).not.toBeNull();
  return link!;
}

beforeEach(() => {
  h.isPlus = false;
});

describe("Games hub cards", () => {
  test("renders every game with title, link, and preview vignette (free user)", () => {
    renderPage();

    for (const game of ALL_GAMES) {
      // Locked Plus games route to the upgrade page for free users.
      const expectedHref = game.plusOnly ? "/upgrade" : game.href;
      expect(cardLink(game.title).getAttribute("href")).toBe(expectedHref);
    }

    // Every card carries its animated preview vignette (decorative, hidden
    // from assistive tech), including the locked Plus ones.
    for (const id of [
      "word-match",
      "listen-and-pick",
      "phrase-builder",
      "speed-round",
      "bolo-quiz",
    ]) {
      const preview = screen.getByTestId(`game-preview-${id}`);
      expect(preview.getAttribute("aria-hidden")).toBe("true");
    }
  });

  test("links every game to its own route for Plus users", () => {
    h.isPlus = true;
    renderPage();

    for (const game of ALL_GAMES) {
      expect(cardLink(game.title).getAttribute("href")).toBe(game.href);
    }
  });
});
