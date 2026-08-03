import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// Hotfix 3 items 7a/7b: Signal Lights round-audio contract. New file because
// signal-lights has no test file and the race-cancel behavior is a genuinely
// new surface. Pins:
// (1) a clip whose synthesis resolves after the round expired NEVER plays
//     (the old code let a late clip fire at or after expiry);
// (2) the frame's mute button wears the green active treatment while a clip
//     is audibly playing, and expiry silences the clip and resets the button.

const h = vi.hoisted(() => ({
  synth: vi.fn(),
}));

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

vi.mock("@/components/mascot", () => ({ Mascot: () => null }));
vi.mock("@/components/layout/bottom-nav", () => ({ BottomNav: () => null }));

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  useListCategories: () => ({
    data: [{ id: 7, title: "Food", phraseCount: 5, iconName: "utensils" }],
    isLoading: false,
  }),
  useListCategoryPhrases: () => ({
    data: [1, 2, 3, 4].map((id) => ({
      id,
      categoryId: 7,
      languageCode: "gu",
      nativeScript: `ન${id}`,
      romanized: `r${id}`,
      english: `word ${id}`,
      hint: "",
      difficulty: 1,
      sortOrder: id,
      bestScore: null,
      mastered: false,
      attemptCount: 0,
    })),
    isLoading: false,
    isFetched: true,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useRecordGameSession: () => ({ mutate: vi.fn(), isPending: false }),
  useSynthesizeSpeech: () => ({ mutateAsync: h.synth }),
}));

import SignalLightsPage from "@/pages/games/signal-lights";

/** Minimal HTMLAudio stand-in: records instances, resolves play, and fires
 *  onpause when paused, exactly the hooks the round code wires. */
class FakeAudio {
  static instances: FakeAudio[] = [];
  src: string;
  onended: (() => void) | null = null;
  onpause: (() => void) | null = null;
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn(() => {
    this.onpause?.();
  });
  constructor(src?: string) {
    this.src = src ?? "";
    FakeAudio.instances.push(this);
  }
}

function renderPage() {
  const { hook } = memoryLocation({ path: "/games/signal-lights?cat=7" });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Router hook={hook}>
        <SignalLightsPage />
      </Router>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  FakeAudio.instances = [];
  h.synth.mockReset();
  vi.stubGlobal("Audio", FakeAudio);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Signal Lights round audio (Hotfix 3 items 7a/7b)", () => {
  test("a clip whose synthesis resolves after the round expired never plays", async () => {
    let resolveSynth: ((v: unknown) => void) | null = null;
    h.synth.mockImplementation(
      () =>
        new Promise((res) => {
          resolveSynth = res;
        }),
    );
    renderPage();
    // 3-2-1 countdown (timed game), then round 1 mounts and requests audio.
    // Each step in its own act: the next timer is scheduled by an effect,
    // which only flushes when the act scope closes.
    for (let i = 0; i < 3; i++) act(() => vi.advanceTimersByTime(800));
    expect(screen.getByTestId("quick-timer")).toHaveTextContent("4s");
    expect(h.synth).toHaveBeenCalledTimes(1);
    // Run the round clock out: 4 ticks to zero -> timed out.
    for (let i = 0; i < 4; i++) act(() => vi.advanceTimersByTime(1000));
    // Synthesis resolves LATE, at/after expiry: the clip must never fire.
    await act(async () => {
      resolveSynth!({ audioBase64: "AA", format: "mp3" });
    });
    expect(FakeAudio.instances).toHaveLength(0);
  });

  test("mute button lights green while the clip plays; expiry silences it", async () => {
    h.synth.mockResolvedValue({ audioBase64: "AA", format: "mp3" });
    renderPage();
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        vi.advanceTimersByTime(800);
      });
    }
    // Flush the awaited synthesis so the clip starts.
    await act(async () => {});
    expect(FakeAudio.instances).toHaveLength(1);
    const btn = screen.getByTestId("game-mute-btn");
    // Item 7b: live playback wears the practice green active treatment.
    expect(btn.className).toContain("bg-secondary");
    // Item 7a: expiry pauses the clip immediately; the button resets.
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
    }
    expect(FakeAudio.instances[0]!.pause).toHaveBeenCalled();
    expect(btn.className).not.toContain("bg-secondary");
  });
});
