/**
 * Copy that reaches a learner's eyes and ears from the model.
 *
 * The house rule is no em dashes anywhere, and the pronunciation feedback
 * cards were full of them: the rubric prompt banned emojis and "special
 * symbols" and the model still wrote "Great job — keep going" on every
 * other card (owner, 2026-08-29: "I see a lot of em dashes in the feedback
 * cards on lessons"). The prompt now says so in words, and this is the belt
 * to that brace: whatever the model writes, a dash used as punctuation
 * leaves here as a comma. The text is also spoken aloud, and a comma is
 * what a dash sounds like.
 */
const DASH_AS_PUNCTUATION = /\s*[—–]+\s*/g;

export function stripDashes(text: string): string {
  if (!text) return text;
  return (
    text
      .replace(DASH_AS_PUNCTUATION, ", ")
      // A dash the model put before a full stop, or doubled up with a comma
      // it also wrote, must not leave ", ." or ", ," behind.
      .replace(/,\s*,\s*/g, ", ")
      .replace(/,\s*([.!?;:])/g, "$1")
      .replace(/^,\s*/, "")
      .replace(/,\s*$/, "")
  );
}
