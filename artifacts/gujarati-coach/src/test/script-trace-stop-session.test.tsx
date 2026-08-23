import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// A tracing stop opens its OWN session, not a menu.
//
// The stop shipped linking here bare, and this screen answered with "Choose a
// chapter to practice" — a grid of whole chapters, 36 characters in one of
// them. What the stop promises is its eight letters, one after another, the way
// a phrase stop serves its phrases. Reported 2026-08-23 on the live site.
//
// Pins:
// (1) ?journey=&zone= goes straight into tracing, no chapter menu;
// (2) it plays exactly the stop's characters, in the stop's order;
// (3) with no zone the menu still works, so /games is untouched.

vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({
    languages: [{ code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" }],
    activeLang: "gu",
    activeLanguage: { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" },
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

// The chapter menu carries the app's whole bottom nav (XP counter, language
// picker). None of it is what these tests are about, and all of it wants
// providers this file has no reason to stand up.
vi.mock("@/components/layout/bottom-nav", () => ({
  BottomNav: () => null,
}));

import ScriptTracePage from "@/pages/games/script-trace";
import { traceStopFor } from "@workspace/script-trace";

function renderAt(path: string) {
  const { hook } = memoryLocation({ path, record: true });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Router hook={hook}>
        <ScriptTracePage />
      </Router>
    </QueryClientProvider>,
  );
}

describe("a tracing stop opens its own session", () => {
  test("goes straight into tracing rather than the chapter menu", () => {
    renderAt("/games/script-trace?journey=1&zone=1");
    expect(screen.queryByText("Choose a chapter to practice")).toBeNull();
    const stop = traceStopFor("gu", 1, 1)!;
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(stop.title);
    // Named by its place on the map, so the learner knows what they opened.
    expect(document.body.textContent).toContain("Zone 1");
  });

  test("plays exactly the stop's characters, starting at the first", () => {
    const stop = traceStopFor("gu", 1, 1)!;
    renderAt("/games/script-trace?journey=1&zone=1");
    // The session counter is the whole point: this stop's slice, not a chapter.
    expect(document.body.textContent).toContain(`1 / ${stop.characters.length}`);
    expect(document.body.textContent).toContain(stop.characters[0]!.label);
  });

  test("a later zone gets a later slice, not the same one", () => {
    const first = traceStopFor("gu", 1, 1)!;
    const third = traceStopFor("gu", 1, 3)!;
    expect(third.characters[0]!.id).not.toBe(first.characters[0]!.id);
    renderAt("/games/script-trace?journey=1&zone=3");
    expect(document.body.textContent).toContain(third.characters[0]!.label);
  });

  test("without a zone it is still the chapter menu", () => {
    renderAt("/games/script-trace");
    expect(screen.getByText("Choose a chapter to practice")).toBeInTheDocument();
  });

  test("a zone the ladder does not reach falls back to the menu", () => {
    // Journey 1 has six rungs. Zone 9 resolves to nothing, and a blank screen
    // would be worse than the menu.
    expect(traceStopFor("gu", 1, 9)).toBeNull();
    renderAt("/games/script-trace?journey=1&zone=9");
    expect(screen.getByText("Choose a chapter to practice")).toBeInTheDocument();
  });
});
