import { db, lessonGroupsTable, languagesTable, categoriesTable, phrasesTable, tokenLedgerTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { storyBookFor } from "@workspace/story";
import { traceStopFor, letterStopFor } from "@workspace/script-trace";
import { checkStopUnlockEligibility, parseStopUnlockRefId, STOP_UNLOCK_REASON, stopUnlockRefId } from "./stopUnlock";

import { JOURNEY_CATEGORY_SLUGS, orderedZoneStops, nextUnownedStop, sameJourneyStop } from './journeyStopOrder';

export type JourneyStopTarget = {
  kind: "lesson" | "story" | "trace" | "letter";
  languageCode: string;
  journey: number;
  zone: number;
  lessonGroupId?: number;
};

export function journeyStopRefId(stop: JourneyStopTarget): string {
  return stop.kind === "lesson"
    ? stopUnlockRefId(stop.languageCode, stop.lessonGroupId!)
    : `journey-stop:${stop.kind}:${stop.languageCode}:${stop.journey}:${stop.zone}`;
}

export async function hasJourneyStopUnlock(userId: string, stop: JourneyStopTarget): Promise<boolean> {
  const [row] = await db.select({ id: tokenLedgerTable.id }).from(tokenLedgerTable)
    .where(and(eq(tokenLedgerTable.userId, userId), eq(tokenLedgerTable.reason, STOP_UNLOCK_REASON), eq(tokenLedgerTable.refId, journeyStopRefId(stop)))).limit(1);
  return !!row;
}

export async function validateJourneyStop(stop: JourneyStopTarget): Promise<boolean> {
  const language = await db.query.languagesTable.findFirst({ where: eq(languagesTable.code, stop.languageCode) });
  if (!language || ![1, 2].includes(stop.journey) || stop.zone < 1 || stop.zone > 6) return false;
  if (stop.kind === "lesson") {
    if (!stop.lessonGroupId) return false;
    const group = await db.query.lessonGroupsTable.findFirst({ where: eq(lessonGroupsTable.id, stop.lessonGroupId) });
    if (!group || group.languageCode !== stop.languageCode) return false;
    const category = await db.query.categoriesTable.findFirst({ where: eq(categoriesTable.id, group.categoryId) });
    if (category?.slug !== JOURNEY_CATEGORY_SLUGS[stop.journey - 1]?.[stop.zone - 1]) return false;
    return (await checkStopUnlockEligibility(group.id)).ok;
  }
  if (stop.lessonGroupId != null) return false;
  if (stop.kind === "letter") return !!letterStopFor(stop.languageCode, stop.journey, stop.zone);
  return stop.kind === "story"
    ? !!storyBookFor(stop.journey, stop.zone)
    : !!traceStopFor(stop.languageCode, stop.journey, stop.zone);
}

export async function listJourneyStopUnlocks(userId: string, languageCode: string): Promise<JourneyStopTarget[]> {
  const rows = await db.select({ refId: tokenLedgerTable.refId }).from(tokenLedgerTable)
    .where(and(eq(tokenLedgerTable.userId, userId), eq(tokenLedgerTable.reason, STOP_UNLOCK_REASON)));
  const stops: JourneyStopTarget[] = [];
  const lessonIds: number[] = [];
  for (const { refId } of rows) {
    const lesson = parseStopUnlockRefId(refId);
    if (lesson?.languageCode === languageCode) lessonIds.push(lesson.lessonGroupId);
    const match = /^journey-stop:(story|trace|letter):([^:]+):([12]):([1-6])$/.exec(refId);
    if (match && match[2] === languageCode) stops.push({ kind: match[1] as "story" | "trace" | "letter", languageCode, journey: Number(match[3]), zone: Number(match[4]) });
  }
  if (lessonIds.length) {
    const groups = await db.select().from(lessonGroupsTable).where(and(inArray(lessonGroupsTable.id, lessonIds), eq(lessonGroupsTable.languageCode, languageCode)));
    const categories = groups.length ? await db.select().from(categoriesTable).where(inArray(categoriesTable.id, groups.map(g => g.categoryId))) : [];
    for (const group of groups) {
      const slug = categories.find(c => c.id === group.categoryId)?.slug;
      const journeyIndex = JOURNEY_CATEGORY_SLUGS.findIndex(zones => zones.some(s => s === slug));
      if (journeyIndex < 0) continue;
      const zoneIndex = JOURNEY_CATEGORY_SLUGS[journeyIndex]!.findIndex(s => s === slug);
      stops.push({ kind: "lesson", languageCode, lessonGroupId: group.id, journey: journeyIndex + 1, zone: zoneIndex + 1 });
    }
  }
  return stops;
}

export async function canTraceOwnedCharacter(userId: string, languageCode: string, characterId: string, chapter: string): Promise<boolean> {
  // All of Zone 1 is free, including its tracing stop.
  if (traceStopFor(languageCode, 1, 1)?.characters.some(c => c.id === characterId && c.chapterId === chapter)) return true;
  const owned = await listJourneyStopUnlocks(userId, languageCode);
  return owned.some(s => s.kind === "trace" && traceStopFor(languageCode, s.journey, s.zone)?.characters.some(c => c.id === characterId && c.chapterId === chapter));
}

/** Canonical paid stop sequence, including synthetic stops in their visible positions. */
export async function purchasableJourneyStops(languageCode: string): Promise<JourneyStopTarget[]> {
  const [categories, groups, phrases] = await Promise.all([
    db.select().from(categoriesTable),
    db.select().from(lessonGroupsTable).where(eq(lessonGroupsTable.languageCode, languageCode)),
    db.select({ groupId: phrasesTable.lessonGroupId, stage: phrasesTable.stage }).from(phrasesTable).where(eq(phrasesTable.languageCode, languageCode)),
  ]);
  return JOURNEY_CATEGORY_SLUGS.flatMap((slugs, j) => slugs.flatMap((slug, z) => {
    if (j === 0 && z === 0) return [];
    const category = categories.find(c => c.slug === slug);
    if (!category) return [];
    const members = groups.filter(g => g.categoryId === category.id && phrases.some(p => p.groupId === g.id))
      .map(g => ({ ...g, stage: phrases.some(p => p.groupId === g.id && p.stage === 'sentence') ? 'sentence' : 'phrase' }));
    return orderedZoneStops(languageCode, j + 1, z + 1, members);
  }));
}

/** Ownership only grows, so an earlier purchase remains valid while a debit waits for the wallet lock. */
export async function canPurchaseInOrder(userId: string, stop: JourneyStopTarget): Promise<boolean> {
  const [stops, owned] = await Promise.all([purchasableJourneyStops(stop.languageCode), listJourneyStopUnlocks(userId, stop.languageCode)]);
  if (owned.some(o => sameJourneyStop(o, stop))) return true;
  const next = nextUnownedStop(stops, owned);
  return !!next && sameJourneyStop(next, stop);
}
