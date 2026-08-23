import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// Only a real hand may demonstrate stroke order.
//
// The demo animated a skeleton extracted from the font outline, which splits at
// every junction. Gujarati has contributions and averages 1.8 strokes a letter;
// the other eleven scripts average 3.3 to 6.2, with a Tamil letter at fourteen.
// Sweeping the merge thresholds across all 459 of their letters moved the mean
// from 5.19 to 4.27 and only by welding strokes across turns up to 101 degrees,
// so tuning cannot turn a skeleton into a flow. Ruled 2026-08-23: show nothing
// rather than teach the wrong stroke order.
//
// Pins:
// (1) a traced script keeps the demo;
// (2) a script with only font guesses shows no demo, no control, no start dot;
// (3) the copy never promises a green dot that is not drawn.

const h = vi.hoisted(() => ({ lang: "gu" }));

vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({
    languages: [
      { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" },
      { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
    ],
    activeLang: h.lang,
    activeLanguage: { code: h.lang, name: h.lang === "gu" ? "Gujarati" : "Hindi" },
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
import { handPenStrokes, hasHandPenStrokes, traceStopFor } from "@workspace/script-trace";

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

  test("a font-only script shows no demo and no control", () => {
    h.lang = "hi";
    // Devanagari has 48 font-derived glyphs and no contributions.
    expect(hasHandPenStrokes("hi")).toBe(false);
    const first = traceStopFor("hi", 1, 1)!.characters[0]!;
    expect(handPenStrokes("hi", first.id)).toBeNull();

    renderGame();
    expect(screen.queryByText(/Watch again|Playing/)).toBeNull();
    // And the copy must not promise a dot that is never drawn.
    expect(document.body.textContent).not.toContain("Start at the green dot");
    expect(document.body.textContent).toContain("Trace the character");
  });

  test("the learner can still trace: only the demo is withheld", () => {
    h.lang = "hi";
    renderGame();
    // The guide shape comes from the font and is legitimate; what cannot be
    // claimed is the ORDER. Clearing and scoring stay exactly as they were.
    expect(screen.getByText("Clear")).toBeInTheDocument();
    expect(document.querySelector("canvas")).not.toBeNull();
  });
});
