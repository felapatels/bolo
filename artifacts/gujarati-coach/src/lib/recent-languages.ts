/**
 * THE LANGUAGES THIS LEARNER LAST SWITCHED TO, IN THIS BROWSER. The web twin
 * of bolo-mobile/lib/recentLanguages.ts (same key, same cap), ported
 * 2026-08-30 on the owner's "Language switcher on web should have the same
 * search and recent functionality as mobile".
 *
 * "RECENT", NOT "RECENTLY PRACTISED", and the difference is deliberate.
 * GET /languages is a flat catalogue with no per-learner state, and nothing
 * reports a last-practised-at per language, so the honest fact this device
 * holds is which languages were SWITCHED TO. Calling a list of switches
 * "practised" would tell a learner who opened Tamil once by accident that
 * they had been studying it.
 *
 * Device-local on purpose: a convenience, not a record. A new browser sees no
 * Recent row until the first switch, which is correct rather than broken.
 */
export const RECENT_LANGUAGES_KEY = "bolo.recentLanguages.v1";

/** Kept short. A "recent" list long enough to need scrolling is just the grid. */
export const RECENT_LANGUAGES_MAX = 4;

export function loadRecentLanguages(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_LANGUAGES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    // Anything that is not a list of strings is treated as absent rather than
    // thrown: a corrupt convenience must never block the picker from opening.
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c): c is string => typeof c === "string").slice(0, RECENT_LANGUAGES_MAX);
  } catch {
    return [];
  }
}

/** Move `code` to the front, keeping the rest in order and dropping
 *  duplicates. Never throws: every caller is a side effect on a happy path. */
export function recordRecentLanguage(code: string): void {
  try {
    const next = [code, ...loadRecentLanguages().filter((c) => c !== code)].slice(
      0,
      RECENT_LANGUAGES_MAX,
    );
    localStorage.setItem(RECENT_LANGUAGES_KEY, JSON.stringify(next));
  } catch {
    /* a convenience that cannot be stored is simply not offered */
  }
}

/** Case and diacritics folded, so "gujarati" finds "Gujarātī" and the
 *  native script matches what a learner who reads it types. */
export function foldForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
