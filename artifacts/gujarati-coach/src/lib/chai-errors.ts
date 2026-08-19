// Refusal copy for Chai spends, shared by every surface that can spend.
//
// The server answers a refused spend with 409 and a machine code (never 402, // that envelope is the Plus paywall). Each code has one sentence here, so the
// wallet, the journey and the home banner cannot drift apart, and so a
// learner is never told to "try again" when trying again cannot work.
//
// Mobile twin: artifacts/bolo-mobile/lib/chai-errors.ts, keep both in step.
import { ApiError } from "@workspace/api-client-react";

type SpendRefusal = {
  error?: string;
  balance?: number;
  cost?: number;
} | null;

/** The 409 body, or null when this was not a spend refusal at all. */
function refusal(error: unknown): SpendRefusal {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  return (error.data ?? null) as SpendRefusal;
}

/**
 * Refusal copy for a streak repair. A broken streak is life happening, so
 * none of these may read as a telling-off, and none of them is a paywall
 * moment.
 *
 * The empty-pocket case names the gap and points at practice, because that is
 * the only way to earn Chai today. When in-app Chai purchases land, this is
 * the branch that grows a "Get Chai" action into the purchase screen, the
 * balance and cost it already carries are what that screen needs.
 */
export function repairErrorMessage(error: unknown): string {
  const data = refusal(error);
  if (data) {
    if (data.error === "insufficient_tokens") {
      return `Not enough Chai to mend. You have ${data.balance ?? 0}, mending costs ${data.cost ?? 0}. Keep practicing to earn more.`;
    }
    if (data.error === "repair_window_expired") {
      return "That day has slipped too far back to mend. Today starts the next one.";
    }
    if (data.error === "break_too_long") {
      return "That was a proper break, not a missed day. Today starts the next one.";
    }
    if (data.error === "no_break_to_repair") {
      return "Nothing to mend. Your streak is whole.";
    }
  }
  return "That repair did not go through. Try again in a moment.";
}
