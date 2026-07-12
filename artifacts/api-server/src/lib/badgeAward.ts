// The badge award path. Extracted from the POST /attempts handler so the
// double-award and per-language invariants can be exercised by automated tests
// without duplicating the logic they protect.
//
// Two invariants live here:
//  1. A badge is awarded at most once per (user, language) — enforced by the
//     unique (user_id, language_code, badge_key) constraint combined with
//     `onConflictDoNothing().returning()`, so only rows actually inserted come
//     back. Re-meeting a criterion therefore never re-awards or re-celebrates.
//  2. Badges are strictly per-language: awarding is scoped by `languageCode`, so
//     earning a badge for Hindi never unlocks it for Tamil.
import { db, badgesTable } from "@workspace/db";
import {
  BADGE_CATALOG,
  earnedBadgeKeys,
  type ProgressMetrics,
} from "./badges";

export interface NewlyEarnedBadge {
  key: string;
  title: string;
  description: string;
  iconName: string;
  earnedAt: string;
}

// Evaluates the badge catalog against a learner's current per-language metrics
// and awards any newly-satisfied badges, returning only the ones actually
// awarded on this call (in catalog order for a stable celebration sequence).
export async function awardNewlyEarnedBadges(
  userId: string,
  languageCode: string,
  metrics: ProgressMetrics,
): Promise<NewlyEarnedBadge[]> {
  const satisfiedKeys = earnedBadgeKeys(metrics);
  if (satisfiedKeys.length === 0) return [];

  const inserted = await db
    .insert(badgesTable)
    .values(
      satisfiedKeys.map((badgeKey) => ({
        userId,
        languageCode,
        badgeKey,
      })),
    )
    .onConflictDoNothing()
    .returning();

  const earnedAtByKey = new Map(inserted.map((r) => [r.badgeKey, r.earnedAt]));

  return BADGE_CATALOG.filter((def) => earnedAtByKey.has(def.key)).map(
    (def) => ({
      key: def.key,
      title: def.title,
      description: def.description,
      iconName: def.iconName,
      earnedAt: earnedAtByKey.get(def.key)!.toISOString(),
    }),
  );
}
