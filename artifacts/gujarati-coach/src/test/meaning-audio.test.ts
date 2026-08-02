import { describe, test, expect, beforeEach } from "vitest";
import {
  MEANING_AUDIO_STORAGE_KEY,
  loadMeaningAudio,
  saveMeaningAudio,
  meaningSpeechText,
} from "@/lib/meaning-audio";

// ---------------------------------------------------------------------------
// Task 1003: coach speaks the English meaning after each phrase (web).
// Unit coverage for the per-device preference (default ON, localStorage
// persistence, same pattern as spoken-feedback / silent-mode) and for the
// spoken-text builder ("means <gloss>", translation alone for sentences).
// ---------------------------------------------------------------------------

describe("meaning audio preference persistence", () => {
  beforeEach(() => {
    localStorage.removeItem(MEANING_AUDIO_STORAGE_KEY);
  });

  test("defaults to ON when nothing is stored", () => {
    expect(loadMeaningAudio()).toBe(true);
  });

  test("loads OFF when the stored value is off", () => {
    localStorage.setItem(MEANING_AUDIO_STORAGE_KEY, "off");
    expect(loadMeaningAudio()).toBe(false);
  });

  test("save round-trips through localStorage", () => {
    saveMeaningAudio(false);
    expect(localStorage.getItem(MEANING_AUDIO_STORAGE_KEY)).toBe("off");
    expect(loadMeaningAudio()).toBe(false);

    saveMeaningAudio(true);
    expect(localStorage.getItem(MEANING_AUDIO_STORAGE_KEY)).toBe("on");
    expect(loadMeaningAudio()).toBe(true);
  });

  test("unrecognized stored values fall back to ON", () => {
    localStorage.setItem(MEANING_AUDIO_STORAGE_KEY, "banana");
    expect(loadMeaningAudio()).toBe(true);
  });
});

describe("meaningSpeechText", () => {
  test("prefixes a short gloss with means", () => {
    expect(meaningSpeechText("Hello")).toBe("means Hello");
    expect(meaningSpeechText("thank you")).toBe("means thank you");
  });

  test("drops means when the translation ends in sentence punctuation", () => {
    expect(meaningSpeechText("I would like a cup of tea.")).toBe(
      "I would like a cup of tea.",
    );
    expect(meaningSpeechText("Where is the station?")).toBe(
      "Where is the station?",
    );
  });

  test("drops means for long translations even without punctuation", () => {
    expect(meaningSpeechText("please bring me a glass of cold water")).toBe(
      "please bring me a glass of cold water",
    );
  });

  test("drops means when the caller flags a sentence-stage session", () => {
    expect(meaningSpeechText("good morning", { sentence: true })).toBe(
      "good morning",
    );
  });

  test("trims surrounding whitespace before speaking", () => {
    expect(meaningSpeechText("  hello  ")).toBe("means hello");
  });
});
