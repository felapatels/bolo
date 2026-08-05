import { authErrorMessage, reportAuthError } from '@/lib/authErrors';

// Escape hatch for a pending Clerk sign-up attempt (iOS build 34 incident: a
// learner typed the wrong email, reached the code screen, and could not get
// out — force-quit, reinstall, and sign-out all returned to the same screen).
//
// WHY THE ATTEMPT SURVIVES EVERYTHING: the pending sign-up lives on the
// server-side Clerk Client, and the credential that re-attaches the app to
// that client (`__clerk_client_jwt`) is kept in the iOS Keychain by the Expo
// token cache. Keychain items outlive app deletion, so a reinstall rehydrates
// the same stuck attempt. Sign-out cannot help either: it returns early when
// there is no session, and with a session it takes Clerk's
// `client.removeSessions()` branch, which deliberately preserves the client.
//
// `client.destroy()` is the only call that resets `client.signUp`; it also
// clears the cached client JWT through the token cache.
//
// SAFETY: destroy() also drops sessions and any in-flight sign-in, so calling
// it from an authenticated surface would be a silent sign-out. This helper
// refuses to run when a session exists — see the guard below. That refusal is
// a backstop; callers must still gate the control to the pre-session sign-up
// verification step.

/** Minimal shape of the Clerk instance this helper needs. */
export type AbandonableClerk = {
  session?: { id?: string } | null;
  client?: { destroy: () => Promise<unknown> } | null;
};

export type AbandonSignUpResult =
  | { ok: true }
  | { ok: false; message: string };

const CONTEXT = 'signUp.abandonAttempt';

/** Fails the call the same way for every refusal: visible message + report. */
function fail(reason: string): AbandonSignUpResult {
  const error = new Error(reason);
  reportAuthError(CONTEXT, error);
  return { ok: false, message: authErrorMessage(error) };
}

/**
 * Abandon the Clerk client's in-flight sign-up attempt.
 *
 * Never throws and never fails silently: every path returns either
 * `{ ok: true }` or a message the caller must show, and every failure is
 * reported through `lib/authErrors`. The caller is responsible for returning
 * the user to a usable screen in BOTH cases.
 */
export async function abandonSignUpAttempt(
  clerk: AbandonableClerk | null | undefined,
): Promise<AbandonSignUpResult> {
  if (clerk?.session) {
    // Hard guard for the authenticated case: destroying the client here would
    // sign the user out without them asking. Refuse loudly instead.
    return fail(
      "We can't reset sign-up while you are signed in. Sign out first, then try again.",
    );
  }
  const client = clerk?.client;
  if (!client) {
    return fail(
      "We couldn't reach your sign-up session. Please close the app and open it again.",
    );
  }
  try {
    await client.destroy();
    return { ok: true };
  } catch (err) {
    reportAuthError(CONTEXT, err);
    return { ok: false, message: authErrorMessage(err) };
  }
}
