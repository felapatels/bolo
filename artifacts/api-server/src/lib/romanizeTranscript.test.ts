// Unit tests for the deterministic display-only transcript romanization
// (Task 907). Pure text transformation, no DB, no HTTP, no LLM.

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
    assert.equal(romanizeTranscript("કેમ છો", "gu"), "kem cho");
    assert.equal(romanizeTranscript("નમસ્તે", "gu"), "namaste");
    assert.equal(romanizeTranscript("આભાર", "gu"), "abhar");
  });

  test("Devanagari languages romanize; ASCII only, no diacritics", () => {
    assert.equal(romanizeTranscript("नमस्ते", "hi"), "namaste");
    assert.equal(romanizeTranscript("कैसे हो", "hi"), "kaise ho");
    const out = romanizeTranscript("मैं ठीक हूँ", "hi");
    assert.ok(/^[\x20-\x7e]*$/.test(out), `expected pure ASCII, got ${JSON.stringify(out)}`);
    assert.equal(out, "maim thik hu");
  });

  test("schwa kept for non-deleting languages (sa, ne, or)", () => {
    assert.equal(romanizeTranscript("संस्कृतम्", "sa"), "samskrtam");
    assert.equal(romanizeTranscript("नमस्कार", "ne"), "namaskara");
    assert.equal(romanizeTranscript("ଭଲ ଅଛ", "or"), "bhala acha");
  });

  test("other covered Brahmic scripts romanize cleanly", () => {
    assert.equal(romanizeTranscript("ਸਤ ਸ੍ਰੀ ਅਕਾਲ", "pa"), "sat sri akal");
    assert.equal(romanizeTranscript("সুপ্রভাত", "bn"), "suprabhat");
    assert.equal(romanizeTranscript("வணக்கம்", "ta"), "vanakkam");
    assert.equal(romanizeTranscript("ఎలా ఉన్నారు", "te"), "ela unnaru");
    assert.equal(romanizeTranscript("ಹೇಗಿದ್ದೀರಾ", "kn"), "hegiddira");
    assert.equal(romanizeTranscript("സുഖമാണോ", "ml"), "sukhamano");
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
    assert.equal(romanizeTranscript("કેમ છો", ""), "kem cho");
    assert.equal(romanizeTranscript("ਸਤ ਸ੍ਰੀ ਅਕਾਲ", undefined), "sat sri akal");
    // Devanagari is ambiguous (sa/ne keep the vowel), no fallback deletion.
    assert.equal(romanizeTranscript("नमस्कार", ""), "namaskara");
  });
});
