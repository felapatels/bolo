import { db, languagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

import type { SpeechCapability } from "./phraseAudioVerify";

export type { SpeechCapability };

/**
 * PER-LANGUAGE SPEECH CAPABILITY, one cached lookup for the whole server.
 *
 * Extracted 2026-08-28 from ttsCacheAudit.ts, which had the only copy. It is
 * needed on a second, colder path now (lesson-group unlock, see
 * lessonGroupUnlock.ts speechScored), and a second definition of the same
 * lookup is the defect rather than the fix.
 *
 * Cached for the process lifetime because it is a SEEDED CONTENT PROPERTY: it
 * changes when somebody edits lib/db/src/seedData.ts and redeploys, never
 * inside a request. That matters more here than it did for synthesis, because
 * unlock derivation sits on the journey and lesson read paths and must not grow
 * a query per call.
 *
 * A language the table does not know returns null, and every caller must read
 * that as "assume it is scored". Failing open is deliberate: a missing row must
 * never silently drop a real language out of scored practice.
 */
const capabilityCache = new Map<string, SpeechCapability | null>();

export async function speechCapabilityFor(
  languageCode: string,
): Promise<SpeechCapability | null> {
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
 * Is this language's speech actually scored? Only 'unsupported' is not: a
 * 'degraded' language IS scored, and merely shows the learner a one-time notice
 * that feedback is approximate. Conflating the two would take Kashmiri and
 * Santali out of scored practice, which is not what either the seed or the
 * clients mean by it.
 */
export async function isSpeechScored(languageCode: string): Promise<boolean> {
  return (await speechCapabilityFor(languageCode)) !== "unsupported";
}

/** Test seam only: drops the process-lifetime cache. */
export function _resetSpeechCapabilityCache(): void {
  capabilityCache.clear();
}
