import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

export const chachaSeenStorageKey = (lang: string) => `bolo.chachaSeen:${lang}`;

const chachaSeenCache = new Map<string, Set<number>>();

function bucket(m: Map<string, Set<number>>, lang: string): Set<number> {
  let s = m.get(lang);
  if (!s) {
    s = new Set();
    m.set(lang, s);
  }
  return s;
}

function parseStations(raw: string | null): Set<number> {
  if (!raw) return new Set();
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((n): n is number => typeof n === 'number'));
  } catch {
    return new Set();
  }
}

export async function hydrateChachaSeen(lang: string): Promise<void> {
  try {
    const stored = parseStations(await AsyncStorage.getItem(chachaSeenStorageKey(lang)));
    const live = chachaSeenCache.get(lang);
    if (live) for (const station of live) stored.add(station);
    chachaSeenCache.set(lang, stored);
  } catch {
    if (!chachaSeenCache.has(lang)) chachaSeenCache.set(lang, new Set());
  }
}

/**
 * Chacha-ji turns up trackside at every fourth station from the third, counted
 * on the flattened global station list (3, 7, 11, ...). The server owns the
 * same rule (api-server lib/chachaEncounters.ts); this copy only decides when
 * the client bothers to ask, so a drift can never mint or skip a gift.
 */
export function isChachaEncounterStation(station: number): boolean {
  return station >= 3 && (station - 3) % 4 === 0;
}

export function isChachaSeenHydrated(lang: string): boolean {
  return chachaSeenCache.has(lang);
}

export function isChachaSeen(lang: string, station: number): boolean {
  return chachaSeenCache.get(lang)?.has(station) ?? false;
}

export function markChachaSeen(lang: string, station: number): void {
  bucket(chachaSeenCache, lang).add(station);
  void AsyncStorage.setItem(
    chachaSeenStorageKey(lang),
    JSON.stringify([...chachaSeenCache.get(lang)!]),
  ).catch(() => {
    // Best-effort
  });
}

export function useChachaMemory(lang: string) {
  const isHydrated = (l: string) => isChachaSeenHydrated(l);
  const [hydrated, setHydrated] = useState(() => isHydrated(lang));

  useEffect(() => {
    let alive = true;
    setHydrated(isHydrated(lang));
    void hydrateChachaSeen(lang).then(() => {
      if (!alive) return;
      setHydrated(true);
    });
    return () => {
      alive = false;
    };
  }, [lang]);

  return {
    hydrated,
    isSeen: useCallback((station: number) => isChachaSeen(lang, station), [lang]),
    markSeen: useCallback((station: number) => markChachaSeen(lang, station), [lang]),
  };
}
