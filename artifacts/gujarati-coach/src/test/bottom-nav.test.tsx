import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// LanguagePicker calls useLanguage (needs LanguageProvider + API mocks).
// In BottomNav tests we only care about navigation structure, so stub it out.
vi.mock("@/components/language-picker", () => ({
  LanguagePicker: () => null,
}));

// BottomNav now reads activeLang directly — stub the context so no provider is needed.
vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({ activeLang: "gu", activeLanguage: undefined, languages: [], setActiveLang: () => {}, isLoading: false }),
}));


// XpCounter renders inside BottomNav; stub it out since this test only checks nav structure.
vi.mock("@/components/XpCounter", () => ({
  XpCounter: () => null,
}));

// BottomNav shows Home, Games, Bolo (chat), Progress and Feed.
// Friends moved to the Account/Profile page so is no longer in the bottom nav.
// Feed took the language switcher's slot on 2026-08-25.
// Imported after the mock is declared.
import { BottomNav } from "@/components/layout/bottom-nav";

function renderNav(ui: ReactElement, path = "/app") {
  const { hook } = memoryLocation({ path });
  return render(<Router hook={hook}>{ui}</Router>);
}

describe("BottomNav destinations", () => {
  test("renders the four primary destinations", () => {
    renderNav(<BottomNav />);

    expect(screen.getByRole("link", { name: /Home/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Games/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Chat with Bolo/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Progress/i })).toBeInTheDocument();
  });

  test("renders the canonical Bolo PNG (not the retired SVG rig) inside the chat button", () => {
    renderNav(<BottomNav />);

    const chatLink = screen.getByRole("link", { name: /Chat with Bolo/i });
    // Canonical-art rule: the centre button shows a whole-image canonical
    // mascot PNG. The hand-drawn SVG rig must not render anywhere in the app.
    const img = chatLink.querySelector("img");
    expect(img).toBeInTheDocument();
    expect(img?.getAttribute("src")).toContain("mascot-wave.png");
  });

  test("does not render a Friends link (Friends moved to Account page)", () => {
    renderNav(<BottomNav />);

    expect(screen.queryByRole("link", { name: /Friends/i })).not.toBeInTheDocument();
  });

  test("highlights Home when on the /app route", () => {
    renderNav(<BottomNav />, "/app");

    const homeLink = screen.getByRole("link", { name: /Home/i });
    expect(homeLink).toHaveClass("text-primary");
  });

  test("highlights Games when on a /games/* route", () => {
    renderNav(<BottomNav />, "/games");

    const gamesLink = screen.getByRole("link", { name: /Games/i });
    expect(gamesLink).toHaveClass("text-primary");
  });

  test("renders Feed, which took the language switcher's slot", () => {
    renderNav(<BottomNav />);

    // ADDED 2026-08-25. The fifth slot was a globe language switcher and the
    // board was reachable only from the home social strip, which buried the
    // whole social surface. Language was safe to take out of this bar because
    // it was never a destination: the sidebar picker and the home page one
    // both remain.
    expect(screen.getByRole("link", { name: /Feed/i })).toBeInTheDocument();
  });

  test("highlights Feed when on the /leaderboard route", () => {
    renderNav(<BottomNav />, "/leaderboard");

    const feedLink = screen.getByRole("link", { name: /Feed/i });
    expect(feedLink).toHaveClass("text-secondary");
  });

  test("highlights Progress when on the /progress route", () => {
    renderNav(<BottomNav />, "/progress");

    const progressLink = screen.getByRole("link", { name: /Progress/i });
    expect(progressLink).toHaveClass("text-secondary");
  });
});
