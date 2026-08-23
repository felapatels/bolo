import * as SecureStore from 'expo-secure-store';
import { Sentry, sentryEnabled } from '@/lib/sentry';

// DIAGNOSTIC, added 2026-08-22 for the Android sign-out.
//
// Symptom: on Android, roughly 30 seconds after signing in, the session
// disappears inside a LIVE process. Not a crash (logcat shows no FATAL and
// the only process deaths are "remove task", i.e. the user swiping the app
// away) and not server-side (Clerk's own logs carry sign_in.created and
// session.created around every bounce and not one revocation).
//
// Why this file exists rather than a Sentry call at the redirect: Clerk's
// stock cache, node_modules/@clerk/expo/dist/token-cache/index.js, does this:
//
//     getToken: async (key) => {
//       try { return await getItemAsync(key, opts); }
//       catch { await deleteItemAsync(key, opts); return null; }
//     }
//
// A bare catch that DELETES the token and returns null. So a single transient
// SecureStore read failure is upgraded to a permanent sign-out, and the cause
// is swallowed on the way. By the time the layout notices `isSignedIn` went
// false the evidence has already been erased, which is precisely why nothing
// has ever reached Sentry.
//
// This cache behaves identically to Clerk's, including the delete, so it
// cannot change what the app does. It only reports the error first.
//
// PII: keys are Clerk's own cache keys (e.g. __clerk_client_jwt) and carry no
// user data. Token VALUES are never logged; only their length, which is what
// the expo-secure-store 2048 byte limit would show up in.

const SECURE_STORE_OPTS = {
  // Matches Clerk's own options exactly. Changing this would change which
  // reads succeed, and then this file would be an experiment rather than a
  // measurement.
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
} as const;

/** expo-secure-store rejects values above this on Android. */
const SECURE_STORE_VALUE_LIMIT_BYTES = 2048;

function report(
  operation: 'getToken' | 'saveToken' | 'clearToken',
  key: string,
  err: unknown,
  extra?: Record<string, unknown>,
): void {
  if (!sentryEnabled) return;
  const exception =
    err instanceof Error
      ? err
      : new Error(`Clerk token cache ${operation} failed: ${String(err)}`);
  Sentry.captureException(exception, {
    tags: { authContext: 'clerkTokenCache', cacheOp: operation },
    extra: { cacheOp: operation, cacheKey: key, ...extra },
  });
}

/**
 * Every cache operation leaves a breadcrumb, so the SessionVanishedError that
 * fires a moment later carries the exact sequence that preceded it.
 *
 * This is the second pass, 2026-08-22. The first only reported FAILURES, and
 * build 422 proved nothing failed: session.vanished fired with no token-cache
 * event beside it. So the remaining question is not "did storage break" but
 * "was the token deliberately cleared, or did the client stop reporting a
 * session while the token sat there untouched", and only a trail of
 * successful calls can tell those apart.
 *
 * Field names avoid the words "token" and "auth". Sentry's own default
 * server-side scrubbing strips keys containing either, and it ate tokenCacheOp,
 * tokenCacheKey and tokenBytes on build 423, leaving breadcrumbs that proved a
 * save happened but not which key or how big. Tags survived; extras and
 * breadcrumb data did not.
 *
 * Token VALUES never appear here. Presence and byte length only.
 */
function crumb(
  operation: 'getToken' | 'saveToken' | 'clearToken',
  key: string,
  data?: Record<string, unknown>,
): void {
  if (!sentryEnabled) return;
  Sentry.addBreadcrumb({
    category: 'clerk.tokenCache',
    level: operation === 'clearToken' ? 'warning' : 'info',
    message: `${operation} ${key}`,
    data: { cacheOp: operation, cacheKey: key, ...data },
  });
}

export const clerkTokenCache = {
  async getToken(key: string): Promise<string | null> {
    try {
      const value = await SecureStore.getItemAsync(key, SECURE_STORE_OPTS);
      crumb('getToken', key, { result: value ? 'hit' : 'miss' });
      return value;
    } catch (err) {
      // Report BEFORE the delete, because the delete is what makes this
      // permanent and unreadable afterwards.
      report('getToken', key, err);
      try {
        await SecureStore.deleteItemAsync(key, SECURE_STORE_OPTS);
      } catch {
        // Clerk ignores a failure here and so do we: the read already failed,
        // and a failed cleanup changes nothing the caller can act on.
      }
      return null;
    }
  },

  async saveToken(key: string, token: string): Promise<void> {
    // Byte length, not string length: the limit is on encoded bytes and a JWT
    // is ASCII, but this stays correct if that ever stops being true.
    const bytes =
      typeof TextEncoder !== 'undefined'
        ? new TextEncoder().encode(token).length
        : token.length;
    try {
      await SecureStore.setItemAsync(key, token, SECURE_STORE_OPTS);
      crumb('saveToken', key, { payloadBytes: bytes });
    } catch (err) {
      report('saveToken', key, err, {
        payloadBytes: bytes,
        overSecureStoreLimit: bytes > SECURE_STORE_VALUE_LIMIT_BYTES,
        secureStoreLimitBytes: SECURE_STORE_VALUE_LIMIT_BYTES,
      });
      // Rethrow: Clerk's cache returns the promise unguarded, so a rejection
      // is the existing behaviour and swallowing it here would be a change.
      throw err;
    }
  },

  async clearToken(key: string): Promise<void> {
    // Unconditional and BEFORE the delete. If Clerk is wiping its own token
    // 43 seconds into a session, this is the line that says so.
    crumb('clearToken', key);
    try {
      await SecureStore.deleteItemAsync(key, SECURE_STORE_OPTS);
    } catch (err) {
      report('clearToken', key, err);
    }
  },
};
