/**
 * A PUBLISH MUST NOT WHITE-SCREEN THE TABS THAT ARE ALREADY OPEN.
 *
 * Reported 2026-09-06, the owner, on a brand new account: "when i first logged
 * in i got stuck on a blank white page until i refreshed." It is not a sign-up
 * bug. It is what this app does to EVERY open tab whenever we publish, and the
 * sign-up flow only made it certain, because finishing a sign-up navigates to
 * /welcome, a lazy route the tab has never loaded.
 *
 * THE MECHANISM, TRACED RATHER THAN GUESSED. Every route past the landing is a
 * `lazyRoute`, so visiting one fetches a hashed chunk named by the index.html
 * that tab loaded. A publish rewrites every hash. The old chunk is then gone,
 * and the host does not answer 404 for it: Replit's router falls the request
 * through to the SPA catch-all, so `/assets/account-CDuOgsCI.js` comes back
 * `200 text/html`, twelve kilobytes of index.html. Verified against production
 * the same day, on four chunks from the previous build, all four identical.
 *
 * A dynamic import of HTML rejects. `React.lazy` turns that rejection into a
 * render-phase throw, and Suspense does not catch throws, only promises. With
 * no error boundary above it the whole tree unmounts, which is the white page.
 * The refresh that "fixes" it is simply the browser fetching a fresh
 * index.html with hashes that exist.
 *
 * THE FIX IS TO RELOAD, ONCE, AND SAY NOTHING. There is nothing to recover:
 * the code this tab wants no longer exists on the server, and the page it
 * wants is one navigation away in a build that does. A reload is what the
 * owner did by hand.
 *
 * THE COOLDOWN IS THE WHOLE OF THE SAFETY. A reload loop is far worse than a
 * white page, so a second reload inside the window is refused and the error is
 * allowed to surface instead. The marker is sessionStorage, so it dies with
 * the tab and cannot poison the next visit, and every access is wrapped:
 * private mode throws on read.
 */

const RELOAD_KEY = "bolo.staleBuildReloadAt";
/** Long enough to cover a slow reload, short enough that a genuine second
 *  stale-chunk hit an hour later still recovers by itself. */
const COOLDOWN_MS = 30_000;

/** The shapes browsers use for a dynamic import that did not come back as a
 *  module. Chrome, Safari and Firefox all word it differently, and the Vite
 *  helper adds its own, so this matches on the words they share. */
const STALE_CHUNK_RE =
  /dynamically imported module|importing a module script failed|error loading dynamically imported|failed to fetch dynamically|expected a javascript(-or-wasm)? module|mime type/i;

export function looksLikeStaleChunk(error: unknown): boolean {
  if (error == null) return false;
  const message =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === "string"
        ? error
        : "";
  return STALE_CHUNK_RE.test(message);
}

function reloadedRecently(): boolean {
  try {
    const at = Number(window.sessionStorage.getItem(RELOAD_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < COOLDOWN_MS;
  } catch {
    // Private mode: no marker means no loop protection, so refuse the reload
    // rather than risk one. A white page is recoverable by hand; a loop is not.
    return true;
  }
}

/**
 * Reload the tab because its build is gone, unless one has just been tried.
 * Returns whether the reload was started, so a caller can fall back to showing
 * something rather than assuming the page is about to go away.
 */
export function reloadForStaleBuild(): boolean {
  if (reloadedRecently()) return false;
  try {
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/**
 * Catch the failure at the two places it surfaces before React ever sees it:
 * Vite's own `vite:preloadError`, which its `__vitePreload` helper fires for
 * exactly this, and a plain unhandled rejection for any import it did not
 * wrap. `preventDefault` on the Vite event stops it rethrowing into an
 * uncaught error we would only see in Sentry.
 *
 * The error boundary in App.tsx is the third net, for the throw that lands in
 * a render rather than in a listener.
 */
export function installStaleBuildRecovery(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    reloadForStaleBuild();
  });
  window.addEventListener("unhandledrejection", (event) => {
    if (!looksLikeStaleChunk(event.reason)) return;
    if (reloadForStaleBuild()) event.preventDefault();
  });
}
