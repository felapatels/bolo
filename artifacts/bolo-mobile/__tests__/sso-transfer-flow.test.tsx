/**
 * OAuth (SSO) completion: transfer-to-sign-up, session recovery, and the
 * provider label.
 *
 * Build 34 was rejected by App Review after an OAuth attempt that ended
 * signed out. The production evidence behind these tests:
 *
 *  - A Sentry AuthIncompleteStateError at status 'needs_identifier', Clerk's
 *    way of saying "this person has no account, transfer the sign-in into a
 *    sign-up". The app had no transfer call at all, so a first-time OAuth
 *    user could never get in. No oauth_google account has ever been created
 *    from mobile.
 *  - Nineteen seconds later Clerk created a user AND an active session that
 *    the app never activated (no authenticated call ever reached the API).
 *    A live session on the Clerk client must be adopted, not ignored.
 *
 * Requirements pinned here:
 *  1. First-time OAuth user (transferable sign-in) completes via
 *     signUp.create({ transfer: true }).
 *  2. Existing user arriving through sign-up (transferable external account)
 *     completes via signIn.create({ transfer: true }).
 *  3. A session left on the Clerk client is adopted rather than shown as an
 *     error: a successful handshake never ends signed out with a message.
 *  4. A transfer that cannot complete says which fields are missing, both on
 *     screen and in Sentry.
 *  5. The Sentry authContext is derived from the strategy, so it always names
 *     the provider actually used.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

import {
  completeSsoFlow,
  providerName,
  ssoContext,
  type SsoFlowStart,
} from '@/lib/ssoAuth';

// ─── auth reporting is captured, never sent ─────────────────────────────────

const mockReportIncomplete = jest.fn();
const mockReportError = jest.fn();

jest.mock('@/lib/authErrors', () => ({
  reportAuthIncompleteState: (...args: unknown[]) =>
    mockReportIncomplete(...args),
  reportAuthError: (...args: unknown[]) => mockReportError(...args),
  authErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : 'unknown',
}));

const NAV = jest.fn();

function flow(result: Record<string, unknown>): SsoFlowStart {
  return jest.fn().mockResolvedValue(result) as unknown as SsoFlowStart;
}

/** A flow whose side effect mimics Clerk putting a session on the client. */
function flowThatCreates(
  client: { sessions: { id: string; status?: string }[] },
  session: { id: string; status?: string },
  result: Record<string, unknown> = {},
): SsoFlowStart {
  return (async () => {
    client.sessions.push(session);
    return { authSessionResult: { type: 'success' }, ...result };
  }) as unknown as SsoFlowStart;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── 1. the ordinary path ───────────────────────────────────────────────────

describe('completeSsoFlow: session already created', () => {
  it('activates the session Clerk returned and navigates', async () => {
    const setActive = jest.fn().mockResolvedValue(undefined);
    const outcome = await completeSsoFlow({
      strategy: 'oauth_apple',
      redirectUrl: 'bolo-mobile://',
      startSSOFlow: flow({ createdSessionId: 'sess_1', setActive }),
      navigate: NAV,
    });

    expect(outcome).toEqual({ kind: 'session', recovered: false });
    expect(setActive).toHaveBeenCalledWith(
      expect.objectContaining({ session: 'sess_1' }),
    );
    expect(mockReportIncomplete).not.toHaveBeenCalled();
  });
});

// ─── 2. first-time OAuth user: transfer into a sign-up ──────────────────────

describe('completeSsoFlow: transfer to sign-up', () => {
  const transferableSignIn = {
    status: 'needs_identifier',
    firstFactorVerification: { status: 'transferable' },
    supportedFirstFactors: [
      { strategy: 'google_one_tap' },
      { strategy: 'oauth_google' },
    ],
    create: jest.fn(),
  };

  it('creates the account and signs the new user in when nothing tried yet', async () => {
    const setActive = jest.fn().mockResolvedValue(undefined);
    const signUp = {
      create: jest
        .fn()
        .mockResolvedValue({ status: 'complete', createdSessionId: 'sess_new' }),
    };

    const outcome = await completeSsoFlow({
      strategy: 'oauth_google',
      redirectUrl: 'bolo-mobile://',
      startSSOFlow: flow({ signIn: transferableSignIn, signUp, setActive }),
      navigate: NAV,
    });

    expect(signUp.create).toHaveBeenCalledWith({ transfer: true });
    expect(outcome).toEqual({ kind: 'session', recovered: false });
    expect(setActive).toHaveBeenCalledWith(
      expect.objectContaining({ session: 'sess_new' }),
    );
    // A completed transfer is not an incident.
    expect(mockReportIncomplete).not.toHaveBeenCalled();
  });

  it('completes for Apple when the provider sent no name (repeat authorization)', async () => {
    // Apple returns the user's name only on the very first authorization, and
    // a private relay address in place of a mailbox. Neither may block the
    // sign-up: Clerk reports complete, and nothing here second-guesses it.
    const setActive = jest.fn().mockResolvedValue(undefined);
    const signUp = {
      create: jest.fn().mockResolvedValue({
        status: 'complete',
        createdSessionId: 'sess_relay',
        missingFields: [],
        unverifiedFields: [],
      }),
    };

    const outcome = await completeSsoFlow({
      strategy: 'oauth_apple',
      redirectUrl: 'bolo-mobile://',
      startSSOFlow: flow({
        signIn: { ...transferableSignIn, create: jest.fn() },
        signUp,
        setActive,
      }),
      navigate: NAV,
    });

    expect(outcome).toEqual({ kind: 'session', recovered: false });
    expect(setActive).toHaveBeenCalledWith(
      expect.objectContaining({ session: 'sess_relay' }),
    );
  });

  it('reads the SDK\u2019s own transfer instead of running a second one', async () => {
    // @clerk/expo 3.7.4 performs signUp.create({ transfer: true }) inside
    // startSSOFlow. When that comes back incomplete, the sign-up resource
    // carries the reason; re-running the transfer would be a second,
    // conflicting attempt. This is the exact shape of the rejected build:
    // signIn.status 'needs_identifier' with the real story on the sign-up.
    const signUp = {
      status: 'missing_requirements',
      missingFields: ['email_address'],
      unverifiedFields: [],
      create: jest.fn(),
    };

    const outcome = await completeSsoFlow({
      strategy: 'oauth_google',
      redirectUrl: 'bolo-mobile://',
      startSSOFlow: flow({
        signIn: { ...transferableSignIn, create: jest.fn() },
        signUp,
        setActive: jest.fn(),
      }),
      navigate: NAV,
    });

    expect(signUp.create).not.toHaveBeenCalled();
    expect(outcome.kind).toBe('incomplete');
    if (outcome.kind !== 'incomplete') throw new Error('expected incomplete');
    expect(outcome.message).toContain('email_address');
    expect(mockReportIncomplete).toHaveBeenCalledWith(
      'sso.oauth_google',
      'missing_requirements',
      expect.any(Array),
      expect.objectContaining({
        phase: 'sdk_transfer_to_sign_up',
        missingFields: ['email_address'],
      }),
    );
  });

  it('names the missing fields when the transfer cannot complete', async () => {
    const signUp = {
      create: jest.fn().mockResolvedValue({
        status: 'missing_requirements',
        missingFields: ['email_address'],
        unverifiedFields: [],
      }),
    };

    const outcome = await completeSsoFlow({
      strategy: 'oauth_apple',
      redirectUrl: 'bolo-mobile://',
      startSSOFlow: flow({
        signIn: { ...transferableSignIn, create: jest.fn() },
        signUp,
        setActive: jest.fn(),
      }),
      navigate: NAV,
    });

    expect(outcome.kind).toBe('incomplete');
    if (outcome.kind !== 'incomplete') throw new Error('expected incomplete');
    expect(outcome.status).toBe('missing_requirements');
    expect(outcome.message).toContain('Apple');
    expect(outcome.message).toContain('email_address');

    expect(mockReportIncomplete).toHaveBeenCalledWith(
      'sso.oauth_apple',
      'missing_requirements',
      expect.any(Array),
      expect.objectContaining({
        phase: 'transfer_to_sign_up',
        missingFields: ['email_address'],
      }),
    );
  });
});

// ─── 3. existing user arriving through the sign-up screen ───────────────────

describe('completeSsoFlow: transfer to sign-in', () => {
  it('signs an existing account in from a transferable sign-up', async () => {
    const setActive = jest.fn().mockResolvedValue(undefined);
    const signIn = {
      create: jest
        .fn()
        .mockResolvedValue({ status: 'complete', createdSessionId: 'sess_back' }),
      supportedFirstFactors: [],
    };
    const signUp = {
      status: 'missing_requirements',
      verifications: { externalAccount: { status: 'transferable' } },
      create: jest.fn(),
    };

    const outcome = await completeSsoFlow({
      strategy: 'oauth_google',
      redirectUrl: 'bolo-mobile://',
      startSSOFlow: flow({ signIn, signUp, setActive }),
      navigate: NAV,
    });

    expect(signIn.create).toHaveBeenCalledWith({ transfer: true });
    expect(signUp.create).not.toHaveBeenCalled();
    expect(outcome).toEqual({ kind: 'session', recovered: false });
    expect(setActive).toHaveBeenCalledWith(
      expect.objectContaining({ session: 'sess_back' }),
    );
  });
});

// ─── 4. the App Review dead end: a session nobody picked up ─────────────────

describe('completeSsoFlow: recovery of a live client session', () => {
  it('adopts a session the handshake created, instead of showing an error', async () => {
    const clerkSetActive = jest.fn().mockResolvedValue(undefined);
    const client = { sessions: [] as { id: string; status?: string }[] };

    const outcome = await completeSsoFlow({
      strategy: 'oauth_apple',
      redirectUrl: 'bolo-mobile://',
      startSSOFlow: flowThatCreates(client, {
        id: 'sess_live',
        status: 'active',
      }),
      clerkSetActive,
      client,
      navigate: NAV,
    });

    expect(outcome).toEqual({ kind: 'session', recovered: true });
    expect(clerkSetActive).toHaveBeenCalledWith(
      expect.objectContaining({ session: 'sess_live' }),
    );
    // Recovered, but never invisible.
    expect(mockReportIncomplete).toHaveBeenCalledWith(
      'sso.oauth_apple',
      'no_status',
      [],
      expect.objectContaining({ phase: 'recovered_client_session' }),
    );
  });

  it('never adopts a session that predates the attempt', async () => {
    // A previous user of the device must not be signed back in because their
    // session is still on the client when someone else's OAuth attempt fails.
    const clerkSetActive = jest.fn().mockResolvedValue(undefined);
    const client = {
      sessions: [{ id: 'sess_someone_else', status: 'active' }],
    };

    const outcome = await completeSsoFlow({
      strategy: 'oauth_google',
      redirectUrl: 'bolo-mobile://',
      startSSOFlow: flow({
        authSessionResult: { type: 'success' },
        signIn: {
          status: 'needs_first_factor',
          firstFactorVerification: { status: 'failed' },
          supportedFirstFactors: [],
          create: jest.fn(),
        },
      }),
      clerkSetActive,
      client,
      navigate: NAV,
    });

    expect(outcome.kind).toBe('incomplete');
    expect(clerkSetActive).not.toHaveBeenCalled();
  });

  it('does not recover when the provider sheet was cancelled', async () => {
    // No successful handshake means nothing to recover, even if a session
    // appears on the client for some unrelated reason.
    const clerkSetActive = jest.fn().mockResolvedValue(undefined);
    const client = { sessions: [] as { id: string; status?: string }[] };

    const outcome = await completeSsoFlow({
      strategy: 'oauth_apple',
      redirectUrl: 'bolo-mobile://',
      startSSOFlow: flowThatCreates(
        client,
        { id: 'sess_unrelated', status: 'active' },
        { authSessionResult: { type: 'cancel' }, signIn: {
          status: 'needs_identifier',
          supportedFirstFactors: [],
          create: jest.fn(),
        } },
      ),
      clerkSetActive,
      client,
      navigate: NAV,
    });

    expect(outcome).toEqual({ kind: 'dismissed' });
    expect(clerkSetActive).not.toHaveBeenCalled();
    expect(mockReportIncomplete).not.toHaveBeenCalled();
  });

  it('picks the new active session out of a client that already had others', async () => {
    const clerkSetActive = jest.fn().mockResolvedValue(undefined);
    const client = {
      sessions: [
        { id: 'sess_ended', status: 'ended' },
        { id: 'sess_old', status: 'active' },
      ],
    };

    const outcome = await completeSsoFlow({
      strategy: 'oauth_apple',
      redirectUrl: 'bolo-mobile://',
      startSSOFlow: flowThatCreates(
        client,
        { id: 'sess_fresh', status: 'active' },
        {
          signIn: {
            status: 'needs_identifier',
            firstFactorVerification: { status: 'unverified' },
            supportedFirstFactors: [],
            create: jest.fn(),
          },
        },
      ),
      clerkSetActive,
      client,
      navigate: NAV,
    });

    expect(outcome).toEqual({ kind: 'session', recovered: true });
    expect(clerkSetActive).toHaveBeenCalledWith(
      expect.objectContaining({ session: 'sess_fresh' }),
    );
  });
});

// ─── 5. genuine stops ───────────────────────────────────────────────────────

describe('completeSsoFlow: nothing left to try', () => {
  it('reports the status, the strategies, and the verification statuses', async () => {
    const outcome = await completeSsoFlow({
      strategy: 'oauth_google',
      redirectUrl: 'bolo-mobile://',
      startSSOFlow: flow({
        signIn: {
          status: 'needs_first_factor',
          firstFactorVerification: { status: 'failed' },
          supportedFirstFactors: [{ strategy: 'password' }],
          create: jest.fn(),
        },
      }),
      client: {},
      navigate: NAV,
    });

    expect(outcome.kind).toBe('incomplete');
    if (outcome.kind !== 'incomplete') throw new Error('expected incomplete');
    expect(outcome.message).toContain('Google');
    expect(outcome.message).toContain('needs_first_factor');
    expect(outcome.message).toContain('password');

    expect(mockReportIncomplete).toHaveBeenCalledWith(
      'sso.oauth_google',
      'needs_first_factor',
      ['password'],
      expect.objectContaining({
        phase: 'no_session',
        firstFactorVerification: 'failed',
      }),
    );
  });

  it('treats an empty return as a dismissal, with no Sentry noise', async () => {
    const outcome = await completeSsoFlow({
      strategy: 'oauth_apple',
      redirectUrl: 'bolo-mobile://',
      startSSOFlow: flow({}),
      client: { sessions: [] },
      navigate: NAV,
    });

    expect(outcome).toEqual({ kind: 'dismissed' });
    expect(mockReportIncomplete).not.toHaveBeenCalled();
  });
});

// ─── 6. the provider label ──────────────────────────────────────────────────

describe('provider labelling', () => {
  it('derives the Sentry context and the copy from the strategy', () => {
    expect(ssoContext('oauth_apple')).toBe('sso.oauth_apple');
    expect(ssoContext('oauth_google')).toBe('sso.oauth_google');
    expect(providerName('oauth_apple')).toBe('Apple');
    expect(providerName('oauth_google')).toBe('Google');
  });

  it('labels an Apple stop as Apple, never as the other provider', async () => {
    await completeSsoFlow({
      strategy: 'oauth_apple',
      redirectUrl: 'bolo-mobile://',
      startSSOFlow: flow({
        signIn: {
          status: 'needs_identifier',
          firstFactorVerification: { status: 'unverified' },
          supportedFirstFactors: [{ strategy: 'oauth_apple' }],
          create: jest.fn(),
        },
      }),
      navigate: NAV,
    });

    expect(mockReportIncomplete).toHaveBeenCalledWith(
      'sso.oauth_apple',
      'needs_identifier',
      ['oauth_apple'],
      expect.anything(),
    );
  });
});

// ─── 7. the buttons are wired to the shared flow ────────────────────────────

const mockStartSSOFlow = jest.fn();
const mockClerkSetActive = jest.fn();
const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn() };

jest.mock('@clerk/expo', () => ({
  useSSO: () => ({ startSSOFlow: mockStartSSOFlow }),
  useClerk: () => ({
    setActive: mockClerkSetActive,
    client: { lastActiveSessionId: null, sessions: [] },
  }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('expo-auth-session', () => ({
  makeRedirectUri: () => 'bolo-mobile://oauth',
}));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  warmUpAsync: jest.fn(),
  coolDownAsync: jest.fn(),
}));

jest.mock('@/lib/haptics', () => ({ hapticLight: jest.fn() }));

describe('GoogleAuthButton', () => {
  it('runs the shared flow with its own strategy and signs in on transfer', async () => {
    const { GoogleAuthButton } = require('@/components/GoogleAuthButton');
    mockStartSSOFlow.mockResolvedValue({
      signIn: {
        status: 'needs_identifier',
        firstFactorVerification: { status: 'transferable' },
        supportedFirstFactors: [{ strategy: 'oauth_google' }],
        create: jest.fn(),
      },
      signUp: {
        create: jest
          .fn()
          .mockResolvedValue({ status: 'complete', createdSessionId: 'sess_g' }),
      },
    });

    render(<GoogleAuthButton />);
    fireEvent.press(screen.getByRole('button'));

    await waitFor(() => {
      expect(mockClerkSetActive).toHaveBeenCalledWith(
        expect.objectContaining({ session: 'sess_g' }),
      );
    });
    expect(mockStartSSOFlow).toHaveBeenCalledWith(
      expect.objectContaining({ strategy: 'oauth_google' }),
    );
    // A first-time user must not be left looking at an error.
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
