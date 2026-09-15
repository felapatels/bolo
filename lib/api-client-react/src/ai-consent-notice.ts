// Only the server's explicit consent refusal triggers this helper; other
// 403s, purchases and authentication errors keep their own handling.
let listener: (() => void) | null = null;
export function setAiConsentRequiredListener(next: (() => void) | null): void { listener = next; }
/**
 * True for the server's explicit AI consent refusal (403 with reason
 * "ai_consent_required"), read off a thrown ApiError. A screen that retries on
 * error must stop on this one: retrying cannot succeed until the learner
 * changes their answer, and the game voice screens used to re-ask forever
 * (2026-09-15, India's consent switch).
 */
export function isAiConsentRequiredError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: unknown; data?: unknown };
  if (e.status !== 403) return false;
  const data = e.data;
  return !!data && typeof data === "object" && "reason" in data && (data as { reason?: unknown }).reason === "ai_consent_required";
}

export function notifyAiConsentRequired(body: unknown): void {
  try {
    const data = typeof body === "string" ? JSON.parse(body) : body;
    if (data && typeof data === "object" && "reason" in data && data.reason === "ai_consent_required") listener?.();
  } catch { /* A helper notice must not replace the request's error handling. */ }
}
