// Tests that the STT language-code hint is built correctly from the phrase's
// languageCode field.
//
// Background: POST /openai/pronunciation constructs sttOptions as:
//
//   const sttOptions = {
//     ...(languageCode ? { language: languageCode } : {}),
//     prompt: `A language learner is speaking ${language}. Transcribe exactly what they say.`,
//   };
//
// When a phraseId is supplied the server fetches the phrase from the DB and
// uses phrase.languageCode — the client cannot forge it.  When no phraseId is
// supplied languageCode defaults to the empty string and the `language` key is
// omitted, leaving Whisper to auto-detect.
//
// The STT language hint is the primary safeguard against phonetically identical
// short words (e.g. "na") silently passing in the wrong language: Whisper
// anchors its transcription to the requested language's phoneme set when the
// hint is present.  These tests verify the hint is wired correctly.

import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Request, type Response, type NextFunction } from "express";
import { createDbMockExports } from "../test/dbMock";

// ─── Captured STT call state ──────────────────────────────────────────────────
// Each test sets these before making a request; the mock closure reads them back
// after the request completes.

let stubbedTranscript = "na"; // returned by speechToText (all calls, unless sequence is set)
// When non-null, each speechToText call pops the first entry; falls back to
// stubbedTranscript once the sequence is exhausted.  Set to null between tests
// that don't need per-call control.
let stubbedTranscriptSequence: string[] | null = null;
let capturedSttOptions: Record<string, unknown>[] = []; // all calls to speechToText

// ─── Stub phrase returned by the DB mock ──────────────────────────────────────
// Tests that use a phraseId will get this phrase back from the DB stub.  Tests
// without phraseId set this to null so findFirst returns undefined (no phrase).

interface StubPhrase {
  id: number;
  nativeScript: string;
  romanized: string;
  english: string;
  languageCode: string;
  stage?: string | null;
  premium?: boolean | null;
}

let stubPhrase: StubPhrase | null = {
  id: 42,
  nativeScript: "ná",
  romanized: "na",
  english: "no",
  languageCode: "gu",
};

// ─── Stub language returned by the DB mock ────────────────────────────────────
// Tests that use a phraseId will get this language back from the DB stub when
// the route looks up languagesTable by languageCode.  Set per-test to match the
// stubPhrase's languageCode so the derived language name is predictable.

interface StubLanguage {
  code: string;
  name: string;
}

let stubLanguage: StubLanguage | null = {
  code: "gu",
  name: "Gujarati",
};

// ─── Module mocks (must be registered before ./openai is imported) ────────────

mock.module("@workspace/integrations-openai-ai-server/audio", {
  namedExports: {
    // Error class imported by parrotChat.ts (transitively via the route file);
    // must exist on the mock or module instantiation throws.
    UndecodableAudioError: class UndecodableAudioError extends Error {},
    speechToText: async (
      _buffer: Buffer,
      _format: string,
      options: Record<string, unknown>,
    ) => {
      capturedSttOptions.push({ ...options });
      // Per-call sequence takes priority; fall back to the single stub value.
      if (stubbedTranscriptSequence !== null && stubbedTranscriptSequence.length > 0) {
        return stubbedTranscriptSequence.shift()!;
      }
      return stubbedTranscript;
    },
    ensureCompatibleFormat: async (buf: Buffer) => ({
      buffer: buf,
      format: "mp3" as const,
    }),
    openai: {
      chat: {
        completions: {
          create: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    score: 55,
                    passed: false,
                    feedback: "Nice try!",
                    tip: "Keep practicing.",
                  }),
                },
              },
            ],
          }),
        },
      },
    },
    textToSpeechElevenLabs: async () => Buffer.from("fake"),
    textToSpeech: async () => Buffer.from("fake"),
    textToSpeechElevenLabsStream: async () => Buffer.from("fake"),
    convertToWav: async (buf: Buffer) => buf,
    getElevenLabsQuota: async () => ({ character_count: 0, character_limit: 100000 }),
    getElevenLabsUsageStats: async () => ({ character_count: 0 }),
  },
});

// Mock @workspace/db via the canonical factory (src/test/dbMock.ts) so the
// route's phrase lookup returns our stub without touching the real database.
// The factory supplies every schema-barrel export (typecheck-enforced against
// the real module, so schema additions update ONE place); only the db query
// stubs below are test-specific.  All query methods the pronunciation handler
// calls (findFirst on phrasesTable, usersTable; findMany on phrasesTable) are
// stubbed; insert is a no-op.
mock.module("@workspace/db", {
  namedExports: createDbMockExports({
    db: {
      query: {
        phrasesTable: {
          // phraseId lookup → return stubPhrase (or undefined when null).
          findFirst: async () => stubPhrase ?? undefined,
          // Sibling phrase query (wrong-phrase-cap guard) → empty so guard is quiet.
          findMany: async () => [],
        },
        ttsCacheTable: {
          findFirst: async () => null,
        },
        usersTable: {
          // Voice-preference lookup → null so the route uses the language default.
          findFirst: async () => null,
        },
        languagesTable: {
          // Language name lookup → return stubLanguage (or undefined when null).
          findFirst: async () => stubLanguage ?? undefined,
        },
      },
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => ({
            execute: async () => {},
          }),
        }),
      }),
    },
  }),
});

// ─── Express test server ──────────────────────────────────────────────────────

let server: Server;
let baseUrl: string;

before(async () => {
  assert.ok(
    process.env.SESSION_SECRET,
    "SESSION_SECRET must be set (needed by signEvaluation)",
  );

  const { default: openaiRouter } = await import("./openai");

  const app = express();
  app.use(express.json());

  app.use((_req: Request, _res: Response, next: NextFunction) => {
    (_req as any).log = { warn: () => {}, error: () => {}, info: () => {} };
    next();
  });
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    (_req as any).userId = "test_lang_hint_user";
    (_req as any).resolvedPlan = { plan: "free" };
    next();
  });

  app.use(openaiRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(() => {
  server?.close();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function postPronunciation(body: Record<string, unknown>) {
  const res = await fetch(`${baseUrl}/openai/pronunciation`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      audioBase64: Buffer.from("fake-audio-bytes").toString("base64"),
      languageName: "Gujarati",
      // Zod schema requires these even when phraseId is present; the route
      // overrides them from the DB when a phraseId is supplied.
      targetNative: "ná",
      targetRomanized: "na",
      targetEnglish: "no",
      ...body,
    }),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test("STT hint includes language code when phrase has languageCode='gu'", async () => {
  // When a phraseId is provided, the route fetches the phrase and uses its
  // languageCode to build the STT options.  The DB stub returns a phrase with
  // languageCode: "gu", so the STT call must include { language: "gu" }.
  stubbedTranscript = "na";
  capturedSttOptions = [];
  stubPhrase = {
    id: 42,
    nativeScript: "ná",
    romanized: "na",
    english: "no",
    languageCode: "gu",
  };
  stubLanguage = { code: "gu", name: "Gujarati" };

  const { status, json } = await postPronunciation({ phraseId: 42 });

  assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(json)}`);
  assert.ok(
    capturedSttOptions.length >= 1,
    "speechToText must have been called at least once",
  );

  // Every STT call on this request must carry the language hint.
  for (const opts of capturedSttOptions) {
    assert.equal(
      opts.language,
      "gu",
      `sttOptions.language must be "gu", got ${JSON.stringify(opts)}`,
    );
    assert.ok(
      typeof opts.prompt === "string" && opts.prompt.includes("Gujarati"),
      `sttOptions.prompt must mention the language name, got ${JSON.stringify(opts.prompt)}`,
    );
  }
});

test("STT hint includes language code 'hi' for a Hindi phrase", async () => {
  // Confirm the hint is driven by phrase.languageCode, not hard-coded to "gu".
  stubbedTranscript = "na";
  capturedSttOptions = [];
  stubPhrase = {
    id: 99,
    nativeScript: "ना",
    romanized: "na",
    english: "no",
    languageCode: "hi",
  };
  stubLanguage = { code: "hi", name: "Hindi" };

  const { status } = await postPronunciation({ phraseId: 99, languageName: "Hindi" });

  assert.equal(status, 200);
  assert.ok(capturedSttOptions.length >= 1, "speechToText must have been called");
  for (const opts of capturedSttOptions) {
    assert.equal(
      opts.language,
      "hi",
      `sttOptions.language must be "hi" for Hindi phrase, got ${JSON.stringify(opts)}`,
    );
  }
});

test("STT hint omits language key when no phraseId is supplied (client-provided targets)", async () => {
  // Without a phraseId, languageCode stays as the empty string and the
  // `language` key must be absent from sttOptions so Whisper auto-detects.
  stubbedTranscript = "na";
  capturedSttOptions = [];

  const { status, json } = await postPronunciation({
    // No phraseId — client supplies the target strings directly.
    targetNative: "ná",
    targetRomanized: "na",
    targetEnglish: "no",
  });

  assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(json)}`);
  assert.ok(capturedSttOptions.length >= 1, "speechToText must have been called");

  // The first STT call must NOT include a `language` key.
  const firstOpts = capturedSttOptions[0]!;
  assert.equal(
    firstOpts.language,
    undefined,
    `sttOptions.language must be absent when languageCode is empty, got ${JSON.stringify(firstOpts)}`,
  );
  assert.ok(
    typeof firstOpts.prompt === "string",
    "sttOptions.prompt must still be present",
  );
});

test("STT hint language code is consistent for cross-language homophone 'na': Gujarati vs Hindi", async () => {
  // 'na' romanizes identically in Gujarati and Hindi.  The only reliable
  // disambiguator is the STT language hint derived from phrase.languageCode.
  // This test confirms that two otherwise-identical requests — one for a
  // Gujarati phrase and one for a Hindi phrase — produce different language
  // hints and therefore steer Whisper toward the correct script.

  // --- Gujarati attempt ---
  stubbedTranscript = "na";
  stubbedTranscriptSequence = null;
  capturedSttOptions = [];
  stubPhrase = { id: 1, nativeScript: "ná", romanized: "na", english: "no", languageCode: "gu" };
  stubLanguage = { code: "gu", name: "Gujarati" };
  await postPronunciation({ phraseId: 1, languageName: "Gujarati" });
  const gujaratiLang = capturedSttOptions[0]?.language;

  // --- Hindi attempt ---
  stubbedTranscript = "na";
  stubbedTranscriptSequence = null;
  capturedSttOptions = [];
  stubPhrase = { id: 2, nativeScript: "ना", romanized: "na", english: "no", languageCode: "hi" };
  stubLanguage = { code: "hi", name: "Hindi" };
  await postPronunciation({ phraseId: 2, languageName: "Hindi" });
  const hindiLang = capturedSttOptions[0]?.language;

  assert.equal(gujaratiLang, "gu", `Gujarati phrase must hint language "gu", got ${gujaratiLang}`);
  assert.equal(hindiLang, "hi", `Hindi phrase must hint language "hi", got ${hindiLang}`);
  assert.notEqual(
    gujaratiLang,
    hindiLang,
    "The two language hints must differ so Whisper transcribes in the right language",
  );
});

test("STT language hint is present on the high-quality retry pass when the first transcript is empty", async () => {
  // When the fast-pass transcript is empty, the route fires a second
  // speechToText call with { highQuality: true }.  The language hint must be
  // included in that retry call too — a refactor that rebuilds sttOptions
  // before the retry would silently drop the anchor.
  //
  // Simulate: first call returns "" (empty), retry returns a recognisable word.
  stubbedTranscriptSequence = ["", "ná"]; // first call → empty, retry → match
  capturedSttOptions = [];
  stubPhrase = {
    id: 42,
    nativeScript: "ná",
    romanized: "na",
    english: "no",
    languageCode: "gu",
  };
  stubLanguage = { code: "gu", name: "Gujarati" };

  const { status, json } = await postPronunciation({ phraseId: 42 });

  assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(json)}`);
  assert.equal(
    capturedSttOptions.length,
    2,
    `expected exactly 2 speechToText calls (fast pass + retry), got ${capturedSttOptions.length}`,
  );

  // Both the initial call and the high-quality retry must carry the language hint.
  for (const [i, opts] of capturedSttOptions.entries()) {
    assert.equal(
      opts.language,
      "gu",
      `call #${i + 1}: sttOptions.language must be "gu" on the retry pass, got ${JSON.stringify(opts)}`,
    );
  }

  // Confirm the second call was the high-quality one.
  assert.equal(
    capturedSttOptions[1]!.highQuality,
    true,
    "second speechToText call must set highQuality: true",
  );

  // Reset sequence so subsequent tests use the plain stub.
  stubbedTranscriptSequence = null;
});

test("STT language hint is present on the high-quality retry pass when the first transcript has low similarity", async () => {
  // The retry is also triggered when compareToTarget returns comparable=true
  // and sim ≤ 0.25 — i.e. the fast-pass transcript is wildly unlike the target.
  // A completely unrelated word like "xyz" relative to target "ná"/"na" should
  // satisfy that condition.  Both STT calls must still carry the language hint.
  //
  // We return a phonetically distant word on the first call and the correct
  // word on the retry so the route can pick the better transcript.
  stubbedTranscriptSequence = ["xyz", "ná"]; // first → distant, retry → match
  capturedSttOptions = [];
  stubPhrase = {
    id: 42,
    nativeScript: "ná",
    romanized: "na",
    english: "no",
    languageCode: "gu",
  };
  stubLanguage = { code: "gu", name: "Gujarati" };

  const { status, json } = await postPronunciation({ phraseId: 42 });

  assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(json)}`);
  // The route may or may not trigger the retry depending on whether "xyz" is
  // comparable to "na"/"ná" at all.  What we care about is that EVERY call
  // that did happen carried the language hint.
  assert.ok(
    capturedSttOptions.length >= 1,
    "at least one speechToText call must have been made",
  );
  for (const [i, opts] of capturedSttOptions.entries()) {
    assert.equal(
      opts.language,
      "gu",
      `call #${i + 1}: sttOptions.language must be "gu", got ${JSON.stringify(opts)}`,
    );
  }

  // When 2 calls happened, confirm the second was the high-quality retry.
  if (capturedSttOptions.length >= 2) {
    assert.equal(
      capturedSttOptions[1]!.highQuality,
      true,
      "second speechToText call must set highQuality: true",
    );
  }

  // Reset sequence so subsequent tests use the plain stub.
  stubbedTranscriptSequence = null;
});

test("STT prompt uses DB-derived language name even when client sends a mismatched languageName", async () => {
  // The client sends languageName="Hindi" but the phrase belongs to Gujarati
  // (languageCode: "gu").  The server must look up the language name from
  // languagesTable using the phrase's languageCode and use "Gujarati" in the
  // STT prompt — not the client-supplied "Hindi".  This prevents a mismatched
  // client value from weakening Whisper's language anchor.
  stubbedTranscript = "na";
  stubbedTranscriptSequence = null;
  capturedSttOptions = [];
  stubPhrase = {
    id: 42,
    nativeScript: "ná",
    romanized: "na",
    english: "no",
    languageCode: "gu",
  };
  // DB returns the canonical Gujarati record regardless of what the client said.
  stubLanguage = { code: "gu", name: "Gujarati" };

  const { status, json } = await postPronunciation({
    phraseId: 42,
    languageName: "Hindi", // client sends the wrong language name
  });

  assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(json)}`);
  assert.ok(capturedSttOptions.length >= 1, "speechToText must have been called");

  for (const [i, opts] of capturedSttOptions.entries()) {
    assert.ok(
      typeof opts.prompt === "string" && opts.prompt.includes("Gujarati"),
      `call #${i + 1}: prompt must mention "Gujarati" (DB-derived), got ${JSON.stringify(opts.prompt)}`,
    );
    assert.ok(
      typeof opts.prompt !== "string" || !opts.prompt.includes("Hindi"),
      `call #${i + 1}: prompt must NOT mention "Hindi" (the mismatched client value), got ${JSON.stringify(opts.prompt)}`,
    );
    assert.equal(
      opts.language,
      "gu",
      `call #${i + 1}: sttOptions.language must be "gu" (from phrase), got ${JSON.stringify(opts.language)}`,
    );
  }
});

test("STT prompt falls back to client-supplied languageName when DB has no record for the phrase's language", async () => {
  // When languagesTable.findFirst returns undefined (no row for the phrase's
  // languageCode), the route must fall back to the client-supplied languageName
  // rather than emitting the generic "the target language" placeholder.
  // Scenario: client sends languageName="Gujarati", phrase.languageCode="gu",
  // DB has no matching language row (stubLanguage = null).
  stubbedTranscript = "na";
  stubbedTranscriptSequence = null;
  capturedSttOptions = [];
  stubPhrase = {
    id: 42,
    nativeScript: "ná",
    romanized: "na",
    english: "no",
    languageCode: "gu",
  };
  // Simulate a missing DB record for the language.
  stubLanguage = null;

  const { status, json } = await postPronunciation({
    phraseId: 42,
    languageName: "Gujarati", // client-supplied; should appear in prompt as fallback
  });

  assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(json)}`);
  assert.ok(capturedSttOptions.length >= 1, "speechToText must have been called at least once");

  for (const [i, opts] of capturedSttOptions.entries()) {
    assert.ok(
      typeof opts.prompt === "string" && opts.prompt.includes("Gujarati"),
      `call #${i + 1}: prompt must mention the client-supplied "Gujarati" when DB has no language row, got ${JSON.stringify(opts.prompt)}`,
    );
    assert.ok(
      typeof opts.prompt !== "string" || !opts.prompt.includes("the target language"),
      `call #${i + 1}: prompt must NOT fall back to generic "the target language" placeholder, got ${JSON.stringify(opts.prompt)}`,
    );
  }

  // Reset so subsequent tests use the default stub.
  stubLanguage = { code: "gu", name: "Gujarati" };
});

test("high-quality STT retry is NOT fired when the first-pass transcript is already strong", async () => {
  // The retry branch fires only when the first-pass transcript is empty or has
  // similarity ≤ 0.40 to the target.  When the first pass returns a transcript
  // that is phonetically close to the target (e.g. the romanized form "na" for
  // target romanized "na"), the condition is false and speechToText must be
  // called exactly once — no costly second pass.
  //
  // This guards against a future refactor that accidentally always fires the
  // retry, which would double API cost on every pronunciation evaluation.
  stubbedTranscript = "na"; // phonetically identical to target romanized "na"
  stubbedTranscriptSequence = null;
  capturedSttOptions = [];
  stubPhrase = {
    id: 42,
    nativeScript: "ná",
    romanized: "na",
    english: "no",
    languageCode: "gu",
  };
  stubLanguage = { code: "gu", name: "Gujarati" };

  const { status, json } = await postPronunciation({ phraseId: 42 });

  assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(json)}`);
  assert.equal(
    capturedSttOptions.length,
    1,
    `expected exactly 1 speechToText call (no high-quality retry) when first transcript is strong, got ${capturedSttOptions.length}`,
  );

  // Confirm the single call did NOT set highQuality.
  assert.notEqual(
    capturedSttOptions[0]!.highQuality,
    true,
    "the single speechToText call must NOT have highQuality: true",
  );
});
