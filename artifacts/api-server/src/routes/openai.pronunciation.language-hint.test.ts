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

// ─── Captured STT call state ──────────────────────────────────────────────────
// Each test sets these before making a request; the mock closure reads them back
// after the request completes.

let stubbedTranscript = "na"; // returned by speechToText
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

// ─── Module mocks (must be registered before ./openai is imported) ────────────

mock.module("@workspace/integrations-openai-ai-server/audio", {
  namedExports: {
    speechToText: async (
      _buffer: Buffer,
      _format: string,
      options: Record<string, unknown>,
    ) => {
      capturedSttOptions.push({ ...options });
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

// Mock @workspace/db so the route's phrase lookup returns our stub without
// touching the real database.  All query methods that the pronunciation handler
// calls (findFirst on phrasesTable, usersTable; findMany on phrasesTable) are
// stubbed; insert is a no-op.
mock.module("@workspace/db", {
  namedExports: {
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
      },
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => ({
            execute: async () => {},
          }),
        }),
      }),
    },
    // Table definitions are only used as arguments to drizzle helpers (eq, etc.);
    // these just need to be plain objects so the import doesn't throw.
    phrasesTable: {},
    ttsCacheTable: {},
    languagesTable: {},
    usersTable: {},
    badgesTable: {},
    chatTurnsTable: {},
    familyPlansTable: {},
    familySeatsTable: {},
    friendInvitesTable: {},
    friendshipsTable: {},
    lessonGenerationsTable: {},
    contactSubmissionsTable: {},
    attemptsTable: {},
    categoriesTable: {},
    lessonsTable: {},
    pool: { end: async () => {} },
    // Re-export drizzle helpers so transitive imports don't fail.
    eq: () => ({}),
    inArray: () => ({}),
    asc: () => ({}),
    and: () => ({}),
    or: () => ({}),
    desc: () => ({}),
    sql: () => ({}),
  },
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
  capturedSttOptions = [];
  stubPhrase = { id: 1, nativeScript: "ná", romanized: "na", english: "no", languageCode: "gu" };
  await postPronunciation({ phraseId: 1, languageName: "Gujarati" });
  const gujaratiLang = capturedSttOptions[0]?.language;

  // --- Hindi attempt ---
  stubbedTranscript = "na";
  capturedSttOptions = [];
  stubPhrase = { id: 2, nativeScript: "ना", romanized: "na", english: "no", languageCode: "hi" };
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
