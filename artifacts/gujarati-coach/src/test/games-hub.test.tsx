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

const h = vi.hoisted(() => ({ isPlus: false as boolean | undefined, isLoading: false }));

vi.mock("@/lib/entitlements", () => ({
  useEntitlements: () => ({ isPlus: h.isPlus, isLoading: h.isLoading }),
}));

vi.mock("@/components/mascot", () => ({ Mascot: () => null }));

import GamesPage from "@/pages/games/index";

const ALL_GAMES: Array<{ title: string; href: string; plusOnly: boolean }> = [
  { title: "Word Match", href: "/games/word-match", plusOnly: false },
  { title: "Listen & Pick", href: "/games/listen-and-pick", plusOnly: false },
  { title: "Phrase Builder", href: "/games/phrase-builder", plusOnly: true },
  { title: "Speed Round", href: "/games/speed-round", plusOnly: true },
  { title: "Bolo Quiz", href: "/games/bolo-quiz", plusOnly: true },
  // Chunk 6B: the five quick games, all free.
  { title: "Ticket Check", href: "/games/ticket-check", plusOnly: false },
  { title: "Wrong Platform", href: "/games/wrong-platform", plusOnly: false },
  { title: "Luggage Match", href: "/games/luggage-match", plusOnly: false },
  { title: "Express Listening", href: "/games/express-listening", plusOnly: false },
  { title: "Signal Lights", href: "/games/signal-lights", plusOnly: false },
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
  h.isLoading = false;
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

    // The Chunk 6B quick games have no vignettes (the animated preview loop
    // stays the original five).
    for (const id of [
      "ticket-check",
      "wrong-platform",
      "luggage-match",
      "express-listening",
      "signal-lights",
    ]) {
      expect(screen.queryByTestId(`game-preview-${id}`)).toBeNull();
    }
  });

  test("links every game to its own route for Plus users", () => {
    h.isPlus = true;
    renderPage();

    for (const game of ALL_GAMES) {
      expect(cardLink(game.title).getAttribute("href")).toBe(game.href);
    }
  });

  test("fails closed: Plus tiles stay locked while entitlements are loading, even if isPlus is already true", () => {
    h.isPlus = true;
    h.isLoading = true;
    renderPage();

    for (const game of ALL_GAMES) {
      const expectedHref = game.plusOnly ? "/upgrade" : game.href;
      expect(cardLink(game.title).getAttribute("href")).toBe(expectedHref);
    }
  });

  test("fails closed: Plus tiles stay locked when isPlus is undefined", () => {
    h.isPlus = undefined;
    h.isLoading = false;
    renderPage();

    for (const game of ALL_GAMES) {
      const expectedHref = game.plusOnly ? "/upgrade" : game.href;
      expect(cardLink(game.title).getAttribute("href")).toBe(expectedHref);
    }
  });
});
