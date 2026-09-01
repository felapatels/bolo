import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { SPLASH_LQIP, SPLASH_PLATE, splashHoldingStyle } from "@/lib/splash-lqip";

// The boot gap has two painters and one picture (brand-splash.tsx, the
// one-toaster rule): index.html paints the blurred first frame before React
// mounts, the overlay paints the same frame from its first render. If the
// strings drift the surface changes under the learner mid-boot, which is the
// flash this whole arrangement exists to prevent. This pins the copies.
describe("splash holding surface (lib/splash-lqip.ts)", () => {
  const html = readFileSync(resolve(__dirname, "../../index.html"), "utf8");

  test("index.html carries both thumbnails verbatim, the wide one behind the landscape query", () => {
    expect(html).toContain(SPLASH_LQIP.portrait);
    expect(html).toContain(SPLASH_LQIP.wide);
    const landscapeAt = html.indexOf("@media (orientation: landscape)");
    expect(landscapeAt).toBeGreaterThan(-1);
    expect(html.indexOf(SPLASH_LQIP.wide)).toBeGreaterThan(landscapeAt);
    expect(html.indexOf(SPLASH_LQIP.portrait)).toBeLessThan(landscapeAt);
  });

  test("index.html keeps the plate under the picture", () => {
    expect(html).toContain(`background: ${SPLASH_PLATE} url(`);
    expect(html).toContain("center / cover no-repeat");
  });

  // INVERTED 2026-09-01, deliberately, not because it broke. The cap was 2048
  // when the frames were 48px wide, and at that size the picture was magnified
  // about sixteen times to fill a desktop viewport: the owner read the result
  // as a fault rather than a photograph ("a brown glitchy screen when you first
  // navigate to the url"). They are 160px now, which cuts the magnification to
  // about five times for 2.8KB. The ceiling still exists, because these are
  // carried TWICE and inlined in the HTML, so it must stay small enough that
  // first paint is not delayed by its own holding image.
  test("the thumbnails are inline JPEGs small enough to carry twice", () => {
    for (const uri of [SPLASH_LQIP.portrait, SPLASH_LQIP.wide]) {
      expect(uri.startsWith("data:image/jpeg;base64,")).toBe(true);
      expect(uri.length).toBeLessThan(6144);
    }
  });

  test("the overlay's holding style is the boot style's picture, cover-fit and centred", () => {
    const portrait = splashHoldingStyle(false);
    expect(portrait.backgroundColor).toBe(SPLASH_PLATE);
    expect(portrait.backgroundImage).toBe(`url("${SPLASH_LQIP.portrait}")`);
    expect(portrait.backgroundSize).toBe("cover");
    expect(portrait.backgroundPosition).toBe("center");
    expect(splashHoldingStyle(true).backgroundImage).toBe(`url("${SPLASH_LQIP.wide}")`);
  });
});
