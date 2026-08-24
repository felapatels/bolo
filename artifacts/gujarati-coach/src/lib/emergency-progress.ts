/**
 * What this browser knows about the Emergency.
 *
 * TWO FACTS PER ZONE AND THEY DO DIFFERENT JOBS:
 *
 *   SEEN unlocks the Skip button. The owner's rule is that the first showing is
 *   mandatory and every one after it is skippable, so this is the flag that
 *   makes the second showing bearable. It is set when the film REACHES ITS END,
 *   never when it starts, or a learner who navigated away during the first
 *   play would come back to a skip they never earned.
 *
 *   PASSED unlocks replaying it whenever they like. "user can replay once they
 *   pass this as many times as they want", so before a first win the Emergency
 *   only appears where the journey puts it.
 *
 * LOCALSTORAGE, for the same reason the storybook ledger is: a table means a
 * migration, and nothing in this repo migrates production. A progress table
 * would exist everywhere except where the learners are. See lib/story-ledger.ts.
 *
 * NOT KEYED ON LANGUAGE, unlike the story ledger, and that is deliberate. The
 * film is the same in every language and so is the interruption; only the five
 * phrases differ. Keying this per language would make a learner who switches
 * from Hindi to Tamil sit through the mandatory first play again, which would
 * read as a bug rather than as a rule.
 *
 * Every access is wrapped: Safari in private mode THROWS on localStorage rather
 * than returning null, and a storage error must never take a game down with it.
 */
const PREFIX = "bolo.emergency";

function key(journey: number, zone: number, fact: "seen" | "passed"): string {
  return `${PREFIX}.${fact}.j${journey}z${zone}`;
}

function read(k: string): boolean {
  try {
    return localStorage.getItem(k) === "1";
  } catch {
    // Storage unavailable reads as "never seen", which keeps the first play
    // mandatory. Erring toward showing the film is the safe direction: the
    // opposite would silently hand out a skip.
    return false;
  }
}

function write(k: string): void {
  try {
    localStorage.setItem(k, "1");
  } catch {
    // Best effort. The in-session state still applies, so a learner in private
    // mode gets the right behaviour for this sitting and a mandatory first
    // play again next time.
  }
}

/** Has the film for this zone ever been watched to the end? */
export function hasSeenEmergency(journey: number, zone: number): boolean {
  return read(key(journey, zone, "seen"));
}

/** Call when the film ENDS, never when it starts. */
export function markEmergencySeen(journey: number, zone: number): void {
  write(key(journey, zone, "seen"));
}

/** Has this zone's drill ever been cleared? */
export function hasPassedEmergency(journey: number, zone: number): boolean {
  return read(key(journey, zone, "passed"));
}

/** Call on a win, never on a loss. */
export function markEmergencyPassed(journey: number, zone: number): void {
  write(key(journey, zone, "passed"));
}
