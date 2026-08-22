// Pins for recognizer language pinning (owner item 5, Aug 21, 2026).
//
// The bug these exist to prevent coming back: practising Hindi धन्यवाद
// returned "Köszönöm" (Hungarian) and "Děkuji" (Czech), because the STT call
// carried English prose in the `prompt` field and the advisory `language`
// field lost to it. The learner reads that transcript on the "We heard" line,
// so the captured word has to be in the language being practised.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildSttOptions,
  discardAnchorEcho,
  sttLanguageCode,
} from "./sttLanguage";
// Subpath import on purpose: `@workspace/db` opens a pg Pool at module
// load, and this is a pure unit test. `seed-data` is JSON and types only.
import { LANGUAGES } from "@workspace/db/seed-data";

describe("sttLanguageCode", () => {
  test("passes through the sixteen codes that are real ISO-639-1", () => {
    for (const code of [
      "as", "bn", "gu", "hi", "kn", "ks", "ml", "mr",
      "ne", "or", "pa", "sa", "sd", "ta", "te", "ur",
    ]) {
      assert.equal(sttLanguageCode(code), code, `${code} must be sent as-is`);
    }
  });

  test("returns null for the six codes with no ISO-639-1 equivalent", () => {
    // These used to be sent raw, draw a 400, and fall into the retry that
    // drops the language hint entirely. Null means the caller omits the
    // field deliberately instead of having it stripped silently.
    for (const code of ["brx", "doi", "kok", "mai", "mni", "sat"]) {
      assert.equal(sttLanguageCode(code), null, `${code} has no ISO-639-1 code`);
    }
  });

  test("returns null for empty, missing and unknown codes", () => {
    assert.equal(sttLanguageCode(""), null);
    assert.equal(sttLanguageCode(null), null);
    assert.equal(sttLanguageCode(undefined), null);
    assert.equal(sttLanguageCode("klingon"), null);
  });

  test("covers every seeded language, so a new one cannot be missed", () => {
    // Not a pass/fail on the mapping itself: every seeded code must resolve
    // to either a two-letter code or an explicit null, never to something
    // three letters long that the API would reject.
    for (const lang of LANGUAGES) {
      const resolved = sttLanguageCode(lang.code);
      assert.ok(
        resolved === null || /^[a-z]{2}$/.test(resolved),
        `${lang.code} resolved to ${JSON.stringify(resolved)}, which the API would reject`,
      );
    }
  });
});

describe("buildSttOptions", () => {
  test("anchors the prompt in the language's own script, with no English", () => {
    const opts = buildSttOptions({ languageCode: "hi", languageNativeName: "हिन्दी" });
    assert.equal(opts.language, "hi");
    assert.equal(opts.prompt, "हिन्दी");
    assert.ok(
      !/[a-zA-Z]/.test(opts.prompt ?? ""),
      "the anchor must carry no Latin letters: Latin context is what let the decoder out of the target script",
    );
  });

  test("omits the language key rather than sending a code the API rejects", () => {
    const opts = buildSttOptions({ languageCode: "kok", languageNativeName: "कोंकणी" });
    assert.equal(opts.language, undefined, "kok has no ISO-639-1 code");
    assert.equal(opts.prompt, "कोंकणी", "the script anchor still pins the script");
  });

  test("omits both fields when nothing is known, keeping the fail-open auto-detect", () => {
    assert.deepEqual(buildSttOptions({}), {});
    assert.deepEqual(buildSttOptions({ languageCode: "", languageNativeName: "" }), {});
  });

  test("omits the prompt when no native name is available", () => {
    // The language row can be missing while the phrase row still names the
    // language. The pin survives; only the script anchor is lost.
    const opts = buildSttOptions({ languageCode: "gu", languageNativeName: null });
    assert.equal(opts.language, "gu");
    assert.equal(opts.prompt, undefined);
  });

  test("never carries a client-supplied English language name", () => {
    // The old prompt was built from `languageName`, which the client sends.
    // buildSttOptions has no parameter that could carry it.
    const opts = buildSttOptions({ languageCode: "gu", languageNativeName: "ગુજરાતી" });
    assert.equal(opts.prompt, "ગુજરાતી");
  });
});

describe("discardAnchorEcho", () => {
  test("blanks a transcript that is only the anchor echoed back", () => {
    // Whisper returns its prompt as the transcript when the clip is silent.
    // A native-script echo would otherwise be scored as the learner saying
    // the wrong word, which the old English prompt never risked.
    assert.equal(discardAnchorEcho("हिन्दी", "हिन्दी"), "");
    assert.equal(discardAnchorEcho("  हिन्दी।  ", "हिन्दी"), "");
  });

  test("keeps a real transcript that merely contains the anchor", () => {
    assert.equal(discardAnchorEcho("मैं हिन्दी बोलता हूँ", "हिन्दी"), "मैं हिन्दी बोलता हूँ");
  });

  test("keeps the transcript untouched when there is no anchor", () => {
    assert.equal(discardAnchorEcho("धन्यवाद", undefined), "धन्यवाद");
    assert.equal(discardAnchorEcho("धन्यवाद", ""), "धन्यवाद");
  });

  test("leaves an ordinary attempt alone", () => {
    assert.equal(discardAnchorEcho("धन्यवाद", "हिन्दी"), "धन्यवाद");
  });
});
