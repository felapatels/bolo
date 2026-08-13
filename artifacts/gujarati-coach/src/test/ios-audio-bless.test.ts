import { describe, test, expect, beforeEach, vi } from "vitest";
import {
  blessAudioPlayback,
  getBandAudioElement,
  getChachaAudioElement,
  getCoachAudioElement,
  getFeedbackAudioElement,
  getMeaningAudioElement,
  __resetBlessedAudioElementsForTests,
} from "@/lib/iosAudio";

// ---------------------------------------------------------------------------
// Pins the WebKit element-blessing contract (first-phrase autoplay fix).
//
// WebKit blesses playback PER ELEMENT: only an element whose own play() ran
// inside a user gesture may later play programmatically. So every
// programmatic voice surface (coach phrase, meaning segment, band call-out,
// spoken feedback, Chacha-ji's stall lines) must route through persistent
// singletons, and every entry gesture must replay a silent clip through ALL
// of them (re-entry included; a once-flag or a WebAudio primer are both
// regressions, the latter proven on-device Aug 2, 2026).
// ---------------------------------------------------------------------------

class MockAudio {
  src = "";
  paused = true;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  static instances: MockAudio[] = [];
  constructor() {
    MockAudio.instances.push(this);
  }
}

const allGetters = [
  getCoachAudioElement,
  getMeaningAudioElement,
  getBandAudioElement,
  getFeedbackAudioElement,
  getChachaAudioElement,
];

beforeEach(() => {
  MockAudio.instances.length = 0;
  __resetBlessedAudioElementsForTests();
  vi.stubGlobal("Audio", MockAudio);
});

describe("blessed audio singletons", () => {
  test("all five voice surfaces are distinct persistent singletons", () => {
    const els = allGetters.map((get) => get());
    for (const [i, get] of allGetters.entries()) {
      expect(get()).toBe(els[i]);
    }
    expect(new Set(els).size).toBe(5);
    expect(MockAudio.instances).toHaveLength(5);
  });

  test("Chacha-ji speaks through his own element, never the coach's", () => {
    // His lines and the phrase card's coach audio can be in flight in the same
    // modal; one element would cut the other off mid-word.
    expect(getChachaAudioElement()).not.toBe(getCoachAudioElement());
  });

  test("blessAudioPlayback plays a silent wav through ALL singletons on every call", () => {
    blessAudioPlayback();
    expect(MockAudio.instances).toHaveLength(5);
    for (const el of MockAudio.instances) {
      expect(el.play).toHaveBeenCalledTimes(1);
      expect(el.src.startsWith("data:audio/wav;base64,")).toBe(true);
    }
    // A re-entry gesture blesses again on the SAME elements (no once-flag).
    blessAudioPlayback();
    expect(MockAudio.instances).toHaveLength(5);
    for (const el of MockAudio.instances) {
      expect(el.play).toHaveBeenCalledTimes(2);
    }
  });

  test("blessing clears stale handlers and swallows play() rejection", async () => {
    const coach = getCoachAudioElement() as unknown as MockAudio;
    const band = getBandAudioElement() as unknown as MockAudio;
    coach.onended = () => {
      throw new Error("stale session handler must not run");
    };
    band.onerror = () => {
      throw new Error("stale error handler must not run");
    };
    coach.play = vi.fn(() =>
      Promise.reject(new DOMException("denied", "NotAllowedError")),
    );
    expect(() => blessAudioPlayback()).not.toThrow();
    expect(coach.onended).toBeNull();
    expect(band.onerror).toBeNull();
    // Rejection is handled internally; flushing microtasks must not blow up.
    await Promise.resolve();
    await Promise.resolve();
  });

  test("an element that is actually playing is skipped, never interrupted", () => {
    const coach = getCoachAudioElement() as unknown as MockAudio;
    coach.paused = false;
    coach.src = "data:audio/mp3;base64,realclip";
    const staleHandler = () => {};
    coach.onended = staleHandler;
    blessAudioPlayback();
    expect(coach.play).not.toHaveBeenCalled();
    expect(coach.src).toBe("data:audio/mp3;base64,realclip");
    expect(coach.onended).toBe(staleHandler);
    // The idle elements still get blessed.
    for (const get of allGetters.slice(1)) {
      expect((get() as unknown as MockAudio).play).toHaveBeenCalledTimes(1);
    }
  });
});
