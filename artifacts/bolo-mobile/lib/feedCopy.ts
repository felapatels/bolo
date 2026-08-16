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
    default:
      return null;
  }
}

/** Copy for a feed with nothing in it yet. */
export const FEED_EMPTY_BODY =
  'Nothing yet. When your friends earn a badge or put on something new, it shows up here.';
