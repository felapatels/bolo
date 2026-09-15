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
  sameSpeaker,
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

/**
 * The prompt ids phrase clips are stored under, beside the passages' own ids.
 * RESERVED: the unkeyed passage route refuses any prompt id with this prefix
 * (routes/scriptTrace.ts), so the only door that can change a phrase take is
 * the one that clears its verdicts.
 */
export const PHRASE_PROMPT_PREFIX = "phrase:";

export function phrasePromptId(phraseId: number): string {
  return `${PHRASE_PROMPT_PREFIX}${phraseId}`;
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
 *
 * That covers verdicts already stored. A verdict still on its way when this
 * runs is storeVerdict's to refuse: it names the take it was given on, and
 * checks it under a lock this upsert's row lock conflicts with.
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

/**
 * WHICH TAKE A CLIP HOLDS: sha256 of its stored base64, as lowercase hex.
 *
 * Added after the 2026-09-15 review of phrase mode (finding 1). A re-record
 * keeps the row id (storePhraseClip upserts in place) and the review page
 * keeps each clip's audio for the whole visit, so a clip id cannot say which
 * recording a reviewer heard. This can: the audio route hands it out with the
 * bytes and the verdict route will only store a verdict that names it.
 *
 * COMPUTED IN SQL, in the same row read as whatever it is checked against, so
 * no second copy of up to a megabyte of audio is pulled to hash it. sha256
 * rather than the md5 the review suggested: it costs the same here, and the
 * bytes being identified are chosen by whoever holds a record key, so the
 * check should not rest on a hash with practical collisions. The base64 is
 * ASCII, so convert_to only turns text into the bytes sha256 takes.
 *
 * ONE DEFINITION, used by both reads below, so the hash served and the hash
 * checked cannot drift apart.
 */
function takeHashSql() {
  return sql<string>`encode(sha256(convert_to(${voiceContributionsTable.audioBase64}, 'UTF8')), 'hex')`;
}

/** A clip's audio, for playback on the review page, and the take it is. */
export async function loadClipAudio(clipId: number): Promise<{
  id: number;
  languageCode: string | null;
  phraseId: number | null;
  mimeType: string;
  audioBase64: string;
  take: string;
} | null> {
  const [row] = await db
    .select({
      id: voiceContributionsTable.id,
      languageCode: voiceContributionsTable.languageCode,
      phraseId: voiceContributionsTable.phraseId,
      mimeType: voiceContributionsTable.mimeType,
      audioBase64: voiceContributionsTable.audioBase64,
      // One statement, one row version: the take always names these bytes.
      take: takeHashSql(),
    })
    .from(voiceContributionsTable)
    .where(eq(voiceContributionsTable.id, clipId))
    .limit(1);
  return row ?? null;
}

export interface VerdictInput {
  contributionId: number;
  /** The language the review key opens; a clip of any other answers unknown_clip. */
  languageCode: string;
  /** The take the reviewer heard, as the audio route handed it out. */
  take: string;
  sessionId: string;
  reviewer: string;
  verdict: ClipVerdict;
  note: string;
  isPractice: boolean;
}

export type VerdictOutcome = "stored" | "unknown_clip" | "own_recording" | "take_changed";

/**
 * A reviewer changing their mind replaces their own verdict, nobody else's.
 * Stored only if the clip still holds the take the reviewer heard.
 *
 * THE CHECK AND THE WRITE ARE ONE TRANSACTION THAT LOCKS THE CLIP ROW FOR
 * SHARE. The review (finding 1) reasoned a race the take alone would not
 * close: storePhraseClip's upsert changes no key column, so it takes FOR NO
 * KEY UPDATE, and the verdict insert's foreign key check takes FOR KEY SHARE,
 * which does not conflict with it. Under READ COMMITTED a verdict inserted
 * after the re-record's DELETE had read the table, but before it committed,
 * survived that delete and sat on the new take. FOR SHARE is the weakest lock
 * that conflicts with FOR NO KEY UPDATE, so:
 *
 *   - a re-record already underway makes this read wait, and the read then
 *     returns the NEW row version, whose take no longer matches: refused;
 *   - a verdict holding the lock first makes the re-record's upsert wait until
 *     it commits, so the re-record's DELETE reads afterwards and removes it.
 *
 * Two reviewers' verdicts on one clip still do not block each other.
 */
export async function storeVerdict(input: VerdictInput): Promise<VerdictOutcome> {
  return db.transaction(async (tx) => {
    const [clip] = await tx
      .select({
        languageCode: voiceContributionsTable.languageCode,
        phraseId: voiceContributionsTable.phraseId,
        contributor: voiceContributionsTable.contributor,
        take: takeHashSql(),
      })
      .from(voiceContributionsTable)
      .where(eq(voiceContributionsTable.id, input.contributionId))
      .for("share");
    // A clip of another language answers exactly like a missing one: a key
    // opens one language and nothing else.
    if (!clip || clip.phraseId === null || clip.languageCode !== input.languageCode) {
      return "unknown_clip";
    }
    // Before the take: a speaker judging their own recording is refused
    // whichever take they heard.
    if (sameSpeaker(input.reviewer, clip.contributor)) return "own_recording";
    if (clip.take !== input.take) return "take_changed";

    await tx
      .insert(voiceContributionReviewsTable)
      .values({
        contributionId: input.contributionId,
        sessionId: input.sessionId,
        reviewer: input.reviewer,
        verdict: input.verdict,
        note: input.note,
        isPractice: input.isPractice,
      })
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
    return "stored";
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
