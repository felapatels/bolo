import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import {
  db,
  pool,
  usersTable,
  languagesTable,
  phrasesTable,
  categoriesTable,
  lessonsTable,
  chatTurnsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import openaiRouter from "./openai";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { defaultParrotChatDeps } from "../lib/parrotChat";
import { ensureUsersColumns } from "../lib/testDbCompat";

// Integration test for POST /openai/chat: seed-word DB fetch + transcription prompt.
//
// Verifies that when phrases exist for the active language in the DB, the
// route fetches them and passes their romanized forms as seed words to the
// Whisper transcription prompt, giving the model phonetic anchoring for
// less-resourced languages (Kashmiri, Santali, Manipuri, etc.).
//
// Strategy: monkey-patch `defaultParrotChatDeps` (the live dependency object
// used by the route) to inject stub functions for all AI operations. This lets
// the test exercise the real DB fetch + runParrotTurn wiring without network
// access, and captures exactly what options the transcribe stub receives.
//
// Follows the node:test + shared dev DB pattern documented in
// .agents/memory/api-server-tests.md.

const RUN = `_${process.pid}`;
const TEST_LANG = `__test_seedw${RUN}`;
const TEST_LANG_NAME = `SeedWordsLang${RUN}`;
const TEST_USER = `__test_user_seedw${RUN}`;
const CATEGORY_SLUG = `__cat_seedw${RUN}`;

// A second language with ZERO phrases, exercises the non-fatal fallback path.
const TEST_LANG_EMPTY = `__test_seedw_e${RUN}`;
const TEST_LANG_EMPTY_NAME = `SeedWordsEmptyLang${RUN}`;

// Third language for the language-switch test. Words are intentionally
// distinct from TEST_LANG's words so cross-contamination is detectable.
const TEST_LANG_2 = `__test_seedw2${RUN}`;
const TEST_LANG_NAME_2 = `SeedWordsLang2${RUN}`;
const CATEGORY_SLUG_2 = `__cat_seedw2${RUN}`;

// Romanized forms we will seed as phrases. The route fetches the 5 easiest
// phrases (ORDER BY difficulty ASC, sort_order ASC), so these must be the
// ones that land first.
const SEED_ROMANIZED = ["kyah chhu", "kus", "chu", "aasi", "baasith"] as const;
const SEED_NATIVE = ["كیا چھُ", "کُس", "چُھ", "آسِ", "باسِتھ"] as const;

// Phrases for the second (Santali-like) language, fully distinct tokens so
// the isolation assertion can detect cross-language leakage.
const SEED_ROMANIZED_2 = ["johar", "hende", "okoe", "alom", "bapla"] as const;
const SEED_NATIVE_2 = ["ᱡᱚᱦᱟᱨ", "ᱦᱮᱸᱫᱮ", "ᱚᱠᱚᱭ", "ᱟᱞᱚᱢ", "ᱵᱟᱯᱞᱟ"] as const;

// A minimal WAV buffer so the route doesn't fail parsing the audio before
// reaching the seed-word DB query.
function makeMinimalWav(): string {
  const sampleRate = 16000;
  const byteRate = sampleRate * 2;
  const dataSize = 2; // 1 sample
  const buf = Buffer.alloc(44 + dataSize, 0);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);  // PCM
  buf.writeUInt16LE(1, 22);  // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(2, 32);  // blockAlign
  buf.writeUInt16LE(16, 34); // bitsPerSample
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf.toString("base64");
}

// Stash originals so we can restore after all tests run.
const origTranscribe = defaultParrotChatDeps.transcribe;
const origReply = defaultParrotChatDeps.reply;
const origSynthesize = defaultParrotChatDeps.synthesize;
const origSynthesizeStream = defaultParrotChatDeps.synthesizeStream;

// Per-test capture: replaced in the transcribe stub for each test call.
let capturedTranscribeOptions: Record<string, unknown> = {};

let app: Express;
let server: Server;
let baseUrl: string;

before(async () => {
  // ── Ensure schema ────────────────────────────────────────────────────────
  await ensureUsersColumns();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS languages (
      code text PRIMARY KEY,
      name text NOT NULL,
      native_name text NOT NULL,
      script text NOT NULL,
      font_family text NOT NULL,
      rtl boolean NOT NULL DEFAULT false,
      sort_order integer NOT NULL DEFAULT 0
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id serial PRIMARY KEY,
      slug text UNIQUE NOT NULL,
      title text NOT NULL,
      description text NOT NULL,
      icon_name text NOT NULL,
      accent text NOT NULL,
      sort_order integer NOT NULL DEFAULT 0
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lessons (
      id serial PRIMARY KEY,
      language_code text NOT NULL REFERENCES languages(code),
      category_id integer NOT NULL REFERENCES categories(id),
      title_native text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT lessons_language_category_unique
        UNIQUE (language_code, category_id)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS phrases (
      id serial PRIMARY KEY,
      lesson_id integer NOT NULL REFERENCES lessons(id),
      language_code text NOT NULL REFERENCES languages(code),
      category_id integer NOT NULL REFERENCES categories(id),
      native_script text NOT NULL,
      romanized text NOT NULL,
      english text NOT NULL,
      hint text,
      difficulty integer NOT NULL DEFAULT 1,
      sort_order integer NOT NULL DEFAULT 0,
      premium boolean NOT NULL DEFAULT false,
      stage text NOT NULL DEFAULT 'phrase'
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_turns (
      id serial PRIMARY KEY,
      user_id text NOT NULL REFERENCES users(id),
      language_code text NOT NULL REFERENCES languages(code),
      duration_seconds integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  // ── Seed test language ────────────────────────────────────────────────────
  await db.insert(usersTable)
    .values({ id: TEST_USER, displayName: "Seed Words Test" })
    .onConflictDoNothing();
  // Plus plan so the language gate never fires for our private test language.
  await db.update(usersTable)
    .set({ tier: "plus", subscriptionStatus: "active" })
    .where(eq(usersTable.id, TEST_USER));

  await db.insert(languagesTable)
    .values({
      code: TEST_LANG,
      name: TEST_LANG_NAME,
      nativeName: "کشمیری",
      script: "Perso-Arabic",
      fontFamily: "sans-serif",
    })
    .onConflictDoNothing();

  // Zero-phrases language, never gets any phrase rows, exercises fallback.
  await db.insert(languagesTable)
    .values({
      code: TEST_LANG_EMPTY,
      name: TEST_LANG_EMPTY_NAME,
      nativeName: "EmptyLang",
      script: "Latin",
      fontFamily: "sans-serif",
    })
    .onConflictDoNothing();

  // Second language (Santali-like) for the language-switch test.
  await db.insert(languagesTable)
    .values({
      code: TEST_LANG_2,
      name: TEST_LANG_NAME_2,
      nativeName: "ᱥᱟᱱᱛᱟᱲᱤ",
      script: "Ol Chiki",
      fontFamily: "sans-serif",
    })
    .onConflictDoNothing();

  // ── Seed category → lesson → phrases (lang 1) ────────────────────────────
  const [category] = await db.insert(categoriesTable)
    .values({
      slug: CATEGORY_SLUG,
      title: "Test Topic",
      description: "Integration test topic",
      iconName: "BookOpen",
      accent: "#000000",
    })
    .returning();

  const [lesson] = await db.insert(lessonsTable)
    .values({
      languageCode: TEST_LANG,
      categoryId: category.id,
      titleNative: "T",
    })
    .returning();

  // Seed exactly the romanized + native-script forms we will assert on.
  // Difficulty=1, sortOrder matches position → these are the 5 cheapest rows
  // the route's query returns.
  for (let i = 0; i < SEED_ROMANIZED.length; i++) {
    await db.insert(phrasesTable)
      .values({
        lessonId: lesson.id,
        languageCode: TEST_LANG,
        categoryId: category.id,
        nativeScript: SEED_NATIVE[i],
        romanized: SEED_ROMANIZED[i],
        english: `word${i}`,
        difficulty: 1,
        sortOrder: i,
      })
      .onConflictDoNothing();
  }

  // ── Seed category → lesson → phrases (lang 2) ────────────────────────────
  const [category2] = await db.insert(categoriesTable)
    .values({
      slug: CATEGORY_SLUG_2,
      title: "Test Topic 2",
      description: "Integration test topic 2",
      iconName: "BookOpen",
      accent: "#111111",
    })
    .returning();

  const [lesson2] = await db.insert(lessonsTable)
    .values({
      languageCode: TEST_LANG_2,
      categoryId: category2.id,
      titleNative: "T2",
    })
    .returning();

  for (let i = 0; i < SEED_ROMANIZED_2.length; i++) {
    await db.insert(phrasesTable)
      .values({
        lessonId: lesson2.id,
        languageCode: TEST_LANG_2,
        categoryId: category2.id,
        nativeScript: SEED_NATIVE_2[i],
        romanized: SEED_ROMANIZED_2[i],
        english: `word2_${i}`,
        difficulty: 1,
        sortOrder: i,
      })
      .onConflictDoNothing();
  }

  // ── Monkey-patch defaultParrotChatDeps ───────────────────────────────────
  // Replace ALL AI functions so the test never makes network calls.
  // The spy is defined on the mutable object that the route closes over.
  (defaultParrotChatDeps as { transcribe: typeof defaultParrotChatDeps.transcribe }).transcribe =
    async (_buf, _fmt, options) => {
      capturedTranscribeOptions = options as Record<string, unknown>;
      return "test transcript";
    };

  (defaultParrotChatDeps as { reply: typeof defaultParrotChatDeps.reply }).reply =
    async () => ({
      text: "Squawk! Hello!",
      english: "Squawk! Hello!",
      transcriptEnglish: "",
    });

  (defaultParrotChatDeps as { synthesize: typeof defaultParrotChatDeps.synthesize }).synthesize =
    async () => Buffer.from("fake-audio");

  // Disable streaming so there's no race between stream chunks and the reply.
  (defaultParrotChatDeps as { synthesizeStream?: unknown }).synthesizeStream = undefined;

  // ── Mount app ────────────────────────────────────────────────────────────
  app = express();
  app.use(express.json({ limit: "10mb" }));
  // Stub req.log so route handlers don't throw on req.log.warn/error/info.
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    (_req as unknown as { log: Record<string, () => void> }).log = {
      warn: () => {},
      error: () => {},
      info: () => {},
    };
    next();
  });
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { userId: string }).userId = TEST_USER;
    next();
  });
  app.use(loadEntitlements);
  app.use(openaiRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  // Restore original deps so other suites running in the same process
  // (node:test runs all files in-process) are not affected.
  (defaultParrotChatDeps as { transcribe: typeof defaultParrotChatDeps.transcribe }).transcribe =
    origTranscribe;
  (defaultParrotChatDeps as { reply: typeof defaultParrotChatDeps.reply }).reply = origReply;
  (defaultParrotChatDeps as { synthesize: typeof defaultParrotChatDeps.synthesize }).synthesize =
    origSynthesize;
  (defaultParrotChatDeps as { synthesizeStream?: unknown }).synthesizeStream =
    origSynthesizeStream;

  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );

  // FK order: chat_turns + phrases → lessons → categories, then language, then user.
  await db.delete(chatTurnsTable).where(eq(chatTurnsTable.languageCode, TEST_LANG));
  await db.delete(chatTurnsTable).where(eq(chatTurnsTable.languageCode, TEST_LANG_2));
  await db.delete(phrasesTable).where(eq(phrasesTable.languageCode, TEST_LANG));
  await db.delete(phrasesTable).where(eq(phrasesTable.languageCode, TEST_LANG_2));
  await db.delete(lessonsTable).where(eq(lessonsTable.languageCode, TEST_LANG));
  await db.delete(lessonsTable).where(eq(lessonsTable.languageCode, TEST_LANG_2));
  await db.delete(categoriesTable).where(eq(categoriesTable.slug, CATEGORY_SLUG));
  await db.delete(categoriesTable).where(eq(categoriesTable.slug, CATEGORY_SLUG_2));
  await db.delete(languagesTable).where(eq(languagesTable.code, TEST_LANG));
  await db.delete(languagesTable).where(eq(languagesTable.code, TEST_LANG_2));
  // Zero-phrases language has no phrases/lessons/categories rows, but the route
  // records chat turns for it, delete those before the FK-constrained language row.
  await db.delete(chatTurnsTable).where(eq(chatTurnsTable.languageCode, TEST_LANG_EMPTY));
  await db.delete(languagesTable).where(eq(languagesTable.code, TEST_LANG_EMPTY));
  await db.delete(usersTable).where(eq(usersTable.id, TEST_USER));
  await pool.end();
});

async function postChat(body: unknown): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${baseUrl}/openai/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

// ─── Core seed-word integration tests ────────────────────────────────────────

test("POST /openai/chat, transcription prompt includes romanized seed words fetched from DB", async () => {
  capturedTranscribeOptions = {};

  const { status } = await postChat({
    languageCode: TEST_LANG,
    audioBase64: makeMinimalWav(),
    history: [],
  });

  // The request must reach the AI pipeline (not fail at a gate).
  // 200 is expected with stubbed deps; 502 would mean a dep stub threw.
  assert.equal(status, 200, `Expected 200 from stubbed pipeline, got ${status}`);

  const prompt = capturedTranscribeOptions["prompt"];
  assert.ok(
    typeof prompt === "string" && prompt.length > 0,
    "transcribe options must include a non-empty prompt",
  );

  // Every seeded romanized word must appear in the prompt.
  for (const word of SEED_ROMANIZED) {
    assert.ok(
      (prompt as string).includes(word),
      `prompt should include seeded romanized word "${word}", got: ${prompt}`,
    );
  }
});

test("POST /openai/chat, transcription prompt includes language name alongside seed words", async () => {
  capturedTranscribeOptions = {};

  await postChat({
    languageCode: TEST_LANG,
    audioBase64: makeMinimalWav(),
    history: [],
  });

  const prompt = capturedTranscribeOptions["prompt"] as string;
  assert.ok(
    prompt.includes(TEST_LANG_NAME),
    `prompt must include the language name "${TEST_LANG_NAME}", got: ${prompt}`,
  );
  // The bilingual hint must still be present so Whisper allows English too.
  assert.ok(
    prompt.toLowerCase().includes("english"),
    `prompt must mention 'English', got: ${prompt}`,
  );
});

test("POST /openai/chat, romanized seed words appear before native-script words in the prompt", async () => {
  capturedTranscribeOptions = {};

  await postChat({
    languageCode: TEST_LANG,
    audioBase64: makeMinimalWav(),
    history: [],
  });

  const prompt = capturedTranscribeOptions["prompt"] as string;
  const firstRomanizedIdx = prompt.indexOf(SEED_ROMANIZED[0]);
  const firstNativeIdx = prompt.indexOf(SEED_NATIVE[0]);

  assert.ok(firstRomanizedIdx !== -1, "prompt should contain the first romanized seed word");
  assert.ok(firstNativeIdx !== -1, "prompt should contain the first native-script seed word");
  assert.ok(
    firstRomanizedIdx < firstNativeIdx,
    `romanized words (idx ${firstRomanizedIdx}) should precede native-script words (idx ${firstNativeIdx})`,
  );
});

test("POST /openai/chat, transcription prompt has the expected seed-word comma-separated format", async () => {
  capturedTranscribeOptions = {};

  await postChat({
    languageCode: TEST_LANG,
    audioBase64: makeMinimalWav(),
    history: [],
  });

  const prompt = capturedTranscribeOptions["prompt"] as string;

  // Expected format: "<LangName> or English. <word1>, <word2>, ..., <native1>, <native2>, ..."
  assert.ok(
    prompt.startsWith(`${TEST_LANG_NAME} or English.`),
    `prompt should start with the bilingual hint, got: ${prompt}`,
  );

  // The romanized words should appear as a comma-separated list after the base hint.
  const commaJoined = SEED_ROMANIZED.join(", ");
  assert.ok(
    prompt.includes(commaJoined),
    `prompt should contain the romanized words comma-separated ("${commaJoined}"), got: ${prompt}`,
  );
});

test("POST /openai/chat, transcription stub does not receive a hard language lock", async () => {
  capturedTranscribeOptions = {};

  await postChat({
    languageCode: TEST_LANG,
    audioBase64: makeMinimalWav(),
    history: [],
  });

  // A hard language lock would block learners from switching to English
  // mid-sentence. The route must NOT pass a `language` field to transcribe.
  assert.ok(
    !("language" in capturedTranscribeOptions),
    "transcribe options must NOT include a hard 'language' lock",
  );
});

// ─── Zero-phrases fallback tests ──────────────────────────────────────────────
// The seed-word fetch is non-fatal. When a language has no phrases yet
// (e.g. brand-new language before lesson generation), the route must still
// return 200 and pass a valid bilingual hint prompt to the transcriber.

test("POST /openai/chat, returns 200 when language has zero phrases (no crash on empty seed fetch)", async () => {
  capturedTranscribeOptions = {};

  const { status } = await postChat({
    languageCode: TEST_LANG_EMPTY,
    audioBase64: makeMinimalWav(),
    history: [],
  });

  assert.equal(
    status,
    200,
    `Expected 200 even with zero phrases seeded, got ${status}`,
  );
});

test("POST /openai/chat, transcription prompt is non-empty for a language with zero phrases", async () => {
  capturedTranscribeOptions = {};

  await postChat({
    languageCode: TEST_LANG_EMPTY,
    audioBase64: makeMinimalWav(),
    history: [],
  });

  const prompt = capturedTranscribeOptions["prompt"];
  assert.ok(
    typeof prompt === "string" && prompt.length > 0,
    "transcribe options must include a non-empty prompt even when no phrases are seeded",
  );

  // The bare bilingual hint must be present so Whisper knows the language.
  assert.ok(
    (prompt as string).includes(TEST_LANG_EMPTY_NAME),
    `prompt must include the language name "${TEST_LANG_EMPTY_NAME}", got: ${prompt}`,
  );
  assert.ok(
    (prompt as string).toLowerCase().includes("english"),
    `prompt must mention 'English', got: ${prompt}`,
  );
});

test("POST /openai/chat, prompt contains no empty comma-separated fragment when phrases are absent", async () => {
  capturedTranscribeOptions = {};

  await postChat({
    languageCode: TEST_LANG_EMPTY,
    audioBase64: makeMinimalWav(),
    history: [],
  });

  const prompt = capturedTranscribeOptions["prompt"] as string;

  // An empty-fragment bug would produce patterns like ". ," or ",," or
  // trailing ", " after the base hint. None of these must appear.
  assert.ok(
    !prompt.includes(", ,"),
    `prompt must not contain empty comma fragments, got: ${prompt}`,
  );
  assert.ok(
    !prompt.match(/\.\s*,/),
    `prompt must not have a comma immediately after the period, got: ${prompt}`,
  );
  assert.ok(
    !prompt.match(/,\s*$/),
    `prompt must not end with a trailing comma, got: ${prompt}`,
  );

  // The zero-phrases prompt should be exactly the bare bilingual hint.
  assert.equal(
    prompt,
    `${TEST_LANG_EMPTY_NAME} or English.`,
    `zero-phrases prompt should be exactly the bare bilingual hint`,
  );
});

// ─── Language-switch mid-session test ────────────────────────────────────────

test("POST /openai/chat, language switch mid-session: each turn uses only that language's seed words", async () => {
  // Turn 1: first language (Kashmiri-like).
  capturedTranscribeOptions = {};
  const { status: status1 } = await postChat({
    languageCode: TEST_LANG,
    audioBase64: makeMinimalWav(),
    history: [],
  });
  // Snapshot the prompt before the second call overwrites the capture variable.
  const promptLang1 = capturedTranscribeOptions["prompt"] as string;

  // Turn 2: second language (Santali-like), simulates a learner switching
  // language mid-session without reloading the app.
  capturedTranscribeOptions = {};
  const { status: status2 } = await postChat({
    languageCode: TEST_LANG_2,
    audioBase64: makeMinimalWav(),
    history: [],
  });
  const promptLang2 = capturedTranscribeOptions["prompt"] as string;

  assert.equal(status1, 200, `lang1 turn should return 200, got ${status1}`);
  assert.equal(status2, 200, `lang2 turn should return 200, got ${status2}`);

  // Lang 1 prompt must contain every lang 1 word …
  for (const word of SEED_ROMANIZED) {
    assert.ok(
      promptLang1.includes(word),
      `lang1 prompt should contain "${word}", got: ${promptLang1}`,
    );
  }
  // … and must NOT contain any lang 2 word.
  for (const word of SEED_ROMANIZED_2) {
    assert.ok(
      !promptLang1.includes(word),
      `lang1 prompt must NOT contain lang2 word "${word}", got: ${promptLang1}`,
    );
  }

  // Lang 2 prompt must contain every lang 2 word …
  for (const word of SEED_ROMANIZED_2) {
    assert.ok(
      promptLang2.includes(word),
      `lang2 prompt should contain "${word}", got: ${promptLang2}`,
    );
  }
  // … and must NOT contain any lang 1 word.
  for (const word of SEED_ROMANIZED) {
    assert.ok(
      !promptLang2.includes(word),
      `lang2 prompt must NOT contain lang1 word "${word}", got: ${promptLang2}`,
    );
  }

  // Each prompt should include the correct language name.
  assert.ok(
    promptLang1.includes(TEST_LANG_NAME),
    `lang1 prompt should include language name "${TEST_LANG_NAME}", got: ${promptLang1}`,
  );
  assert.ok(
    promptLang2.includes(TEST_LANG_NAME_2),
    `lang2 prompt should include language name "${TEST_LANG_NAME_2}", got: ${promptLang2}`,
  );
});
