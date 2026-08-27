/**
 * THE QUICK CHIPS ON THE BOLO CHAT PAGE. Parked as work-queue item 11 and asked
 * for on 2026-08-26: "might as well add the quick chips here".
 *
 * Web twin: src/lib/chat-chips.ts. Keep the copy in step.
 *
 * TWO SETS, AND THAT IS THE WHOLE DESIGN NOTE. A learner staring at an empty
 * screen needs a reason to open their mouth; a learner three turns in needs a
 * way to push on what Bolo just said. Offering "say that again" to somebody who
 * has heard nothing is nonsense, and offering "teach me a phrase" for the
 * fifth time is wallpaper. So the starters retire the moment there is a
 * conversation, and the follow-ups only exist once there is something to follow.
 *
 * THEY ARE IN ENGLISH ON PURPOSE. The chip is scaffolding for somebody who does
 * not yet have the words: putting the ask in the language being learned would
 * make the shortcut need the skill it exists to reach.
 *
 * THEY SEND, THEY DO NOT COMPOSE. Tapping one asks it outright rather than
 * dropping it in the box to be edited, because a chip that needs a second tap
 * is slower than typing for anybody who could already type it.
 */

/** Openers, shown only while the conversation is empty. */
export const CHAT_STARTER_CHIPS: readonly string[] = [
  'Teach me a phrase',
  'How do I say hello?',
  'Ask me a question',
  'What should I learn first?',
  // Added 2026-08-27 on the owner's "add more suggestions". The four above
  // are all "give me something"; these give the learner a way to steer the
  // conversation rather than only to receive it.
  "Let's talk using only words I know",
  'Get me ready for my next stop',
  'Teach me restaurant phrases',
  'How do I greet an elder politely?',
  'What did I get wrong last time?',
  'Tell me a fun fact',
  // The owner's, 2026-08-27: "since bolo can answer math and history
  // questions, its legit". It is also the one starter that is not about
  // language at all, which is the point: it invites a learner who came for
  // homework and stays for the Hindi.
  'Help me with homework',
];

/** Follow-ups, shown only once Bolo has said something to follow up on. */
export const CHAT_FOLLOWUP_CHIPS: readonly string[] = [
  'Say that slower',
  'What does that mean?',
  'Use it in a sentence',
  'Ask me another',
  // Same pass. A follow-up is a way to PUSH on what was just said, so these
  // are all repair and drill moves rather than new topics.
  'Say that again',
  'How do I write that?',
  'Is that formal or casual?',
  'Quiz me on that',
  'Give me an easier one',
  'What else could I say?',
];

/**
 * A DETERMINISTIC SHUFFLE, seeded by the caller.
 *
 * The owner asked for the pills to "shuffle randomly" (2026-08-27) now that
 * there are ten per set rather than four and only three or four fit on screen
 * at once: a fixed order means the last six are never seen by anybody who
 * does not scroll.
 *
 * SEEDED, NOT Math.random(). An unseeded shuffle would reorder the row on
 * every single React render, so a chip would move out from under a finger
 * mid-tap. The seed is the conversation length, so the order is stable for
 * the whole of one turn and changes when, and only when, the turn does.
 */
function shuffleSeeded<T>(items: readonly T[], seed: number): T[] {
  const out = items.slice();
  // Mulberry32: small, dependency-free, and good enough to order ten chips.
  let s = (seed + 0x6d2b79f5) >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Which set belongs on screen, given how much has been said, shuffled so the
 * whole set gets seen over a conversation rather than only its first four.
 * The row scrolls horizontally, so nothing is hidden either way; this is
 * about what a learner meets without having to go looking.
 */
export function chatChipsFor(messageCount: number): readonly string[] {
  const set = messageCount === 0 ? CHAT_STARTER_CHIPS : CHAT_FOLLOWUP_CHIPS;
  return shuffleSeeded(set, messageCount);
}
