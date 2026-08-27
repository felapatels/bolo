// WHAT BOLO SAYS WHEN HE HEARD NOTHING.
//
// Asked for on 2026-08-27 (chat 12) after a silent hold: "I want to make Bolo
// funnier, like I know chicks that can speak louder than you... it should feel
// like a personality. Funny always, but not cheesy."
//
// THE FIRST LINE IS THE OWNER'S OWN, VERBATIM. It sets the register and the
// rest are written to hold to it. Four rules fall out of it:
//
// 1. SPECIFIC, NOT GENERIC. "Say that again!" is cheesy because it could come
//    from any app. "I heard a fan, a car, and my own heartbeat. Not you." could
//    only come from this bird.
// 2. HE IS A PARROT WITH OPINIONS, not a joke dispenser. The comedy is the
//    character being mildly put out, never a gag or a pun.
// 3. SELF-DEPRECATING AS OFTEN AS TEASING, and this one is not a style note.
//    Learners here are children, and a line that only ever mocks how quiet
//    they were would land badly on a shy one. Half of these blame his own ears.
// 4. NO EMOJI AND NO EXCLAMATION SPAM. The rest of the app's error copy leans
//    on both and it is exactly what makes copy read as cheesy.
//
// NEVER ABOUT ABILITY. Volume is fair game; pronunciation, accent and effort
// are not. A learner who was too quiet made no mistake, which is the whole
// reason this can be funny at all.
const LINES: readonly string[] = [
  // The owner's, unchanged.
  'I know chicks that can speak louder than you.',
  'Nothing. Not one peep. And I am the one with the beak.',
  'I heard a fan, a car, and my own heartbeat. Not you.',
  'Either you said nothing or my ears have finally gone. My money is on nothing.',
  'Louder please. I am a bird. My ears are the size of a seed.',
];

// Module-level, not persisted: stops the same line landing twice running in
// one sitting, which is what makes a rotation read as random rather than as a
// short list. Same idea as pickFunFact, and deliberately reset on restart.
let last: string | null = null;

/** A line for a hold that carried no speech, never the same one twice running. */
export function pickCantHearLine(): string {
  if (LINES.length === 0) return '';
  if (LINES.length === 1) return LINES[0]!;
  let next = LINES[Math.floor(Math.random() * LINES.length)]!;
  let guard = 0;
  while (next === last && guard < 10) {
    next = LINES[Math.floor(Math.random() * LINES.length)]!;
    guard += 1;
  }
  last = next;
  return next;
}

/** Exposed for tests: the copy rules above are worth asserting, not just stating. */
export const CANT_HEAR_LINES = LINES;
