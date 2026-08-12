import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// ---------------------------------------------------------------------------
// What a Listen & Pick choice card says (owner ruling, Aug 12, 2026).
//
// The clip IS the question, so a romanized reading under the script spells the
// answer out: a learner could win every round by matching Latin letters to the
// sounds just played, without reading the script or knowing the word. Choices
// carry the script and its MEANING instead. (The always-visible romanization
// ruling still holds on reading surfaces; this game is the exception.)
// ---------------------------------------------------------------------------

const state = vi.hoisted(() => ({
  synth: vi.fn(async () => ({ audioBase64: "AAA", format: "mp3" })),
  record: vi.fn(),
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

// The page renders the app's bottom nav, which drags in the language picker
// and Clerk; none of that is what this file is about.
vi.mock("@/components/layout/bottom-nav", () => ({ BottomNav: () => null }));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
}));

/** Distinct romanized and english strings so neither can be mistaken for the other. */
const PHRASES = Array.from({ length: 6 }, (_, i) => ({
  id: i + 1,
  nativeScript: `ન${i + 1}`,
  romanized: `roman${i + 1}`,
  english: `meaning ${i + 1}`,
}));

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  useListCategories: () => ({
    data: [{ id: 1, title: "Greetings", iconName: "star", phraseCount: 6 }],
    isLoading: false,
  }),
  useListCategoryPhrases: () => ({
    data: PHRASES,
    isLoading: false,
    isError: false,
    isFetched: true,
    error: null,
  }),
  getListCategoryPhrasesQueryKey: () => ["phrases"],
  getGetProgressSummaryQueryKey: () => ["progress"],
  useRecordGameSession: () => ({ mutate: state.record, isPending: false }),
  useSynthesizeSpeech: () => ({ mutateAsync: state.synth, isPending: false }),
}));

import ListenAndPickPage from "@/pages/games/listen-and-pick";

class FakeAudio {
  static instances: FakeAudio[] = [];
  src: string;
  onended: (() => void) | null = null;
  constructor(src: string) {
    this.src = src;
    FakeAudio.instances.push(this);
  }
  play() {
    return Promise.resolve();
  }
  pause() {}
}

/** Enter a round: the page opens on its own topic picker. */
function enterGame() {
  const { hook } = memoryLocation({ path: "/games/listen-and-pick" });
  render(
    <Router hook={hook}>
      <ListenAndPickPage />
    </Router>,
  );
  fireEvent.click(screen.getByText("Greetings"));
}

/** The four choice cards, identified by their native-script first line. */
const choiceCards = () =>
  screen
    .getAllByRole("button")
    .filter((b) => /^ન\d/.test((b.querySelector("span")?.textContent ?? "").trim()));

beforeEach(() => {
  FakeAudio.instances.length = 0;
  vi.stubGlobal("Audio", FakeAudio);
  state.synth.mockClear();
  state.record.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Listen & Pick choice cards", () => {
  test("each choice shows its meaning under the script", () => {
    enterGame();
    const cards = choiceCards();
    expect(cards).toHaveLength(4);

    for (const card of cards) {
      const script = (card.querySelector("span")?.textContent ?? "").trim();
      const phrase = PHRASES.find((p) => p.nativeScript === script)!;
      expect(card).toHaveTextContent(phrase.english);
    }
  });

  test("no choice leaks the romanized reading, which would spell out the clip", () => {
    enterGame();
    const cards = choiceCards();
    expect(cards).toHaveLength(4);

    for (const card of cards) {
      for (const p of PHRASES) {
        expect(card.textContent ?? "").not.toContain(p.romanized);
      }
    }
  });
});
