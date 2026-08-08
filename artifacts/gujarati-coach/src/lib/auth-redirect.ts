// `?redirect_url=` on the Clerk auth screens, so a landing page can send a
// visitor back to itself once their account exists (the referral link uses
// this). The value is attacker-controllable: it rides in a link that gets
// shared around, which is exactly the shape of an open redirect.

/**
 * Resolves a `redirect_url` query param to a safe, same-origin app URL, or
 * undefined if it points anywhere else.
 *
 * Validation is by canonical origin, NOT by prefix. A prefix test like
 * `startsWith("/") && !startsWith("//")` looks right and is not: the WHATWG
 * URL parser treats a backslash as a slash for http(s), so `/\evil.example`
 * and its encoded form `/%5Cevil.example` both resolve to the scheme-relative
 * external target `//evil.example` while passing the prefix test.
 */
export function safeAuthRedirect(
  search: string,
  basePath: string,
): string | undefined {
  const raw = new URLSearchParams(search).get("redirect_url");
  if (!raw) return undefined;

  const origin = window.location.origin;
  let parsed: URL;
  try {
    parsed = new URL(raw, origin);
  } catch {
    return undefined;
  }
  if (parsed.origin !== origin) return undefined;

  // Rebuild from the parsed parts rather than echoing the raw string, so any
  // normalization the parser applied is what actually gets used.
  return `${basePath}${parsed.pathname}${parsed.search}`;
}
