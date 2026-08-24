import type { LedgerEntry } from "@workspace/story";

/**
 * The learner's book, kept in this browser.
 *
 * LOCALSTORAGE FIRST, AND ON PURPOSE. A table means a migration, and nothing in
 * this repo migrates production: the deploy runs a bare node boot and the only
 * migrate hook runs in the Repl workspace, which is the DEV database. So a
 * storybook table would exist everywhere except the place learners actually
 * are. The ledger is a return value from the engine and this is where it lands
 * until that changes.
 *
 * KEYED ON BOOK AND LANGUAGE, because the same book read in Hindi and in Tamil
 * is two different books: the entries record a concept, but what the learner
 * SAID was that concept's phrase in one language.
 *
 * Every access is wrapped: Safari in private mode throws on localStorage rather
 * than returning null, and a thrown storage error must never take the game down
 * with it. Same contract as lib/gameAudioPref.ts.
 */
const PREFIX = "bolo.story.book";

function keyFor(bookId: string, languageCode: string): string {
  return `${PREFIX}.${bookId}.${languageCode}`;
}

export function loadStoryBook(
  bookId: string,
  languageCode: string,
): LedgerEntry[] {
  try {
    const raw = localStorage.getItem(keyFor(bookId, languageCode));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Validated rather than trusted: this is a string a user can edit, and a
    // malformed entry would render as a blank row in their own book.
    return parsed.filter(
      (e): e is LedgerEntry =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as LedgerEntry).sceneId === "string" &&
        typeof (e as LedgerEntry).concept === "string" &&
        typeof (e as LedgerEntry).fitted === "boolean",
    );
  } catch {
    return [];
  }
}

export function saveStoryBook(
  bookId: string,
  languageCode: string,
  entries: LedgerEntry[],
): void {
  try {
    localStorage.setItem(keyFor(bookId, languageCode), JSON.stringify(entries));
  } catch {
    // Best effort. A learner who cannot persist still finishes the story they
    // are in; they just do not find it again later.
  }
}

export function clearStoryBook(bookId: string, languageCode: string): void {
  try {
    localStorage.removeItem(keyFor(bookId, languageCode));
  } catch {
    // Nothing to do: a book that cannot be cleared was never stored.
  }
}
