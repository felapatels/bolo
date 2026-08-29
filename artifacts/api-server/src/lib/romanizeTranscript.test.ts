// Unit tests for the deterministic display-only transcript romanization
// (Task 907). Pure text transformation — no DB, no HTTP, no LLM.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { romanizeTranscript } from "./romanizeTranscript";

describe("romanizeTranscript", () => {
  test("Latin transcript passes through unchanged", () => {
    assert.equal(romanizeTranscript("kem cho", "gu"), "kem cho");
    assert.equal(romanizeTranscript("Hello there", null), "Hello there");
  });

  test("empty and whitespace-only transcripts return empty", () => {
    assert.equal(romanizeTranscript("", "gu"), "");
    assert.equal(romanizeTranscript("   ", "hi"), "");
    assert.equal(romanizeTranscript("\n\t", undefined), "");
  });

  test("Gujarati romanizes to card style (schwa deletion)", () => {
    // "kem chho", NOT "kem cho", SINCE BUILD 17: the seed writes છ as chh
    // (280 chhe, 6 kem chho against 2 kem cho) and the mirror now spells what
    // the cards spell. See toCardStyle.
    assert.equal(romanizeTranscript("કેમ છો", "gu"), "kem chho");
    assert.equal(romanizeTranscript("નમસ્તે", "gu"), "namaste");
    assert.equal(romanizeTranscript("આભાર", "gu"), "abhar");
  });

  test("IAST c and ch become the card style's ch and chh, and sibilants sh", () => {
    // Owner, build 17, under Chacha-ji's face on a Gujarati call: "are bet!
    // hum cacaji bolum chum. kem cho?" The 'bet' was the final-schwa rule,
    // fixed and unpublished; the rest was IAST's c for ચ leaking through.
    assert.equal(
      romanizeTranscript("અરે બેટા! હું ચાચાજી બોલું છું. કેમ છો?", "gu"),
      "are beta! hum chachaji bolum chhum. kem chho?",
    );
    assert.equal(romanizeTranscript("चाय", "hi"), "chay");
    assert.equal(romanizeTranscript("अच्छा", "hi"), "achchha");
    assert.equal(romanizeTranscript("कृपया", "hi"), "kripaya");
  });

  test("Devanagari languages romanize; ASCII only, no diacritics", () => {
    assert.equal(romanizeTranscript("नमस्ते", "hi"), "namaste");
    assert.equal(romanizeTranscript("कैसे हो", "hi"), "kaise ho");
    const out = romanizeTranscript("मैं ठीक हूँ", "hi");
    assert.ok(/^[\x20-\x7e]*$/.test(out), `expected pure ASCII, got ${JSON.stringify(out)}`);
    assert.equal(out, "maim thik hu");
  });

  test("schwa kept for non-deleting languages (sa, ne, or)", () => {
    assert.equal(romanizeTranscript("संस्कृतम्", "sa"), "samskritam");
    assert.equal(romanizeTranscript("नमस्कार", "ne"), "namaskara");
    assert.equal(romanizeTranscript("ଭଲ ଅଛ", "or"), "bhala achha");
  });

  test("other covered Brahmic scripts romanize cleanly", () => {
    assert.equal(romanizeTranscript("ਸਤ ਸ੍ਰੀ ਅਕਾਲ", "pa"), "sat sri akal");
    assert.equal(romanizeTranscript("সুপ্রভাত", "bn"), "suprabhat");
    assert.equal(romanizeTranscript("வணக்கம்", "ta"), "vanakkam");
    assert.equal(romanizeTranscript("ఎలా ఉన్నారు", "te"), "ela unnaru");
    assert.equal(romanizeTranscript("ಹೇಗಿದ್ದೀರಾ", "kn"), "hegiddira");
    assert.equal(romanizeTranscript("സുഖമാണോ", "ml"), "sukhamano");
  });

  test("internal schwas go, and real vowels stay", () => {
    // Owner, 2026-08-28, reading his own words mirrored back from a Gujarati
    // call: `gharamam` for ઘરમાં, which should read `gharmam`. Only the
    // word-FINAL schwa was ever deleted, so every middle one survived.
    assert.equal(romanizeTranscript("ઘરમાં", "gu"), "gharmam");
    assert.equal(romanizeTranscript("રોટલી અને દાળ", "gu"), "rotli ane dal");
    assert.equal(romanizeTranscript("શુક્રિયા", "hi"), "shukriya");
  });

  test("a long a at the end is a vowel, not a schwa", () => {
    // The old rule ran AFTER the macrons were stripped, so it could not tell
    // ā from a and would have taken the ending off રાજા. Deciding on IAST is
    // what makes the two distinguishable at all.
    assert.equal(romanizeTranscript("રાજા", "gu"), "raja");
    assert.equal(romanizeTranscript("મજામાં", "gu"), "majamam");
  });

  test("a schwa a cluster needs is kept", () => {
    // Real schwa deletion is hard and a wrong romanization is worse than a
    // clumsy one, so the rule refuses whenever the consonants either side
    // would merge into more than two units. m + st is three, which is the
    // whole reason નમસ્તે is not `namste`.
    assert.equal(romanizeTranscript("નમસ્તે", "gu"), "namaste");
    assert.equal(romanizeTranscript("नमस्ते", "hi"), "namaste");
    assert.equal(romanizeTranscript("সুপ্রভাত", "bn"), "suprabhat");
  });

  test("uncovered scripts return empty, never garbage", () => {
    // Perso-Arabic (Urdu, Sindhi, Kashmiri): unvocalized consonant skeletons.
    assert.equal(romanizeTranscript("کیسے ہو", "ur"), "");
    assert.equal(romanizeTranscript("سنڌي", "sd"), "");
    assert.equal(romanizeTranscript("کٲشُر", "ks"), "");
    // Ol Chiki (Santali) and Meetei Mayek (Manipuri): unmapped glyphs.
    assert.equal(romanizeTranscript("ᱥᱟᱱᱛᱟᱲᱤ", "sat"), "");
    assert.equal(romanizeTranscript("ꯃꯤꯇꯩ ꯂꯣꯟ", "mni"), "");
  });

  test("language code only affects styling, never coverage", () => {
    // Same Devanagari text romanizes with or without a language code; the
    // scheme comes from the script itself.
    assert.equal(romanizeTranscript("नमस्ते", undefined), "namaste");
    assert.equal(romanizeTranscript("नमस्ते", "unknown-lang"), "namaste");
  });

  test("script fallback: unambiguous schwa-deleting scripts delete without a language code", () => {
    // Eval requests with client-provided targets carry no phraseId, so the
    // route has no languageCode. Gujarati/Gurmukhi/Bengali scripts belong
    // only to schwa-deleting app languages, so card style still applies.
    assert.equal(romanizeTranscript("કેમ છો", ""), "kem chho");
    assert.equal(romanizeTranscript("ਸਤ ਸ੍ਰੀ ਅਕਾਲ", undefined), "sat sri akal");
    // Devanagari is ambiguous (sa/ne keep the vowel) — no fallback deletion.
    assert.equal(romanizeTranscript("नमस्कार", ""), "namaskara");
  });
});
