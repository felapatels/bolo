import {
  db,
  categoriesTable,
  lessonGroupsTable,
  phrasesTable,
  attemptsTable,
} from "@workspace/db";
import { and, asc, eq, inArray } from "drizzle-orm";

// ---------------------------------------------------------------------------
// M1 Language Teaser: a locked language is not a hard wall. Every Free /
// One Language user may try the first TEASER_LIMIT phrases of the first
// Greetings lesson group of any locked language, with the full pipeline
// (TTS, speaking, scoring, XP, attempts). Consumption is DERIVED from the
// append-only attempts table (distinct teaser phrase ids attempted), never
// stored, per the "derive, do not store" convention. Lifetime per
// (user, language).
// ---------------------------------------------------------------------------

export const TEASER_LIMIT = 3;

export interface TeaserProgress {
  consumed: number;
  limit: number;
}

// The teaser set is frozen content (seeded group 1 of Greetings; the
// replenisher only ever appends to the LAST group), so a per-process cache
// never goes stale in practice. Keyed by language code.
const teaserIdsCache = new Map<string, number[]>();
let greetingsCategoryIdPromise: Promise<number | null> | null = null;

async function getGreetingsCategoryId(): Promise<number | null> {
  greetingsCategoryIdPromise ??= db.query.categoriesTable
    .findFirst({ where: eq(categoriesTable.slug, "greetings") })
    .then((row) => row?.id ?? null)
    .catch((err) => {
      // Do not cache a failed lookup.
      greetingsCategoryIdPromise = null;
      throw err;
    });
  return greetingsCategoryIdPromise;
}

// The canonical teaser set for a language: the first TEASER_LIMIT phrase-stage
// phrases, by position, of the first (lowest-position) Greetings lesson group.
// Returns [] when the language has no Greetings group (should not happen for
// seeded languages), [] means "no teaser", i.e. plain locked behavior.
export async function getTeaserPhraseIds(lang: string): Promise<number[]> {
  const cached = teaserIdsCache.get(lang);
  if (cached) return cached;

  const greetingsId = await getGreetingsCategoryId();
  if (greetingsId == null) return [];

  const [firstGroup] = await db
    .select({ id: lessonGroupsTable.id })
    .from(lessonGroupsTable)
    .where(
      and(
        eq(lessonGroupsTable.languageCode, lang),
        eq(lessonGroupsTable.categoryId, greetingsId),
      ),
    )
    .orderBy(asc(lessonGroupsTable.position))
    .limit(1);
  if (!firstGroup) return [];

  const rows = await db
    .select({ id: phrasesTable.id })
    .from(phrasesTable)
    .where(
      and(
        eq(phrasesTable.lessonGroupId, firstGroup.id),
        // Sentences are Plus-only stage rows in the same table; the teaser is
        // phrase-stage only (confirmed in the M1 Step 0 review).
        eq(phrasesTable.stage, "phrase"),
      ),
    )
    .orderBy(asc(phrasesTable.lessonGroupPosition), asc(phrasesTable.id))
    .limit(TEASER_LIMIT);

  const ids = rows.map((r) => r.id);
  // Only cache a complete, non-empty set so a mid-seed read can't freeze a
  // partial teaser for the process lifetime.
  if (ids.length === TEASER_LIMIT) teaserIdsCache.set(lang, ids);
  return ids;
}

// ---------------------------------------------------------------------------
// Free-tier content policy (owner ruling, Aug 2026): every language's FIRST
// stop, the position-1 Greetings lesson group, is fully playable free, even
// while the language itself is plan-locked. The teaser above remains the
// accounting model for the 402 payloads (consumed/limit meters); this is the
// serving carve-out's membership source. Same frozen-content reasoning as the
// teaser cache: the replenisher only ever appends to the LAST group, so
// group 1's membership never changes within a process lifetime.
// ---------------------------------------------------------------------------

export interface FirstStopGroup {
  groupId: number;
  phraseIds: number[];
}

const firstStopCache = new Map<string, FirstStopGroup>();

export async function getFirstStopGroup(
  lang: string,
): Promise<FirstStopGroup | null> {
  const cached = firstStopCache.get(lang);
  if (cached) return cached;

  const greetingsId = await getGreetingsCategoryId();
  if (greetingsId == null) return null;

  const [firstGroup] = await db
    .select({ id: lessonGroupsTable.id })
    .from(lessonGroupsTable)
    .where(
      and(
        eq(lessonGroupsTable.languageCode, lang),
        eq(lessonGroupsTable.categoryId, greetingsId),
      ),
    )
    .orderBy(asc(lessonGroupsTable.position))
    .limit(1);
  if (!firstGroup) return null;

  const rows = await db
    .select({ id: phrasesTable.id })
    .from(phrasesTable)
    .where(
      and(
        eq(phrasesTable.lessonGroupId, firstGroup.id),
        // First-stop groups are phrase-stage; the filter also guards against
        // any future mixed-stage rows widening the carve-out.
        eq(phrasesTable.stage, "phrase"),
      ),
    )
    .orderBy(asc(phrasesTable.lessonGroupPosition), asc(phrasesTable.id));

  const info: FirstStopGroup = {
    groupId: firstGroup.id,
    phraseIds: rows.map((r) => r.id),
  };
  // Only cache a plausibly complete set (same mid-seed guard as the teaser).
  if (info.phraseIds.length >= TEASER_LIMIT) firstStopCache.set(lang, info);
  return info;
}

// How many distinct teaser phrases this user has ever attempted in `lang`.
// Attempts are append-only and only ever written through the server-signed
// evaluation token path, so this derivation is durable and tamper-proof.
export async function countTeaserConsumed(
  userId: string,
  lang: string,
  teaserPhraseIds: number[],
): Promise<number> {
  return (await listTeaserConsumedIds(db, userId, lang, teaserPhraseIds)).length;
}

// The distinct teaser phrase ids this user has attempted, via any executor, pass a transaction so the read participates in the caller's serialization
// (POST /attempts holds an advisory lock across recount + insert so concurrent
// submissions can't overshoot the limit).
export async function listTeaserConsumedIds(
  executor: Pick<typeof db, "selectDistinct">,
  userId: string,
  lang: string,
  teaserPhraseIds: number[],
): Promise<number[]> {
  if (teaserPhraseIds.length === 0) return [];
  const rows = await executor
    .selectDistinct({ phraseId: attemptsTable.phraseId })
    .from(attemptsTable)
    .where(
      and(
        eq(attemptsTable.userId, userId),
        eq(attemptsTable.languageCode, lang),
        inArray(attemptsTable.phraseId, teaserPhraseIds),
      ),
    );
  return rows.map((r) => r.phraseId).filter((id): id is number => id != null);
}

// Test-only: reset process caches so suites that create throwaway languages
// and categories never see another test's frozen teaser set.
export function __resetTeaserCacheForTests(): void {
  teaserIdsCache.clear();
  firstStopCache.clear();
  greetingsCategoryIdPromise = null;
}
