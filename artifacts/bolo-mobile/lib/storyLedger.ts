// The learner's book, kept on this phone. Twin of the web's
// src/lib/story-ledger.ts, with the SAME KEYS so the two read side by side.
//
// ASYNCSTORAGE, and async is the one real difference. Everything else is
// documented once on the web file and holds here:
//
//   LOCAL, NOT A TABLE. Nothing in this repo migrates production, so a
//   storybook table would exist everywhere except where the learners are.
//
//   KEYED ON BOOK AND LANGUAGE, because the same book read in Hindi and in
//   Tamil is two different books: the entries record a concept, but what the
//   learner SAID was that concept's phrase in one language.
//
//   VALIDATED RATHER THAN TRUSTED on read. It is less obviously editable than
//   localStorage, but a malformed entry renders as a blank row in somebody's
//   own book, and the check costs nothing.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LedgerEntry } from '@workspace/story';

const PREFIX = 'bolo.story.book';

function keyFor(bookId: string, languageCode: string): string {
  return `${PREFIX}.${bookId}.${languageCode}`;
}

export async function loadStoryBook(
  bookId: string,
  languageCode: string,
): Promise<LedgerEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(bookId, languageCode));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is LedgerEntry =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as LedgerEntry).sceneId === 'string' &&
        typeof (e as LedgerEntry).concept === 'string' &&
        typeof (e as LedgerEntry).fitted === 'boolean',
    );
  } catch {
    return [];
  }
}

export async function saveStoryBook(
  bookId: string,
  languageCode: string,
  entries: LedgerEntry[],
): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(bookId, languageCode), JSON.stringify(entries));
  } catch {
    // Best effort. A learner who cannot persist still finishes the story they
    // are in; they just do not find it again later.
  }
}

export async function clearStoryBook(bookId: string, languageCode: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(bookId, languageCode));
  } catch {
    // A book that cannot be cleared was never stored.
  }
}
