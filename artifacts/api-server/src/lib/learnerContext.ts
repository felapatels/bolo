import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  attemptsTable,
  phrasesTable,
  userTokenStateTable,
} from "@workspace/db";
import { MASTERY_THRESHOLD } from "./progressMetrics";
import { OUTFIT_CATALOG } from "./outfits";
import { logger } from "./logger";

/**
 * WHAT BOLO CAN SEE ABOUT THE LEARNER RIGHT NOW.
 *
 * Three asks from 2026-08-27, and they are one feature rather than three:
 *  - "let bolo read how far a user has gone on the journey so he can help
 *    'Practice what I've learned'"
 *  - "he can drive people toward shopping. allow him to read the amount of
 *    chai you have and say, you have enough chai to buy a Pagdi for instance,
 *    tell the user how to get to it"
 *  - and the app-promotion nudges in the persona prompt, which are useless if
 *    Bolo cannot tell whether the learner has actually got anywhere.
 *
 * All three need the same thing: a small, cheap, current picture of this
 * learner, rendered into the prompt.
 *
 * SEPARATE FROM chatMemory ON PURPOSE. Memory is what Bolo was TOLD and it
 * persists; this is what is TRUE right now and it is recomputed every turn. A
 * chai balance in the memory table would be wrong within the hour, and a fact
 * about the learner's grandmother does not belong in a live snapshot.
 *
 * IT NEVER BLOCKS A TURN. Every query here is wrapped by the caller and any
 * failure degrades to an empty block: a learner would rather have a reply with
 * no context than an error with none.
 */

/**
 * How many mastered phrases Bolo is shown.
 *
 * 12. Enough that "practice what I've learned" has real material and that the
 * choice does not feel repetitive, few enough that the block stays a couple of
 * hundred tokens on a call that already carries a persona and a history.
 */
const MASTERED_SAMPLE = 12;

export interface LearnerSnapshot {
  masteredTotal: number;
  /** A sample of what the learner can already say, freshest first. */
  mastered: { native: string; romanized: string; english: string }[];
  chaiBalance: number;
  /** Catalog items this balance can actually cover right now. */
  affordable: { name: string; cost: number }[];
}

/**
 * Reads the learner's live picture for one language.
 *
 * MASTERY IS COMPUTED THE SAME WAY THE REST OF THE APP COMPUTES IT: best score
 * across attempts at or above MASTERY_THRESHOLD. Deriving it here with a
 * different rule is how the chat would end up congratulating somebody on a
 * phrase their progress page still calls unlearned.
 */
export async function loadLearnerSnapshot(
  userId: string,
  languageCode: string,
): Promise<LearnerSnapshot> {
  // Best score per phrase, for this language's phrases only, mastered only.
  // Aggregated in SQL rather than pulling every attempt back: a long-standing
  // learner has thousands, and this runs on every single chat turn.
  const masteredRows = await db
    .select({
      phraseId: attemptsTable.phraseId,
      best: sql<number>`max(${attemptsTable.score})`,
      lastAt: sql<Date>`max(${attemptsTable.createdAt})`,
    })
    .from(attemptsTable)
    .innerJoin(phrasesTable, eq(phrasesTable.id, attemptsTable.phraseId))
    .where(
      and(
        eq(attemptsTable.userId, userId),
        eq(phrasesTable.languageCode, languageCode),
      ),
    )
    .groupBy(attemptsTable.phraseId)
    .having(sql`max(${attemptsTable.score}) >= ${MASTERY_THRESHOLD}`)
    .orderBy(desc(sql`max(${attemptsTable.createdAt})`))
    .limit(MASTERED_SAMPLE);

  const ids = masteredRows
    .map((r) => r.phraseId)
    .filter((id): id is number => id != null);

  const total = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(
      db
        .select({ phraseId: attemptsTable.phraseId })
        .from(attemptsTable)
        .innerJoin(phrasesTable, eq(phrasesTable.id, attemptsTable.phraseId))
        .where(
          and(
            eq(attemptsTable.userId, userId),
            eq(phrasesTable.languageCode, languageCode),
          ),
        )
        .groupBy(attemptsTable.phraseId)
        .having(sql`max(${attemptsTable.score}) >= ${MASTERY_THRESHOLD}`)
        .as("m"),
    );

  const phraseRows =
    ids.length > 0
      ? await db
          .select({
            id: phrasesTable.id,
            native: phrasesTable.nativeScript,
            romanized: phrasesTable.romanized,
            english: phrasesTable.english,
          })
          .from(phrasesTable)
          .where(inArray(phrasesTable.id, ids))
      : [];
  const byId = new Map(phraseRows.map((p) => [p.id, p]));

  const tokenRow = await db
    .select({ balance: userTokenStateTable.balance })
    .from(userTokenStateTable)
    .where(eq(userTokenStateTable.userId, userId))
    .limit(1);
  const chaiBalance = tokenRow[0]?.balance ?? 0;

  const affordable = OUTFIT_CATALOG.filter((o) => o.cost <= chaiBalance).map(
    (o) => ({ name: o.name, cost: o.cost }),
  );

  return {
    masteredTotal: total[0]?.n ?? 0,
    // Ordered by the mastered query, so freshest first survives the join.
    mastered: ids
      .map((id) => byId.get(id))
      .filter((p): p is NonNullable<typeof p> => p != null)
      .map((p) => ({
        native: p.native,
        romanized: p.romanized ?? "",
        english: p.english ?? "",
      })),
    chaiBalance,
    affordable,
  };
}

/**
 * Renders the snapshot into the user prompt.
 *
 * IN THE USER MESSAGE, LIKE THE MEMORY AND SCENARIO BLOCKS, so the static
 * persona stays byte-identical and OpenAI's prompt cache keeps hitting.
 *
 * SAYS WHAT BOLO MAY DO WITH EACH PART, because a bare data dump gets recited.
 * The phrases are for practising; the chai is for one nudge when there is
 * something the learner can actually afford, never a sales pitch; and a
 * learner at zero is told nothing at all rather than being nagged toward a
 * shop they cannot use.
 */
export function buildLearnerContextBlock(snap: LearnerSnapshot): string {
  const parts: string[] = [];

  if (snap.mastered.length > 0) {
    const lines = snap.mastered
      .map((p) =>
        p.romanized
          ? `- ${p.native} (${p.romanized}) = ${p.english}`
          : `- ${p.native} = ${p.english}`,
      )
      .join("\n");
    parts.push(
      `This learner has mastered ${snap.masteredTotal} phrase(s) on their journey so far. Their most recent are:\n${lines}\n` +
        "If they ask to practise what they have learned, use THESE, one at a time, in conversation rather than as a list or a quiz. You may also weave them into ordinary chat so they meet them again by accident.",
    );
  }

  if (snap.chaiBalance > 0 && snap.affordable.length > 0) {
    const names = snap.affordable
      .slice(0, 4)
      .map((a) => `${a.name} (${a.cost})`)
      .join(", ");
    parts.push(
      `This learner has ${snap.chaiBalance} chai saved up, which is enough for: ${names}. ` +
        "ONCE IN A WHILE, and only at a natural lull, you may mention that they have enough chai for one of these and that the Bolo Bazaar is on the Home screen. Say it once and drop it; never push it twice in a conversation and never make it the whole reply.",
    );
  } else if (snap.chaiBalance > 0) {
    parts.push(
      `This learner has ${snap.chaiBalance} chai saved up, not yet enough for anything in the Bolo Bazaar. Do not raise the Bazaar.`,
    );
  }

  if (parts.length === 0) return "";
  return parts.join("\n\n") + "\n\n";
}

/** Loads and renders in one call, degrading to an empty block on any failure. */
export async function learnerContextBlockFor(
  userId: string,
  languageCode: string,
): Promise<string> {
  try {
    return buildLearnerContextBlock(
      await loadLearnerSnapshot(userId, languageCode),
    );
  } catch (err) {
    logger.warn({ err, userId }, "learner context load failed; continuing without");
    return "";
  }
}
