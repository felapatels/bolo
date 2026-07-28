// Cleanup of stale DEV-instance Clerk cookies on the production domain.
//
// Why: before July 28, 2026 the production domain briefly served a bundle
// keyed to the DEV Clerk instance (pk_test). Dev-instance clerk-js writes its
// state as JS-visible cookies on the app's apex domain (__client,
// __clerk_db_jwt*, Domain=.bolo-india.app). Browsers that visited during that
// window kept sending those stale cookies to clerk.bolo-india.app, which
// poisons the production flows: OAuth callbacks fail with
// err_code=authorization_invalid and email/password sign-ups hang silently.
//
// PRIMARY GATE — detect, then purge. We only purge when a cookie that can
// ONLY come from the dev era is visible. Distinguishers:
//   - __client:        the real production __client is HttpOnly and scoped to
//                      clerk.bolo-india.app, so it is invisible to
//                      document.cookie on the apex. Only dev-instance clerk-js
//                      stores the client JWT as a JS-visible apex cookie.
//   - __clerk_db_jwt*: URL-based session syncing, development instances only.
//                      A pk_live production instance never sets these.
// Cookies that are NOT distinguishers (production legitimately sets them
// JS-visible on the apex, so their presence must never trigger a purge):
//   __session (the session JWT written by clerk-js) and __client_uat*.
// They are only cleared as part of a triggered purge, because a session
// minted against the dev client is itself invalid.
//
// A healthy browser has no dev-era cookies -> the purge never runs, no
// persistent marker required. The purge is also self-terminating: it deletes
// its own trigger cookies, so it cannot loop even with zero storage.
const DEV_TRIGGER_MATCHERS = [/^__client$/, /^__clerk_db_jwt/] as const;

const PURGE_MATCHERS = [
  /^__client$/,
  /^__client_uat/,
  /^__clerk_db_jwt/,
  /^__clerk_handshake/,
  /^__session$/,
] as const;

// SECONDARY GATE (belt and braces): a first-party marker COOKIE — not
// localStorage, which privacy extensions can silently make non-persistent
// (setItem "succeeds" but nothing survives a reload, which previously made
// the purge fire on every load and destroy fresh sessions).
const MARKER_NAME = "bolo_clerk_dev_cleanup";
const MARKER_GENERATION = "v2";

function markerAttributes(prodDomain: string): string {
  // Domain-scoped so apex and www share one marker; Secure because the prod
  // site is HTTPS-only. One year.
  return `max-age=31536000; path=/; domain=.${prodDomain}; SameSite=Lax; Secure`;
}

function visibleCookieNames(): string[] {
  return document.cookie
    .split(";")
    .map((c) => c.split("=")[0]?.trim())
    .filter((n): n is string => Boolean(n));
}

function hasMarker(): boolean {
  return document.cookie
    .split(";")
    .some((c) => c.trim() === `${MARKER_NAME}=${MARKER_GENERATION}`);
}

export function cleanupStaleDevClerkCookies(prodDomain: string): void {
  const host = window.location.hostname.toLowerCase();
  if (host !== prodDomain && host !== `www.${prodDomain}`) return;

  const names = visibleCookieNames();
  const hasDevRelics = names.some((name) =>
    DEV_TRIGGER_MATCHERS.some((re) => re.test(name)),
  );
  if (!hasDevRelics) return;
  if (hasMarker()) return;

  // TERTIARY GATE — write-probe before any destructive delete. Write the
  // marker FIRST and read it back. If it doesn't stick (extension blocks or
  // virtualizes cookie writes), our deletions would likely be blocked too and
  // we would have no persistent guard, so abort without touching anything.
  // This closes the residual loop: a purge can only run when cookie writes
  // demonstrably work, in which case either the trigger deletion succeeds
  // (self-terminating) or the marker persists (guarded).
  document.cookie = `${MARKER_NAME}=${MARKER_GENERATION}; ${markerAttributes(prodDomain)}`;
  if (!hasMarker()) return;

  for (const name of names) {
    if (!PURGE_MATCHERS.some((re) => re.test(name))) continue;
    // Expire under every domain/path scope the dev era could have used.
    const expiry = "expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    document.cookie = `${name}=; ${expiry}`;
    document.cookie = `${name}=; ${expiry}; domain=${prodDomain}`;
    document.cookie = `${name}=; ${expiry}; domain=.${prodDomain}`;
  }
}
