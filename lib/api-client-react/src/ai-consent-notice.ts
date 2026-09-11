// Only the server's explicit consent refusal triggers this helper; other
// 403s, purchases and authentication errors keep their own handling.
let listener: (() => void) | null = null;
export function setAiConsentRequiredListener(next: (() => void) | null): void { listener = next; }
export function notifyAiConsentRequired(body: unknown): void {
  try {
    const data = typeof body === "string" ? JSON.parse(body) : body;
    if (data && typeof data === "object" && "reason" in data && data.reason === "ai_consent_required") listener?.();
  } catch { /* A helper notice must not replace the request's error handling. */ }
}
