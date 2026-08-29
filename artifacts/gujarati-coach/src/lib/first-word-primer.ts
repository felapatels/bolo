// THE FIRST-WORD LIGHTBOX, build 19. Mobile twin, which carries the full
// reasoning: artifacts/bolo-mobile/lib/firstWordPrimer.ts. Same copy, same
// two-way "first" test (this browser has not shown it, and the language's
// progress summary, when cached, reports zero attempts), same ordering: the
// practice page holds the score reveal and any unlocked badge behind the
// lightbox and releases both together when it is dismissed.

export const FIRST_WORD_PRIMER_KEY = "bolo.firstWordPrimerSeen";

export const FIRST_WORD_PRIMER_COPY = {
  title: "Your first word!",
  body: "Great job trying your first word. Scoring gets more accurate as you go: as you learn more, Bolo learns more about how you sound, and can score you more accurately.",
  cta: "Show me my score",
} as const;

export function loadFirstWordPrimerSeen(): boolean {
  try {
    return localStorage.getItem(FIRST_WORD_PRIMER_KEY) === "yes";
  } catch {
    // Unreadable storage reads as "seen": no lightbox beats one per attempt.
    return true;
  }
}

export function saveFirstWordPrimerSeen(): void {
  try {
    localStorage.setItem(FIRST_WORD_PRIMER_KEY, "yes");
  } catch {
    // Best-effort; the in-session hold still applies.
  }
}

/** The decision, pure. `totalAttempts` is undefined when nothing is cached. */
export function shouldShowFirstWordPrimer(input: {
  seenOnDevice: boolean;
  totalAttempts: number | undefined;
}): boolean {
  if (input.seenOnDevice) return false;
  if (input.totalAttempts !== undefined && input.totalAttempts > 0) return false;
  return true;
}
