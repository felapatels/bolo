import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, fireEvent, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// ---------------------------------------------------------------------------
// Owner ruling: any game surface showing native script must ALSO show its
// romanized form, ALWAYS VISIBLE during play — not on reveal, not gated. A
// learner who cannot read the script yet is otherwise guessing at shapes.
//
// This file pins the ruling on every web surface that was missing the line:
// Luggage Match tags, Express Listening choices, the Word Match native card,
// the Signal Lights prompt and the Wrong Platform tiles. Two things are
// pinned per surface:
//
//   1. the romanized reading renders during play, straight off phrase.romanized
//      (no transliteration engine ships to the client), and
//   2. a phrase with NO romanization (empty string — several scripts have
//      none) degrades to the script alone: no empty line, no placeholder.
//
// Ticket Check, Speed Round hard mode and the Phrase Builder tiles are
// deliberately EXEMPT and are not touched here.
// ---------------------------------------------------------------------------

const state = vi.hoisted(() => ({
  /** Flip to false to model a language whose phrases have no romanization. */
  withRomanized: true,
  record: vi.fn(),
  synth: vi.fn(async () => ({ audioBase64: "AAA", format: "mp3" })),
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
  nativeTextProps: () => ({ style: {}, dir: "ltr" as const, isNastaliq: false }),
}));

vi.mock("@/lib/entitlements", () => ({
  useEntitlements: () => ({ isPlus: true, isLoading: false, isLanguageAllowed: () => true }),
  asUpgradeRequired: () => null,
  upgradeHrefForDenial: () => "/upgrade",
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
}));

/** Topic 1: the phrases every game plays. Topic 2: Wrong Platform's strays. */
function poolFor(categoryId: number) {
  const spec =
    categoryId === 2
      ? { count: 4, offset: 20, script: "s" }
      : { count: 8, offset: 0, script: "n" };
  return Array.from({ length: spec.count }, (_, i) => {
    const n = spec.offset + i + 1;
    return {
      id: n,
      categoryId,
      nativeScript: `${spec.script}${n}`,
      romanized: state.withRomanized ? `r${n}` : "",
      english: `e${n}`,
    };
  });
}

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  useListCategories: () => ({
    data: [
      { id: 1, title: "Greetings", iconName: "smile", phraseCount: 8, phrasesCount: 8 },
      { id: 2, title: "Travel", iconName: "train", phraseCount: 4, phrasesCount: 4 },
    ],
    isLoading: false,
    isError: false,
    error: null,
  }),
  useListCategoryPhrases: (categoryId: number) => ({
    data: poolFor(categoryId),
    isLoading: false,
    isError: false,
    isFetched: true,
    error: null,
  }),
  getListCategoryPhrasesQueryKey: () => ["phrases"],
  useRecordGameSession: () => ({ mutate: state.record, isPending: false }),
  useSynthesizeSpeech: () => ({ mutateAsync: state.synth, isPending: false }),
  useGetAccount: () => ({
    data: { preferences: { learning: { ttsVoice: null } } },
    isLoading: false,
  }),
}));

import LuggageMatchPage from "@/pages/games/luggage-match";
import ExpressListeningPage from "@/pages/games/express-listening";
import SignalLightsPage from "@/pages/games/signal-lights";
import WrongPlatformPage from "@/pages/games/wrong-platform";
import ListenAndPickPage from "@/pages/games/listen-and-pick";
import { FlipCard } from "@/pages/games/word-match";

// jsdom has no Audio; the listening games construct one per clip.
class FakeAudio {
  playbackRate = 1;
  onended: (() => void) | null = null;
  constructor(public src: string) {}
  play() {
    return Promise.resolve();
  }
  pause() {}
}

/** Every romanized reading currently on screen. */
const romanizedOnScreen = () => screen.queryAllByText(/^r\d+$/);

/**
 * A romanized slot that rendered EMPTY is the failure this guard is for: an
 * empty line or a placeholder where a script has no romanization.
 */
function emptyMutedSlots(container: HTMLElement) {
  return [...container.querySelectorAll("p,span")].filter(
    (el) =>
      el.className.includes("text-muted-foreground") &&
      el.children.length === 0 &&
      (el.textContent ?? "").trim() === "",
  );
}

/** Walks the 3-2-1 pre-round count-in that timed quick games open with. */
async function passCountIn() {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
  }
}

async function openQuickGame(Page: () => JSX.Element, path: string) {
  const { hook } = memoryLocation({ path });
  const view = render(
    <Router hook={hook}>
      <Page />
    </Router>,
  );
  // HOW TO PLAY OPENS ITSELF the first time a learner plays a given game
  // (added 2026-08-25), and it holds the count-in behind it on purpose, so a
  // learner who is still reading has not already started. A test is that
  // learner: dismiss it exactly as they would, then carry on.
  const help = screen.queryByTestId("how-to-play-dismiss");
  if (help) {
    await act(async () => {
      fireEvent.click(help);
    });
  }
  if (screen.queryByTestId("quick-countdown")) await passCountIn();
  await act(async () => {});
  return view;
}

beforeEach(() => {
  state.withRomanized = true;
  state.record.mockClear();
  state.synth.mockClear();
  vi.stubGlobal("Audio", FakeAudio);
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/**
 * Luggage Match shuffles the topic pool and plays only the first six phrases,
 * so WHICH tags are on the board is random per run — naming a phrase (n1) is
 * a one-in-four flake. Assert over whatever the board dealt instead: every
 * native tag on it, and its own reading.
 */
const nativeTagsOnScreen = () => screen.getAllByText(/^n\d+$/);

describe("Luggage Match tags", () => {
  test("every tag shows its romanized reading under the script", async () => {
    await openQuickGame(LuggageMatchPage, "/games/luggage-match?cat=1");

    const tags = nativeTagsOnScreen();
    expect(tags.length).toBeGreaterThanOrEqual(4);
    // One reading per native tag on the board, and it is that tag's reading.
    for (const tag of tags) {
      const n = tag.textContent!.replace(/^n/, "");
      expect(screen.getByText(`r${n}`)).toBeTruthy();
    }
    expect(romanizedOnScreen()).toHaveLength(tags.length);
  });

  test("no romanization degrades to the script alone", async () => {
    state.withRomanized = false;
    const { container } = await openQuickGame(LuggageMatchPage, "/games/luggage-match?cat=1");

    expect(nativeTagsOnScreen().length).toBeGreaterThanOrEqual(4);
    expect(romanizedOnScreen()).toHaveLength(0);
    expect(emptyMutedSlots(container)).toHaveLength(0);
  });
});

describe("Express Listening choices", () => {
  // INVERTED. This suite guards the always-visible romanization ruling, and
  // Express Listening is the ONE surface exempt from it (owner ruling, Aug 12
  // 2026): the clip is the question, so a romanized reading under each option
  // spells out the answer. A learner could win every round by matching Latin
  // letters to the sounds they just heard, never reading the script. Mobile's
  // listen-and-pick has shown the meaning since 5ddaa082; web kept showing
  // romanized because this assertion held it there.
  //
  // The rest of this file is untouched: reading surfaces still must show the
  // romanization, and those tests still say so.

  test("choices show the MEANING, never the romanized reading", async () => {
    await openQuickGame(ExpressListeningPage, "/games/express-listening?cat=1");

    expect(romanizedOnScreen()).toHaveLength(0);
    expect(screen.queryAllByText(/^e\d+$/)).toHaveLength(4);
  });

  test("a phrase with no romanization is unaffected, since none is shown", async () => {
    state.withRomanized = false;
    const { container } = await openQuickGame(
      ExpressListeningPage,
      "/games/express-listening?cat=1",
    );

    expect(romanizedOnScreen()).toHaveLength(0);
    // The meaning still carries the option, and no empty slot is left behind.
    expect(screen.queryAllByText(/^e\d+$/)).toHaveLength(4);
    expect(emptyMutedSlots(container)).toHaveLength(0);
  });
});

describe("Signal Lights prompt", () => {
  test("the claim shows the romanized reading under the script", async () => {
    await openQuickGame(SignalLightsPage, "/games/signal-lights?cat=1");

    // One prompt phrase on screen, so exactly one reading.
    expect(romanizedOnScreen()).toHaveLength(1);
  });

  test("no romanization degrades to the script alone", async () => {
    state.withRomanized = false;
    const { container } = await openQuickGame(SignalLightsPage, "/games/signal-lights?cat=1");

    expect(romanizedOnScreen()).toHaveLength(0);
    expect(emptyMutedSlots(container)).toHaveLength(0);
  });
});

describe("Wrong Platform tiles", () => {
  test("every tile shows its romanized reading between the script and the meaning", async () => {
    await openQuickGame(WrongPlatformPage, "/games/wrong-platform?cat=1");

    expect(romanizedOnScreen()).toHaveLength(4);
  });

  test("no romanization degrades to the script alone", async () => {
    state.withRomanized = false;
    const { container } = await openQuickGame(WrongPlatformPage, "/games/wrong-platform?cat=1");

    expect(romanizedOnScreen()).toHaveLength(0);
    expect(emptyMutedSlots(container)).toHaveLength(0);
  });
});

describe("Listen & Pick choices", () => {
  async function openGame() {
    const { hook } = memoryLocation({ path: "/games/listen-and-pick" });
    const view = render(
      <Router hook={hook}>
        <ListenAndPickPage />
      </Router>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText("Greetings"));
    });
    // Fake timers are running, so the round is settled by advancing them —
    // waitFor would sit on a clock nothing is turning.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(screen.getAllByText(/^n\d+$/).length).toBeGreaterThan(0);
    return view;
  }

  // EXCEPTION to the ruling above (owner, Aug 12, 2026). Here the clip IS the
  // question, so a reading under the script spells out the answer: match the
  // Latin letters to the sounds just played and you never read the script or
  // learn the word. These choices carry the MEANING instead. The behaviour
  // itself is pinned in listen-and-pick-choices.test.tsx; this stays so the
  // ruling's own file records the carve-out rather than looking like a gap.
  test("choices carry the meaning, NOT the reading (the clip is the question)", async () => {
    await openGame();

    expect(romanizedOnScreen()).toHaveLength(0);
    expect(screen.getAllByText(/^e\d+$/).length).toBe(4);
  });

  test("no empty slot is left where the reading used to sit", async () => {
    state.withRomanized = false;
    const { container } = await openGame();

    expect(romanizedOnScreen()).toHaveLength(0);
    expect(emptyMutedSlots(container)).toHaveLength(0);
  });
});

describe("Word Match native card", () => {
  const native = { style: {}, dir: "ltr" as const, isNastaliq: false };

  test("a flipped native card shows the romanized reading under the script", () => {
    render(
      <FlipCard
        card={{ id: "1-n", pairId: 1, type: "native", label: "n1", romanized: "r1", state: "flipped" }}
        onFlip={() => {}}
        native={native}
      />,
    );

    // Mobile's treatment, ported: script primary, reading quieter beneath it.
    expect(screen.getByText("n1")).toBeTruthy();
    expect(screen.getByText("r1")).toBeTruthy();
  });

  test("an English card never grows a romanized line", () => {
    render(
      <FlipCard
        card={{ id: "1-e", pairId: 1, type: "english", label: "e1", state: "flipped" }}
        onFlip={() => {}}
        native={native}
      />,
    );

    expect(screen.getByText("e1")).toBeTruthy();
    expect(romanizedOnScreen()).toHaveLength(0);
  });

  test("no romanization degrades to the script alone", () => {
    const { container } = render(
      <FlipCard
        card={{ id: "1-n", pairId: 1, type: "native", label: "n1", romanized: "", state: "flipped" }}
        onFlip={() => {}}
        native={native}
      />,
    );

    expect(screen.getByText("n1")).toBeTruthy();
    expect(romanizedOnScreen()).toHaveLength(0);
    expect(emptyMutedSlots(container)).toHaveLength(0);
  });
});
