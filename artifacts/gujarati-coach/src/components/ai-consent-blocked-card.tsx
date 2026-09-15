// A VOICE GAME STOPS WHEN THE LEARNER HAS SAID NO TO AI (2026-09-15).
//
// Web twin of bolo-mobile components/games/AiConsentBlockedCard.tsx. India
// turned its consent switch on, and the server refuses a take from a learner
// who declined (useSpeakAndScore returns "consent_required"). Last Call and
// Answer Back used to treat any refusal as "Scoring hit a snag", re-ask, and
// hit the same refusal forever (ledger X101, trap 5). This card says what is off
// and where to change it, over a round that stays paused.

import { Link } from "wouter";

export function AiConsentBlockedCard({
  gameName,
  onLeave,
  testId,
}: {
  gameName: string;
  onLeave: () => void;
  testId?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/45 p-5"
      role="alertdialog"
      aria-labelledby="ai-consent-blocked-title"
      data-testid={testId}
    >
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 text-center">
        <h2 id="ai-consent-blocked-title" className="text-2xl font-extrabold text-foreground">
          AI permission is off
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {`${gameName} listens to you with AI, and you have turned that off. Turn AI permission on in Account to play.`}
        </p>
        <Link
          href="/account"
          className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-primary py-3.5 text-base font-black text-primary-foreground"
        >
          Open Account
        </Link>
        <button
          type="button"
          onClick={onLeave}
          className="mt-3 inline-flex w-full items-center justify-center rounded-2xl border border-border bg-card py-3 text-base font-bold text-foreground hover:bg-muted"
        >
          Leave
        </button>
      </div>
    </div>
  );
}
