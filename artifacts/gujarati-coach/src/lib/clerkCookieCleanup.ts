// One-time cleanup of stale DEV-instance Clerk cookies on the production domain.
//
// Why: before July 28, 2026 the production domain briefly served a bundle
// keyed to the DEV Clerk instance (pk_test). Dev-instance clerk-js writes its
// state as JS-visible cookies on the app's apex domain (__client, __client_uat*,
// __clerk_db_jwt*, Domain=.bolo-india.app). Browsers that visited during that
// window now send those stale cookies to clerk.bolo-india.app on every request,
// which poisons the production flows: OAuth callbacks fail with
// err_code=authorization_invalid (state belongs to a different client) and
// email/password sign-ups hang silently.
//
// Safety: the REAL production __client cookie is HttpOnly and scoped to
// clerk.bolo-india.app, so it is invisible to document.cookie here — any
// __client or __clerk_db_jwt* cookie this code can see on the apex is by
// definition a dev-era relic. __client_uat* are reset by the FAPI on the next
// response, so clearing them is harmless.
const STALE_COOKIE_MATCHERS = [
  /^__client$/,
  /^__client_uat/,
  /^__clerk_db_jwt/,
  /^__clerk_handshake/,
  /^__session$/,
] as const;

// Runs at most once per browser: the production __session / __client_uat
// cookies live on the same apex, so clearing on every load would sign users
// out repeatedly. One marker per cleanup generation.
const CLEANUP_MARKER = "bolo.clerkDevCookieCleanup.v1";

export function cleanupStaleDevClerkCookies(prodDomain: string): void {
  const host = window.location.hostname.toLowerCase();
  if (host !== prodDomain && host !== `www.${prodDomain}`) return;

  try {
    if (localStorage.getItem(CLEANUP_MARKER)) return;
    localStorage.setItem(CLEANUP_MARKER, "1");
  } catch {
    // Storage unavailable: skip the cleanup entirely. Without a durable
    // marker this would delete the production apex __session/__client_uat*
    // on EVERY load and repeatedly sign users out — worse than leaving the
    // stale dev cookies in place for this browser class.
    return;
  }

  const names = document.cookie
    .split(";")
    .map((c) => c.split("=")[0]?.trim())
    .filter((n): n is string => Boolean(n));

  for (const name of names) {
    if (!STALE_COOKIE_MATCHERS.some((re) => re.test(name))) continue;
    // Expire under every domain/path scope the dev era could have used.
    const expiry = "expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    document.cookie = `${name}=; ${expiry}`;
    document.cookie = `${name}=; ${expiry}; domain=${prodDomain}`;
    document.cookie = `${name}=; ${expiry}; domain=.${prodDomain}`;
  }
}
