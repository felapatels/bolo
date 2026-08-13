import { setFailedResponseObserver } from '@workspace/api-client-react';
import { Sentry } from '@/lib/sentry';

/**
 * Diagnosing API failures from the outside.
 *
 * Apple rejected build 34 because the Settings screen "shows an error message"
 * on a brand-new Sign in with Apple account — and nobody could say WHICH
 * request failed or with what status, because the app threw that away: one
 * generic "check your connection" line, no Sentry event, no breadcrumb.
 *
 * Two rules come out of that (they mirror lib/authErrors.ts for auth flows):
 *
 * 1. NO ANONYMOUS FAILURES: a visible API error state must carry the failing
 *    endpoint and status in the copy itself, so a reviewer's screenshot is
 *    diagnostic on its own, and must reach Sentry.
 * 2. A SIGN-IN PROBLEM IS NOT A CONNECTION PROBLEM: telling a signed-out-ish
 *    learner to "check your connection" sends them down the wrong path.
 *
 * PII: only method, path (query string stripped), status, and the server's
 * auth-reason headers ever leave the device — never bodies, tokens, or
 * emails. lib/sentry.ts scrubbing is the backstop, not the primary defense.
 */

export type ApiFailureKind = 'auth' | 'connection' | 'server' | 'client';

/**
 * HTTP status of an `ApiError`, or null for a transport-level failure
 * (network down, DNS, timeout, abort).
 *
 * Duck-typed rather than `instanceof ApiError`: the shared client can be
 * present as more than one module instance (and is wholesale-mocked in tests),
 * which makes `instanceof` an unreliable gate for something whose whole job is
 * to describe failures.
 */
export function apiFailureStatus(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null;
  const candidate = err as { name?: unknown; status?: unknown };
  if (candidate.name !== 'ApiError') return null;
  return typeof candidate.status === 'number' ? candidate.status : null;
}

export function apiFailureKind(err: unknown): ApiFailureKind {
  const status = apiFailureStatus(err);
  if (status === null) return 'connection';
  if (status === 401 || status === 403) return 'auth';
  if (status >= 500) return 'server';
  return 'client';
}

/**
 * The failing endpoint as a stable, PII-free path: query string dropped, host
 * dropped from `/api/...` onwards. Null when the error carries no URL.
 */
export function apiFailureEndpoint(err: unknown): string | null {
  const url = (err as { url?: unknown } | null)?.url;
  if (typeof url !== 'string' || url.length === 0) return null;
  return endpointPath(url);
}

function endpointPath(url: string): string {
  const withoutQuery = url.split('?')[0];
  const apiIndex = withoutQuery.indexOf('/api/');
  if (apiIndex >= 0) return withoutQuery.slice(apiIndex);
  const schemeIndex = withoutQuery.indexOf('://');
  if (schemeIndex < 0) return withoutQuery;
  const pathIndex = withoutQuery.indexOf('/', schemeIndex + 3);
  return pathIndex >= 0 ? withoutQuery.slice(pathIndex) : withoutQuery;
}

/**
 * Response headers that state WHY a request was rejected.
 *
 * Clerk sets `x-clerk-auth-reason` (`session-token-and-uat-missing`,
 * `token-expired`, `jwk-kid-mismatch`, ...) — that single string separates
 * "the app sent no token" from "the app signed into a different Clerk instance
 * than the server verifies against".
 *
 * `x-bolo-auth-error` is our own, set by the api-server's unreadable-token
 * guard for the case Clerk throws on instead of classifying (a token it cannot
 * decode). Both are read, so the reason survives whichever side rejected.
 */
const AUTH_REASON_HEADERS = ['x-clerk-auth-reason', 'x-bolo-auth-error'];

export function authFailureReason(err: unknown): string | null {
  const headers = (err as { headers?: { get?: unknown } } | null)?.headers;
  if (!headers || typeof headers.get !== 'function') return null;
  // Invoked THROUGH the headers object: a real `Headers` instance throws
  // "Illegal invocation" if its `get` is called detached.
  const get = headers.get as (this: unknown, name: string) => string | null;
  for (const name of AUTH_REASON_HEADERS) {
    const reason = get.call(headers, name);
    if (typeof reason === 'string' && reason.length > 0) return reason;
  }
  return null;
}

/** Learner-facing copy: what went wrong and what they can do about it. */
export function apiFailureMessage(err: unknown): string {
  switch (apiFailureKind(err)) {
    case 'auth':
      return "Bolo couldn't confirm your sign-in 🥭 — try signing out and signing back in.";
    case 'connection':
      return "Bolo couldn't reach the internet 🥭 — check your connection and try again.";
    case 'server':
      return 'Bolo is having a wobble on our side 🥭 — please try again in a moment.';
    case 'client':
      return "Bolo couldn't load this right now 🥭 — please try again.";
  }
}

/**
 * The one-line technical footnote shown UNDER the friendly message. Deliberately
 * user-visible: a screenshot from an App Review reviewer (or any learner) then
 * names the failing request, which is exactly what was missing when build 34
 * was rejected.
 */
export function apiFailureDetail(err: unknown): string {
  const status = apiFailureStatus(err);
  const endpoint = apiFailureEndpoint(err) ?? 'request';
  if (status === null) return `${endpoint} — no response (network)`;
  const reason = authFailureReason(err);
  return reason
    ? `${endpoint} — HTTP ${status} · ${reason}`
    : `${endpoint} — HTTP ${status}`;
}

/**
 * Report a failed API call that the learner can SEE (an error state), with the
 * status, endpoint and Clerk reason attached. `context` names the surface
 * (e.g. 'account.load') so the Sentry issue groups per screen.
 */
export function reportApiFailure(context: string, err: unknown): void {
  const status = apiFailureStatus(err);
  const endpoint = apiFailureEndpoint(err);
  const kind = apiFailureKind(err);
  const reason = authFailureReason(err);
  const exception =
    err instanceof Error
      ? err
      : new Error(`${context} failed: ${apiFailureDetail(err)}`);
  Sentry.captureException(exception, {
    tags: {
      apiContext: context,
      apiFailureKind: kind,
      httpStatus: status === null ? 'network' : String(status),
    },
    extra: {
      apiContext: context,
      endpoint,
      status,
      authReason: reason,
      detail: apiFailureDetail(err),
    },
  });
}

/**
 * Leave a Sentry breadcrumb for EVERY non-2xx API response, whether or not it
 * surfaces to the learner. Without this, a visible error arrives in Sentry with
 * no trace of the requests that led to it.
 *
 * Called once at app start (app/_layout.tsx); a no-op when no DSN is set,
 * because Sentry itself is then uninitialized.
 */
export function installApiFailureBreadcrumbs(): void {
  setFailedResponseObserver((info) => {
    const endpoint = endpointPath(info.url);
    const reason = authFailureReason({ headers: info.headers });
    Sentry.addBreadcrumb({
      category: 'http',
      type: 'http',
      level: info.status >= 500 ? 'error' : 'warning',
      message: `${info.method} ${endpoint} → ${info.status}`,
      data: {
        method: info.method,
        endpoint,
        status: info.status,
        ...(reason ? { authReason: reason } : {}),
      },
    });
  });
}
