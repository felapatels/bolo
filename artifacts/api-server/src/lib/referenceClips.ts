import { isTestContributor } from "@workspace/script-trace";
import { normalizePhraseText } from "@workspace/db/phrase-text";

/**
 * WHEN A NATIVE LESSON PHRASE CLIP COUNTS, AND AS WHAT (2026-09-15).
 *
 * The contribution page's phrase mode records a native speaker saying each
 * lesson phrase, and its review mode lets a second speaker approve or reject
 * each clip. This file is the ONE place that turns those rows into a state,
 * so the review page, the Nest's counts and, next, the reference scorer
 * (lib/referenceAudio.ts) can never disagree about which clips are approved.
 *
 * PURE. No database, no request: the caller loads the rows.
 *
 * THE RULE, conservative on purpose, because an approved clip is meant to
 * become the audio a learner's take is judged against, and "a wrong reference
 * would mark learners wrong for saying it right" (the owner's proposal):
 *
 *   not_counted  practice, or recorded under a test name (Test Aakesh, any
 *                name starting "test", PROBE_CLAUDE, smoke: CLAUDE.md, "The
 *                contribution page: whose data counts")
 *   stale        the phrase's text has been edited since the clip was made,
 *                so it is a reading of words the app no longer teaches
 *   not_right    ANY real reviewer said not right. One objection outweighs
 *                any number of approvals until the phrase is recorded again
 *   approved     at least one real approval and no real objection
 *   needs_check  a real, current clip nobody real has judged yet
 *
 * A "real" verdict is not practice, not under a test name, and not from the
 * speaker who recorded the clip. The route refuses a self-review outright;
 * the rule ignores one anyway, so it stays correct on rows written before
 * that check or by any other door.
 */

/**
 * Journey 1 zone number to the category its lesson groups live under.
 *
 * ZONE 1 ONLY, deliberately. It is the same join lib/teaser.ts makes for the
 * free first stop, and the full zone table lives in the two clients
 * (journeyLines.ts JOURNEY_1_SLUGS, web and mobile twins). A third copy here
 * would be a third place to forget; add the next zone when a speaker has
 * finished this one.
 */
export const PHRASE_MODE_ZONE_SLUGS: Readonly<Record<number, string>> = {
  1: "greetings",
};

export type ClipVerdict = "approved" | "rejected";

export function isClipVerdict(value: unknown): value is ClipVerdict {
  return value === "approved" || value === "rejected";
}

export interface ClipFacts {
  contributor: string;
  isPractice: boolean;
  /** The words the speaker was shown when they recorded it. */
  promptText: string;
}

export interface VerdictFacts {
  reviewer: string;
  verdict: string;
  isPractice: boolean;
}

export type ClipState =
  | "not_counted"
  | "stale"
  | "not_right"
  | "approved"
  | "needs_check";

/**
 * Whether two typed first names are the same person, as far as the page can
 * tell. The page stores names through its safeName (spaces become "_"), so
 * "First Name", "first_name" and "!First Name" all compare equal.
 */
export function sameSpeaker(a: string, b: string): boolean {
  const norm = (s: string) =>
    s.trim().replace(/^!/, "").toLowerCase().replace(/[_\s]+/g, " ").trim();
  return norm(a) === norm(b);
}

function isReal(name: string, isPractice: boolean): boolean {
  return !isPractice && !isTestContributor(name);
}

export function clipState(
  clip: ClipFacts,
  verdicts: readonly VerdictFacts[],
  currentNativeScript: string,
): ClipState {
  if (!isReal(clip.contributor, clip.isPractice)) return "not_counted";
  if (normalizePhraseText(clip.promptText) !== normalizePhraseText(currentNativeScript)) {
    return "stale";
  }
  const real = verdicts.filter(
    (v) => isReal(v.reviewer, v.isPractice) && !sameSpeaker(v.reviewer, clip.contributor),
  );
  if (real.some((v) => v.verdict === "rejected")) return "not_right";
  if (real.some((v) => v.verdict === "approved")) return "approved";
  return "needs_check";
}

export type PhraseClipProgress = "approved" | "needs_check" | "not_right" | "none";

/**
 * Where one phrase stands, from the states of all its clips. Best first: one
 * approved take is all a reference needs, so a phrase with an approved clip
 * and a rejected one is approved. "none" covers no clips at all, and clips
 * that do not count or are stale, which are the same thing to the scorer.
 */
export function phraseProgress(states: readonly ClipState[]): PhraseClipProgress {
  if (states.includes("approved")) return "approved";
  if (states.includes("needs_check")) return "needs_check";
  if (states.includes("not_right")) return "not_right";
  return "none";
}

/**
 * Whether the review page should put a clip in front of this reviewer.
 *
 * A reviewer's time is the scarce thing, so the queue holds only clips worth
 * judging: never practice, never a reading of edited words, and never the
 * reviewer's own recording (the verdict route would refuse it). A clip under
 * a TEST name is shown only to a reviewer who is also testing, so the owner
 * can walk through both halves without leaving junk in a real speaker's queue.
 */
export function reviewerSeesClip(
  clip: ClipFacts,
  reviewer: string,
  currentNativeScript: string,
): boolean {
  if (clip.isPractice) return false;
  if (normalizePhraseText(clip.promptText) !== normalizePhraseText(currentNativeScript)) {
    return false;
  }
  if (sameSpeaker(reviewer, clip.contributor)) return false;
  if (isTestContributor(clip.contributor) && !isTestContributor(reviewer)) return false;
  return true;
}
