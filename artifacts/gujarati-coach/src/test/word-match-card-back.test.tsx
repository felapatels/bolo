import { describe, test, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { WordMatchCardBack } from "@/pages/games/word-match";

// ---------------------------------------------------------------------------
// The Word Match face-down card back (web).
//
// It shipped as a lucide `Link2` chain-link glyph at 40% opacity, which read
// as a broken-image placeholder rather than a designed card back, while the
// mobile game had been rendering the canonical waving Bolo all along. These
// tests pin the art so the placeholder cannot quietly return: the back is one
// component, it renders the shipped mascot PNG, and it contains no icon glyph.
// ---------------------------------------------------------------------------

afterEach(cleanup);

describe("word match card back", () => {
  test("renders the canonical waving mascot, the same art mobile deals", () => {
    const { container } = render(<WordMatchCardBack />);

    expect(screen.getByTestId("word-match-card-back")).toBeTruthy();

    const imgs = [...container.querySelectorAll("img")];
    expect(imgs).toHaveLength(1);
    // Canonical mascot rule: a shipped PNG from public/mascot, never new art.
    expect(imgs[0].getAttribute("src")).toContain("mascot/mascot-wave.png");
  });

  test("no icon glyph on the back, the chain-link placeholder cannot return", () => {
    const { container } = render(<WordMatchCardBack />);

    // lucide icons (Link2 among them) render as inline <svg>. The back face is
    // the mascot image and nothing else, so any svg here is a regression.
    expect(container.querySelectorAll("svg")).toHaveLength(0);
  });
});
