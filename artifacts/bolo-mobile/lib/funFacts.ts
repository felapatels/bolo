// Curated "fun fact about India" dataset shown by FunFactLoader while the
// app waits on a network call. Facts are static bundled JSON — no network
// fetch — so they render instantly and work offline (mirrors how other
// curated content ships in this app; see memory: "Pre-curated lessons").
import indiaFacts from '@/data/indiaFacts.json';

const facts: string[] = indiaFacts;

// Module-level (not persisted): remembers the last fact shown so a learner
// bouncing between loading spots in the same session doesn't see the same
// fact twice in a row. Intentionally reset on app restart.
let lastFact: string | null = null;

/** Picks a random fun fact, avoiding an immediate repeat of the last one shown. */
export function pickFunFact(): string {
  if (facts.length === 0) return '';
  if (facts.length === 1) return facts[0];
  let next = facts[Math.floor(Math.random() * facts.length)];
  let guard = 0;
  while (next === lastFact && guard < 10) {
    next = facts[Math.floor(Math.random() * facts.length)];
    guard += 1;
  }
  lastFact = next;
  return next;
}
