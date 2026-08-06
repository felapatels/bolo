import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { ChaiGlyph, ChaiStallVignette, STALL_ASSETS } from "@/components/chai-stall";

// ---------------------------------------------------------------------------
// Chacha-ji's Chai Stall, web side.
//
//  - the kulhad glyph is Chai's inline mark and renders the delivered art
//  - the stall vignette is a layer-mapped scene: stall + one steam plume
//  - the steam loop is pure CSS with NO fill-mode, so the global
//    prefers-reduced-motion rule collapses it onto a visible resting frame
//  - CENSUS: every Chai surface carries the glyph and no Coffee icon survives
//    on one. The census is a count, not a presence check, so a NEW Chai
//    surface that forgets the glyph fails here instead of shipping a coffee
//    cup next to a kulhad.
// ---------------------------------------------------------------------------

/**
 * Locate this artifact's `src/`. Under vitest `import.meta.url` is not a file
 * URL, so the census walks out from the working directory instead (and also
 * checks the artifact path, in case the suite is run from the repo root).
 */
function findSrc(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    for (const candidate of [
      path.join(dir, "src"),
      path.join(dir, "artifacts", "gujarati-coach", "src"),
    ]) {
      if (fs.existsSync(path.join(candidate, "components", "chai-stall.css"))) {
        return candidate;
      }
    }
    dir = path.dirname(dir);
  }
  throw new Error(`could not locate gujarati-coach/src from ${process.cwd()}`);
}

const SRC = findSrc();

function read(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), "utf8");
}

/**
 * The Chai surfaces and how many amounts each one marks. Total is the
 * per-platform count; web carries SEVEN (the wallet sheet marks both spend
 * buttons). Mobile's twin census lives in
 * artifacts/bolo-mobile/__tests__/chai-stall.test.tsx.
 */
const GLYPH_SITES: Record<string, number> = {
  "components/chai-wallet.tsx": 2, // Equip · 5, Start · 10
  "pages/home.tsx": 1, // Chai stat cell
  "pages/games/quick-game-frame.tsx": 1, // chai-earn-beat
  "pages/games/speed-round.tsx": 1, // +N Chai earned
  "pages/journey.tsx": 1, // signal-chai-chip
  "pages/practice.tsx": 1, // session-chai-pill
};

const WEB_GLYPH_COUNT = 7;

describe("chai glyph", () => {
  test("renders the delivered kulhad art, decoratively", () => {
    render(<ChaiGlyph className="h-4 w-4" />);
    const glyph = screen.getByTestId("chai-glyph");
    expect(glyph.getAttribute("src")).toBe(STALL_ASSETS.kulhad);
    expect(glyph.getAttribute("src")).toMatch(/stall\/kulhad\.png$/);
    // Decorative: every site already writes the amount and the word "Chai".
    expect(glyph).toHaveAttribute("aria-hidden", "true");
    expect(glyph.getAttribute("alt")).toBe("");
    // Sizing comes from the caller, exactly like the Coffee icon it replaced.
    expect(glyph.className).toContain("h-4 w-4");
  });
});

describe("chai stall vignette", () => {
  test("renders the scene with the steam plume layered over it", () => {
    render(<ChaiStallVignette className="h-14" />);
    const scene = screen.getByTestId("chai-stall-scene");
    const steam = screen.getByTestId("chai-stall-steam");
    expect(scene.getAttribute("src")).toBe(STALL_ASSETS.scene);
    expect(steam.getAttribute("src")).toBe(STALL_ASSETS.steam);
    // Layer map: the plume is placed in fractions of the scene box, so art
    // swaps keep working as long as the kettle stays put.
    expect(steam.style.left).toMatch(/%$/);
    expect(steam.style.bottom).toMatch(/%$/);
    expect(steam.style.width).toMatch(/%$/);
  });

  test("the whole vignette is decorative and never in the way", () => {
    render(<ChaiStallVignette className="h-14" />);
    const box = screen.getByTestId("chai-stall-vignette");
    expect(box).toHaveAttribute("aria-hidden", "true");
    expect(box.className).toContain("pointer-events-none");
  });

  test("the steam loop respects reduced motion and rests on a visible frame", () => {
    // jsdom applies no stylesheets, so the reduced-motion contract is pinned
    // at the source: ONE looping CSS animation (which the global
    // prefers-reduced-motion rule in index.css collapses), a base opacity
    // that keeps the plume visible once collapsed, and NO fill-mode — with
    // `forwards`/`both` the collapsed animation would strand the plume on its
    // last keyframe instead of its resting frame.
    // Comments are stripped first: the file EXPLAINS why there is no
    // fill-mode, and prose must not satisfy (or trip) a declaration check.
    const css = read("components/chai-stall.css").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).toMatch(/\.chai-stall-steam\s*{[^}]*opacity:\s*0?\.\d+/);
    expect(css).toMatch(/animation:\s*chai-steam-rise\s+\d+ms[^;]*infinite/);
    expect(css).not.toMatch(/animation-fill-mode/);
    expect(css).not.toMatch(/infinite\s+(forwards|both)/);

    // And the global rule really does cover this class: the only exemption is
    // .animate-spin (functional loaders), which the plume is not.
    const globals = read("index.css");
    expect(globals).toContain("@media (prefers-reduced-motion: reduce)");
    expect(globals).toContain("*:not(.animate-spin)");
    expect(globals).not.toContain("chai-stall-steam");
  });
});

describe("chai glyph census (web)", () => {
  test("every Chai surface carries the glyph, with the exact expected count", () => {
    const counts: Record<string, number> = {};
    for (const file of Object.keys(GLYPH_SITES)) {
      counts[file] = read(file).split("<ChaiGlyph").length - 1;
    }
    // Compared as an object so a failure names the offending file.
    expect(counts).toEqual(GLYPH_SITES);

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(WEB_GLYPH_COUNT);
  });

  test("no Coffee icon survives on a Chai surface", () => {
    const survivors: string[] = [];
    for (const file of Object.keys(GLYPH_SITES)) {
      // The word also appears in prose ("the wallet's kulhad glyph…"), so the
      // check is for the icon itself: a lucide import or a rendered element.
      const src = read(file);
      if (/<Coffee[\s/>]/.test(src) || /\bCoffee\b[^\n]*lucide-react/.test(src)) {
        survivors.push(file);
      }
    }
    expect(survivors).toEqual([]);
  });

  test("the food-topic icon is deliberately still Coffee", () => {
    // Owner ruling: category-icons maps the Utensils TOPIC, not a Chai
    // amount. Swapping it would stamp the currency mark on a phrasebook
    // topic, so it is pinned here rather than left to look like an oversight.
    expect(read("lib/category-icons.tsx")).toContain("Utensils: Coffee");
  });
});
