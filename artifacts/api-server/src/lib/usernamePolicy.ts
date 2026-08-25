// What a public username may be, and what it may not.
//
// Added 2026-08-25 with the global feed. Until then the only name a learner
// had was `displayName`, which is private and is what Bolo calls them. A
// username is seen by strangers, so it needs rules displayName never did.
//
// THIS SCREEN IS THE CHEAP HALF, AND IT IS NOT THE SAFETY NET. A word list
// catches the obvious and nothing else: it cannot read intent, it does not
// know every language's slang, and it will never catch a name that is only
// offensive in context or only offensive to the person being impersonated.
// The half that handles what a list cannot is the report queue
// (username_reports). If this file is ever treated as sufficient on its own,
// that is the mistake. Bolo teaches children; the two halves ship together.
//
// REPLACING THE LIST IS EXPECTED. A maintained library or a moderation service
// is strictly better than a hand-kept array, and the shape here (one pure
// function, one reason string out) is deliberately easy to swap.

/** Length bounds. Short enough to read on a leaderboard row, long enough to be a name. */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

/**
 * Letters, digits and underscore only.
 *
 * NO SPACES AND NO PUNCTUATION, which is not tidiness: mixed scripts and
 * combining marks are how a name gets rendered as something other than what
 * was screened, and zero-width characters are how two different accounts get
 * names that look identical on a row.
 */
const SHAPE = /^[A-Za-z0-9_]+$/;

/**
 * Fold the tricks people use to slip a word past a list: case, digits standing
 * in for letters, and separators between every character. Screening happens on
 * the folded form, never on the raw one.
 */
export function foldForScreen(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[013457$@!|]/g, (c) =>
      ({
        "0": "o",
        "1": "i",
        "3": "e",
        "4": "a",
        "5": "s",
        "7": "t",
        $: "s",
        "@": "a",
        "!": "i",
        "|": "i",
      })[c] ?? c,
    )
    .replace(/[^a-z]/g, "");
}

/**
 * Stems that may not appear anywhere in the folded name. Substring matching on
 * purpose: an exact-match list is defeated by adding one character.
 *
 * SUBSTRING MATCHING HAS A KNOWN COST and it is the right trade. Innocent
 * names will occasionally be refused because they contain one of these inside
 * them, and the learner is asked to pick another; the opposite error puts a
 * slur on a child's screen. Same direction as isTestContributor's "a name
 * merely starting with test is caught too".
 */
const BLOCKED_STEMS = [
  "fuck",
  "shit",
  "cunt",
  "bitch",
  "bastard",
  "wanker",
  "dick",
  "cock",
  "pussy",
  "slut",
  "whore",
  "rape",
  "nazi",
  "hitler",
  "nigg",
  "fagg",
  "retard",
  "kill",
  "porn",
  "sex",
] as const;

/**
 * Names nobody may take because taking one is a lie about who you are. Exact
 * match on the folded form: "bolo" is refused, "bolophile" is not.
 */
const RESERVED = [
  "bolo",
  "boloteam",
  "admin",
  "administrator",
  "moderator",
  "mod",
  "support",
  "help",
  "staff",
  "official",
  "system",
  "root",
  "chachaji",
] as const;

/**
 * Why this username may not be used, or null when it is fine.
 *
 * Returns a SENTENCE, not a code: every caller is showing it to the learner
 * who just typed the name, and a code table split across two clients is how
 * the two clients end up disagreeing about what is wrong with it.
 */
export function usernameProblem(raw: string): string | null {
  const name = raw.trim();
  if (name.length < USERNAME_MIN) {
    return `A username needs at least ${USERNAME_MIN} characters.`;
  }
  if (name.length > USERNAME_MAX) {
    return `A username can be at most ${USERNAME_MAX} characters.`;
  }
  if (!SHAPE.test(name)) {
    return "Letters, numbers and underscores only, with no spaces.";
  }
  if (!/[A-Za-z]/.test(name)) {
    return "A username needs at least one letter in it.";
  }
  const folded = foldForScreen(name);
  // A name that folds away to nothing is all digits and underscores dressed up
  // as a word, and there is nothing left to screen.
  if (folded.length === 0) {
    return "A username needs at least one letter in it.";
  }
  if ((RESERVED as readonly string[]).includes(folded)) {
    return "That name is reserved. Please pick another.";
  }
  for (const stem of BLOCKED_STEMS) {
    if (folded.includes(stem)) {
      return "That name cannot be used. Please pick another.";
    }
  }
  return null;
}

/** Convenience for the routes: true when the name passes every rule. */
export function isUsernameAllowed(raw: string): boolean {
  return usernameProblem(raw) === null;
}
