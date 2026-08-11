/**
 * Sweep behaviour: what the audit does with a clip it cannot hear properly.
 *
 * The stakes are asymmetric — evicting a good clip strips a learner's audio
 * and burns a synthesis, while keeping a doubtful one merely preserves the
 * status quo — so these tests pin the caution: two failed listens before
 * anything is deleted, a replacement synthesized before the old row goes, and
 * nothing at all touched in a dry run.
 */
import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createDbMockExports } from "../test/dbMock";

// ─── Mutable stubs the mocks read ────────────────────────────────────────────

type StubPhrase = {
  id: number;
  nativeScript: string;
  romanized: string;
  languageCode: string;
};

const PHRASE: StubPhrase = {
  id: 1427,
  nativeScript: "સાચવીને જજો",
  romanized: "saachvine jajo",
  languageCode: "gu",
};

let stubPhrases: StubPhrase[] = [PHRASE];
let stubCacheRow: { audioBase64: string; format: string } | null = null;
/** Recognizer reads, consumed in order; the last entry repeats. */
let transcripts: string[] = [];
let synthesisCalls = 0;
let updatedKeys: string[] = [];
let updatedClauses: string[][] = [];
let deletedKeys: string[] = [];

/** Flattens the captured drizzle clause stubs into the values they matched on. */
function clauseValues(clause: unknown): string[] {
  const node = clause as { key?: unknown; and?: unknown[] } | null;
  if (!node) return ["row"];
  if (Array.isArray(node.and)) return node.and.flatMap(clauseValues);
  return [String(node.key ?? "row")];
}

const silentLog = { info: () => {}, warn: () => {}, error: () => {} };

mock.module("@workspace/integrations-openai-ai-server/audio", {
  namedExports: {
    UndecodableAudioError: class UndecodableAudioError extends Error {},
    speechToText: async () => "unused — tests inject transcribe",
    textToSpeech: async () => Buffer.from("synth"),
    textToSpeechElevenLabs: async () => Buffer.from("synth"),
    openai: { audio: { speech: { create: async () => ({ arrayBuffer: async () => new ArrayBuffer(4) }) } } },
  },
});

mock.module("@workspace/db", {
  namedExports: createDbMockExports({
    db: {
      query: {
        phrasesTable: { findMany: async () => stubPhrases },
        languagesTable: { findMany: async () => [{ code: "gu", name: "Gujarati" }] },
        ttsCacheTable: { findFirst: async () => stubCacheRow },
      },
      update: () => ({
        set: () => ({
          where: (clause: unknown) => {
            const values = clauseValues(clause);
            updatedClauses.push(values);
            updatedKeys.push(values[0] ?? "row");
            return Promise.resolve();
          },
        }),
      }),
      delete: () => ({
        where: (clause: unknown) => {
          deletedKeys.push(clauseValues(clause)[0] ?? "row");
          return Promise.resolve();
        },
      }),
    },
  }),
});

// drizzle's eq() is called with the inert table sentinel; capture the value so
// the update/delete stubs above can report which key was touched.
mock.module("drizzle-orm", {
  namedExports: {
    and: (...args: unknown[]) => ({ and: args }),
    asc: (col: unknown) => ({ asc: col }),
    eq: (_col: unknown, value: unknown) => ({ key: value }),
    gt: (_col: unknown, value: unknown) => ({ gt: value }),
    inArray: (_col: unknown, values: unknown) => ({ inArray: values }),
  },
});

const { auditPhraseAudioBatch } = await import("./ttsCacheAudit");

function nextTranscript(): string {
  return transcripts.length > 1 ? (transcripts.shift() as string) : (transcripts[0] ?? "");
}

const deps = {
  transcribe: async () => nextTranscript(),
  synthesize: async () => {
    synthesisCalls++;
    return Buffer.from("fresh-take");
  },
};

beforeEach(() => {
  stubPhrases = [PHRASE];
  stubCacheRow = { audioBase64: Buffer.from("cached-audio").toString("base64"), format: "mp3" };
  transcripts = [];
  synthesisCalls = 0;
  updatedKeys = [];
  updatedClauses = [];
  deletedKeys = [];
});

test("a clip that speaks the whole phrase is left alone", async () => {
  transcripts = ["saachvine jajo"];
  const result = await auditPhraseAudioBatch({ limit: 10, log: silentLog, deps });

  assert.equal(result.audited, 1);
  assert.equal(result.verified, 1);
  assert.equal(result.evicted, 0);
  assert.deepEqual(result.findings, []);
  assert.equal(synthesisCalls, 0, "no synthesis should be spent on a good clip");
});

test("a truncated clip is replaced only after failing a second listen", async () => {
  // Both listens hear one word; the replacement take says the whole phrase.
  transcripts = ["saachvine", "saachvine", "saachvine jajo"];
  const result = await auditPhraseAudioBatch({ limit: 10, log: silentLog, deps });

  assert.equal(result.evicted, 1);
  assert.equal(result.replaced, 1);
  assert.equal(deletedKeys.length, 0, "the row is overwritten in place, never left empty");
  assert.equal(updatedKeys.length, 1);
  assert.equal(result.findings[0]?.status, "short");
  assert.equal(result.findings[0]?.phraseId, PHRASE.id);
});

test("a clip that clears on the second listen is kept", async () => {
  // First read drops a word, second read hears it — recognizer noise, not a
  // bad clip. Nothing may be thrown away on that evidence.
  transcripts = ["saachvine", "saachvine jajo"];
  const result = await auditPhraseAudioBatch({ limit: 10, log: silentLog, deps });

  assert.equal(result.verified, 1);
  assert.equal(result.evicted, 0);
  assert.equal(synthesisCalls, 0);
  assert.deepEqual(result.findings, []);
});

test("a dry run reports the finding without touching the cache", async () => {
  transcripts = ["saachvine"];
  const result = await auditPhraseAudioBatch({ limit: 10, dryRun: true, log: silentLog, deps });

  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.evicted, false);
  assert.equal(result.evicted, 0);
  assert.equal(updatedKeys.length, 0);
  assert.equal(deletedKeys.length, 0);
  assert.equal(synthesisCalls, 0);
});

test("an untransliterable transcript counts as unverifiable, not as a failure", async () => {
  transcripts = ["вучит крашна"];
  const result = await auditPhraseAudioBatch({ limit: 10, log: silentLog, deps });

  assert.equal(result.unverifiable, 1);
  assert.equal(result.verified, 0);
  assert.equal(result.evicted, 0);
});

test("phrases with no cached clip are counted, not audited", async () => {
  stubCacheRow = null;
  const result = await auditPhraseAudioBatch({ limit: 10, log: silentLog, deps });

  assert.equal(result.notCached, 1);
  assert.equal(result.audited, 0);
});

test("the cursor advances only while batches come back full", async () => {
  transcripts = ["saachvine jajo"];

  // A full batch means there may be more behind it: report where to resume.
  stubPhrases = [PHRASE];
  const full = await auditPhraseAudioBatch({ limit: 1, log: silentLog, deps });
  assert.equal(full.nextPhraseId, PHRASE.id);

  // A short batch is the end of the catalog.
  const partial = await auditPhraseAudioBatch({ limit: 10, log: silentLog, deps });
  assert.equal(partial.nextPhraseId, null);
});

test("when every replacement take falls short the finding says so", async () => {
  // Cached clip fails twice, then all three replacement takes fail too.
  transcripts = ["saachvine"];
  const result = await auditPhraseAudioBatch({ limit: 10, log: silentLog, deps });

  assert.equal(result.replaced, 1, "the learner still gets the best take we could make");
  assert.match(result.findings[0]?.replacementNote ?? "", /still short after \d+ takes/);
});

test("a failed replacement leaves the old clip in place rather than silence", async () => {
  transcripts = ["saachvine"];
  const result = await auditPhraseAudioBatch({
    limit: 10,
    log: silentLog,
    deps: {
      transcribe: deps.transcribe,
      synthesize: async () => {
        throw new Error("provider outage");
      },
    },
  });

  assert.equal(result.replacementFailures, 1);
  assert.equal(result.evicted, 0, "a clip that says half the phrase still beats no audio");
  assert.equal(deletedKeys.length, 0);
  assert.equal(updatedKeys.length, 0);
  assert.match(result.findings[0]?.replacementNote ?? "", /old clip kept/);
});

test("the replacement only overwrites the exact take that was audited", async () => {
  // A playback request or a second sweep may swap the row while the recognizer
  // and synthesizer are working; that newer take has not been judged.
  transcripts = ["saachvine", "saachvine", "saachvine jajo"];
  await auditPhraseAudioBatch({ limit: 10, log: silentLog, deps });

  assert.equal(updatedClauses.length, 1);
  assert.deepEqual(
    updatedClauses[0]?.slice(1),
    [Buffer.from("cached-audio").toString("base64")],
    "the update must be conditional on the audited audio, not on the cache key alone",
  );
});
