import {
  db,
  categoriesTable,
  languagesTable,
  lessonGroupsTable,
  phrasesTable,
  voiceContributionsTable,
  voiceContributionReviewsTable,
} from "@workspace/db";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  PHRASE_MODE_ZONE_SLUGS,
  clipState,
  phraseProgress,
  type ClipState,
  type ClipVerdict,
  type PhraseClipProgress,
} from "./referenceClips";

/**
 * THE DATABASE HALF OF THE CONTRIBUTION PAGE'S PHRASE MODES (2026-09-15).
 * Rules live in referenceClips.ts; this file only reads and writes rows.
 *
 * THE PHRASES ARE THE APP'S OWN ROWS, read at request time from whichever
 * database serves the page. Not baked into the page at build time like the
 * alphabets: phrase ids are serials, and dev and production number them
 * differently, so an id frozen into a committed file would point at the wrong
 * phrase in one of them. A clip recorded on production names production's id,
 * which is the id production's scorer will look up.
 *
 * THE SAME ORDER AND MEMBERSHIP THE LEARNER MEETS: the zone's lesson groups by
 * position, and inside each group lesson_group_position then id, which is how
 * GET /lesson-groups/:id/phrases orders a stop. Phrases no group claims yet
 * are left out, because no stop serves them. Premium rows are kept: the
 * reference has to exist for every learner, and the link that fetches them is
 * keyed (contributionLinks.ts).
 */

export interface ZonePhrase {
  id: number;
  nativeScript: string;
  romanized: string;
  english: string;
  stage: string;
  /** The stop's position in the zone, 1-based. */
  stop: number;
}

export interface ZoneLanguage {
  code: string;
  name: string;
  nativeName: string;
  script: string;
  rtl: boolean;
}

export interface ZonePhraseSet {
  language: ZoneLanguage;
  zone: number;
  phrases: ZonePhrase[];
}

export async function loadZonePhrases(
  languageCode: string,
  zone: number,
): Promise<ZonePhraseSet | null> {
  const slug = PHRASE_MODE_ZONE_SLUGS[zone];
  if (!slug) return null;

  const [language] = await db
    .select({
      code: languagesTable.code,
      name: languagesTable.name,
      nativeName: languagesTable.nativeName,
      script: languagesTable.script,
      rtl: languagesTable.rtl,
    })
    .from(languagesTable)
    .where(eq(languagesTable.code, languageCode))
    .limit(1);
  if (!language) return null;

  const rows = await db
    .select({
      id: phrasesTable.id,
      nativeScript: phrasesTable.nativeScript,
      romanized: phrasesTable.romanized,
      english: phrasesTable.english,
      stage: phrasesTable.stage,
      stop: lessonGroupsTable.position,
    })
    .from(phrasesTable)
    .innerJoin(lessonGroupsTable, eq(lessonGroupsTable.id, phrasesTable.lessonGroupId))
    .innerJoin(categoriesTable, eq(categoriesTable.id, lessonGroupsTable.categoryId))
    .where(
      and(
        eq(categoriesTable.slug, slug),
        eq(lessonGroupsTable.languageCode, languageCode),
        eq(phrasesTable.languageCode, languageCode),
      ),
    )
    .orderBy(
      asc(lessonGroupsTable.position),
      asc(phrasesTable.lessonGroupPosition),
      asc(phrasesTable.id),
    );
  if (rows.length === 0) return null;

  return { language, zone, phrases: rows };
}

/**
 * One phrase, only if it belongs to this language's zone. The write path's
 * gate: a clip is stored against a phrase id the page could actually have
 * shown, never against any id a caller cares to send.
 */
export async function findZonePhrase(
  languageCode: string,
  zone: number,
  phraseId: number,
): Promise<{ id: number; nativeScript: string; english: string; script: string } | null> {
  const slug = PHRASE_MODE_ZONE_SLUGS[zone];
  if (!slug) return null;
  const [row] = await db
    .select({
      id: phrasesTable.id,
      nativeScript: phrasesTable.nativeScript,
      english: phrasesTable.english,
      script: languagesTable.script,
    })
    .from(phrasesTable)
    .innerJoin(lessonGroupsTable, eq(lessonGroupsTable.id, phrasesTable.lessonGroupId))
    .innerJoin(categoriesTable, eq(categoriesTable.id, lessonGroupsTable.categoryId))
    .innerJoin(languagesTable, eq(languagesTable.code, phrasesTable.languageCode))
    .where(
      and(
        eq(phrasesTable.id, phraseId),
        eq(phrasesTable.languageCode, languageCode),
        eq(lessonGroupsTable.languageCode, languageCode),
        eq(categoriesTable.slug, slug),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** The prompt id a phrase clip is stored under, beside the passages' own ids. */
export function phrasePromptId(phraseId: number): string {
  return `phrase:${phraseId}`;
}

export interface PhraseClipInput {
  sessionId: string;
  contributor: string;
  isPractice: boolean;
  languageCode: string;
  phrase: { id: number; nativeScript: string; english: string; script: string };
  audioBase64: string;
  mimeType: string;
  durationMs: number | null;
}

/**
 * Store one take, replacing this sitting's earlier take of the same phrase.
 *
 * THE VERDICTS ON THE OLD TAKE GO IN THE SAME TRANSACTION. The row keeps its
 * id through the upsert, so without this an approval given to the first take
 * would silently transfer to a second take nobody has heard.
 */
export async function storePhraseClip(input: PhraseClipInput): Promise<{ id: number }> {
  return db.transaction(async (tx) => {
    const values = {
      sessionId: input.sessionId,
      script: input.phrase.script,
      contributor: input.contributor,
      promptId: phrasePromptId(input.phrase.id),
      // The words exactly as shown, and what they mean: the clip stays
      // interpretable if the phrase is edited or deleted later.
      promptText: input.phrase.nativeScript,
      promptLabel: input.phrase.english,
      audioBase64: input.audioBase64,
      mimeType: input.mimeType,
      durationMs: input.durationMs,
      isPractice: input.isPractice,
      languageCode: input.languageCode,
      phraseId: input.phrase.id,
    };
    const [row] = await tx
      .insert(voiceContributionsTable)
      .values(values)
      .onConflictDoUpdate({
        target: [voiceContributionsTable.sessionId, voiceContributionsTable.promptId],
        set: {
          audioBase64: values.audioBase64,
          mimeType: values.mimeType,
          durationMs: values.durationMs,
          contributor: values.contributor,
          isPractice: values.isPractice,
          // Re-read because the phrase may have been edited between takes, and
          // the row must describe the take it now holds.
          promptText: values.promptText,
          promptLabel: values.promptLabel,
          script: values.script,
          languageCode: values.languageCode,
          phraseId: values.phraseId,
        },
      })
      .returning({ id: voiceContributionsTable.id });
    await tx
      .delete(voiceContributionReviewsTable)
      .where(eq(voiceContributionReviewsTable.contributionId, row!.id));
    return { id: row!.id };
  });
}

export interface StoredClip {
  id: number;
  phraseId: number;
  sessionId: string;
  contributor: string;
  isPractice: boolean;
  promptText: string;
  durationMs: number | null;
}

export interface StoredVerdict {
  contributionId: number;
  sessionId: string;
  reviewer: string;
  verdict: string;
  note: string;
  isPractice: boolean;
}

/**
 * Every clip for these phrases and every verdict on them. NEVER THE AUDIO:
 * a zone's clips are megabytes of base64, and a list needs none of it.
 */
export async function loadClipsForPhrases(
  languageCode: string,
  phraseIds: readonly number[],
): Promise<{ clips: StoredClip[]; verdictsByClip: Map<number, StoredVerdict[]> }> {
  const verdictsByClip = new Map<number, StoredVerdict[]>();
  if (phraseIds.length === 0) return { clips: [], verdictsByClip };
  const rows = await db
    .select({
      id: voiceContributionsTable.id,
      phraseId: voiceContributionsTable.phraseId,
      sessionId: voiceContributionsTable.sessionId,
      contributor: voiceContributionsTable.contributor,
      isPractice: voiceContributionsTable.isPractice,
      promptText: voiceContributionsTable.promptText,
      durationMs: voiceContributionsTable.durationMs,
    })
    .from(voiceContributionsTable)
    .where(
      and(
        eq(voiceContributionsTable.languageCode, languageCode),
        inArray(voiceContributionsTable.phraseId, [...phraseIds]),
      ),
    )
    .orderBy(asc(voiceContributionsTable.id));
  const clips = rows.filter((r): r is StoredClip => r.phraseId !== null);
  if (clips.length === 0) return { clips, verdictsByClip };

  const verdicts = await db
    .select({
      contributionId: voiceContributionReviewsTable.contributionId,
      sessionId: voiceContributionReviewsTable.sessionId,
      reviewer: voiceContributionReviewsTable.reviewer,
      verdict: voiceContributionReviewsTable.verdict,
      note: voiceContributionReviewsTable.note,
      isPractice: voiceContributionReviewsTable.isPractice,
    })
    .from(voiceContributionReviewsTable)
    .where(
      inArray(
        voiceContributionReviewsTable.contributionId,
        clips.map((c) => c.id),
      ),
    );
  for (const v of verdicts) {
    const list = verdictsByClip.get(v.contributionId) ?? [];
    list.push(v);
    verdictsByClip.set(v.contributionId, list);
  }
  return { clips, verdictsByClip };
}

/** Who recorded a clip and what it belongs to, without its audio. */
export async function loadClipIdentity(clipId: number): Promise<{
  id: number;
  languageCode: string | null;
  phraseId: number | null;
  contributor: string;
} | null> {
  const [row] = await db
    .select({
      id: voiceContributionsTable.id,
      languageCode: voiceContributionsTable.languageCode,
      phraseId: voiceContributionsTable.phraseId,
      contributor: voiceContributionsTable.contributor,
    })
    .from(voiceContributionsTable)
    .where(eq(voiceContributionsTable.id, clipId))
    .limit(1);
  return row ?? null;
}

/** A clip's audio, for playback on the review page. */
export async function loadClipAudio(clipId: number): Promise<{
  id: number;
  languageCode: string | null;
  phraseId: number | null;
  mimeType: string;
  audioBase64: string;
} | null> {
  const [row] = await db
    .select({
      id: voiceContributionsTable.id,
      languageCode: voiceContributionsTable.languageCode,
      phraseId: voiceContributionsTable.phraseId,
      mimeType: voiceContributionsTable.mimeType,
      audioBase64: voiceContributionsTable.audioBase64,
    })
    .from(voiceContributionsTable)
    .where(eq(voiceContributionsTable.id, clipId))
    .limit(1);
  return row ?? null;
}

export interface VerdictInput {
  contributionId: number;
  sessionId: string;
  reviewer: string;
  verdict: ClipVerdict;
  note: string;
  isPractice: boolean;
}

/** A reviewer changing their mind replaces their own verdict, nobody else's. */
export async function storeVerdict(input: VerdictInput): Promise<void> {
  await db
    .insert(voiceContributionReviewsTable)
    .values(input)
    .onConflictDoUpdate({
      target: [
        voiceContributionReviewsTable.contributionId,
        voiceContributionReviewsTable.sessionId,
      ],
      set: {
        verdict: input.verdict,
        note: input.note,
        reviewer: input.reviewer,
        isPractice: input.isPractice,
        updatedAt: sql`now()`,
      },
    });
}

export interface ZonePhraseProgressRow {
  phraseId: number;
  stop: number;
  stage: string;
  nativeScript: string;
  romanized: string;
  english: string;
  progress: PhraseClipProgress;
  /** Clips that count (not practice, not a test name, not stale). */
  takes: number;
  approvedTakes: number;
  notRightTakes: number;
}

export interface ZoneClipSummary {
  language: ZoneLanguage;
  zone: number;
  phrases: number;
  /** Phrases with at least one clip that counts, whatever its verdict. */
  recorded: number;
  approved: number;
  needsCheck: number;
  /** Phrases whose only counting clips were all marked not right. */
  needsRetake: number;
  rows: ZonePhraseProgressRow[];
}

/**
 * Where a language's zone stands, for the Nest. Every count comes from
 * clipState and phraseProgress, the same two functions the review page and
 * the future scorer use, so the tile and the scorer cannot disagree about
 * what "approved" means.
 */
export async function summarizeZoneClips(
  languageCode: string,
  zone: number,
): Promise<ZoneClipSummary | null> {
  const set = await loadZonePhrases(languageCode, zone);
  if (!set) return null;
  const { clips, verdictsByClip } = await loadClipsForPhrases(
    languageCode,
    set.phrases.map((p) => p.id),
  );
  const rows: ZonePhraseProgressRow[] = set.phrases.map((p) => {
    const states: ClipState[] = clips
      .filter((c) => c.phraseId === p.id)
      .map((c) => clipState(c, verdictsByClip.get(c.id) ?? [], p.nativeScript));
    const counting = states.filter((s) => s !== "not_counted" && s !== "stale");
    return {
      phraseId: p.id,
      stop: p.stop,
      stage: p.stage,
      nativeScript: p.nativeScript,
      romanized: p.romanized,
      english: p.english,
      progress: phraseProgress(states),
      takes: counting.length,
      approvedTakes: counting.filter((s) => s === "approved").length,
      notRightTakes: counting.filter((s) => s === "not_right").length,
    };
  });
  return {
    language: set.language,
    zone,
    phrases: rows.length,
    recorded: rows.filter((r) => r.takes > 0).length,
    approved: rows.filter((r) => r.progress === "approved").length,
    needsCheck: rows.filter((r) => r.progress === "needs_check").length,
    needsRetake: rows.filter((r) => r.progress === "not_right").length,
    rows,
  };
}
