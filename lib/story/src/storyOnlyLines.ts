import type { StoryOnlyLines } from "./storyOnly";

/**
 * STORYBOOK-ONLY LINES: the data. REGION, and a fork replaces this whole map.
 *
 * One line per (language, concept) the storybook needs and the language's
 * lessons do not teach, served by GET /games/story/book only when the database
 * has no matching phrase row (see storyOnly.ts for why these are not lesson
 * rows, and why a database row always wins).
 *
 * EVERY LINE HERE IS UNREVIEWED UNTIL A SPEAKER CONFIRMS IT. They were written
 * by an agent with no translation tool and no speaker of each language to
 * hand, the same footing as the reading passages in
 * @workspace/script-trace/passages.ts, and they carry that file's convention:
 * a `confidence` saying how far to trust the draft, and `verified: false`.
 *
 * RULES FOR AN ENTRY, pinned by the story-only test:
 *   - the key is a concept exactly as a book names it (`bookConcepts`);
 *   - `english` is exactly that key, so it matches without any alias;
 *   - `nativeScript` is in the script the language's own seed rows use;
 *   - `romanized` follows that language's seed romanization style.
 *
 * RETIRE A LINE when a lesson row for the concept lands in that language
 * (the ledger's X114 note makes these words the journey 2 lesson backlog).
 * Until it is deleted it is simply never served.
 */
export const STORY_ONLY_LINES: StoryOnlyLines = {};
