/**
 * Escape hatches on the sign-up verification step (iOS build 34 trap).
 *
 * A learner who typed the wrong email reached the 6-digit code screen and
 * could not get out: the branch offered only "Verify & continue" and "Send a
 * new code", and the step is derived from server state, so force-quit and
 * reinstall both landed back on it. These tests pin the fix:
 *
 *  1. "Use a different email" destroys the Clerk client (the only call that
 *     resets the pending sign-up) and returns to the email form, cleared.
 *  2. A failed abandon still lands the user on a usable form, with the
 *     message surfaced and a Sentry report, never a dead button, never a
 *     blank screen.
 *  3. "Back" escapes without touching Clerk state.
 *  4. Neither control exists outside the code step, and the helper refuses to
 *     run when a session exists (destroying the client while signed in would
 *     be a silent sign-out).
 */

import React from 'react';
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';

// ─── mutable state controlled per-test ──────────────────────────────────────

const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn() };

const mockSignUp = {
  status: undefined as string | undefined,
  unverifiedFields: [] as string[],
  missingFields: [] as string[],
  password: jest.fn(),
  finalize: jest.fn(),
  verifications: {
    sendEmailCode: jest.fn(),
    verifyEmailCode: jest.fn(),
  },
};

const mockClerk = {
  session: null as { id?: string } | null,
  client: { destroy: jest.fn() } as { destroy: jest.Mock } | null,
};

// ─── external module mocks ───────────────────────────────────────────────────

// The real hook re-renders the screen when Clerk's resource changes; mutating
// a plain object cannot. The mock subscribes each render to a tiny emitter so
// a test that advances `mockSignUp` can push that change into the tree.
jest.mock('@clerk/expo', () => {
  const React = require('react');
  const listeners = new Set<() => void>();
  return {
    __notify: () => listeners.forEach((l) => l()),
    useSignUp: () => {
      const [, setTick] = React.useState(0);
      React.useEffect(() => {
        const listener = () => setTick((t: number) => t + 1);
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }, []);
      return {
        signUp: mockSignUp,
        errors: { raw: [], fields: {} },
        fetchStatus: 'idle',
      };
    },
    useClerk: () => mockClerk,
  };
});
// eslint-disable-next-line @typescript-eslint/no-require-imports
const notifyClerkChanged = require('@clerk/expo').__notify as () => void;

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    __esModule: true,
    useRouter: () => mockRouter,
    Link: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

// jest.fn created inside the factory (module imports hoist above top-level
// consts, so a file-level fn would be undefined at factory time).
jest.mock('@/lib/sentry', () => ({
  sentryEnabled: true,
  Sentry: { captureException: jest.fn() },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockCaptureException = require('@/lib/sentry').Sentry
  .captureException as jest.Mock;

// Heavy presentational wrappers stand in light (same convention as
// sign-in-client-trust.test.tsx); fields and buttons render for real.
jest.mock('@/components/Screen', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
  };
});
jest.mock('@/components/Mascot', () => ({ Mascot: () => null }));
jest.mock('@/components/AppleAuthButton', () => ({
  AppleAuthButton: () => null,
}));
jest.mock('@/components/GoogleAuthButton', () => ({
  GoogleAuthButton: () => null,
}));

import SignUpScreen from '@/app/(auth)/sign-up';
import { abandonSignUpAttempt } from '@/lib/abandonSignUp';

// ─── helpers ─────────────────────────────────────────────────────────────────

const TYPO_EMAIL = 'learnre@exmaple.com';

/** Drive the real flow: submit the form, land on the code step. */
async function reachCodeStep() {
  render(<SignUpScreen />);
  fireEvent.changeText(
    screen.getByPlaceholderText('you@example.com'),
    TYPO_EMAIL,
  );
  fireEvent.changeText(
    screen.getByPlaceholderText('At least 8 characters'),
    'hunter22!',
  );
  mockSignUp.password.mockImplementation(async () => {
    mockSignUp.status = 'missing_requirements';
    mockSignUp.unverifiedFields = ['email_address'];
    notifyClerkChanged();
    return {};
  });
  mockSignUp.verifications.sendEmailCode.mockResolvedValue({});
  await act(async () => {
    fireEvent.press(screen.getByText('Create account'));
  });
  expect(screen.getByText('Check your email')).toBeOnTheScreen();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSignUp.status = undefined;
  mockSignUp.unverifiedFields = [];
  mockSignUp.missingFields = [];
  mockClerk.session = null;
  mockClerk.client = { destroy: jest.fn() };
});

// ─── tests ───────────────────────────────────────────────────────────────────

describe('"Use a different email" on the verification step', () => {
  it('destroys the Clerk client and returns to the email form with the fields cleared', async () => {
    await reachCodeStep();
    mockClerk.client!.destroy.mockResolvedValue(undefined);

    // The code field carries a stale value the escape must clear too.
    fireEvent.changeText(screen.getByPlaceholderText('123456'), '424242');

    await act(async () => {
      fireEvent.press(screen.getByText('Use a different email'));
    });

    // The only call that resets the pending sign-up ran, exactly once.
    expect(mockClerk.client!.destroy).toHaveBeenCalledTimes(1);

    // Back on the email form, not the code step.
    await waitFor(() =>
      expect(screen.getByText('Start speaking today')).toBeOnTheScreen(),
    );
    expect(screen.queryByPlaceholderText('123456')).toBeNull();

    // Fields cleared: the typo email is gone.
    expect(screen.getByPlaceholderText('you@example.com').props.value).toBe('');
    expect(
      screen.getByPlaceholderText('At least 8 characters').props.value,
    ).toBe('');

    // A successful escape is not an error and reaches nobody's inbox.
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('leaves the user on a usable form with a visible message when the abandon fails', async () => {
    await reachCodeStep();
    mockClerk.client!.destroy.mockRejectedValue(
      new Error('Network request failed'),
    );

    await act(async () => {
      fireEvent.press(screen.getByText('Use a different email'));
    });

    // Recovered to the form (never a blank screen, never a dead button).
    await waitFor(() =>
      expect(screen.getByText('Start speaking today')).toBeOnTheScreen(),
    );
    expect(screen.getByPlaceholderText('you@example.com')).toBeOnTheScreen();
    expect(screen.getByText('Create account')).toBeOnTheScreen();

    // The failure is visible and reported (no silent failures policy).
    expect(screen.getByText('Network request failed')).toBeOnTheScreen();
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('"Back" escapes the code step without touching Clerk state', async () => {
    await reachCodeStep();

    await act(async () => {
      fireEvent.press(screen.getByText('Back'));
    });

    expect(screen.getByText('Start speaking today')).toBeOnTheScreen();
    expect(mockClerk.client!.destroy).not.toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});

describe('exposure of the escape controls', () => {
  it('renders neither control on the email form branch', () => {
    render(<SignUpScreen />);

    expect(screen.getByText('Start speaking today')).toBeOnTheScreen();
    expect(screen.queryByText('Use a different email')).toBeNull();
    expect(screen.queryByText('Back')).toBeNull();
  });
});

describe('abandonSignUpAttempt guard', () => {
  it('refuses to destroy the client when a session exists', async () => {
    const destroy = jest.fn();

    const result = await abandonSignUpAttempt({
      session: { id: 'sess_test' },
      client: { destroy },
    });

    // Destroying a client with a live session would be a silent sign-out.
    expect(destroy).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('reports and returns a message when there is no client at all', async () => {
    const result = await abandonSignUpAttempt({ session: null, client: null });

    expect(result.ok).toBe(false);
    expect(result).toHaveProperty('message');
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});
