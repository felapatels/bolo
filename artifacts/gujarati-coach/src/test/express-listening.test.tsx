import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { GAME_AUDIO_PREF_KEY } from "@/lib/gameAudioPref";

// ---------------------------------------------------------------------------
// Express Listening: the clip IS the prompt (the four choices render native
// script only), so this file guards the two things that make the audio path
// trustworthy — a late clip never plays over the round that replaced it, and
// a voice change never replays the old voice — plus the entry gate that keeps
// the game from starting with sound off. The existing round behaviour
// (autoplay, replay, both advance beats, timeout scoring) is pinned alongside
// so the audio work cannot quietly change how the game plays.
// ---------------------------------------------------------------------------

const state = vi.hoisted(() => {
  const clipFor = (text: string, voice: string | null) => `${text}-${voice ?? "auto"}`;
  const s = {
    clipFor,
    ttsVoice: null as string | null,
    /** Every text handed to the synthesizer, in call order. */
    calls: [] as string[],
    /** When manual, syntheses hang until the test resolves them by hand. */
    manual: false,
    deferred: [] as { text: string; release: () => void }[],
    record: vi.fn(),
    synth: vi.fn(),
  };
  s.synth = vi.fn((args: { data: { text: string } }) => {
    const text = args.data.text;
    const voice = s.ttsVoice;
    s.calls.push(text);
    const value = { audioBase64: clipFor(text, voice), format: "mp3" };
    if (!s.manual) return Promise.resolve(value);
    return new Promise((resolve) => {
      s.deferred.push({ text, release: () => resolve(value) });
    });
  });
  return s;
});

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
  useEntitlements: () => ({ isPlus: true, isLoading: false, isLanguageAllowed: () => true }),
  asUpgradeRequired: () => null,
  upgradeHrefForDenial: () => "/upgrade",
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
}));

const POOL = Array.from({ length: 8 }, (_, i) => ({
  id: i + 1,
  nativeScript: `n${i + 1}`,
  romanized: `r${i + 1}`,
  english: `e${i + 1}`,
}));

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  useListCategories: () => ({
    data: [{ id: 1, title: "Greetings", description: "", locked: false, phrasesCount: 8, masteredCount: 0 }],
    isLoading: false,
  }),
  useListCategoryPhrases: () => ({
    data: Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      nativeScript: `n${i + 1}`,
      romanized: `r${i + 1}`,
      english: `e${i + 1}`,
    })),
    isLoading: false,
    isError: false,
    isFetched: true,
    error: null,
  }),
  useRecordGameSession: () => ({ mutate: state.record, isPending: false }),
  useSynthesizeSpeech: () => ({ mutateAsync: state.synth, isPending: false }),
  useGetAccount: () => ({
    data: { preferences: { learning: { ttsVoice: state.ttsVoice } } },
    isLoading: false,
  }),
}));

import ExpressListeningPage from "@/pages/games/express-listening";

// --- audio double -----------------------------------------------------------

class FakeAudio {
  static instances: FakeAudio[] = [];
  src: string;
  playbackRate = 1;
  onended: (() => void) | null = null;
  paused = false;
  constructor(src: string) {
    this.src = src;
    FakeAudio.instances.push(this);
  }
  play() {
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}

const clips = () => FakeAudio.instances;
const lastClip = () => FakeAudio.instances[FakeAudio.instances.length - 1]!;
/** A clip is identified by the base64 payload the synthesizer returned. */
const clipBody = (a: FakeAudio) => a.src.replace("data:audio/mp3;base64,", "");

async function endClip() {
  const a = lastClip();
  await act(async () => {
    a.onended?.();
  });
}

// --- harness ----------------------------------------------------------------

function renderGame(path = "/games/express-listening?cat=1") {
  const { hook } = memoryLocation({ path });
  const view = render(
    <Router hook={hook}>
      <ExpressListeningPage />
    </Router>,
  );
  return {
    ...view,
    // A fresh element each time so React cannot bail out on identity.
    rerenderSame: () =>
      view.rerender(
        <Router hook={hook}>
          <ExpressListeningPage />
        </Router>,
      ),
  };
}

/** The frame holds the round surface behind a 3-2-1 count-in (800ms steps). */
async function runCountdown() {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
  }
}

/** The frame's round clock chains one setTimeout per second, and each next
 *  timeout is only scheduled after React commits the tick — so the seconds
 *  have to be advanced one act() at a time, not in a single jump. */
async function tickSeconds(seconds: number) {
  for (let i = 0; i < seconds; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
  }
}

const choiceButtons = () =>
  screen.getAllByRole("button").filter((b) => /^n\d$/.test((b.textContent ?? "").trim()));

const choiceTexts = () => choiceButtons().map((b) => (b.textContent ?? "").trim());
const idOf = (nativeScript: string) => POOL.find((p) => p.nativeScript === nativeScript)!.id;
/** The round's target is whatever text the synthesizer was last asked for. */
const currentTarget = () => state.calls[state.calls.length - 1]!;

beforeEach(() => {
  state.ttsVoice = null;
  state.calls.length = 0;
  state.deferred.length = 0;
  state.manual = false;
  state.record.mockClear();
  state.synth.mockClear();
  FakeAudio.instances.length = 0;
  vi.stubGlobal("Audio", FakeAudio);
  vi.useFakeTimers();
  // The suite-wide setup pins other prefs in its own beforeEach; this only
  // adds the game-audio one, which defaults to unmuted when absent.
  localStorage.removeItem(GAME_AUDIO_PREF_KEY);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------

describe("Express Listening entry gate", () => {
  test("entry is BLOCKED when sound is off", async () => {
    localStorage.setItem(GAME_AUDIO_PREF_KEY, "off");
    renderGame();

    expect(screen.getByTestId("quick-audio-gate")).toBeTruthy();
    expect(screen.getByText("This game needs sound")).toBeTruthy();
    // Nothing behind the message is running: no count-in, no round, and above
    // all no clock ticking down on a learner who cannot answer.
    expect(screen.queryByTestId("quick-countdown")).toBeNull();
    expect(screen.queryByTestId("quick-round-progress")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(screen.queryByTestId("quick-timer")).toBeNull();
    expect(screen.queryByTestId("quick-round-progress")).toBeNull();
    // And it never spends a synthesis on a game it refused to start.
    expect(state.calls).toHaveLength(0);
  });

  test("entry is ALLOWED when sound is on", async () => {
    renderGame();
    expect(screen.queryByTestId("quick-audio-gate")).toBeNull();
    expect(screen.getByTestId("quick-countdown")).toBeTruthy();
    await runCountdown();
    expect(screen.getByText("Round 1 of 8")).toBeTruthy();
  });

  test("unmuting on the gate screen lets the learner straight in", async () => {
    localStorage.setItem(GAME_AUDIO_PREF_KEY, "off");
    renderGame();
    expect(screen.getByTestId("quick-audio-gate")).toBeTruthy();

    // The header's mute button is the way out; the gate clears in that one
    // direction only, and nothing auto-unmutes on the learner's behalf.
    await act(async () => {
      fireEvent.click(screen.getByTestId("game-mute-btn"));
    });
    expect(screen.queryByTestId("quick-audio-gate")).toBeNull();
    expect(screen.getByTestId("quick-countdown")).toBeTruthy();
  });

  test("muting MID-RUN does not interrupt the run in progress", async () => {
    renderGame();
    await runCountdown();
    expect(screen.getByText("Round 1 of 8")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByTestId("game-mute-btn"));
    });
    // The gate is an entry check, not a mid-round one: the run stands.
    expect(screen.queryByTestId("quick-audio-gate")).toBeNull();
    expect(screen.getByText("Round 1 of 8")).toBeTruthy();
  });
});

describe("Express Listening audio", () => {
  test("the round clip autoplays at the express tempo when the round opens", async () => {
    renderGame();
    // The count-in holds the round, so nothing is synthesized before it ends.
    expect(state.calls).toHaveLength(0);
    await runCountdown();

    expect(state.calls).toHaveLength(1);
    expect(clips()).toHaveLength(1);
    expect(clipBody(lastClip())).toBe(state.clipFor(currentTarget(), null));
    expect(lastClip().playbackRate).toBe(1.25);
  });

  test("the replay button replays from cache without a second synthesis", async () => {
    renderGame();
    await runCountdown();
    await endClip();

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Play audio"));
    });
    expect(state.calls).toHaveLength(1);
    expect(clips()).toHaveLength(2);
    expect(clipBody(lastClip())).toBe(clipBody(clips()[0]!));
  });

  test("a clip that resolves AFTER the round advanced is dropped, not played", async () => {
    state.manual = true;
    renderGame();
    await runCountdown();

    // Round 1's synthesis is in flight and has played nothing yet.
    expect(state.deferred).toHaveLength(1);
    const round1Text = currentTarget();
    expect(clips()).toHaveLength(0);

    // Answer correctly and let the 700ms beat carry us to round 2, which
    // starts its own synthesis.
    await act(async () => {
      fireEvent.click(choiceButtons().find((b) => b.textContent?.trim() === round1Text)!);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(screen.getByText("Round 2 of 8")).toBeTruthy();
    expect(state.deferred).toHaveLength(2);

    // The late round-1 clip lands. It must NOT play over round 2's question.
    await act(async () => {
      state.deferred[0]!.release();
    });
    expect(clips()).toHaveLength(0);

    // Round 2's own clip still plays normally.
    await act(async () => {
      state.deferred[1]!.release();
    });
    expect(clips()).toHaveLength(1);
    expect(clipBody(lastClip())).toBe(state.clipFor(state.calls[1]!, null));
  });

  test("a mid-session voice change never serves the old voice's clip", async () => {
    state.ttsVoice = "nova";
    const view = renderGame();
    await runCountdown();
    await endClip();
    expect(state.calls).toHaveLength(1);
    const firstBody = clipBody(clips()[0]!);
    expect(firstBody).toContain("nova");

    // Same voice: the cache answers, no new synthesis.
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Play audio"));
    });
    expect(state.calls).toHaveLength(1);
    expect(clipBody(lastClip())).toBe(firstBody);
    await endClip();

    // Voice changes under the running game: the cache key changes with it.
    state.ttsVoice = "sage";
    view.rerenderSame();
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Play audio"));
    });
    expect(state.calls).toHaveLength(2);
    expect(clipBody(lastClip())).not.toBe(firstBody);
    expect(clipBody(lastClip())).toContain("sage");
  });
});

describe("Express Listening rounds (unchanged behaviour)", () => {
  test("a CORRECT pick advances on the 700ms beat, not before", async () => {
    renderGame();
    await runCountdown();
    const target = currentTarget();

    await act(async () => {
      fireEvent.click(choiceButtons().find((b) => b.textContent?.trim() === target)!);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(690);
    });
    expect(screen.getByText("Round 1 of 8")).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.getByText("Round 2 of 8")).toBeTruthy();
  });

  test("a WRONG pick waits on the manual continue", async () => {
    renderGame();
    await runCountdown();
    const target = currentTarget();

    await act(async () => {
      fireEvent.click(choiceButtons().find((b) => b.textContent?.trim() !== target)!);
    });
    expect(screen.getByTestId("express-listening-continue")).toBeTruthy();
    await tickSeconds(5);
    expect(screen.getByText("Round 1 of 8")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByTestId("express-listening-continue"));
    });
    expect(screen.getByText("Round 2 of 8")).toBeTruthy();
  });

  test("a timeout submits the FIRST non-target choice, never the target", async () => {
    renderGame();
    await runCountdown();

    const expected: { phraseId: number; selectedPhraseId: number }[] = [];
    for (let round = 0; round < 8; round++) {
      const target = currentTarget();
      const firstNonTarget = choiceTexts().find((t) => t !== target)!;
      expected.push({ phraseId: idOf(target), selectedPhraseId: idOf(firstNonTarget) });

      await tickSeconds(8);
      expect(screen.getByText("Too slow! The express rolled on.")).toBeTruthy();
      await act(async () => {
        fireEvent.click(screen.getByTestId("express-listening-continue"));
      });
    }

    expect(state.record).toHaveBeenCalledTimes(1);
    const payload = state.record.mock.calls[0]![0].data;
    expect(payload.game).toBe("listen-and-pick");
    expect(payload.phraseResults).toEqual(expected);
  });
});
