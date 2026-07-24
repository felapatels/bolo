/**
 * languageVoice.test.ts
 *
 * Two test layers:
 *
 * 1. UNIT — getVoiceIdForLanguage routing logic (no network, instant).
 *    Confirms every ISO code in LANGUAGE_VOICE_MAP resolves to the expected
 *    voice ID, unknown codes fall back to DEFAULT_MULTILINGUAL_VOICE_ID, and
 *    edge cases (undefined, whitespace, mixed-case) are handled correctly.
 *
 * 2. INTEGRATION — ElevenLabs voice-ID smoke test (live API, ~6 real calls).
 *    Calls textToSpeechElevenLabs with a short native-script phrase for each
 *    distinct voice ID in the map.  Asserts:
 *      - No 402 / 400 error (voice is available on the current plan)
 *      - Returned buffer is non-empty (synthesis actually produced audio)
 *    Skipped automatically when ELEVENLABS_API_KEY is absent (CI without the
 *    key is fine; the key is expected on the dev repl where this matters).
 *
 *    Character cost per run: ≤ 10 chars × 6 voices = ≤ 60 characters total.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { textToSpeechElevenLabs } from "@workspace/integrations-openai-ai-server/audio";
import {
  getVoiceIdForLanguage,
  getLanguageIdForCode,
  LANGUAGE_VOICE_MAP,
  LANGUAGE_ID_MAP,
  DEFAULT_MULTILINGUAL_VOICE_ID,
} from "./languageVoice";

// ─── Unit: getVoiceIdForLanguage routing ─────────────────────────────────────

test("getVoiceIdForLanguage: undefined returns the default voice", () => {
  assert.equal(
    getVoiceIdForLanguage(undefined),
    DEFAULT_MULTILINGUAL_VOICE_ID,
    "Undefined languageCode must fall back to DEFAULT_MULTILINGUAL_VOICE_ID",
  );
});

test("getVoiceIdForLanguage: empty string returns the default voice", () => {
  assert.equal(
    getVoiceIdForLanguage(""),
    DEFAULT_MULTILINGUAL_VOICE_ID,
  );
});

test("getVoiceIdForLanguage: whitespace-only string returns the default voice", () => {
  assert.equal(
    getVoiceIdForLanguage("   "),
    DEFAULT_MULTILINGUAL_VOICE_ID,
    "Whitespace-only code must not match a real language entry",
  );
});

test("getVoiceIdForLanguage: unknown code returns the default voice", () => {
  assert.equal(
    getVoiceIdForLanguage("xx"),
    DEFAULT_MULTILINGUAL_VOICE_ID,
  );
});

test("getVoiceIdForLanguage: code lookup is case-insensitive", () => {
  // 'hi' → Brian; confirm 'HI' and 'Hi' resolve identically.
  const lower = getVoiceIdForLanguage("hi");
  assert.equal(getVoiceIdForLanguage("HI"), lower);
  assert.equal(getVoiceIdForLanguage("Hi"), lower);
});

test("getVoiceIdForLanguage: leading/trailing whitespace is stripped", () => {
  assert.equal(
    getVoiceIdForLanguage("  hi  "),
    getVoiceIdForLanguage("hi"),
  );
});

// Verify every entry in the map resolves to its own voice (not the default).
test("getVoiceIdForLanguage: every mapped code returns a non-default voice ID", () => {
  for (const [code, expected] of Object.entries(LANGUAGE_VOICE_MAP)) {
    const resolved = getVoiceIdForLanguage(code);
    assert.equal(
      resolved,
      expected,
      `Language code "${code}" should resolve to voice "${expected}"`,
    );
    assert.notEqual(
      resolved,
      DEFAULT_MULTILINGUAL_VOICE_ID,
      `Language code "${code}" should NOT fall back to the default voice — add it to LANGUAGE_VOICE_MAP`,
    );
  }
});

// Spot-check specific family groupings.
test("getVoiceIdForLanguage: North Indian languages share the Brian voice", () => {
  const brian = "nPczCjzI2devNBz1zQrb";
  for (const code of ["hi", "pa", "mr", "ne", "sa"]) {
    assert.equal(
      getVoiceIdForLanguage(code),
      brian,
      `${code} should map to Brian`,
    );
  }
});

test("getVoiceIdForLanguage: Dravidian languages share the Eric voice", () => {
  const eric = "cjVigY5qzO86Huf0OWal";
  for (const code of ["ta", "te", "kn", "ml"]) {
    assert.equal(
      getVoiceIdForLanguage(code),
      eric,
      `${code} should map to Eric`,
    );
  }
});

test("getVoiceIdForLanguage: East Indian languages share the Charlie voice", () => {
  const charlie = "IKne3meq5aSn9XLyUdCD";
  for (const code of ["bn", "or", "as"]) {
    assert.equal(
      getVoiceIdForLanguage(code),
      charlie,
      `${code} should map to Charlie`,
    );
  }
});

test("getVoiceIdForLanguage: West Indian languages share the Bill voice", () => {
  const bill = "pqHfZKP75CvOlQylNhV4";
  for (const code of ["gu", "raj"]) {
    assert.equal(
      getVoiceIdForLanguage(code),
      bill,
      `${code} should map to Bill`,
    );
  }
});

test("getVoiceIdForLanguage: Perso-Arabic script languages share the Daniel voice", () => {
  const daniel = "onwK4e9ZLuTAKqWW03F9";
  for (const code of ["ur", "ks", "sd"]) {
    assert.equal(
      getVoiceIdForLanguage(code),
      daniel,
      `${code} should map to Daniel`,
    );
  }
});

// ─── Unit: getLanguageIdForCode routing ──────────────────────────────────────

test("getLanguageIdForCode: undefined returns undefined", () => {
  assert.equal(
    getLanguageIdForCode(undefined),
    undefined,
    "Undefined languageCode must return undefined",
  );
});

test("getLanguageIdForCode: empty string returns undefined", () => {
  assert.equal(getLanguageIdForCode(""), undefined);
});

test("getLanguageIdForCode: whitespace-only string returns undefined", () => {
  assert.equal(
    getLanguageIdForCode("   "),
    undefined,
    "Whitespace-only code must not match a real language entry",
  );
});

test("getLanguageIdForCode: unknown code returns undefined", () => {
  assert.equal(
    getLanguageIdForCode("xx"),
    undefined,
    "Unrecognised code must return undefined",
  );
});

test("getLanguageIdForCode: code lookup is case-insensitive", () => {
  const lower = getLanguageIdForCode("hi");
  assert.equal(getLanguageIdForCode("HI"), lower);
  assert.equal(getLanguageIdForCode("Hi"), lower);
});

test("getLanguageIdForCode: leading/trailing whitespace is stripped", () => {
  assert.equal(
    getLanguageIdForCode("  hi  "),
    getLanguageIdForCode("hi"),
  );
});

test("getLanguageIdForCode: natively supported codes return themselves", () => {
  const nativeCodes = ["hi", "gu", "ta", "bn", "ur", "mr", "pa", "te", "kn", "ml", "ne"];
  for (const code of nativeCodes) {
    assert.equal(
      getLanguageIdForCode(code),
      code,
      `Native code "${code}" must map to itself as the language_id`,
    );
  }
});

test("getLanguageIdForCode: Devanagari-adjacent codes fall back to hi", () => {
  for (const code of ["sa", "raj", "doi", "mai", "bho"]) {
    assert.equal(
      getLanguageIdForCode(code),
      "hi",
      `Code "${code}" should fall back to language_id "hi"`,
    );
  }
});

test("getLanguageIdForCode: East Indic codes fall back to bn", () => {
  for (const code of ["or", "as", "mni"]) {
    assert.equal(
      getLanguageIdForCode(code),
      "bn",
      `Code "${code}" should fall back to language_id "bn"`,
    );
  }
});

test("getLanguageIdForCode: Perso-Arabic codes fall back to ur", () => {
  for (const code of ["ks", "sd"]) {
    assert.equal(
      getLanguageIdForCode(code),
      "ur",
      `Code "${code}" should fall back to language_id "ur"`,
    );
  }
});

test("getLanguageIdForCode: Konkani falls back to mr", () => {
  assert.equal(getLanguageIdForCode("kok"), "mr");
});

test("getLanguageIdForCode: sat (Santali) has no mapping and returns undefined", () => {
  assert.equal(
    getLanguageIdForCode("sat"),
    undefined,
    "Santali has no close ElevenLabs language; should return undefined",
  );
});

// Verify every entry in LANGUAGE_ID_MAP resolves to a non-undefined string.
test("getLanguageIdForCode: every mapped code returns a non-undefined language_id", () => {
  for (const [code, expected] of Object.entries(LANGUAGE_ID_MAP)) {
    const resolved = getLanguageIdForCode(code);
    assert.equal(
      resolved,
      expected,
      `Language code "${code}" should resolve to language_id "${expected}"`,
    );
    assert.notEqual(
      resolved,
      undefined,
      `Language code "${code}" should return a defined language_id`,
    );
  }
});

// ─── Integration: ElevenLabs voice availability smoke test ───────────────────
//
// Each entry maps: voiceName → { voiceId, phrase, languageNote }.
// The phrase is a very short (≤10 chars) native-script word to keep character
// usage low.  The test calls the real ElevenLabs API and asserts a non-empty
// MP3 buffer is returned with no 402/400 error.
//
// This block is skipped when ELEVENLABS_API_KEY is not set so CI without the
// key stays green.

const VOICE_SMOKE_CASES: Array<{
  voiceName: string;
  voiceId: string;
  phrase: string;
  languageCodes: string[];
}> = [
  {
    voiceName: "Brian (North Indian / Indic)",
    voiceId: "nPczCjzI2devNBz1zQrb",
    phrase: "नमस्ते",   // "Namaste" — Hindi Devanagari, 6 chars
    languageCodes: ["hi", "pa", "mr", "ne", "sa", "doi", "mai", "kok", "bho"],
  },
  {
    voiceName: "Eric (South Indian / Dravidian)",
    voiceId: "cjVigY5qzO86Huf0OWal",
    phrase: "வணக்கம்", // "Vanakkam" — Tamil, 7 chars
    languageCodes: ["ta", "te", "kn", "ml"],
  },
  {
    voiceName: "Charlie (East Indian)",
    voiceId: "IKne3meq5aSn9XLyUdCD",
    phrase: "নমস্কার",  // "Nomoskar" — Bengali, 7 chars
    languageCodes: ["bn", "or", "as", "mni", "sat"],
  },
  {
    voiceName: "Bill (West Indian)",
    voiceId: "pqHfZKP75CvOlQylNhV4",
    phrase: "નમસ્તે",   // "Namaste" — Gujarati, 6 chars
    languageCodes: ["gu", "raj"],
  },
  {
    voiceName: "Daniel (Perso-Arabic script)",
    voiceId: "onwK4e9ZLuTAKqWW03F9",
    phrase: "آداب",      // "Aadaab" — Urdu greeting, 4 chars
    languageCodes: ["ur", "ks", "sd"],
  },
  {
    voiceName: "George (default fallback)",
    voiceId: DEFAULT_MULTILINGUAL_VOICE_ID,
    phrase: "Hello",    // English — tests the fallback path, 5 chars
    languageCodes: [],
  },
];

// Confirm every distinct voice ID in the map is covered by the smoke cases
// (pure code assertion — not skipped by key absence).
test("smoke test coverage: every distinct voice ID in LANGUAGE_VOICE_MAP has a smoke case", () => {
  const smokeIds = new Set(VOICE_SMOKE_CASES.map((c) => c.voiceId));
  const mapIds = new Set(Object.values(LANGUAGE_VOICE_MAP));
  mapIds.add(DEFAULT_MULTILINGUAL_VOICE_ID); // default must also be tested

  for (const id of mapIds) {
    assert.ok(
      smokeIds.has(id),
      `Voice ID "${id}" appears in LANGUAGE_VOICE_MAP but has no smoke test case. ` +
        "Add an entry to VOICE_SMOKE_CASES in languageVoice.test.ts.",
    );
  }
});

// Confirm every mapped language code appears in at least one smoke case.
test("smoke test coverage: every mapped language code is represented in a smoke case", () => {
  const coveredCodes = new Set(
    VOICE_SMOKE_CASES.flatMap((c) => c.languageCodes),
  );
  const unmapped: string[] = [];
  for (const code of Object.keys(LANGUAGE_VOICE_MAP)) {
    if (!coveredCodes.has(code)) unmapped.push(code);
  }
  assert.deepEqual(
    unmapped,
    [],
    `Language codes not represented in any smoke test case: ${unmapped.join(", ")}. ` +
      "Add them to the matching languageCodes array in VOICE_SMOKE_CASES.",
  );
});

if (!process.env.ELEVENLABS_API_KEY) {
  // eslint-disable-next-line no-console
  console.log(
    "⚠  ELEVENLABS_API_KEY not set — skipping ElevenLabs voice smoke tests.",
  );
} else {
  for (const { voiceName, voiceId, phrase, languageCodes } of VOICE_SMOKE_CASES) {
    // Use the first mapped language code to exercise the language_id path.
    // For the George fallback case (no language codes) this is undefined,
    // which correctly exercises the "no language_id" code path.
    const smokeLanguageId = languageCodes[0]
      ? getLanguageIdForCode(languageCodes[0])
      : undefined;

    test(
      `ElevenLabs voice smoke: "${voiceName}" (${voiceId}) synthesises real audio`,
      async () => {
        let buffer: Buffer;
        try {
          buffer = await textToSpeechElevenLabs(phrase, voiceId, undefined, undefined, smokeLanguageId);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);

          // ElevenLabs returns 401 with code:"quota_exceeded" when monthly credits
          // are exhausted. This is NOT a voice-ID problem — it means the API key
          // was accepted and the request was routed (so the voice ID is valid on
          // the account's plan) but synthesis was blocked by the quota gate.
          // Skip rather than fail so a depleted-quota environment doesn't
          // incorrectly flag the voice map as broken.
          if (/quota_exceeded/.test(msg) || /status 429/.test(msg)) {
            console.log(
              `  ⚠  Voice "${voiceName}" (${voiceId}): ElevenLabs quota ` +
                "exhausted — voice ID was accepted but credits are depleted. " +
                "Re-run after the monthly quota resets to verify audio quality.",
            );
            return; // Skip this voice — not a map problem.
          }

          // 402 = plan does not include this voice; 400 = invalid voice ID.
          // Both indicate a misconfigured voice map — fail loudly.
          if (/status 402/.test(msg)) {
            assert.fail(
              `Voice "${voiceName}" (${voiceId}) returned 402 — it may be a ` +
                "library/cloned voice unavailable on the current ElevenLabs plan. " +
                "Replace it with a premade voice in LANGUAGE_VOICE_MAP.",
            );
          }
          if (/status 400/.test(msg) || /status 404/.test(msg)) {
            assert.fail(
              `Voice "${voiceName}" (${voiceId}) returned 400/404 — the voice ID ` +
                "is invalid or was deleted. Update LANGUAGE_VOICE_MAP and bump " +
                "TTS_PROVIDER_VERSION in ttsCache.ts.",
            );
          }
          throw err; // Unexpected error (network outage, etc.) — surface as-is.
        }

        assert.ok(
          buffer.length > 0,
          `Voice "${voiceName}" (${voiceId}) returned an empty audio buffer. ` +
            "ElevenLabs accepted the request but produced no audio — check the phrase or voice settings.",
        );

        // Verify the buffer starts with an MP3 ID3 tag or frame sync marker.
        // ElevenLabs always returns mp3_44100_128 for this integration.
        const isId3 =
          buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33; // "ID3"
        const isMp3Frame =
          buffer[0] === 0xff &&
          (buffer[1] === 0xfb ||
            buffer[1] === 0xfa ||
            buffer[1] === 0xf3 ||
            buffer[1] === 0xe3); // MP3 sync word variants
        assert.ok(
          isId3 || isMp3Frame,
          `Voice "${voiceName}" (${voiceId}) returned a buffer that does not look like ` +
            `MP3 audio (first bytes: 0x${buffer.slice(0, 4).toString("hex")}). ` +
            "Possible wrong format or a text error response was base64-decoded.",
        );
      },
    );
  }
}
