import { useEffect, useState } from "react";

/**
 * RANK MOVEMENT, SINCE THIS BROWSER LAST LOOKED (build 23 on web; mobile
 * build 22, the mockup's green and red arrows). The server keeps no rank
 * history, so the arrows cannot mean "since yesterday" for everybody; they
 * mean "since you last opened this board", which is the question a learner
 * coming back actually has.
 *
 * One snapshot per board (scope, metric and week are in the key, so a new
 * week starts clean), written after every read. Nothing is shown until a
 * previous snapshot exists, so a first visit has no arrows rather than a
 * board full of "new". Storage failures are swallowed: an arrow is not worth
 * an error, and localStorage can be absent or throw (private windows, jsdom).
 *
 * Mobile twin: bolo-mobile/lib/useRankDeltas.ts, on AsyncStorage.
 */
const PREFIX = "board-ranks:";

function readSnapshot(key: string): Record<string, number> | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as Record<string, number>) : null;
  } catch {
    return null;
  }
}

function writeSnapshot(key: string, ranks: Record<string, number>): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(ranks));
  } catch {
    // An arrow is not worth an error.
  }
}

export function useRankDeltas(
  key: string | null,
  ranked: readonly { userId: string }[],
): Record<string, number> {
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  // The order is the signal, not the array identity: a refetch that returns
  // the same standings must not rewrite the snapshot and erase the arrows.
  const signature = ranked.map((r) => r.userId).join("|");

  useEffect(() => {
    if (!key || ranked.length === 0) return;
    const current: Record<string, number> = {};
    ranked.forEach((r, i) => {
      current[r.userId] = i + 1;
    });
    const previous = readSnapshot(key);
    const next: Record<string, number> = {};
    if (previous) {
      for (const [userId, rank] of Object.entries(current)) {
        const before = previous[userId];
        if (typeof before === "number" && before !== rank) next[userId] = before - rank;
      }
    }
    // Only touch state when there is something to show or clear, so a first
    // visit renders once and never re-renders for nothing.
    setDeltas((old) => (Object.keys(old).length === 0 && Object.keys(next).length === 0 ? old : next));
    writeSnapshot(key, current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, signature]);

  return deltas;
}
