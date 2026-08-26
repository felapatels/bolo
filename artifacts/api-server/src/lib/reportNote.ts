/**
 * A phrase-report note that is NOTHING BUT an email address is dropped.
 *
 * MEASURED, NOT SUSPECTED. On 2026-08-25 production held 47 phrase reports and
 * 44 of them carried the identical string "appletester721-bolo@yahoo.com" in
 * the note column. Not one real explanation survived. The reason and the
 * phrase id were fine every time; only the "why" was lost, which is the half
 * that made the report worth having.
 *
 * THE CLIENT-SIDE FIX WAS ALREADY SHIPPED AND DID NOT HOLD. 417c5d29 put
 * autoComplete="new-note" on the web textarea and autoComplete="off" plus
 * textContentType="none" on the mobile one, and both were live on 2026-08-24.
 * Five more reports arrived on the evening of 2026-08-25 still carrying the
 * address. phrase_reports records no platform, so which client did it cannot be
 * read out of the data, and that is exactly why the guard belongs on the
 * SERVER: it is the one layer that does not care which browser, which OS
 * version, or whether the person typed it in themselves.
 *
 * IT STRIPS, IT DOES NOT REJECT, and only when the WHOLE trimmed note is an
 * address. A learner writing "the audio says hello@example.com" is making a
 * real report about a real phrase and must keep every word of it. Dropping to
 * null costs nothing: the reason and the phrase are the load-bearing parts of
 * a report, and an address in that column is PII the field never asked for.
 *
 * LIVES IN lib RATHER THAN IN THE ROUTE so it can be tested without a
 * database. routes/phraseReports.ts imports the pool at module load, so a pure
 * function tested through it would need DATABASE_URL and could then only run
 * in the Repl. Same reasoning as lib/publicName.ts.
 */
const ONLY_AN_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function usableNote(note: string | undefined): string | undefined {
  if (!note) return undefined;
  const trimmed = note.trim();
  if (trimmed.length === 0) return undefined;
  if (ONLY_AN_EMAIL.test(trimmed)) return undefined;
  return trimmed;
}
