import { describe, test, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// The shape of "text disappears in dark mode", caught in the source.
//
// Web themes through CSS variables: :root carries the light palette and .dark
// overrides it, so anything written in tokens flips correctly and for free. The
// bugs are where a literal was used instead, and only ONE combination actually
// hurts:
//
//   a HARDCODED light surface carrying THEME-TOKEN text.
//
// In dark mode the token moves and the literal does not, so --muted-foreground
// lightens to 70% and sits on a white disc. That is exactly how the practice
// screen's prev/next arrows vanished.
//
// The reverse (a literal ON a literal) is fine and deliberate: a cream chai
// card or a white postcard is theme-independent by design, and inverting it
// would be the bug. So this checks pairings, not literals.
// ---------------------------------------------------------------------------

const ROOT = join(__dirname, "..");
const HARDCODED_SURFACE = /\bbg-(?:white|black)(?:\/\d+)?\b/;
const TOKEN_TEXT = /\btext-(?:foreground|muted-foreground|card-foreground|popover-foreground)\b/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "test" && name !== "node_modules") sourceFiles(p, out);
    } else if (/\.tsx$/.test(name) && !/\.test\./.test(name)) {
      out.push(p);
    }
  }
  return out;
}

function offenders(): string[] {
  const hits: string[] = [];
  for (const file of sourceFiles(ROOT)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      // Only when BOTH appear on one element, and no dark: override rescues it.
      if (HARDCODED_SURFACE.test(line) && TOKEN_TEXT.test(line) && !line.includes("dark:")) {
        hits.push(`${file.replace(ROOT, "src")}:${i + 1}`);
      }
    });
  }
  return hits;
}

describe("NOTHING DISAPPEARS: no theme-token text on a hardcoded surface", () => {
  test("the whole web app is clean", () => {
    // Was two: the practice screen's prev/next phrase arrows, bg-white/90
    // carrying text-muted-foreground. In dark those are a 70%-lightness chevron
    // on pure white, on a near-black page. Fixed to bg-card/90 on 2026-08-18.
    expect(offenders()).toEqual([]);
  });

  test("the detector actually detects, so an empty result means something", () => {
    // A scanner that silently matches nothing would pass forever. Prove the
    // patterns fire on the exact string that was in practice.tsx.
    const bad = 'className="rounded-full bg-white/90 text-muted-foreground"';
    expect(HARDCODED_SURFACE.test(bad) && TOKEN_TEXT.test(bad)).toBe(true);

    // And prove it does NOT fire on the fix, nor on a deliberate literal pair.
    const fixed = 'className="rounded-full bg-card/90 text-muted-foreground"';
    expect(HARDCODED_SURFACE.test(fixed)).toBe(false);
    const deliberate = 'style={{ background: "#FBF1DF", color: "#6B4A0F" }}';
    expect(TOKEN_TEXT.test(deliberate)).toBe(false);
  });

  test("it reads real files, not an empty directory", () => {
    // Cheap guard against the walk silently returning nothing.
    expect(sourceFiles(ROOT).length).toBeGreaterThan(50);
  });
});
