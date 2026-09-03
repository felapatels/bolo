import { describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
 * per-platform count. The count is a raw substring count over source text,
 * so a glyph inside a conditional branch still counts and only deleting it
 * from the file lowers the number. Mobile's twin census lives in
 * artifacts/bolo-mobile/__tests__/chai-stall.test.tsx.
 */
const GLYPH_SITES: Record<string, number> = {
  "components/chai-stall.tsx": 1, // the band's own balance readout
  "components/chai-wallet.tsx": 4 /* was 3; build 23 rebuilt the sheet to the phone's: the balance card on the stall, the per-row delta, a kulhad in the history tile for Chacha-ji's cups (where a coffee cup must never stand), and the shared ChaiCoin */,
  "components/bazaar-header.tsx": 1, // the Chai pill on the hub and every door (build 23); it was pages/bazaar.tsx's wardrobe balance
  "pages/upgrade.tsx": 4, // build 23: three kulhads on the annual card and one in the trial box, off the phone's paywall
  "components/referral-card.tsx": 1, // Chai earned from referrals
  "pages/home.tsx": 3, // Chai stat cell + streak-repair banner balance + the cup before the pass's reason (2026-08-30)
  "pages/games/quick-game-frame.tsx": 1, // chai-earn-beat
  "pages/games/speed-round.tsx": 1, // +N Chai earned
  "pages/journey.tsx": 2, // signal-chai-chip, stop-unlock offer
  "pages/practice.tsx": 1, // session-chai-pill
  "pages/bazaar.tsx": 1, // the action bar's Buy · N; the wardrobe balance moved to components/bazaar-header.tsx (build 23)
  "components/outfit-card.tsx": 1, // Buy Now. The thumbnail price pill went with the card-to-row rebuild (5414ef9)
};

const WEB_GLYPH_COUNT = 21; // 15 until build 23; see the three lines above

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

describe("chai stall scene", () => {
  test("the film variant plays the clip over its own first frame and drops the painted layers", () => {
    // Build 29: the home hero is the living stall. The clip already carries
    // Chacha-ji and his steam, so neither painted layer may sit on it.
    render(<ChaiStallVignette film />);
    const film = screen.getByTestId("chai-stall-film") as HTMLVideoElement;
    expect(film.getAttribute("poster")).toBe(STALL_ASSETS.filmPoster);
    expect(film.querySelector("source")?.getAttribute("src")).toBe(STALL_ASSETS.film);
    expect(screen.queryByTestId("chai-stall-chachaji")).toBeNull();
    expect(screen.queryByTestId("chai-stall-steam")).toBeNull();
  });

  test("renders the scene with the steam plume layered over it", () => {
    render(<ChaiStallVignette />);
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

  test("Chacha-ji is his own layer, placed by his own fraction map", () => {
    // He is NEVER baked into stall.png: the banked pour-on-earn moment has to
    // be able to animate him, which a painted-in figure makes impossible.
    render(<ChaiStallVignette />);
    const chachaji = screen.getByTestId("chai-stall-chachaji");
    expect(chachaji.getAttribute("src")).toBe(STALL_ASSETS.chachaji);
    expect(chachaji.getAttribute("src")).toMatch(/stall\/chachaji\.png$/);
    expect(STALL_ASSETS.chachaji).not.toBe(STALL_ASSETS.scene);
    expect(screen.getByTestId("chai-stall-scene").getAttribute("src")).toBe(
      STALL_ASSETS.scene,
    );
    // Same three-number contract as the kettle map, so an art move is an edit
    // to the map and nothing else. Placement itself was verified by looking at
    // the composite; these pin the numbers that verification chose.
    expect(chachaji.style.left).toBe("48.5%");
    expect(chachaji.style.bottom).toBe("17%");
    expect(chachaji.style.width).toBe("19.5%");
    // Decoration, not a control.
    expect(chachaji).toHaveAttribute("aria-hidden", "true");
    expect(chachaji.getAttribute("alt")).toBe("");
    expect(chachaji.className).toContain("pointer-events-none");
  });

  test("is a full-width band whose kettle map survives the new scale", () => {
    // Owner correction (Aug 6): the stall is a SCENE, not an icon — it fills
    // the column, cropped 12% at the bottom (BOTTOM_CROP), while the scene
    // layer inside it holds the art's own 1024/572. The kettle map is
    // unaffected BY CONSTRUCTION: the plume offsets are percentages of the
    // SCENE layer, whose aspect never changes, and object-cover on a
    // same-aspect box crops nothing.
    render(<ChaiStallVignette />);
    const box = screen.getByTestId("chai-stall-vignette");
    expect(box.className).toContain("w-full");
    expect(box.className).not.toContain("shrink-0");
    // The BAND is the cropped box: 572 * (1 - 0.12) = 503.36. The SCENE
    // LAYER inside it keeps 1024/572, and that is the box the fraction
    // maps below are fractions OF.
    expect(box.style.aspectRatio).toBe("1024 / 503.36");
    const sceneLayer = screen.getByTestId("chai-stall-scene").parentElement!;
    expect(sceneLayer.style.aspectRatio).toBe("1024 / 572");
    const steam = screen.getByTestId("chai-stall-steam");
    expect(steam.style.left).toBe("21%");
    expect(steam.style.bottom).toBe("46%");
    expect(steam.style.width).toBe("12%");
    expect(screen.getByTestId("chai-stall-scene").className).toContain(
      "object-cover",
    );
  });

  test("names itself and shows the balance it is given", () => {
    // The band is a wallet surface, not scenery: it says whose stall it is and
    // what the learner has. The balance is a PROP — the component never runs
    // its own query, so it cannot drift from the stat cell or the wallet.
    render(<ChaiStallVignette balance={12} />);
    expect(screen.getByTestId("chai-stall-title")).toHaveTextContent(
      "Chacha-ji's Chai Stall",
    );
    expect(screen.getByTestId("chai-stall-balance")).toHaveTextContent("12");
    // Rendered with the kulhad, exactly like every other Chai amount.
    expect(screen.getByTestId("chai-glyph")).toBeInTheDocument();
  });

  test("shows the wallet's dash while the balance is still loading", () => {
    render(<ChaiStallVignette />);
    expect(screen.getByTestId("chai-stall-balance")).toHaveTextContent("-");
  });

  test("the overlay is legible over the art, not just where it is dark", () => {
    // INVERTED 2026-08-29 (build 18, web parity with mobile's build 17). The
    // owner's home mockup puts the copy on the LEFT and Chacha-ji on the
    // right, so the scrim moved with the copy: a left-half band fading
    // rightward, and the man stays in the light. It used to pin right-0 and
    // bg-gradient-to-l. The text still carries its own shadow on top of it.
    render(<ChaiStallVignette balance={3} />);
    const scrim = screen.getByTestId("chai-stall-scrim");
    expect(scrim.className).toContain("inset-y-0");
    expect(scrim.className).toContain("left-0");
    expect(scrim.className).not.toContain("right-0");
    expect(scrim.className).toContain("w-[58%]");
    expect(scrim.className).toMatch(/bg-gradient-to-r/);
    expect(scrim.className).not.toMatch(/bg-gradient-to-l/);
    // The styling sits on the title itself now; its parent is the layout
    // column and carries no colour or shadow.
    const title = screen.getByTestId("chai-stall-title");
    expect(title.className).toMatch(/drop-shadow/);
    expect(title.className).toContain("text-white");
    // The column sits top-left with the copy, so it never covers him.
    const column = title.parentElement!;
    expect(column.className).toContain("left-0");
    expect(column.className).toContain("items-start");
  });

  test("says what the stall is for, with the balance in gold", () => {
    // The mockup's line read "Take a break and earn 24 Chai"; the number is
    // the BALANCE, which is spent at the stall, not earned there, so the verb
    // was corrected on both platforms. Same string as mobile's blurb.
    render(<ChaiStallVignette balance={24} />);
    const blurb = screen.getByTestId("chai-stall-blurb");
    expect(blurb).toHaveTextContent("Take a break and spend your 24 Chai");
    const gold = blurb.querySelector("span") as HTMLElement;
    expect(gold.style.color.replace(/\s/g, "").toLowerCase()).toMatch(
      /^(#fbbf24|rgb\(251,191,36\))$/,
    );
  });

  test("the blurb reads plain Chai while the balance is still loading", () => {
    render(<ChaiStallVignette />);
    expect(screen.getByTestId("chai-stall-blurb")).toHaveTextContent(
      "Take a break and spend your Chai",
    );
  });

  test("stays decorative when no tap target is asked for", () => {
    render(<ChaiStallVignette />);
    const box = screen.getByTestId("chai-stall-vignette");
    expect(box).toHaveAttribute("aria-hidden", "true");
    expect(box.className).toContain("pointer-events-none");
  });

  test("given onClick it is a labelled button, not decoration", () => {
    const onClick = vi.fn();
    render(
      <ChaiStallVignette
        onClick={onClick}
        label="Open your Chai wallet"
        balance={12}
      />,
    );
    const box = screen.getByTestId("chai-stall-vignette");
    expect(box.tagName).toBe("BUTTON");
    expect(box).not.toHaveAttribute("aria-hidden");
    expect(box.className).not.toContain("pointer-events-none");
    expect(screen.getByRole("button", { name: "Open your Chai wallet" })).toBe(
      box,
    );
    fireEvent.click(box);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("the title and balance do not add a second tap target", () => {
    // The overlay is text on a pointer-events-none layer inside the button:
    // one control, one accessible name, whichever part of the band is hit.
    const onClick = vi.fn();
    render(
      <ChaiStallVignette
        onClick={onClick}
        label="Open your Chai wallet"
        balance={12}
      />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
    // Chacha-ji is part of that one target, not a second one.
    fireEvent.click(screen.getByTestId("chai-stall-chachaji"));
    expect(onClick).toHaveBeenCalledTimes(1);
    onClick.mockClear();
    const overlay = screen.getByTestId("chai-stall-title").parentElement!;
    expect(overlay.className).toContain("pointer-events-none");
    expect(screen.getByTestId("chai-stall-scrim").className).toContain(
      "pointer-events-none",
    );
    fireEvent.click(screen.getByTestId("chai-stall-balance"));
    expect(onClick).toHaveBeenCalledTimes(1);
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
      // Comments are stripped first — chai-stall.tsx is itself a census site
      // now, and the ChaiGlyph docstring quotes the very element it replaced
      // (`<Coffee className="h-4 w-4" />`). Prose must not satisfy, or trip,
      // a check on what the file actually renders.
      const src = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
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
