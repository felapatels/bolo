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
];

/** Follow-ups, shown only once Bolo has said something to follow up on. */
export const CHAT_FOLLOWUP_CHIPS: readonly string[] = [
  'Say that slower',
  'What does that mean?',
  'Use it in a sentence',
  'Ask me another',
];

/** Which set belongs on screen, given how much has been said. */
export function chatChipsFor(messageCount: number): readonly string[] {
  return messageCount === 0 ? CHAT_STARTER_CHIPS : CHAT_FOLLOWUP_CHIPS;
}
