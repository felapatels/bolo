import { db, lessonGroupsTable, phrasesTable, tokenLedgerTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { getFirstStopGroup } from "./teaser";

// ---------------------------------------------------------------------------
// Chai buys an individual lesson stop from Zone 2 onward. Zone 1 is free.
// Ownership is the existing permanent ledger row, with an idempotent charge.

export const STOP_UNLOCK_REASON = "spend_stop_unlock" as const;

/** `stop:<languageCode>:<lessonGroupId>` — unique per learner, language and stop. */
export function stopUnlockRefId(languageCode: string, lessonGroupId: number): string {
  return `stop:${languageCode}:${lessonGroupId}`;
}

/** Parses a stop-unlock refId back to its language and stop, or null. */
export function parseStopUnlockRefId(
  refId: string,
): { languageCode: string; lessonGroupId: number } | null {
  const match = /^stop:([^:]+):(\d+)$/.exec(refId);
  if (!match) return null;
  return { languageCode: match[1]!, lessonGroupId: Number(match[2]) };
}

export type StopUnlockRefusal =
  | "not_found"
  // The whole first zone is already free.
  | "already_free"
  // Empty stops have no content to sell.
  | "nothing_to_serve";

export type StopUnlockEligibility =
  | { ok: true; lessonGroupId: number; languageCode: string }
  | { ok: false; refusal: StopUnlockRefusal };

/** Zone 1 is free; later nonempty lesson stops can be bought individually. */
export async function checkStopUnlockEligibility(
  lessonGroupId: number,
): Promise<StopUnlockEligibility> {
  const group = await db.query.lessonGroupsTable.findFirst({
    where: (t, { eq: eqFn }) => eqFn(t.id, lessonGroupId),
  });
  if (!group) return { ok: false, refusal: "not_found" };

  const firstZoneId = await getFirstZoneCategoryId(group.languageCode);
  if (firstZoneId == null) return { ok: false, refusal: "not_found" };
  if (group.categoryId === firstZoneId) return { ok: false, refusal: "already_free" };

  // A purchase includes the stop's premium phrases or sentences; otherwise
  // every paid-zone stop would sell an empty lesson.
  const [servable] = await db.select({ id: phrasesTable.id }).from(phrasesTable)
    .where(eq(phrasesTable.lessonGroupId, group.id)).limit(1);
  if (!servable) return { ok: false, refusal: "nothing_to_serve" };

  return { ok: true, lessonGroupId: group.id, languageCode: group.languageCode };
}

/** Has this learner bought this exact stop? Exact refId match, no scan. */
export async function hasStopUnlock(
  userId: string,
  languageCode: string,
  lessonGroupId: number,
): Promise<boolean> {
  const [row] = await db
    .select({ id: tokenLedgerTable.id })
    .from(tokenLedgerTable)
    .where(
      and(
        eq(tokenLedgerTable.userId, userId),
        eq(tokenLedgerTable.reason, STOP_UNLOCK_REASON),
        eq(tokenLedgerTable.refId, stopUnlockRefId(languageCode, lessonGroupId)),
      ),
    )
    .limit(1);
  return row != null;
}

/**
 * Every stop this learner has bought in `lang`. The language is matched in JS
 * against a parsed refId rather than through a LIKE pattern, so no caller-
 * supplied string ever reaches the scan.
 */
export async function listUnlockedStopIds(
  userId: string,
  languageCode: string,
): Promise<Set<number>> {
  const rows = await db
    .select({ refId: tokenLedgerTable.refId })
    .from(tokenLedgerTable)
    .where(
      and(
        eq(tokenLedgerTable.userId, userId),
        eq(tokenLedgerTable.reason, STOP_UNLOCK_REASON),
      ),
    );
  const ids = new Set<number>();
  for (const r of rows) {
    const parsed = parseStopUnlockRefId(r.refId);
    if (parsed && parsed.languageCode === languageCode) ids.add(parsed.lessonGroupId);
  }
  return ids;
}

/**
 * Does this learner own the stop that hosts `phraseId`? Used by the shared
 * language gate so a bought stop plays through every phrase-scoped route
 * (phrase fetch, TTS, pronunciation, attempt writes) with no route-by-route
 * exception list.
 */
export async function hasStopUnlockForPhrase(
  userId: string,
  languageCode: string,
  phraseId: number,
): Promise<boolean> {
  const [row] = await db
    .select({ lessonGroupId: phrasesTable.lessonGroupId })
    .from(phrasesTable)
    .where(eq(phrasesTable.id, phraseId))
    .limit(1);
  if (!row?.lessonGroupId) return false;
  return hasStopUnlock(userId, languageCode, row.lessonGroupId);
}

/** The free first zone, which must never be sold for Chai. */
export async function getFirstZoneCategoryId(
  languageCode: string,
): Promise<number | null> {
  const firstStop = await getFirstStopGroup(languageCode);
  if (firstStop == null) return null;
  const [row] = await db
    .select({ categoryId: lessonGroupsTable.categoryId })
    .from(lessonGroupsTable)
    .where(eq(lessonGroupsTable.id, firstStop.groupId))
    .limit(1);
  return row?.categoryId ?? null;
}
