import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// Who gets a writing demo, and where its stroke order comes from.
//
// THIS RULE HAS MOVED TWICE, so the history is worth keeping. It began as "any
// script with a guide gets a demo", drawn from a skeleton extracted from the
// font outline. That was withdrawn on 2026-08-23 because the skeleton splits at
// every junction (Gujarati letters played as four to nine fragments where a
// hand writes one) and because its stroke DIRECTION was a hardcoded top-left
// guess, wrong for every right-to-left script.
//
// It is back, with the direction fixed: strokes now start on the side the
// script is written from, left for the eleven LTR scripts and right for
// Nastaliq. A real hand still wins wherever one exists, and provisional
// font-derived glyphs are still never promoted to a hand: those are CONTOUR
// paths that trace the outside edge of a letter and double back, which is worse
// than a fragmented centreline.
//
// Pins:
// (1) a traced script plays its hand;
// (2) a font-only script still gets a demo, from the skeleton;
// (3) the direction rule is applied per script, not hardcoded.

const h = vi.hoisted(() => ({ lang: "gu" }));

vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({
    languages: [
      { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" },
      { code: "bn", name: "Bengali", nativeName: "বাংলা" },
    ],
    activeLang: h.lang,
    activeLanguage: { code: h.lang, name: h.lang === "gu" ? "Gujarati" : "Bengali" },
    setActiveLang: vi.fn(),
    isLoading: false,
  }),
  useNativeText: () => ({ style: {}, dir: "ltr" as const, isNastaliq: false }),
  nativeTextProps: () => ({ style: {}, dir: "ltr" as const }),
}));

vi.mock("@/lib/entitlements", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useEntitlements: () => ({ isPlus: true, isAllAccess: true, isLoading: false }),
}));

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
}));

vi.mock("@/components/layout/bottom-nav", () => ({ BottomNav: () => null }));

import ScriptTracePage from "@/pages/games/script-trace";
import {
  handPenStrokes,
  hasHandPenStrokes,
  traceStopFor,
  writesRightToLeft,
} from "@workspace/script-trace";

function renderGame() {
  const loc = memoryLocation({ path: "/games/script-trace?journey=1&zone=1", record: true });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Router hook={loc.hook}>
        <ScriptTracePage />
      </Router>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.lang = "gu";
});

describe("who gets a writing demo", () => {
  test("a traced script keeps it", () => {
    h.lang = "gu";
    // The premise: Gujarati zone 1 opens on a character Bharti actually traced.
    const first = traceStopFor("gu", 1, 1)!.characters[0]!;
    expect(handPenStrokes("gu", first.id)).not.toBeNull();

    renderGame();
    expect(screen.getByText(/Watch again|Playing/)).toBeInTheDocument();
  });

  test("a font-only script gets one too, from the skeleton", () => {
    // INVERTED 2026-08-23. This asserted no demo at all for a script with no
    // contributions. The demo is back for them now that the stroke direction
    // follows the script rather than a hardcoded top-left guess, on the
    // reasoning that a sensible inference beats a blank canvas. Bengali has 48
    // font-derived glyphs and no hand.
    h.lang = "bn";
    expect(hasHandPenStrokes("bn")).toBe(false);
    const first = traceStopFor("bn", 1, 1)!.characters[0]!;
    // Still no HAND: a font guess is never promoted to one.
    expect(handPenStrokes("bn", first.id)).toBeNull();

    renderGame();
    // But there is a demo, drawn from the skeleton.
    expect(screen.getByText(/Watch again|Playing/)).toBeInTheDocument();
  });

  test("the start side follows the script, not a hardcoded corner", () => {
    // The reason the demo could come back. Nastaliq is the one right-to-left
    // script in the roster, and its strokes used to start at the wrong end.
    expect(writesRightToLeft("ur")).toBe(true);
    expect(writesRightToLeft("ks")).toBe(true);
    expect(writesRightToLeft("sd")).toBe(true);
    for (const ltr of ["hi", "gu", "bn", "ta", "te", "kn", "ml", "or", "pa", "sat", "mni"]) {
      expect(writesRightToLeft(ltr), `${ltr} is written left to right`).toBe(false);
    }
  });

  test("tracing and scoring are untouched either way", () => {
    h.lang = "bn";
    renderGame();
    expect(screen.getByText("Clear")).toBeInTheDocument();
    expect(document.querySelector("canvas")).not.toBeNull();
  });
});
