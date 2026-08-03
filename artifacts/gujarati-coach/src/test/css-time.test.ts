import { describe, expect, test } from "vitest";
import { cssTimeMs } from "@/lib/utils";

// Prod hotfix item 7 (splash blackout): the production CSS minifier rewrites
// ":root" time values from ms to seconds ("1500ms" -> "1.5s", "8000ms" ->
// "8s"). A unit-blind parseFloat read "8s" as 8 MILLISECONDS, so the splash
// max-hold failsafe unmounted the overlay before its first paint. cssTimeMs
// is the mandatory unit-aware parser for every JS read of a stylesheet
// timing var; these cases pin both source-form and minified-form values.

describe("cssTimeMs (unit-aware CSS <time> parser)", () => {
  const FALLBACK = 4321;

  test("parses ms values as milliseconds (source form)", () => {
    expect(cssTimeMs("1500ms", FALLBACK)).toBe(1500);
    expect(cssTimeMs("8000ms", FALLBACK)).toBe(8000);
    expect(cssTimeMs("260ms", FALLBACK)).toBe(260);
    expect(cssTimeMs(" 500ms ", FALLBACK)).toBe(500);
  });

  test("parses s values as seconds (prod minified form)", () => {
    expect(cssTimeMs("8s", FALLBACK)).toBe(8000);
    expect(cssTimeMs("1.5s", FALLBACK)).toBe(1500);
    expect(cssTimeMs(".26s", FALLBACK)).toBe(260);
    expect(cssTimeMs(".5s", FALLBACK)).toBe(500);
    expect(cssTimeMs("1.2s", FALLBACK)).toBe(1200);
    expect(cssTimeMs(".9s", FALLBACK)).toBe(900);
  });

  test("treats a unitless number as milliseconds", () => {
    expect(cssTimeMs("300", FALLBACK)).toBe(300);
  });

  test("falls back on missing, non-numeric, or non-positive values", () => {
    expect(cssTimeMs("", FALLBACK)).toBe(FALLBACK);
    expect(cssTimeMs("   ", FALLBACK)).toBe(FALLBACK);
    expect(cssTimeMs("auto", FALLBACK)).toBe(FALLBACK);
    expect(cssTimeMs("0", FALLBACK)).toBe(FALLBACK);
    expect(cssTimeMs("0s", FALLBACK)).toBe(FALLBACK);
    expect(cssTimeMs("0ms", FALLBACK)).toBe(FALLBACK);
    expect(cssTimeMs("-200ms", FALLBACK)).toBe(FALLBACK);
  });
});
