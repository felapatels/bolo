import { reportAuthIncompleteState, reportAuthError } from '@/lib/authErrors';

// Shared completion logic for the OAuth (SSO) buttons.
//
// Build 34 was rejected by App Review after a sign-in that went nowhere. Two
// distinct defects sat behind it, both handled here.
//
// 1. AN UNREAD SIGN-UP. When the provider handshake succeeds for someone with
//    no account, Clerk hands back a sign-in whose first-factor verification is
//    `transferable` and expects a `signUp.create({ transfer: true })`.
//    @clerk/expo 3.7.4 makes that call for us INSIDE startSSOFlow (verified in
//    the installed dist: it reloads the sign-in with the rotating token nonce,
//    transfers when transferable, and returns
//    `signUp.createdSessionId ?? signIn.createdSessionId`). So the bug was
//    never a missing call — it was that when the transfer came back
//    incomplete, the app read only `signIn.status` ('needs_identifier'),
//    showed that, and threw away the sign-up resource that says WHY. We now
//    read the sign-up, report its missing fields, and only make the transfer
//    call ourselves if the SDK did not (an older or newer SDK, or a flow that
//    never attempted a sign-up).
//
// 2. A DROPPED SESSION. The same production evidence shows Clerk creating a
//    user and an active session that the app never activated, leaving the user
//    signed out in front of an error. If the handshake came back successful
//    and a session that did NOT exist beforehand is now on the Clerk client,
//    we adopt it. Strictly new sessions only: adopting `lastActiveSessionId`
//    or any already-present active session could sign in a previous user of
//    the device.
//
// The Sentry context is derived from the strategy, never written by hand, so
// it cannot drift from the provider actually used.

/** Verification status Clerk uses to mean "hand this to the other flow". */
const TRANSFERABLE = 'transferable';

type Status = string | null | undefined;

type Verification = { status?: Status } | null | undefined;

type SignInLike = {
  status?: Status;
  firstFactorVerification?: Verification;
  supportedFirstFactors?: { strategy: string }[] | null;
  create: (params: { transfer: boolean }) => Promise<{
    status?: Status;
    createdSessionId?: string | null;
  }>;
};

type SignUpLike = {
  status?: Status;
  missingFields?: string[] | null;
  unverifiedFields?: string[] | null;
  createdSessionId?: string | null;
  verifications?: { externalAccount?: Verification } | null;
  create: (params: { transfer: boolean }) => Promise<{
    status?: Status;
    createdSessionId?: string | null;
    missingFields?: string[] | null;
    unverifiedFields?: string[] | null;
  }>;
};

type SetActiveLike = (params: {
  session: string;
  navigate?: () => Promise<void> | void;
}) => Promise<void>;

type SessionLike = { id: string; status?: string };

type ClientLike = { sessions?: SessionLike[] | null } | null | undefined;

/** `WebBrowser.openAuthSessionAsync` result, as useSSO passes it back. */
type AuthSessionResultLike = { type?: string } | null | undefined;

export type SsoStrategy = 'oauth_apple' | 'oauth_google';

export type SsoFlowOutcome =
  /** A session is active and `navigate` has run. Nothing to display. */
  | { kind: 'session'; recovered: boolean }
  /** The provider sheet was closed. Gentle copy, no Sentry. */
  | { kind: 'dismissed' }
  /** Stopped somewhere real. `message` is ready to show. */
  | { kind: 'incomplete'; message: string; status: string | null };

export type SsoFlowStart = (options: {
  strategy: SsoStrategy;
  redirectUrl: string;
}) => Promise<{
  createdSessionId?: string | null;
  setActive?: SetActiveLike;
  signIn?: SignInLike | null;
  signUp?: SignUpLike | null;
  authSessionResult?: AuthSessionResultLike;
}>;

/** The provider name as it should read in user-facing copy. */
export function providerName(strategy: SsoStrategy): string {
  return strategy === 'oauth_apple' ? 'Apple' : 'Google';
}

/** Sentry `authContext`, derived so it always matches the strategy used. */
export function ssoContext(strategy: SsoStrategy): string {
  return `sso.${strategy}`;
}

function strategiesOf(signIn: SignInLike | null | undefined): string[] {
  return (signIn?.supportedFirstFactors ?? []).map((f) => f.strategy);
}

function fieldList(fields: (string[] | null | undefined)[]): string[] {
  return Array.from(new Set(fields.flatMap((f) => f ?? [])));
}

function activeSessionIds(client: ClientLike): Set<string> {
  const ids = new Set<string>();
  for (const s of client?.sessions ?? []) ids.add(s.id);
  return ids;
}

/**
 * Runs a Clerk SSO flow to a definite end: an active session, a dismissal, or
 * a described stopping point. Never resolves in a state where the provider
 * handshake worked but the app is signed out with nothing to show for it.
 */
export async function completeSsoFlow(args: {
  strategy: SsoStrategy;
  redirectUrl: string;
  startSSOFlow: SsoFlowStart;
  /** From `useClerk()`, used when the flow itself hands back no `setActive`. */
  clerkSetActive?: SetActiveLike;
  /** From `useClerk()`. Read before AND after the flow, never trusted blindly. */
  client?: ClientLike;
  navigate: () => Promise<void> | void;
}): Promise<SsoFlowOutcome> {
  const { strategy, redirectUrl, startSSOFlow, client, navigate } = args;
  const context = ssoContext(strategy);
  const provider = providerName(strategy);

  // Snapshot before the handshake: anything already here belongs to an
  // earlier sign-in and must never be adopted as the result of this one.
  const preExistingSessionIds = activeSessionIds(client);

  const { createdSessionId, setActive, signIn, signUp, authSessionResult } =
    await startSSOFlow({ strategy, redirectUrl });

  const activate = args.clerkSetActive ?? setActive;
  const enter = async (session: string, recovered: boolean) => {
    if (!activate) {
      throw new Error(`${context}: no setActive available to start a session`);
    }
    await activate({ session, navigate });
    return { kind: 'session' as const, recovered };
  };

  // 1. The ordinary path, and the one an SDK-side transfer also lands in.
  if (createdSessionId) return enter(createdSessionId, false);

  // 2. The browser came back without success: closed, cancelled, or locked.
  //    Nothing downstream can be true, and it is not an incident.
  const handshakeSucceeded =
    !authSessionResult || authSessionResult.type === 'success';
  if (!handshakeSucceeded) return { kind: 'dismissed' };

  // 3. First-time OAuth user. The SDK transfers into a sign-up itself; if it
  //    did, `signUp` carries the verdict and re-running the transfer would be
  //    a second, conflicting attempt. Only transfer when nothing tried yet.
  if (signIn?.firstFactorVerification?.status === TRANSFERABLE && signUp) {
    const attempted = Boolean(signUp.status);
    const res = attempted
      ? {
          status: signUp.status,
          createdSessionId: signUp.createdSessionId,
          missingFields: signUp.missingFields,
          unverifiedFields: signUp.unverifiedFields,
        }
      : await signUp.create({ transfer: true });

    if (res.status === 'complete' && res.createdSessionId) {
      return enter(res.createdSessionId, false);
    }

    // The sign-up could not be completed from what the provider supplied.
    // Name the fields: this is precisely what the rejected build hid behind
    // a bare 'needs_identifier'. (Apple sends the user's name on the FIRST
    // authorization only, and a private relay address in place of a mailbox;
    // neither is fatal on its own.)
    const missing = fieldList([res.missingFields, res.unverifiedFields]);
    const status = res.status ?? 'unknown';
    reportAuthIncompleteState(context, status, strategiesOf(signIn), {
      phase: attempted ? 'sdk_transfer_to_sign_up' : 'transfer_to_sign_up',
      missingFields: missing,
    });
    return {
      kind: 'incomplete',
      status,
      message:
        `${provider} sign-in could not finish creating your account (status: ${status}` +
        `${missing.length > 0 ? `; still needed: ${missing.join(', ')}` : ''}). ` +
        `Please sign up with your email instead, or contact support and mention this message.`,
    };
  }

  // 4. The mirror case: an existing account arriving through a sign-up.
  if (
    signUp?.verifications?.externalAccount?.status === TRANSFERABLE &&
    signIn
  ) {
    const res = await signIn.create({ transfer: true });
    if (res.status === 'complete' && res.createdSessionId) {
      return enter(res.createdSessionId, false);
    }
    const status = res.status ?? 'unknown';
    reportAuthIncompleteState(context, status, strategiesOf(signIn), {
      phase: 'transfer_to_sign_in',
    });
    return {
      kind: 'incomplete',
      status,
      message:
        `${provider} sign-in did not complete (status: ${status}). ` +
        `Please try again, or sign in with your email.`,
    };
  }

  // 5. The handshake succeeded and a session that did not exist before it now
  //    does: adopt it rather than stranding the user in front of an error
  //    while a live session sits on the client. New sessions only — a session
  //    that predates this attempt could belong to someone else on the device.
  const fresh = (client?.sessions ?? []).find(
    (s) => s.status === 'active' && !preExistingSessionIds.has(s.id),
  );
  if (fresh && activate) {
    // Recovered for the user, but never invisible to us.
    reportAuthIncompleteState(
      context,
      signIn?.status ?? signUp?.status ?? 'no_status',
      strategiesOf(signIn),
      { phase: 'recovered_client_session' },
    );
    return enter(fresh.id, true);
  }

  // 6. A real stopping point with nothing left to try.
  const status = signIn?.status ?? signUp?.status ?? null;
  if (status) {
    const strategies = strategiesOf(signIn);
    reportAuthIncompleteState(context, status, strategies, {
      phase: 'no_session',
      firstFactorVerification: signIn?.firstFactorVerification?.status ?? null,
      externalAccountVerification:
        signUp?.verifications?.externalAccount?.status ?? null,
      signUpStatus: signUp?.status ?? null,
    });
    return {
      kind: 'incomplete',
      status,
      message:
        `${provider} sign-in did not complete (status: ${status}` +
        `${strategies.length > 0 ? `; available sign-in methods: ${strategies.join(', ')}` : ''}` +
        `). Please try again.`,
    };
  }

  // 7. Nothing at all came back: treated as a dismissal.
  return { kind: 'dismissed' };
}

/** Shared catch handler so both buttons report with the derived context. */
export function reportSsoError(strategy: SsoStrategy, err: unknown): void {
  reportAuthError(ssoContext(strategy), err);
}
