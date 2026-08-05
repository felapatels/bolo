// Build 35 mobile parity: trackside signal memory.
//
// Web reads sessionStorage/localStorage SYNCHRONOUSLY during render. That
// does not port: AsyncStorage is a promise API, and reading it at render
// time would either suspend the map or flash every signal through a wrong
// state on the way to the right one. So the split here is:
//
//   waves      SESSION scoped  — in-memory only, per language
//   stop-seen  SESSION scoped  — in-memory only, per language
//   cleared    DEVICE  scoped  — AsyncStorage, HYDRATED once into an
//                                in-memory cache that render reads
//
// "Session" on mobile is the app process: an in-memory Set dies with the
// app exactly as sessionStorage dies with the tab, so the semantics match
// web without touching disk. Waving is never shamed and never permanent —
// an unclaimed first-clear Chai grant must stay claimable on a later run.
//
// Every read below is synchronous and cheap, so the map can call them
// during render; the only async work is hydration and the cleared write.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

/** Device-scoped clears. Per-language so two languages never share marks. */
export const clearedStorageKey = (lang: string) => `bolo.signalCleared:${lang}`;

const sessionWaves = new Map<string, Set<number>>();
const sessionStopSeen = new Map<string, Set<number>>();
/** Hydrated mirror of AsyncStorage. Absent language = not hydrated yet. */
const clearedCache = new Map<string, Set<number>>();

function bucket(m: Map<string, Set<number>>, lang: string): Set<number> {
  let s = m.get(lang);
  if (!s) {
    s = new Set();
    m.set(lang, s);
  }
  return s;
}

function parseGaps(raw: string | null): Set<number> {
  if (!raw) return new Set();
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((n): n is number => typeof n === 'number'));
  } catch {
    // Corrupt value: treat as empty rather than throwing inside the map.
    return new Set();
  }
}

/** Load this language's device-scoped clears into the render-readable cache.
 *  Idempotent and safe to call on every mount. */
export async function hydrateClearedSignals(lang: string): Promise<void> {
  try {
    const stored = parseGaps(await AsyncStorage.getItem(clearedStorageKey(lang)));
    // Merge rather than replace: a clear marked while hydration was in
    // flight must not be thrown away by the slower disk read.
    const live = clearedCache.get(lang);
    if (live) for (const gap of live) stored.add(gap);
    clearedCache.set(lang, stored);
  } catch {
    // Unreadable storage still counts as hydrated — an empty set only
    // re-offers an encounter the server will decline to pay twice.
    if (!clearedCache.has(lang)) clearedCache.set(lang, new Set());
  }
}

export function isClearedHydrated(lang: string): boolean {
  return clearedCache.has(lang);
}

export function isSignalWaved(lang: string, gap: number): boolean {
  return sessionWaves.get(lang)?.has(gap) ?? false;
}

export function markSignalWaved(lang: string, gap: number): void {
  bucket(sessionWaves, lang).add(gap);
}

export function isSignalStopSeen(lang: string, gap: number): boolean {
  return sessionStopSeen.get(lang)?.has(gap) ?? false;
}

export function markSignalStopSeen(lang: string, gap: number): void {
  bucket(sessionStopSeen, lang).add(gap);
}

export function isSignalCleared(lang: string, gap: number): boolean {
  return clearedCache.get(lang)?.has(gap) ?? false;
}

/**
 * Mark a signal cleared on this device.
 *
 * ONLY call this when the server actually granted the first-clear Chai. The
 * ledger is the real idempotency boundary; this mark is display state that
 * must never run ahead of it, or the map would show a paid crossing the
 * server has no record of and quietly retire a claimable reward.
 */
export async function markSignalCleared(lang: string, gap: number): Promise<void> {
  bucket(clearedCache, lang).add(gap);
  try {
    await AsyncStorage.setItem(
      clearedStorageKey(lang),
      JSON.stringify([...clearedCache.get(lang)!]),
    );
  } catch {
    // Best-effort: the in-memory mark still holds for this session.
  }
}

/** Test seam. Never called by app code. */
export function resetSignalMemory(): void {
  sessionWaves.clear();
  sessionStopSeen.clear();
  clearedCache.clear();
}

export type SignalMemory = {
  /** False until this language's clears have been read off disk. Signals
   *  render as un-cleared while false, so gate anything that would BURN a
   *  reward (auto-open, grant writes) on it, not the glyph itself. */
  hydrated: boolean;
  /** Bumped on every mark so the map re-derives signal state. */
  version: number;
  isWaved: (gap: number) => boolean;
  isCleared: (gap: number) => boolean;
  isStopSeen: (gap: number) => boolean;
  markWaved: (gap: number) => void;
  markStopSeen: (gap: number) => void;
  markCleared: (gap: number) => void;
};

/**
 * Hydrating hook. Render reads the synchronous accessors; the promise work
 * happens in an effect, and `version` is what tells the map to look again.
 */
export function useSignalMemory(lang: string): SignalMemory {
  const [hydrated, setHydrated] = useState(() => isClearedHydrated(lang));
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    setHydrated(isClearedHydrated(lang));
    void hydrateClearedSignals(lang).then(() => {
      if (!alive) return;
      setHydrated(true);
      setVersion((v) => v + 1);
    });
    return () => {
      alive = false;
    };
  }, [lang]);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  return {
    hydrated,
    version,
    isWaved: useCallback((gap: number) => isSignalWaved(lang, gap), [lang]),
    isCleared: useCallback((gap: number) => isSignalCleared(lang, gap), [lang]),
    isStopSeen: useCallback((gap: number) => isSignalStopSeen(lang, gap), [lang]),
    markWaved: useCallback(
      (gap: number) => {
        markSignalWaved(lang, gap);
        bump();
      },
      [lang, bump],
    ),
    markStopSeen: useCallback(
      (gap: number) => {
        // Deliberately no bump: "seen" only suppresses a future auto-open,
        // and re-rendering the whole map for it would be waste.
        markSignalStopSeen(lang, gap);
      },
      [lang],
    ),
    markCleared: useCallback(
      (gap: number) => {
        void markSignalCleared(lang, gap).then(bump);
      },
      [lang, bump],
    ),
  };
}
