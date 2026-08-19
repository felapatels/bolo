// Build 35 mobile parity: zone closeout stage memory.
//
// The web machine (gujarati-coach/src/lib/quick-games.ts) is a localStorage
// map per language, zoneIndex -> "beat2" | "done", read SYNCHRONOUSLY during
// render. AsyncStorage cannot be read at render time, so this mirrors the
// signal-memory approach exactly: one hydration pass into an in-memory cache
// that render reads through synchronous accessors, hydration MERGES rather
// than replaces, and nothing reads disk during render.
//
// Two things live here:
//
//   stages   DEVICE scoped , AsyncStorage, hydrated. Pure DISPLAY state:
//                             where each zone sits in the celebration, never
//                             a record of what was paid. The ledger's
//                             once-ever `earn_closeout_first` refId is the
//                             real idempotency boundary for the Chai.
//   grants   SESSION scoped, in-memory only. "The server actually granted
//                             closeout Chai for this zone on this run", which
//                             is the ONLY thing allowed to put a "+2 Chai"
//                             claim on screen. It is deliberately not
//                             persisted: it describes a run, not a device.
//
// "Unseeded" is the first-sight guard. A learner who already finished zones
// before this shipped must not get a burst of retroactive celebrations, so
// the very first hydration that finds NO stored key seeds every already-done
// zone straight to "done" and celebrates nothing that pass.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

export type CloseoutStage = 'beat2' | 'done';
export type CloseoutStages = Record<number, CloseoutStage>;

/** Per-language so two languages never share celebration state. */
export const closeoutStorageKey = (lang: string) => `bolo.zoneCloseout:${lang}`;

type Entry = {
  stages: CloseoutStages;
  /** False = this device has never written the key (first sight). */
  seeded: boolean;
};

/** Hydrated mirror of AsyncStorage. Absent language = not hydrated yet. */
const cache = new Map<string, Entry>();
/** Session-scoped record of real server grants: lang -> zoneId -> amount
 *  PAID BY THE SERVER. The amount is stored rather than assumed so the payoff
 *  chip can never promise a number the server did not actually grant. */
const sessionGrants = new Map<string, Map<number, number>>();

function isStage(v: unknown): v is CloseoutStage {
  return v === 'beat2' || v === 'done';
}

/** Web parity: integer keys and the two literals only, anything else is
 *  discarded rather than trusted. A corrupt value must never celebrate. */
function parseStages(raw: string | null): CloseoutStages | null {
  if (raw === null) return null;
  try {
    const obj = JSON.parse(raw) as unknown;
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
    const out: CloseoutStages = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (!/^\d+$/.test(k)) continue;
      if (!isStage(v)) continue;
      out[Number(k)] = v;
    }
    return out;
  } catch {
    return {};
  }
}

async function persist(lang: string): Promise<void> {
  const entry = cache.get(lang);
  if (!entry) return;
  try {
    // Read-modify-write, never blind-write. A stage written before this
    // language finished hydrating would otherwise persist ONLY what this
    // session happens to know and wipe every zone already closed out on
    // disk, the one way this display state could resurrect a celebration.
    const stored = parseStages(await AsyncStorage.getItem(closeoutStorageKey(lang))) ?? {};
    const merged: CloseoutStages = { ...stored, ...entry.stages };
    // The live entry stays authoritative for anything written meanwhile.
    entry.stages = { ...merged, ...entry.stages };
    await AsyncStorage.setItem(closeoutStorageKey(lang), JSON.stringify(entry.stages));
  } catch {
    // Best-effort: the in-memory stages still hold for this session.
  }
}

/**
 * Load this language's stages into the render-readable cache. Idempotent and
 * safe to call on every mount.
 */
export async function hydrateCloseoutStages(lang: string): Promise<void> {
  let stored: CloseoutStages | null;
  try {
    stored = parseStages(await AsyncStorage.getItem(closeoutStorageKey(lang)));
  } catch {
    // Unreadable storage reads as a missing key, which is what web does with
    // an absent key: the seeding pass runs and closes out already-done zones
    // silently. The alternative (treating it as seeded) would hand the
    // learner a retroactive celebration for every zone they finished long ago.
    stored = null;
  }
  const live = cache.get(lang);
  const merged: CloseoutStages = { ...(stored ?? {}) };
  // Merge rather than replace: a stage written while hydration was in flight
  // must not be thrown away by the slower disk read.
  if (live) Object.assign(merged, live.stages);
  cache.set(lang, {
    stages: merged,
    seeded: stored !== null || (live?.seeded ?? false),
  });
}

export function isCloseoutHydrated(lang: string): boolean {
  return cache.has(lang);
}

/** Synchronous snapshot for render. Empty until hydrated. */
export function readCloseoutStages(lang: string): CloseoutStages {
  return cache.get(lang)?.stages ?? {};
}

/** True on first sight of the feature for this language. Only meaningful once
 *  hydrated, gate every use of it on {@link isCloseoutHydrated}. */
export function closeoutStateUnseeded(lang: string): boolean {
  return cache.get(lang)?.seeded !== true;
}

/** First-sight seeding: already-complete zones go straight to "done". */
export function seedCloseoutStages(lang: string, doneZoneIndexes: number[]): void {
  const stages: CloseoutStages = {};
  for (const zi of doneZoneIndexes) stages[zi] = 'done';
  // Anything already written this session outranks the seed.
  Object.assign(stages, cache.get(lang)?.stages ?? {});
  cache.set(lang, { stages, seeded: true });
  void persist(lang);
}

export function writeCloseoutStage(
  lang: string,
  zoneIndex: number,
  stage: CloseoutStage,
): void {
  const entry = cache.get(lang) ?? { stages: {}, seeded: true };
  entry.stages = { ...entry.stages, [zoneIndex]: stage };
  entry.seeded = true;
  cache.set(lang, entry);
  void persist(lang);
}

/**
 * Record that the SERVER granted closeout Chai for this zone.
 *
 * Only the game shell may call this, and only inside a real `chaiGranted`
 * response. The payoff beat's "+2 Chai" line is rendered from this and
 * nothing else, so a run that granted nothing (a repeat, a failed run, a
 * different category picked in the hub) makes no claim it cannot back.
 */
export function markCloseoutGranted(lang: string, zoneId: number, amount: number): void {
  if (!(amount > 0)) return;
  let m = sessionGrants.get(lang);
  if (!m) {
    m = new Map();
    sessionGrants.set(lang, m);
  }
  m.set(zoneId, amount);
}

/** The Chai the server actually paid for this zone this session, or null. */
export function closeoutGrantedChai(lang: string, zoneId: number): number | null {
  return sessionGrants.get(lang)?.get(zoneId) ?? null;
}

/**
 * Is a celebration owed for any zone? This is what the trackside signal's
 * soft stop suppresses itself on (web parity), so the two never race for the
 * screen. Unseeded counts as owed: the first-sight seeding pass has not run
 * yet, so nothing can be said about which zones are closed out. Nothing is
 * owed before hydration, an empty cache is not evidence of an open zone.
 */
export function closeoutOwed(
  memory: { hydrated: boolean; unseeded: boolean; stages: CloseoutStages },
  zonesAllDone: boolean[],
): boolean {
  if (!memory.hydrated) return false;
  if (memory.unseeded) return true;
  return zonesAllDone.some((done, zi) => done && memory.stages[zi] !== 'done');
}

/** Test seam. Never called by app code. */
export function resetCloseoutMemory(): void {
  cache.clear();
  sessionGrants.clear();
}

export type CloseoutMemory = {
  /** False until this language's stages have been read off disk. Nothing may
   *  celebrate, seed or write while false. */
  hydrated: boolean;
  /** Bumped on every write so the map re-derives. */
  version: number;
  stages: CloseoutStages;
  unseeded: boolean;
  seed: (doneZoneIndexes: number[]) => void;
  write: (zoneIndex: number, stage: CloseoutStage) => void;
  /** Chai the server really paid for this zone this session, or null. */
  grantedChai: (zoneId: number) => number | null;
};

/** Hydrating hook, the counterpart of useSignalMemory. */
export function useCloseoutMemory(lang: string): CloseoutMemory {
  const [hydrated, setHydrated] = useState(() => isCloseoutHydrated(lang));
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    setHydrated(isCloseoutHydrated(lang));
    void hydrateCloseoutStages(lang).then(() => {
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
    stages: readCloseoutStages(lang),
    unseeded: closeoutStateUnseeded(lang),
    seed: useCallback(
      (doneZoneIndexes: number[]) => {
        seedCloseoutStages(lang, doneZoneIndexes);
        bump();
      },
      [lang, bump],
    ),
    write: useCallback(
      (zoneIndex: number, stage: CloseoutStage) => {
        writeCloseoutStage(lang, zoneIndex, stage);
        bump();
      },
      [lang, bump],
    ),
    grantedChai: useCallback((zoneId: number) => closeoutGrantedChai(lang, zoneId), [lang]),
  };
}
