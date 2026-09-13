/**
 * The speaking-speed preference and the pitch guarantee that goes with it.
 */
import { describe, expect, test, beforeEach } from "vitest";
import {
  SPEECH_RATE_PREF_KEY,
  SPEECH_RATE_OPTIONS,
  NORMAL_SPEECH_RATE,
  loadSpeechRatePref,
  saveSpeechRatePref,
  applySpeechRate,
} from "@/lib/speechRatePref";

beforeEach(() => {
  localStorage.clear();
});

describe("the speaking-speed preference", () => {
  test("defaults to normal when nothing is stored", () => {
    expect(loadSpeechRatePref()).toBe(NORMAL_SPEECH_RATE);
  });

  test("round-trips every offered rate", () => {
    for (const { rate } of SPEECH_RATE_OPTIONS) {
      saveSpeechRatePref(rate);
      expect(loadSpeechRatePref()).toBe(rate);
    }
  });

  // A value this module did not write is corruption or a future version's.
  // Clamping to the nearest option would apply a rate nobody chose.
  test("an unrecognised stored value reads as normal, not as the nearest rate", () => {
    localStorage.setItem(SPEECH_RATE_PREF_KEY, "0.42");
    expect(loadSpeechRatePref()).toBe(NORMAL_SPEECH_RATE);
    localStorage.setItem(SPEECH_RATE_PREF_KEY, "slow");
    expect(loadSpeechRatePref()).toBe(NORMAL_SPEECH_RATE);
  });

  test("the first option is the normal rate, so the default is the first chip", () => {
    expect(SPEECH_RATE_OPTIONS[0]!.rate).toBe(NORMAL_SPEECH_RATE);
  });
});

describe("applySpeechRate", () => {
  // WITHOUT PITCH CORRECTION A SLOWED CLIP BECOMES A DIFFERENT, DEEPER PERSON,
  // which throws away the voice the owner picked by ear. This is the assertion
  // that keeps the toggle from quietly changing who is speaking.
  test("preserves pitch whenever it sets a rate", () => {
    const el = {} as HTMLAudioElement & { preservesPitch?: boolean };
    applySpeechRate(el, 0.65);
    expect(el.preservesPitch).toBe(true);
    expect(el.playbackRate).toBe(0.65);
  });

  test("reads the stored preference when no rate is passed", () => {
    saveSpeechRatePref(0.8);
    const el = {} as HTMLAudioElement;
    applySpeechRate(el);
    expect(el.playbackRate).toBe(0.8);
  });

  // The blessed singletons in iosAudio.ts persist across plays, so a rate set
  // once would stick. applySpeechRate is called per play, which means it must
  // also be able to put an element BACK to normal.
  test("returns a previously slowed element to normal", () => {
    const el = {} as HTMLAudioElement;
    applySpeechRate(el, 0.65);
    saveSpeechRatePref(NORMAL_SPEECH_RATE);
    applySpeechRate(el);
    expect(el.playbackRate).toBe(NORMAL_SPEECH_RATE);
  });

  test("an element that refuses a rate still plays", () => {
    const el = {
      set playbackRate(_v: number) {
        throw new Error("not supported");
      },
      get playbackRate() {
        return 1;
      },
    } as unknown as HTMLAudioElement;
    expect(() => applySpeechRate(el, 0.8)).not.toThrow();
  });
});
