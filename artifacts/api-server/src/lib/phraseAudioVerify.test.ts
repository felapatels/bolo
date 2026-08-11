/**
 * Verifier decision table.
 *
 * The recognizer is injected, so these tests pin the JUDGEMENT — which
 * transcripts count as a clip that dropped content and which ambiguous cases
 * must fail open — without spending API calls.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  verifyPhraseAudio,
  expectedPhonetics,
  heardPhonetics,
  MIN_COVERAGE,
} from "./phraseAudioVerify";

const AUDIO = Buffer.from("fake-mp3-bytes");

/** The phrase from the field report: "સાચવીને જજો" / "saachvine jajo". */
const PHRASE = {
  nativeScript: "સાચવીને જજો",
  romanized: "saachvine jajo",
  languageCode: "gu",
};

function transcribing(heard: string) {
  return async () => heard;
}

test("the reported clip fails: the recognizer hears only the first word", async () => {
  const verdict = await verifyPhraseAudio({
    audio: AUDIO,
    ...PHRASE,
    transcribe: transcribing("Sačvine"),
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.status, "short");
  assert.ok(
    verdict.coverage !== null && verdict.coverage < MIN_COVERAGE,
    `coverage ${verdict.coverage} should sit below the pass mark`,
  );
});

test("a healthy take of the same phrase passes, even transcribed into another Indic script", async () => {
  // A real recognizer read of the good take: Gurmukhi, not Gujarati, and split
  // differently — still clearly the whole phrase.
  const verdict = await verifyPhraseAudio({
    audio: AUDIO,
    ...PHRASE,
    transcribe: transcribing("ਸਾਚਵੀ ਨੇ ਜੱਜੋਂ"),
  });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.status, "verified");
});

test("a clip that transcribes to nothing fails", async () => {
  const verdict = await verifyPhraseAudio({
    audio: AUDIO,
    ...PHRASE,
    transcribe: transcribing("   ...  "),
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.status, "empty");
});

test("zero-byte audio fails without calling the recognizer", async () => {
  let called = false;
  const verdict = await verifyPhraseAudio({
    audio: Buffer.alloc(0),
    ...PHRASE,
    transcribe: async () => {
      called = true;
      return "anything";
    },
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.status, "empty");
  assert.equal(called, false);
});

test("recognizer drift into an untransliterable script fails open", async () => {
  // The documented Cyrillic drift. We cannot compare it, so we must not use it
  // as grounds for throwing away audio.
  const verdict = await verifyPhraseAudio({
    audio: AUDIO,
    ...PHRASE,
    transcribe: transcribing("вучит крашна"),
  });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.status, "unverifiable");
});

test("a recognizer outage fails open", async () => {
  const verdict = await verifyPhraseAudio({
    audio: AUDIO,
    ...PHRASE,
    transcribe: async () => {
      throw new Error("503 upstream");
    },
  });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.status, "unverifiable");
  assert.match(verdict.note ?? "", /transcription failed/);
});

test("a one-word phrase is too short to length-check and is left alone", async () => {
  let called = false;
  const verdict = await verifyPhraseAudio({
    audio: AUDIO,
    nativeScript: "થામ",
    romanized: "tham",
    languageCode: "gu",
    transcribe: async () => {
      called = true;
      return "tham";
    },
  });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.status, "unverifiable");
  assert.equal(called, false, "no API call is worth spending on an uncheckable phrase");
});

test("a clip that speaks far more than the phrase fails", async () => {
  const verdict = await verifyPhraseAudio({
    audio: AUDIO,
    ...PHRASE,
    transcribe: transcribing(
      "saachvine jajo means take care on your way, said with an upbeat cheerful tone",
    ),
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.status, "long");
});

test("phrases with no romanization fall back to transliterating the native script", () => {
  const withColumn = expectedPhonetics("સાચવીને જજો", "saachvine jajo", "gu");
  const withoutColumn = expectedPhonetics("સાચવીને જજો", "", "gu");
  assert.ok(withColumn.length > 0, "the romanized column must yield comparable letters");
  assert.ok(withoutColumn.length > 0, "native script must still yield comparable letters");
  // Both routes must agree closely enough that the same coverage threshold
  // applies whether or not a phrase carries a romanization.
  const ratio = withoutColumn.length / withColumn.length;
  assert.ok(
    ratio > 0.6 && ratio < 1.6,
    `transliterated length ${withoutColumn.length} should track the authored ${withColumn.length}`,
  );
});

test("heardPhonetics keeps the richer of the direct and transliterated reads", () => {
  // Native-script transcript: nothing survives direct normalization, so the
  // transliterated read must win.
  assert.ok(heardPhonetics("ਸਾਚਵੀ ਨੇ ਜੱਜੋਂ", "gu").length > 0);
  // Latin transcript: passes through.
  assert.ok(heardPhonetics("saachvine jajo", "gu").length > 0);
});
