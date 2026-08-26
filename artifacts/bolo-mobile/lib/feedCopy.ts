/**
 * One sentence per activity event, in one place.
 *
 * The board's Feed tab and the home card both render the same line, so the
 * wording lives here rather than being typed twice and drifting. Twin of
 * gujarati-coach/src/lib/feed-copy.ts, word for word: the same event must not
 * read differently on the two platforms.
 *
 * An unknown type returns null and the caller renders NOTHING. The server
 * deliberately leaves the type open, so a build that predates a new event kind
 * skips it silently rather than printing a placeholder nobody can read.
 */
import type { FeedEntry } from '@workspace/api-client-react';

export function feedActorName(actor: { displayName: string | null }): string {
  return actor.displayName?.trim() || 'Fellow learner';
}

/** Resolvers a feed line needs to name the things it mentions. */
export interface FeedResolvers {
  /**
   * Resolves an outfit/accessory id to its catalog name. Returns null
   * while the catalog is loading or for an id it does not know, in
   * which case the line says "something new" rather than showing a raw
   * id like `station-cap`.
   */
  itemName: (id: string) => string | null;
  /**
   * Resolves a badge key to its title. Optional: a surface showing ONE
   * event has nothing to disambiguate, so the home strips omit it and
   * the line falls back to 'a badge'.
   */
  badgeName?: (key: string) => string | null;
}

export function feedLineFor(
  entry: FeedEntry,
  resolvers: FeedResolvers,
): string | null {
  const name = feedActorName(entry.actor);
  switch (entry.type) {
    case 'equip_outfit':
    case 'equip_accessory':
      return `${name} put on ${resolvers.itemName(entry.refId) ?? 'something new'}`;
    case 'badge_earned':
      // refId IS the badge key, typed and documented as such on FeedEntry.
      return `${name} earned ${resolvers.badgeName?.(entry.refId) ?? 'a badge'}`;
    case 'zone_closeout':
      return `${name} finished a zone`;
    // ── PROJECTED MOMENTS, added 2026-08-25 ──
    //
    // The feed read one table, activity_events, which is written only on
    // milestones: 29 rows across the app's whole history against 490 attempts.
    // A feed with 29 lifetime entries cannot look alive, so the server now
    // projects the things that happen OFTEN as well.
    case 'practice_day': {
      const n = Number((entry.payload as { count?: number } | null)?.count ?? 0);
      // Aggregated per learner per day rather than per attempt: 490 separate
      // "practised a phrase" lines is a log, not a feed.
      return n > 0
        ? `${name} practised ${n} ${n === 1 ? 'phrase' : 'phrases'}`
        : `${name} practised`;
    }
    case 'stop_completed':
      return `${name} finished a stop`;
    case 'game_played': {
      const p = entry.payload as { correct?: number; total?: number } | null;
      const c = Number(p?.correct ?? 0);
      const t = Number(p?.total ?? 0);
      return t > 0 ? `${name} played a game, ${c} of ${t}` : `${name} played a game`;
    }
    default:
      return null;
  }
}

/** Copy for a feed with nothing in it yet. */
export const FEED_EMPTY_BODY =
  'Nothing yet. When your friends earn a badge or put on something new, it shows up here.';
