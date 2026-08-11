/**
 * Cached phrase-audio audit.
 *
 * Verification (phraseAudioVerify.ts) stops NEW bad takes reaching the cache.
 * This sweep deals with the ones already in it: every phrase whose clip is
 * cached under the current key scheme is transcribed, and any clip that
 * demonstrably does not speak its phrase is evicted and re-synthesized through
 * the verified path.
 *
 * BATCHED BY DESIGN
 * ─────────────────
 * The catalog runs to ~10k clips, far more than one request or one process
 * lifetime should own. The sweep therefore advances a phrase-id cursor a batch
 * at a time and reports where it stopped, so a driver (script locally, HTTP
 * against a deployment) can resume after an interruption without repeating
 * work — and so a deployment instance recycling mid-sweep costs one batch
 * rather than the whole run.
 *
 * SAFETY
 * ──────
 * A clip is only evicted after failing twice. Recognizers are noisy, and the
 * cost of a false positive (throwing away good audio, spending a
 * re-synthesis) is higher than the cost of leaving a questionable clip for the
 * next sweep. Nothing is deleted until its replacement has been synthesized,
 * so a phrase is never left with no audio at all.
 */
import { db, phrasesTable, languagesTable, ttsCacheTable } from "@workspace/db";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { phraseTtsCacheKey } from "./ttsCache";
import { phraseAudioIdentity } from "./ttsConfig";
import { getLanguageIdForCode } from "./languageVoice";
import {
  verifyPhraseAudio,
  type PhraseAudioVerdict,
  type SpeechCapability,
  type TranscribeFn,
} from "./phraseAudioVerify";
import { synthesizeVerifiedPhraseAudio, type SynthesizeFn } from "./phraseAudioSynthesis";
import { logger as defaultLogger } from "./logger";
import { pool } from "./ttsUtils";

/** Phrases inspected per batch. Sized so a batch finishes well inside an HTTP request. */
export const DEFAULT_BATCH_SIZE = 40;
/** Parallel recognizer calls. The proxy 429s under burst, so keep this low. */
export const DEFAULT_CONCURRENCY = 3;
/** Minimum gap between recognizer calls per worker slot, for the same reason. */
export const AUDIT_PACING_MS = 250;

export type AuditFinding = {
  phraseId: number;
  languageCode: string;
  nativeScript: string;
  romanized: string;
  status: PhraseAudioVerdict["status"];
  heard: string;
  coverage: number | null;
  /** Whether the bad clip was removed (false in a dry run). */
  evicted: boolean;
  /** Whether a verified replacement was cached in its place. */
  replaced: boolean;
  /** Set when the replacement itself could not be verified. */
  replacementNote?: string;
};

export type AuditBatchResult = {
  audited: number;
  /** Cached and heard to speak the phrase. */
  verified: number;
  /** Cached but not comparable — left untouched. */
  unverifiable: number;
  /** Why those clips could not be checked, so the blind spot stays visible. */
  unverifiableReasons: Record<string, number>;
  /** No cache row under the current key scheme; nothing to audit yet. */
  notCached: number;
  evicted: number;
  replaced: number;
  /** Bad clips left in place because the replacement could not be synthesized. */
  replacementFailures: number;
  /**
   * Coverage ratio of every clip that could be length-checked, passing ones
   * included. The distribution is what tells an operator whether the pass mark
   * sits in a quiet gap or in the middle of normal variation.
   */
  coverages: number[];
  findings: AuditFinding[];
  /** Pass as `afterPhraseId` to continue; null when the catalog is exhausted. */
  nextPhraseId: number | null;
};

export type AuditBatchOptions = {
  afterPhraseId?: number;
  limit?: number;
  languageCodes?: string[];
  /**
   * Audit exactly these phrases instead of walking the cursor. Used for spot
   * checks and for sampling the catalog when tuning; the cursor is meaningless
   * in this mode and comes back null.
   */
  phraseIds?: number[];
  /** Report what would be evicted without touching the cache. */
  dryRun?: boolean;
  concurrency?: number;
  log?: { info: (obj: object, msg: string) => void; warn: (obj: object, msg: string) => void };
  /** Injected for tests. */
  deps?: { transcribe?: TranscribeFn; synthesize?: SynthesizeFn };
};

/**
 * Per-language speech capability, cached for the process lifetime: it is a
 * seeded content property, and the playback path must not pay a query for it
 * on every synthesis.
 */
const capabilityCache = new Map<string, SpeechCapability | null>();

async function speechCapabilityFor(languageCode: string): Promise<SpeechCapability | null> {
  const cached = capabilityCache.get(languageCode);
  if (cached !== undefined) return cached;
  const row = await db.query.languagesTable.findFirst({
    where: eq(languagesTable.code, languageCode),
    columns: { speechCapability: true },
  });
  const capability = (row?.speechCapability as SpeechCapability | undefined) ?? null;
  capabilityCache.set(languageCode, capability);
  return capability;
}

/**
 * Listen to a take that has just been served and cached, and drop it if it
 * does not speak its phrase.
 *
 * The playback route cannot afford to verify before responding — a learner is
 * waiting on that audio — so it serves the take and calls this afterwards.
 * The learner who triggered the synthesis may hear one bad clip; nobody after
 * them does, because the row is gone before the next play and the next
 * synthesis goes through the verified path.
 *
 * Fire-and-forget: never awaited by a request, never throws.
 */
export function verifyServedTakeInBackground(args: {
  cacheKey: string;
  audio: Buffer;
  text: string;
  languageCode?: string;
  log?: { info: (obj: object, msg: string) => void; warn: (obj: object, msg: string) => void };
  deps?: { transcribe?: TranscribeFn };
}): void {
  const { cacheKey, audio, text, languageCode, log = defaultLogger, deps = {} } = args;
  if (!languageCode) return; // Nothing to transliterate against.

  void (async () => {
    const verifyArgs = {
      audio,
      nativeScript: text,
      languageCode,
      speechCapability: await speechCapabilityFor(languageCode),
      transcribe: deps.transcribe,
    };
    const first = await verifyPhraseAudio(verifyArgs);
    if (first.ok) return;
    const second = await verifyPhraseAudio(verifyArgs);
    if (second.ok) return;

    // Delete only if the cached row still holds the exact take that was
    // judged. Two concurrent misses race to insert, and only one wins
    // `onConflictDoNothing`; the loser must not delete the winner's row, and
    // neither may delete a replacement written after them.
    await db
      .delete(ttsCacheTable)
      .where(
        and(
          eq(ttsCacheTable.cacheKey, cacheKey),
          eq(ttsCacheTable.audioBase64, audio.toString("base64")),
        ),
      );
    log.warn(
      {
        cacheKey,
        language: languageCode,
        chars: text.length,
        status: second.status,
        coverage: second.coverage,
        heard: second.heard,
      },
      "[tts-verify] served take did not speak its phrase — cache row dropped",
    );
  })().catch((err) => {
    // Verification is a safety net, not a request path: its failure must never
    // surface anywhere.
    log.warn({ err, cacheKey }, "[tts-verify] background verification failed");
  });
}

/**
 * Audit one batch of phrases, starting after `afterPhraseId`.
 */
export async function auditPhraseAudioBatch(
  options: AuditBatchOptions = {},
): Promise<AuditBatchResult> {
  const {
    afterPhraseId = 0,
    limit = DEFAULT_BATCH_SIZE,
    languageCodes,
    dryRun = false,
    concurrency = DEFAULT_CONCURRENCY,
    log = defaultLogger,
    deps = {},
  } = options;

  const explicitIds = options.phraseIds?.length ? options.phraseIds : null;
  const where = explicitIds
    ? inArray(phrasesTable.id, explicitIds)
    : languageCodes?.length
      ? and(gt(phrasesTable.id, afterPhraseId), inArray(phrasesTable.languageCode, languageCodes))
      : gt(phrasesTable.id, afterPhraseId);

  const phrases = await db.query.phrasesTable.findMany({
    where,
    columns: { id: true, nativeScript: true, romanized: true, languageCode: true },
    orderBy: [asc(phrasesTable.id)],
    ...(explicitIds ? {} : { limit }),
  });

  const result: AuditBatchResult = {
    audited: 0,
    verified: 0,
    unverifiable: 0,
    unverifiableReasons: {},
    notCached: 0,
    evicted: 0,
    replaced: 0,
    replacementFailures: 0,
    coverages: [],
    findings: [],
    nextPhraseId:
      !explicitIds && phrases.length === limit ? (phrases[phrases.length - 1]?.id ?? null) : null,
  };
  if (phrases.length === 0) return result;

  // Language display names are part of the cache key the clients produce; the
  // speech capability decides whether the recognizer can be trusted at all.
  const languages = await db.query.languagesTable.findMany({
    columns: { code: true, name: true, speechCapability: true },
  });
  const nameByCode = new Map(languages.map((l) => [l.code, l.name]));
  const capabilityByCode = new Map(
    languages.map((l) => [l.code, l.speechCapability as SpeechCapability | null]),
  );

  await pool(
    phrases,
    concurrency,
    async (phrase) => {
      const languageName = nameByCode.get(phrase.languageCode) ?? "";
      const identity = phraseAudioIdentity(phrase.languageCode);
      const cacheKey = phraseTtsCacheKey(
        phrase.nativeScript,
        identity.provider,
        identity.model,
        identity.voice,
        languageName,
      );

      const cached = await db.query.ttsCacheTable.findFirst({
        where: eq(ttsCacheTable.cacheKey, cacheKey),
        columns: { audioBase64: true, format: true },
      });
      if (!cached) {
        result.notCached++;
        return;
      }

      const audio = Buffer.from(cached.audioBase64, "base64");
      const verifyArgs = {
        audio,
        format: (cached.format === "wav" ? "wav" : "mp3") as "mp3" | "wav",
        nativeScript: phrase.nativeScript,
        romanized: phrase.romanized,
        languageCode: phrase.languageCode,
        speechCapability: capabilityByCode.get(phrase.languageCode),
        transcribe: deps.transcribe,
      };

      result.audited++;
      const first = await verifyPhraseAudio(verifyArgs);
      if (first.coverage !== null) result.coverages.push(Number(first.coverage.toFixed(3)));
      if (first.ok) {
        if (first.status === "unverifiable") {
          result.unverifiable++;
          // Collapse the varying numbers out of the note so reasons group.
          const reason = (first.note ?? "unknown").replace(/\d+/g, "N");
          result.unverifiableReasons[reason] = (result.unverifiableReasons[reason] ?? 0) + 1;
        } else result.verified++;
        return;
      }

      // Second opinion before anything is deleted: recognizers are noisy and a
      // single bad read is not evidence enough to discard a learner's audio.
      const second = await verifyPhraseAudio(verifyArgs);
      if (second.ok) {
        result.verified++;
        log.info(
          { phraseId: phrase.id, first: first.status, heard: first.heard },
          "[tts-audit] clip cleared on second listen",
        );
        return;
      }

      const finding: AuditFinding = {
        phraseId: phrase.id,
        languageCode: phrase.languageCode,
        nativeScript: phrase.nativeScript,
        romanized: phrase.romanized,
        status: second.status,
        heard: second.heard,
        coverage: second.coverage,
        evicted: false,
        replaced: false,
      };

      if (!dryRun) {
        // Synthesize the replacement BEFORE evicting, so a synthesis failure
        // leaves the learner with the old clip rather than with silence.
        try {
          const replacement = await synthesizeVerifiedPhraseAudio({
            nativeScript: phrase.nativeScript,
            romanized: phrase.romanized,
            languageCode: phrase.languageCode,
            languageName,
            speechCapability: capabilityByCode.get(phrase.languageCode),
            identity,
            elevenLabsLanguageId: getLanguageIdForCode(phrase.languageCode),
            synthesize: deps.synthesize,
            transcribe: deps.transcribe,
          });
          // Compare-and-swap on the exact take that was audited: a playback
          // request or a concurrent sweep may have replaced the row while the
          // recognizer and the synthesizer were working, and that newer take
          // has not been judged. Overwriting it blind would discard a good
          // clip on the strength of a verdict about a clip that is gone.
          await db
            .update(ttsCacheTable)
            .set({ audioBase64: replacement.audio.toString("base64"), format: "mp3" })
            .where(
              and(
                eq(ttsCacheTable.cacheKey, cacheKey),
                eq(ttsCacheTable.audioBase64, cached.audioBase64),
              ),
            );
          finding.evicted = true;
          finding.replaced = true;
          result.evicted++;
          result.replaced++;
          if (!replacement.verdict.ok) {
            finding.replacementNote = `replacement still ${replacement.verdict.status} after ${replacement.takes} takes`;
          }
        } catch (err) {
          // Could not re-synthesize (provider outage, quota, empty response).
          // The old row stays: a clip that speaks one of its two words is
          // still better than silence, and the next sweep will try again.
          finding.replacementNote = `replacement failed, old clip kept: ${(err as Error).message}`;
          result.replacementFailures++;
        }
      }

      result.findings.push(finding);
      log.warn(
        {
          phraseId: phrase.id,
          language: phrase.languageCode,
          phrase: phrase.nativeScript,
          status: finding.status,
          coverage: finding.coverage,
          heard: finding.heard,
          evicted: finding.evicted,
          replaced: finding.replaced,
        },
        "[tts-audit] cached clip does not speak its phrase",
      );
    },
    AUDIT_PACING_MS,
  );

  return result;
}
