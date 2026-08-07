import { db, lessonGroupsTable, phrasesTable, tokenLedgerTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { getFirstStopGroup } from "./teaser";

// ---------------------------------------------------------------------------
// Chai stop unlocks (owner ruling, Aug 6 2026)
//
// A learner may spend Chai to open ONE stop at a time in a language their plan
// does not include. Three rules make this safe to sell:
//
//   1. CAP — only stops inside the language's FIRST ZONE are purchasable. The
//      boundary is not invented here: it is the zone that already hosts the
//      free-taste carve-out (lib/teaser.ts getFirstStopGroup, the position-1
//      Greetings group). Everything past that zone needs All-Access and no
//      amount of Chai opens it.
//   2. ONCE-EVER — the purchase IS the ledger row. refId encodes language and
//      stop, so the ledger's unique (user, reason, ref) index makes a replay a
//      no-op that charges nothing and grants nothing.
//   3. SERVER-AUTHORITATIVE — the refId is composed here from the group row's
//      own languageCode, never from anything the client sends, and never from
//      the Date.now() fallback POST /tokens/spend uses for its optional
//      client-supplied key (that fallback is a fresh key every call, i.e. not
//      an idempotency key at all).
//
// Ownership is DERIVED from the ledger, so an unlock outlives a reinstall, a
// new device, and a cleared cache — there is no device-side unlock state.
// ---------------------------------------------------------------------------

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
  // The learner already gets this stop for nothing (the free-taste stop).
  | "already_free"
  // Outside the first zone: the All-Access boundary, unreachable by Chai.
  | "beyond_first_zone"
  // Nothing this learner's plan could actually practise here (an all-premium
  // stop), so there is nothing to sell.
  | "nothing_to_serve";

export type StopUnlockEligibility =
  | { ok: true; lessonGroupId: number; languageCode: string }
  | { ok: false; refusal: StopUnlockRefusal };

/**
 * THE CAP, server-side. A stop is purchasable only when it sits in the same
 * zone as the language's free first stop, is not that free stop itself, and
 * has at least one non-premium phrase to serve.
 */
export async function checkStopUnlockEligibility(
  lessonGroupId: number,
): Promise<StopUnlockEligibility> {
  const group = await db.query.lessonGroupsTable.findFirst({
    where: (t, { eq: eqFn }) => eqFn(t.id, lessonGroupId),
  });
  if (!group) return { ok: false, refusal: "not_found" };

  const firstStop = await getFirstStopGroup(group.languageCode);
  if (firstStop == null) return { ok: false, refusal: "beyond_first_zone" };
  if (firstStop.groupId === group.id) return { ok: false, refusal: "already_free" };

  const firstStopGroup = await db.query.lessonGroupsTable.findFirst({
    where: (t, { eq: eqFn }) => eqFn(t.id, firstStop.groupId),
  });
  if (!firstStopGroup || firstStopGroup.categoryId !== group.categoryId) {
    return { ok: false, refusal: "beyond_first_zone" };
  }

  // Same premium filter the serving routes apply, so an unlock can never buy
  // an empty station (position-2+ stops can be entirely Plus-library rows).
  const [servable] = await db
    .select({ id: phrasesTable.id })
    .from(phrasesTable)
    .where(
      and(
        eq(phrasesTable.lessonGroupId, group.id),
        eq(phrasesTable.stage, "phrase"),
        eq(phrasesTable.premium, false),
      ),
    )
    .limit(1);
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

/** The zone (category) whose stops Chai can open in `lang`, or null. */
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
