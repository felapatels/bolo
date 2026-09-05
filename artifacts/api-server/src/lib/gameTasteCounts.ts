/**
 * THE ONE DATABASE READ BEHIND THE FREE TASTE: how many hub plays of each
 * tasted game this learner has recorded.
 *
 * Kept out of `@workspace/game-taste` on purpose. That package is pure and
 * data-free so web, mobile and this server can all hold the same rules; this
 * file is the half that needs a pool, and it is the only half. Three callers
 * share it, which is why it is a module rather than a query inlined at each:
 * the record (POST /game-sessions), the call's start (the one tasted game the
 * server sees BEGIN), and the hub's read (GET /games/plays). Three copies of
 * one count is three chances for the badge to disagree with the wall.
 *
 * HUB PLAYS ONLY, and `isHubPlay` in the pure package carries the reasoning.
 * A trackside signal and a zone closeout are exempt from both the count and
 * the refusal.
 *
 * THE COUNT STARTS AT ZERO FOR EVERYBODY, and that is not an accident of this
 * query. No row written before 2026-09-04 can match it: every quick game used
 * to record under "listen-and-pick" or "word-match", so no historical row
 * carries a tasted game's id at all. Nobody is retroactively locked out of a
 * game they were playing yesterday, which is the trade the owner accepted when
 * the recorded name was widened.
 */
import { and, count, eq, inArray, isNull, or } from "drizzle-orm";
import { db, gameSessionsTable } from "@workspace/db";
import { TASTE_GAME_IDS } from "@workspace/game-taste";

/** Plays spent per tasted game, zero-filled: every tasted id is always present. */
export type TastePlayCounts = Record<string, number>;

export async function countTastePlays(userId: string): Promise<TastePlayCounts> {
  const rows = await db
    .select({ game: gameSessionsTable.game, plays: count() })
    .from(gameSessionsTable)
    .where(
      and(
        eq(gameSessionsTable.userId, userId),
        inArray(gameSessionsTable.game, [...TASTE_GAME_IDS]),
        // A row written before the context column was populated is a hub play:
        // nothing but the hub could have written a tasted game's id.
        or(isNull(gameSessionsTable.context), eq(gameSessionsTable.context, "hub")),
      ),
    )
    .groupBy(gameSessionsTable.game);

  // ZERO-FILLED, so no caller ever has to tell "not played" from "not in the
  // payload". The absent key is the bug this shape exists to prevent: it reads
  // as undefined, undefined reads as falsy, and falsy reads as locked.
  const counts: TastePlayCounts = {};
  for (const id of TASTE_GAME_IDS) counts[id] = 0;
  for (const row of rows) counts[row.game] = Number(row.plays);
  return counts;
}
