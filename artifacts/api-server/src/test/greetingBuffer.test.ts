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

// ---------------------------------------------------------------------------
// The greeting's accent, added 2026-08-24.
//
// Reported from the live app: the greeting reads in a different voice from the
// rest of chat. Measured against production first, and it was NOT a config
// divergence: the cached greeting audio and the chat reply shared provider,
// model, the voice `nova` and instruction digest dce4b670 exactly.
//
// The difference is the TEXT. Chat replies are in the target language and
// `nova` reading Hindi sounds Indian for free; the greeting is deliberately
// English in all 22 languages, and `nova` reading English defaults to General
// American. These pin the fix so it cannot quietly revert to sharing the chat
// instructions again.
// ---------------------------------------------------------------------------
import {
  BOLO_CHAT_TTS_INSTRUCTIONS,
  BOLO_CHAT_TTS_INSTRUCTIONS_DIGEST,
  BOLO_GREETING_TTS_INSTRUCTIONS,
  BOLO_GREETING_TTS_INSTRUCTIONS_DIGEST,
} from "../lib/ttsConfig.js";

test("the greeting asks for Indian English, and asks first", () => {
  // FIRST, not buried. "with an indian tone" in the middle of a paragraph about
  // being a cheerleader is what failed; leading with it is the fix.
  const firstLine = BOLO_GREETING_TTS_INSTRUCTIONS.split("\n")[0] ?? "";
  assert.match(firstLine, /Indian English/i);
  assert.match(BOLO_GREETING_TTS_INSTRUCTIONS, /Do not use an American/i);
});

test("the greeting instructions differ from the chat ones, so the cache splits", () => {
  // If these ever converge the digest converges too, the greeting silently
  // reuses chat-instruction audio, and the accent goes back to American with
  // nothing failing.
  assert.notEqual(BOLO_GREETING_TTS_INSTRUCTIONS, BOLO_CHAT_TTS_INSTRUCTIONS);
  assert.notEqual(
    BOLO_GREETING_TTS_INSTRUCTIONS_DIGEST,
    BOLO_CHAT_TTS_INSTRUCTIONS_DIGEST,
  );
});

test("the greeting is still the same character, not a different one", () => {
  // Only the accent direction may differ. A greeting that sounded like someone
  // else would be a worse bug than the one being fixed.
  for (const trait of ["cheerleader", "Enthusiastic", "playful"]) {
    assert.ok(
      BOLO_GREETING_TTS_INSTRUCTIONS.includes(trait),
      `greeting lost the shared trait "${trait}"`,
    );
  }
});
