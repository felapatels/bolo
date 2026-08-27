import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, chatMemoriesTable } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server/audio";
import { logger } from "./logger";

/**
 * WHAT BOLO REMEMBERS ABOUT A LEARNER, ACROSS SESSIONS.
 *
 * Asked for 2026-08-27. Before this, the client sent a rolling three-turn
 * window and nothing survived closing the app: parrotChat's own comment said
 * "no server-side chat history is persisted". Bolo met every learner for the
 * first time, every time.
 *
 * See the chat_memories table for why this stores DISTILLED FACTS rather than
 * a transcript. This file is the whole lifecycle: read them, put them in the
 * prompt, and write new ones after the turn.
 *
 * THE EXTRACTION NEVER BLOCKS A TURN. It is a second model call, and making
 * the learner wait for it would trade a feature they cannot see for latency
 * they can. `rememberFromTurn` is fired without awaiting, and every failure
 * path inside it is swallowed to a log: a chat turn must never fail because
 * the note-taking did.
 */

/**
 * The most memories one learner may hold.
 *
 * 40, and the number is doing two jobs. It is a PROMPT budget first: 40 short
 * sentences is roughly 500 tokens on every single turn, which is affordable,
 * and much past that the model starts to lose the recent ones among the old.
 * It is a STORAGE budget second, and the production database has a hard
 * 10 GiB ceiling with tts_cache at 98% of it, so nothing new gets to grow
 * without a bound.
 */
export const CHAT_MEMORY_CAP = 40;

/**
 * How many turns of context the extractor sees. Two: what the learner just
 * said and what Bolo said back. More would catch slower-burning facts and
 * would also cost more on every turn for a thinner return.
 */
const EXTRACTOR_MODEL = "gpt-4o-mini";

/** A memory as the prompt builder wants it. */
export interface ChatMemoryRow {
  id: number;
  memory: string;
}

/**
 * Loads a learner's memories, freshest last so the prompt reads chronologically.
 *
 * ORDERED BY lastUsedAt DESC FOR THE CAP, THEN REVERSED FOR THE PROMPT. If the
 * table ever holds more than the cap (a cap lowered later, a race between two
 * devices), the ones that survive into the prompt should be the ones actually
 * being used, not whichever the database happened to return.
 */
export async function loadChatMemories(userId: string): Promise<ChatMemoryRow[]> {
  const rows = await db
    .select({ id: chatMemoriesTable.id, memory: chatMemoriesTable.memory })
    .from(chatMemoriesTable)
    .where(eq(chatMemoriesTable.userId, userId))
    .orderBy(desc(chatMemoriesTable.lastUsedAt))
    .limit(CHAT_MEMORY_CAP);
  return rows.reverse();
}

/**
 * Marks memories as used, so pruning falls on the stale rather than the old.
 *
 * Fire-and-forget on purpose: a failed bump costs nothing but a slightly worse
 * pruning decision later, and it must not delay a reply.
 */
export function touchChatMemories(ids: number[]): void {
  if (ids.length === 0) return;
  void db
    .update(chatMemoriesTable)
    .set({ lastUsedAt: new Date() })
    .where(inArray(chatMemoriesTable.id, ids))
    .catch((err) => {
      logger.warn({ err }, "chat memory touch failed");
    });
}

/**
 * The block that goes into the user prompt.
 *
 * IN THE USER MESSAGE, NEVER THE SYSTEM PROMPT. BOLO_PERSONA_PROMPT is kept
 * byte-identical on every request to preserve OpenAI's prompt cache, and
 * per-learner text in it would break that for every learner at once. The
 * scenario block is placed the same way and for the same reason.
 *
 * Empty string when there is nothing remembered, so a brand-new learner's
 * prompt is byte-identical to what it was before this feature existed.
 */
export function buildMemoryBlock(memories: ChatMemoryRow[]): string {
  if (memories.length === 0) return "";
  const lines = memories.map((m) => `- ${m.memory}`).join("\n");
  return (
    "What you remember about this learner from before:\n" +
    lines +
    "\nUse these naturally when they are relevant. Do not list them back, " +
    "do not announce that you remembered, and never bring one up if it does " +
    "not fit what is being talked about right now.\n\n"
  );
}

const EXTRACTOR_SYSTEM = [
  "You keep notes for a language tutor about a learner they talk to regularly.",
  "From the exchange you are given, extract any DURABLE facts worth remembering next time.",
  "",
  "Return STRICT JSON: {\"memories\": [\"...\", \"...\"]}. Return {\"memories\": []} when there is nothing worth keeping, which is the common case.",
  "",
  "A fact is worth keeping only if it would still be true and still be useful next week:",
  "  - who they are and what is around them (family, pets, where they live, their job or school)",
  "  - why they are learning, and any deadline or trip driving it",
  "  - what they find hard or easy in the language, and mistakes they repeat",
  "  - their interests, so a lesson can use examples they care about",
  "",
  "Never keep:",
  "  - anything about this one conversation ('asked how to say hello', 'said namaste')",
  "  - pleasantries, greetings, small talk, or the tutor's own words",
  "  - anything you are guessing at rather than being told",
  "  - contact details, addresses, passwords, payment details, or health details",
  "",
  "MANY OF THESE LEARNERS ARE CHILDREN. Keep nothing that would be unwelcome in a note a teacher leaves for the next teacher.",
  "",
  "Each memory: ONE short sentence, English, second person, under 120 characters.",
  "Example: \"You are learning Gujarati for your grandmother, who lives in Rajkot.\"",
  "Do not repeat anything already in the existing notes you are shown.",
].join("\n");

/** Hard ceiling on one memory, matching what the extractor is told. */
const MAX_MEMORY_CHARS = 120;
/** How many new memories one turn may add, so a chatty turn cannot flood. */
const MAX_NEW_PER_TURN = 3;

/**
 * Extracts durable facts from one exchange and stores the new ones.
 *
 * NOT AWAITED BY THE TURN. Call it and walk away; every failure inside is
 * logged rather than thrown, because a chat reply must never fail because
 * the note-taking did.
 */
export async function rememberFromTurn(input: {
  userId: string;
  languageCode: string;
  transcript: string;
  reply: string;
  existing: ChatMemoryRow[];
}): Promise<void> {
  const { userId, languageCode, transcript, reply, existing } = input;

  // Nothing said, nothing to remember. Also skips the unclear-speech turns,
  // where the transcript is the placeholder rather than the learner's words.
  if (!transcript || transcript.trim().length < 8) return;

  try {
    const existingBlock =
      existing.length > 0
        ? `Existing notes (do not repeat these):\n${existing
            .map((m) => `- ${m.memory}`)
            .join("\n")}`
        : "Existing notes: none yet.";

    const completion = await openai.chat.completions.create({
      model: EXTRACTOR_MODEL,
      response_format: { type: "json_object" },
      // Low but not zero: the task is extraction, not invention.
      temperature: 0.2,
      max_tokens: 300,
      messages: [
        { role: "system", content: EXTRACTOR_SYSTEM },
        {
          role: "user",
          content: `${existingBlock}\n\nLearner said: ${transcript}\nTutor replied: ${reply}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    if (!raw) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // A model that ignored response_format is a miss, not an incident.
      logger.warn({ raw: raw.slice(0, 200) }, "chat memory extractor returned non-JSON");
      return;
    }

    const list = (parsed as { memories?: unknown })?.memories;
    if (!Array.isArray(list)) return;

    const seen = new Set(existing.map((m) => m.memory.trim().toLowerCase()));
    const fresh: string[] = [];
    for (const item of list) {
      if (typeof item !== "string") continue;
      const text = item.trim();
      if (!text || text.length > MAX_MEMORY_CHARS) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      fresh.push(text);
      if (fresh.length >= MAX_NEW_PER_TURN) break;
    }
    if (fresh.length === 0) return;

    // onConflictDoNothing, not a pre-select: two devices in the same
    // conversation can extract the same fact at the same moment, and the
    // unique constraint is the only thing that actually settles that.
    await db
      .insert(chatMemoriesTable)
      .values(
        fresh.map((memory) => ({
          userId,
          memory,
          sourceLanguage: languageCode,
        })),
      )
      .onConflictDoNothing();

    await pruneChatMemories(userId);
  } catch (err) {
    logger.warn({ err, userId }, "chat memory extraction failed");
  }
}

/**
 * Drops the least recently used memories once a learner is over the cap.
 *
 * BY lastUsedAt, NOT createdAt. A fact from the first week that still comes up
 * every session is worth more than one from last Tuesday that never has.
 */
export async function pruneChatMemories(userId: string): Promise<void> {
  const count = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(chatMemoriesTable)
    .where(eq(chatMemoriesTable.userId, userId));
  const total = count[0]?.n ?? 0;
  if (total <= CHAT_MEMORY_CAP) return;

  const doomed = await db
    .select({ id: chatMemoriesTable.id })
    .from(chatMemoriesTable)
    .where(eq(chatMemoriesTable.userId, userId))
    .orderBy(asc(chatMemoriesTable.lastUsedAt))
    .limit(total - CHAT_MEMORY_CAP);
  if (doomed.length === 0) return;

  await db.delete(chatMemoriesTable).where(
    and(
      eq(chatMemoriesTable.userId, userId),
      inArray(
        chatMemoriesTable.id,
        doomed.map((d) => d.id),
      ),
    ),
  );
}

/** Wipes everything Bolo remembers about one learner. */
export async function forgetChatMemories(userId: string): Promise<number> {
  const gone = await db
    .delete(chatMemoriesTable)
    .where(eq(chatMemoriesTable.userId, userId))
    .returning({ id: chatMemoriesTable.id });
  return gone.length;
}
