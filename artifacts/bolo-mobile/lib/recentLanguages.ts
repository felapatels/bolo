import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * THE LANGUAGES THIS LEARNER LAST SWITCHED TO, ON THIS DEVICE.
 *
 * The owner's item 4 asked for a "Recently practiced" row in the language
 * picker, and the honest version of that turned out not to be buildable on the
 * client. `GET /languages` returns a flat catalogue with no per-learner state,
 * and there is no endpoint anywhere reporting a last-practised-at per language.
 * Getting the true fact means a server change, an openapi entry, codegen and a
 * deploy, which is a different size of job from the rest of item 4.
 *
 * SO THIS RECORDS WHAT IT CAN ACTUALLY KNOW, AND THE LABEL SAYS SO. It stores
 * the languages the learner has SWITCHED TO here, most recent first, and the
 * picker heads the row "Recent" rather than "Recently practiced". Calling a
 * list of recent switches "practiced" would be a small lie on a screen whose
 * whole job is telling the learner where they have been, and a learner who
 * switched to Tamil once by accident would be told they had been practising it.
 *
 * WHY IT IS STILL WORTH SHIPPING: 22 languages in a two-column grid is eleven
 * rows of scrolling, and almost every learner moves between two or three. The
 * row that saves the scroll is the row of languages they actually use, and
 * "switched to recently" is a good enough proxy for that to be useful today,
 * without claiming to be the better fact.
 *
 * Device-local on purpose. It is a convenience, not a record: a learner on a new
 * phone simply sees no Recent row until they switch once, which is correct
 * rather than broken.
 */
export const RECENT_LANGUAGES_KEY = 'bolo.recentLanguages.v1';

/** Kept short. A "recent" list long enough to need scrolling is just the grid. */
export const RECENT_LANGUAGES_MAX = 4;

export async function loadRecentLanguages(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_LANGUAGES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    // Anything that is not a list of strings is treated as absent rather than
    // thrown: a corrupt convenience must never block the picker from opening.
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c): c is string => typeof c === 'string').slice(0, RECENT_LANGUAGES_MAX);
  } catch {
    return [];
  }
}

/**
 * Move `code` to the front, keeping the rest in order and dropping duplicates.
 * Never throws: every caller is a side effect on a happy path.
 */
export async function recordRecentLanguage(code: string): Promise<void> {
  try {
    const current = await loadRecentLanguages();
    const next = [code, ...current.filter((c) => c !== code)].slice(0, RECENT_LANGUAGES_MAX);
    await AsyncStorage.setItem(RECENT_LANGUAGES_KEY, JSON.stringify(next));
  } catch {
    /* a convenience that cannot be stored is simply not offered */
  }
}
