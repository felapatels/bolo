import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildGreetingTexts,
  buildGreetingTtsText,
  GREETING_CACHE_KEY_VERSION,
} from "../lib/greetingStrings.js";

// ---------------------------------------------------------------------------
// The canned buffer line, played the instant the learner's first recording
// ends so there is no silence while STT -> LLM -> TTS runs.
//
// It used to be a hand-written native-script greeting per language, which told
// a beginner nothing they could read. The buffer's whole job is to set
// expectations before the first real answer, so it is now English in every
// language. Exact wording, because it was specified rather than derived.
// ---------------------------------------------------------------------------

describe("the canned buffer line", () => {
  test("says the specified words, with the learner's language in them", () => {
    assert.equal(
      buildGreetingTtsText("Hindi"),
      "Ooh, one quick thing while I think! You can talk to me in English, in Hindi, or mix them right up. Bolo loves a good jumble!",
    );
  });

  test("is the same line in every language, only the name moves", () => {
    for (const name of ["Gujarati", "Tamil", "Santali", "Konkani"]) {
      const text = buildGreetingTtsText(name);
      assert.ok(text.includes(`in English, in ${name}, or mix them right up`));
      assert.ok(text.startsWith("Ooh, one quick thing while I think"));
    }
  });

  test("permits a combo, which is the load-bearing half", () => {
    // A beginner's instinct is that mixing languages is cheating. This is the
    // only place that tells them otherwise before they must speak again.
    // Permission to MIX is the load-bearing half of this line, whatever the
    // wording: a beginner thinks mixing is cheating and nothing else tells them
    // otherwise before they speak again.
    assert.ok(buildGreetingTtsText("Hindi").includes("mix them right up"));
    // And it has to sound like Bolo, who talks about himself in the third
    // person. The line it replaced was reported as sounding American.
    assert.ok(buildGreetingTtsText("Hindi").includes("Bolo"));
  });

  test("no native script survives, in any language", () => {
    // The regression this guards: reintroducing a per-language native greeting
    // would put the buffer back in a script the learner cannot yet read.
    for (const code of ["hi", "gu", "ta", "bn", "ur"]) {
      const { display, tts } = buildGreetingTexts(code, "Hindi");
      // Latin letters, digits, punctuation and the parrot only.
      assert.ok(
        /^[\x20-\x7E\u{1F99C}]*$/u.test(display),
        `display for ${code} carries non-Latin text: ${display}`,
      );
      assert.ok(/^[\x20-\x7E]*$/.test(tts), `tts for ${code} is not plain English`);
    }
  });

  test("the emoji is display-only and never spoken", () => {
    const { display, tts } = buildGreetingTexts("hi", "Hindi");
    assert.ok(display.includes("🦜"));
    assert.ok(!tts.includes("🦜"));
  });

  test("carries no English subtitle, because the line already is English", () => {
    assert.equal(buildGreetingTexts("hi", "Hindi").english, "");
  });

  test("the cache version moved, so stale native audio is orphaned", () => {
    // The clips are cached per version. Leaving it at v6 would keep serving
    // the old native greeting audio under the new text.
    assert.notEqual(GREETING_CACHE_KEY_VERSION, "v6");
  });
});
