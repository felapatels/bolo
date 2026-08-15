/**
 * One sentence per activity event, in one place.
 *
 * The board's Feed tab and the home card both render the same line, so the
 * wording lives here rather than being typed twice and drifting. A line is
 * always about somebody else (the server never puts the caller's own events in
 * their feed), so every string reads in the third person.
 *
 * An unknown type returns null and the caller renders NOTHING. The server
 * deliberately leaves the type open, so a client that predates a new event kind
 * must skip it silently rather than print a placeholder nobody can read.
 */
import type { FeedEntry } from "@workspace/api-client-react";

export function feedActorName(actor: { displayName: string | null }): string {
  return actor.displayName?.trim() || "Fellow learner";
}

/**
 * @param itemName resolves an outfit/accessory id to its catalog name. Returns
 *   null while the catalog is still loading or for an id it does not know, in
 *   which case the line falls back to "something new" rather than showing the
 *   learner a raw id like `station-cap`.
 */
export function feedLineFor(
  entry: FeedEntry,
  itemName: (id: string) => string | null,
): string | null {
  const name = feedActorName(entry.actor);
  switch (entry.type) {
    case "equip_outfit":
    case "equip_accessory":
      return `${name} put on ${itemName(entry.refId) ?? "something new"}`;
    case "badge_earned":
      return `${name} earned a badge`;
    case "zone_closeout":
      return `${name} finished a zone`;
    default:
      return null;
  }
}

/** Copy for a feed with nothing in it yet. */
export const FEED_EMPTY_BODY =
  "Nothing yet. When your friends earn a badge or put on something new, it shows up here.";
