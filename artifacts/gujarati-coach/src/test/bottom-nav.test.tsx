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

// BottomNav shows Home, Games, Bolo (chat), and Progress tabs.
// Friends moved to the Account/Profile page so is no longer in the bottom nav.
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

  test("renders the rigged Bolo (not a static image) inside the chat button", () => {
    renderNav(<BottomNav />);

    const chatLink = screen.getByRole("link", { name: /Chat with Bolo/i });
    // The centre button hosts the living SVG rig now — no <img> fallback.
    expect(chatLink.querySelector("svg")).toBeInTheDocument();
    expect(chatLink.querySelector("img")).not.toBeInTheDocument();
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

  test("highlights Progress when on the /progress route", () => {
    renderNav(<BottomNav />, "/progress");

    const progressLink = screen.getByRole("link", { name: /Progress/i });
    expect(progressLink).toHaveClass("text-secondary");
  });
});
