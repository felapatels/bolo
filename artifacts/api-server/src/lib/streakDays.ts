// THE streak. One computation, server-side, for every surface that shows a
// streak number or sells one back (Task #1081).
//
// WHY THIS FILE EXISTS
// The banner and the streak-repair offer used to compute the streak from two
// different expressions: the banner counted attempt days in the ACTIVE
// LANGUAGE, the repair offer scanned attempt days in ALL languages. The card
// could therefore promise a number the banner was structurally incapable of
// showing, it said 4 while the banner delivered 1 and 2, and it charged 25
// Chai for that promise. Two expressions that can disagree is the defect. It
// is not fixed by aligning two copies, so there is exactly one here and every
// caller reads it.
//
// THE DEFINITION (owner ruling, Task #1081)
// A streak day is a day on which the learner either COMPLETED A LESSON or
// PLAYED A MINI-GAME, in ANY language. Bare attempts no longer count a day:
// showing up and recording a few takes without finishing anything is not the
// thing the streak is meant to reward. Mini-games do count, a learner who
// played one showed up and practised.
//
// "Completed a lesson" is the EXISTING completion rule, not a new concept:
// every accessible item of the lesson group cleared the advance gate (good
// band or better, or three takes) within that one local day. The 80%-mastered
// ratio in lessonGroupUnlock.ts is a different rule for a different job (which
// station unlocks next) and is deliberately NOT used here, it does not match
// the ruling's wording.
//
// DERIVED, NEVER STORED
// Nothing persists "lesson completed on date": lesson_group_progress is a
// latch written when a read endpoint OBSERVES completion, so its timestamp is
// the observation day, not the practice day. Completion days are therefore
// derived from attempts resolved to their lesson group. Deriving it that way
// also means the entry point does not matter, a station session and a
// topic-wide session both land on the same group.
import {
  db,
  attemptsTable,
  gameSessionsTable,
  lessonGroupTestoutsTable,
  phrasesTable,
  usersTable,
  zoneTestoutsTable,
} from "@workspace/db";
import { and, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { bandFromScore, isGoodOrBetterBand } from "./scoreBands";
import { localDayKey, streakFromDayKeys } from "./progressMetrics";
import { listCoveredDayKeys } from "./tokenService";
import {
  featuresForPlan,
  resolvePlan,
  type SubscriptionState,
} from "./entitlements";
import { familyGrantedPlan } from "./familyAccess";

/**
 * How far back any streak question ever looks. The ladder is contiguous by
 * construction, so a streak longer than this is unreachable anyway; the repair
 * scan (lib/streakRepair.ts) refuses anything past its own two-day window
 * regardless. Purely a bound on the work.
 */
export const STREAK_SCAN_DAYS = 60;

/** A few days of slack so a learner far east of UTC never loses the oldest rung. */
const HORIZON_DAYS = STREAK_SCAN_DAYS + 3;

/**
 * Takes on one item after which the advance gate opens whatever the band: a
 * dead mic or a brutally hard phrase must never strand the learner, and must
 * not silently cost them the day either. The client twins this exactly, ADVANCE_ATTEMPT_LIMIT in web `pages/practice.tsx` and mobile `lib/ui.ts`.
 */
export const STREAK_ITEM_ATTEMPT_LIMIT = 3;

/**
 * The item rule, verbatim from the advance gate the learner actually saw:
 * earned by scoring good or better, or by simply having had enough goes.
 *
 * `bestScore` is the learner's best score on the item WITHIN THE DAY and
 * `attemptCount` their takes on it within that same day. Best-of-day rather
 * than last-of-day because the gate is a latch on the client: once a take
 * lands good or better, moving on is unlocked for the rest of that phrase's
 * run and a later scrappy take does not shut it again.
 *
 * The window is the DAY, not the practice session, and that is a knowing
 * divergence from the client, whose tally lives in component state and resets
 * whenever a session does. Nothing persists a session boundary, so there is
 * nothing here to bucket by; inventing storage for one is a bigger change than
 * this rule is worth. Two consequences, both in the learner's favour and both
 * accepted: three takes spread across three sittings clear an item where three
 * in one sitting would have, and a good take followed later by a bad one still
 * counts as good. A learner who takes three real goes at every item of a lesson
 * over a day has practised that day, which is what the ruling is about.
 *
 * Band comes from the score (scoreBands.bandFromScore), never from the stored
 * `band` column: that column is nullable on rows predating the five-band
 * rollout and carries legacy names on older ones, and legacy 'close' straddles
 * good and almost, it cannot answer "good or better" at all.
 */
export function isStreakItemCleared(
  bestScore: number,
  attemptCount: number,
): boolean {
  if (isGoodOrBetterBand(bandFromScore(bestScore))) return true;
  return attemptCount >= STREAK_ITEM_ATTEMPT_LIMIT;
}

/** Everything the earned-day derivation needs, with no database of its own. */
export interface StreakDayInputs {
  /** Attempts on real phrases, all languages, over the horizon. */
  attempts: { phraseId: number; score: number; createdAt: Date }[];
  /** Lesson group of every attempted phrase. Absent = ungrouped phrase. */
  groupByPhraseId: Map<number, number>;
  /**
   * The items of each touched lesson group that this learner may actually be
   * served, premium rows only for the extended library, sentence groups only
   * for a plan that owns the sentence stage. A Free learner completes a
   * station by clearing the starter items, which is the only set they were
   * ever offered; requiring the locked ones would make completion impossible
   * for them. An empty set means the group is entirely out of reach and can
   * never be completed.
   */
  accessibleItemsByGroup: Map<number, Set<number>>;
  /**
   * When every mini-game session happened, all languages. Read from
   * `game_sessions` rather than the phantom streak-only attempts that sit
   * beside them: those are attempts, attempts no longer count a day, and that
   * mechanism stops working under this definition. Every write path inserts
   * one of these rows, so the substitution is complete, including
   * script-trace, which writes both the session row and the phantom ONLY on
   * the first completion of a chapter. A chapter replay anchored no day before
   * this change and anchors none after it; that asymmetry is carried over
   * deliberately, not quietly fixed here.
   */
  gameSessionDates: Date[];
  /**
   * When every PASSED test-out happened, station-level and zone-level alike.
   * A test-out is the other existing way a station is cleared, so a day the
   * learner cleared one is a day they completed a lesson. Taken from the
   * append-only submission logs, whose timestamps ARE the practice moment
   * (unlike the lesson_group_progress latch). Failed submissions clear
   * nothing and are excluded.
   */
  passedTestoutDates: Date[];
}

/**
 * The earned days themselves: pure, so the rule can be tested without a
 * database or a clock.
 */
export function computeEarnedDayKeys(
  inputs: StreakDayInputs,
  timeZone?: string | null,
): Set<string> {
  const earned = new Set<string>();

  // Clause 2 of the ruling: a mini-game played is a day shown up for.
  for (const d of inputs.gameSessionDates) earned.add(localDayKey(d, timeZone));
  // A cleared station, by the express route rather than the long one.
  for (const d of inputs.passedTestoutDates)
    earned.add(localDayKey(d, timeZone));

  // Clause 1: bucket every attempt by (local day, lesson group, item), then
  // ask whether any group was finished off inside a single day.
  type ItemTally = { bestScore: number; attemptCount: number };
  const byDayGroup = new Map<string, Map<number, ItemTally>>();
  for (const a of inputs.attempts) {
    const groupId = inputs.groupByPhraseId.get(a.phraseId);
    // Ungrouped phrases (replenisher rows awaiting assignment, generated
    // lessons) belong to no lesson, so they can complete none.
    if (groupId == null) continue;
    const day = localDayKey(a.createdAt, timeZone);
    const key = `${day}\u0000${groupId}`;
    let items = byDayGroup.get(key);
    if (!items) {
      items = new Map<number, ItemTally>();
      byDayGroup.set(key, items);
    }
    const tally = items.get(a.phraseId);
    if (tally) {
      tally.attemptCount += 1;
      if (a.score > tally.bestScore) tally.bestScore = a.score;
    } else {
      items.set(a.phraseId, { bestScore: a.score, attemptCount: 1 });
    }
  }

  for (const [key, items] of byDayGroup) {
    const sep = key.indexOf("\u0000");
    const day = key.slice(0, sep);
    if (earned.has(day)) continue; // already earned; nothing to prove twice
    const groupId = Number(key.slice(sep + 1));
    const required = inputs.accessibleItemsByGroup.get(groupId);
    // No reachable items = no lesson this learner can finish here.
    if (!required || required.size === 0) continue;
    let allCleared = true;
    for (const phraseId of required) {
      const tally = items.get(phraseId);
      if (!tally || !isStreakItemCleared(tally.bestScore, tally.attemptCount)) {
        allCleared = false;
        break;
      }
    }
    if (allCleared) earned.add(day);
  }

  return earned;
}

/** The one answer, and the two day sets it was read from. */
export interface StreakLadder {
  /** Local days the learner EARNED under the ruling. */
  earnedDayKeys: Set<string>;
  /** Local days COVERED by a station pause or an earlier repair. */
  coveredDayKeys: Set<string>;
  /** What the ladder reads today. */
  currentStreakDays: number;
}

/**
 * THE streak read. Every surface that shows or sells a streak calls this:
 * the progress summary's banner value, badge evaluation, and both the
 * streak-repair offer and the repair write itself.
 *
 * Reuses the existing ladder climb (progressMetrics.streakFromDayKeys) and the
 * existing covered-day accessor (tokenService.listCoveredDayKeys) untouched, a covered day counts exactly as an earned one, which is what buying a cover
 * means.
 */
export async function loadStreakLadder(
  userId: string,
  timeZone?: string | null,
  now: Date = new Date(),
): Promise<StreakLadder> {
  const earnedDayKeys = await loadEarnedDayKeys(userId, timeZone, now);
  const coveredDayKeys = await listCoveredDayKeys(userId);
  return {
    earnedDayKeys,
    coveredDayKeys,
    currentStreakDays: streakFromDayKeys(
      earnedDayKeys,
      coveredDayKeys,
      timeZone,
      now,
    ),
  };
}

/**
 * The earned days for one learner, across every language, read from the
 * database. Split from the ladder so the repair scan can hold the raw day set.
 */
export async function loadEarnedDayKeys(
  userId: string,
  timeZone?: string | null,
  now: Date = new Date(),
): Promise<Set<string>> {
  const horizon = new Date(now.getTime() - HORIZON_DAYS * 86_400_000);

  const [attempts, gameSessions, groupTestouts, zoneTestoutRows, userRow] =
    await Promise.all([
      db
        .select({
          phraseId: attemptsTable.phraseId,
          score: attemptsTable.score,
          createdAt: attemptsTable.createdAt,
        })
        .from(attemptsTable)
        .where(
          and(
            eq(attemptsTable.userId, userId),
            gte(attemptsTable.createdAt, horizon),
            // Phantom streak-only rows (phraseId null, score 0) are excluded
            // structurally: they resolve to no phrase, so no lesson.
            isNotNull(attemptsTable.phraseId),
          ),
        ),
      db
        .select({ createdAt: gameSessionsTable.createdAt })
        .from(gameSessionsTable)
        .where(
          and(
            eq(gameSessionsTable.userId, userId),
            gte(gameSessionsTable.createdAt, horizon),
          ),
        ),
      db
        .select({ createdAt: lessonGroupTestoutsTable.createdAt })
        .from(lessonGroupTestoutsTable)
        .where(
          and(
            eq(lessonGroupTestoutsTable.userId, userId),
            eq(lessonGroupTestoutsTable.passed, true),
            gte(lessonGroupTestoutsTable.createdAt, horizon),
          ),
        ),
      db
        .select({ createdAt: zoneTestoutsTable.createdAt })
        .from(zoneTestoutsTable)
        .where(
          and(
            eq(zoneTestoutsTable.userId, userId),
            eq(zoneTestoutsTable.passed, true),
            gte(zoneTestoutsTable.createdAt, horizon),
          ),
        ),
      db
        .select({
          tier: usersTable.tier,
          subscriptionStatus: usersTable.subscriptionStatus,
          trialEndsAt: usersTable.trialEndsAt,
          currentPeriodEnd: usersTable.currentPeriodEnd,
          chosenLanguage: usersTable.chosenLanguage,
          pauseUntil: usersTable.pauseUntil,
        })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1)
        .then((rows) => rows[0]),
    ]);

  const gameSessionDates = gameSessions.map((r) => r.createdAt);
  const passedTestoutDates = [
    ...groupTestouts.map((r) => r.createdAt),
    ...zoneTestoutRows.map((r) => r.createdAt),
  ];

  const attemptedPhraseIds = [
    ...new Set(attempts.map((a) => a.phraseId as number)),
  ];
  if (attemptedPhraseIds.length === 0) {
    return computeEarnedDayKeys(
      {
        attempts: [],
        groupByPhraseId: new Map(),
        accessibleItemsByGroup: new Map(),
        gameSessionDates,
        passedTestoutDates,
      },
      timeZone,
    );
  }

  // Which lesson group each attempted phrase belongs to. Only these groups can
  // possibly have been finished off in the window.
  const attemptedPhraseRows = await db
    .select({
      id: phrasesTable.id,
      lessonGroupId: phrasesTable.lessonGroupId,
    })
    .from(phrasesTable)
    .where(inArray(phrasesTable.id, attemptedPhraseIds));

  const groupByPhraseId = new Map<number, number>();
  const touchedGroupIds = new Set<number>();
  for (const row of attemptedPhraseRows) {
    if (row.lessonGroupId == null) continue;
    groupByPhraseId.set(row.id, row.lessonGroupId);
    touchedGroupIds.add(row.lessonGroupId);
  }

  const accessibleItemsByGroup = new Map<number, Set<number>>();
  if (touchedGroupIds.size > 0) {
    // The learner's plan decides which items of a group they were ever
    // offered. Resolved the same way loadEntitlements does, including the
    // family cascade, so this agrees with what the phrase-serving routes
    // actually handed them.
    const features = featuresForPlan(
      await resolveEffectivePlan(userId, userRow),
    );
    const members = await db
      .select({
        id: phrasesTable.id,
        lessonGroupId: phrasesTable.lessonGroupId,
        premium: phrasesTable.premium,
        stage: phrasesTable.stage,
      })
      .from(phrasesTable)
      .where(inArray(phrasesTable.lessonGroupId, [...touchedGroupIds]));

    for (const m of members) {
      if (m.lessonGroupId == null) continue;
      if (m.premium && !features.extendedLibrary) continue;
      if (m.stage === "sentence" && !features.sentences) continue;
      let set = accessibleItemsByGroup.get(m.lessonGroupId);
      if (!set) {
        set = new Set<number>();
        accessibleItemsByGroup.set(m.lessonGroupId, set);
      }
      set.add(m.id);
    }
  }

  return computeEarnedDayKeys(
    {
      attempts: attempts.map((a) => ({
        phraseId: a.phraseId as number,
        score: a.score,
        createdAt: a.createdAt,
      })),
      groupByPhraseId,
      accessibleItemsByGroup,
      gameSessionDates,
      passedTestoutDates,
    },
    timeZone,
  );
}

/** loadEntitlements' resolution, minus Express. */
async function resolveEffectivePlan(
  userId: string,
  userRow: SubscriptionState | undefined,
): Promise<"free" | "one_language" | "plus"> {
  const state: SubscriptionState = userRow ?? {
    tier: "free",
    subscriptionStatus: null,
    trialEndsAt: null,
    currentPeriodEnd: null,
    chosenLanguage: null,
  };
  let resolved = resolvePlan(state);
  if (resolved.plan === "free" && userRow) {
    resolved = (await familyGrantedPlan(userId)) ?? resolved;
  }
  return resolved.plan;
}
