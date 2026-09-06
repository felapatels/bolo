import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { SPLASH_PLATE, splashHoldingStyle } from "@/lib/splash-lqip";

// The boot gap has two painters and one surface (brand-splash.tsx, the
// one-toaster rule): index.html paints it before React mounts, the overlay
// paints it from its first render. If the two drift the surface changes under
// the learner mid-boot, which is the flash this arrangement exists to prevent.
// This pins the copies.
//
// REWRITTEN 2026-09-06, when the surface stopped being a picture. It was the
// film's first frame at 160px, pre-blurred and inlined in both places, and
// most of this file pinned the two base64 strings against each other. The
// films open on white now, so the surface is a flat colour and there is
// nothing left to blur, inline or keep in step but the colour itself.
describe("splash holding surface (lib/splash-lqip.ts)", () => {
  const html = readFileSync(resolve(__dirname, "../../index.html"), "utf8");

  test("index.html paints the same plate the overlay does", () => {
    expect(html).toContain(`background: ${SPLASH_PLATE};`);
  });

  test("the plate stops painting once React fills #root", () => {
    // `data-boot` is set once by the inline script and never removed, so
    // without this the plate would sit on <html> for the whole session with
    // only body's own background hiding it.
    expect(html).toContain('html[data-boot="app"]:has(#root:empty)');
  });

  test("nothing is inlined into the boot style any more", () => {
    expect(html).not.toContain("data:image/jpeg;base64,");
  });

  test("the overlay's holding style is the boot style's plate", () => {
    expect(splashHoldingStyle().backgroundColor).toBe(SPLASH_PLATE);
  });
});
