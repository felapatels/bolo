import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// Guards the combo-burst overlay in the Speed Round game.
// The overlay (HOT STREAK 🔥 / ON FIRE ⚡ / UNSTOPPABLE 💥) fires when the
// in-game streak hits 3, 5, or 10 respectively.
//
// Strategy: seed a single phrase so `buildOptions` produces exactly one button
// (the correct answer). Clicking it repeatedly drives the streak without any
// need to identify which of four options is correct.
// ---------------------------------------------------------------------------

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

vi.mock("@/lib/entitlements", () => ({
  useEntitlements: () => ({
    isPlus: true,
    isLoading: false,
    isLanguageAllowed: () => true,
  }),
  asUpgradeRequired: () => null,
  upgradeHrefForDenial: () => "/upgrade",
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

// A single phrase pool — buildOptions will produce exactly one button (always correct).
const singlePhrase = [
  { id: 1, nativeScript: " નમસ્તે", romanized: "namaste", english: "Hello" },
];

const manyPhrases = Array.from({ length: 4 }, (_, i) => ({
  id: 10 + i,
  nativeScript: `phrase-${i}`,
  romanized: `rom-${i}`,
  english: `english-${i}`,
}));

vi.mock("@workspace/api-client-react", () => ({
  // Categories — one entry so the first is auto-selected on the setup screen.
  useListCategories: () => ({
    data: [{ id: 1, title: "Greetings", description: "", locked: false, phrasesCount: 1, masteredCount: 0 }],
    isLoading: false,
  }),
  // Default: single phrase (combo can be built by answering it repeatedly).
  useListCategoryPhrases: () => ({
    data: singlePhrase,
    isLoading: false,
    isError: false,
    error: null,
  }),
  useRecordGameSession: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  getGetProgressSummaryQueryKey: () => ["progress-summary"],
}));

import SpeedRoundPage from "@/pages/games/speed-round";

function renderPage(ui: ReactElement, path = "/games/speed-round") {
  const { hook } = memoryLocation({ path });
  return render(<Router hook={hook}>{ui}</Router>);
}

// Generous timeout — CI runs all suites in parallel.
const WT = { timeout: 8000 };

/**
 * Render the Speed Round page and advance from setup → playing.
 * The first category is auto-highlighted; we just click Start Game.
 */
async function reachPlaying() {
  renderPage(<SpeedRoundPage />);
  // Setup screen is shown first — wait for the Start button.
  const startBtn = await screen.findByText("Start Game", {}, WT);
  fireEvent.click(startBtn);
  // Wait for the first question to appear.
  await waitFor(() => expect(screen.getByText("Hello")).toBeInTheDocument(), WT);
}

/**
 * Click the correct answer button. With a single-phrase pool the only rendered
 * option is the correct one.
 */
async function answerCorrect() {
  const btn = screen.getByRole("button", { name: "Hello" });
  fireEvent.click(btn);
  // Wait briefly for the auto-advance timeout (400 ms for correct answers).
  await waitFor(
    () => expect(screen.getByRole("button", { name: "Hello" })).not.toBeDisabled(),
    { timeout: 2000 },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Speed Round combo burst overlay", () => {
  test('shows "HOT STREAK 🔥" after 3 consecutive correct answers', async () => {
    await reachPlaying();

    await answerCorrect(); // streak = 1
    await answerCorrect(); // streak = 2
    await answerCorrect(); // streak = 3 → burst fires

    await waitFor(
      () => expect(screen.getByText("HOT STREAK 🔥")).toBeInTheDocument(),
      WT,
    );
  });

  test('shows "ON FIRE ⚡" after 5 consecutive correct answers', async () => {
    await reachPlaying();

    for (let i = 0; i < 4; i++) await answerCorrect(); // streaks 1-4
    await answerCorrect(); // streak = 5 → burst fires

    await waitFor(
      () => expect(screen.getByText("ON FIRE ⚡")).toBeInTheDocument(),
      WT,
    );
  });

  test('shows "UNSTOPPABLE 💥" after 10 consecutive correct answers', async () => {
    await reachPlaying();

    for (let i = 0; i < 9; i++) await answerCorrect(); // streaks 1-9
    await answerCorrect(); // streak = 10 → burst fires

    await waitFor(
      () => expect(screen.getByText("UNSTOPPABLE 💥")).toBeInTheDocument(),
      WT,
    );
  // 10 answers × ~400 ms auto-advance each = ~4 s minimum; allow enough headroom.
  }, 15000);

  test("combo burst updates its text when the streak crosses a higher threshold", async () => {
    // Streak 3 → "HOT STREAK 🔥", then streak 5 → "ON FIRE ⚡".
    // The key-change mechanism replaces the burst content in place.
    await reachPlaying();

    for (let i = 0; i < 2; i++) await answerCorrect();
    await answerCorrect(); // streak = 3 → HOT STREAK

    await waitFor(
      () => expect(screen.getByText("HOT STREAK 🔥")).toBeInTheDocument(),
      WT,
    );

    await answerCorrect(); // streak = 4 — no new burst
    await answerCorrect(); // streak = 5 → ON FIRE replaces HOT STREAK

    await waitFor(
      () => expect(screen.getByText("ON FIRE ⚡")).toBeInTheDocument(),
      WT,
    );
  });

  test("combo burst does not fire before reaching a threshold", async () => {
    await reachPlaying();

    await answerCorrect(); // streak = 1
    await answerCorrect(); // streak = 2 — no burst yet

    await new Promise((r) => setTimeout(r, 200));
    expect(screen.queryByText("HOT STREAK 🔥")).toBeNull();
    expect(screen.queryByText("ON FIRE ⚡")).toBeNull();
    expect(screen.queryByText("UNSTOPPABLE 💥")).toBeNull();
  });
});
