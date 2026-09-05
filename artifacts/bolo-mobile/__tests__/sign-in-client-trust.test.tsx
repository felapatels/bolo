/**
 * Client Trust (needs_client_trust) handling on the sign-in screen.
 *
 * Clerk's Client Trust feature makes password sign-in from a new device stop
 * at status 'needs_client_trust' with second factors in
 * `supportedSecondFactors`. Build 26 treated that as an unexpected state
 * (visible error + Sentry). These tests pin the build-27 behavior:
 *
 *  1. needs_client_trust + email_code second factor → the second-factor send
 *     (`signIn.mfa.sendEmailCode`) fires automatically, the existing code
 *     step appears with a new-device notice, entering the six-digit code
 *     calls `signIn.mfa.verifyEmailCode` (NOT the first-factor
 *     `emailCode.verifyCode`), and at 'complete' the finalize/navigation
 *     path runs.
 *  2. needs_client_trust WITHOUT an email_code second factor → on-screen
 *     diagnostic carrying the status + offered second-factor strategies and
 *     a Sentry report (never a silent no-op, never a generic message).
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

const mockSignIn = {
  id: 'sia_test',
  status: undefined as string | undefined,
  supportedFirstFactors: [{ strategy: 'password' }, { strategy: 'email_code' }],
  supportedSecondFactors: [] as Array<{ strategy: string }>,
  password: jest.fn(),
  finalize: jest.fn(),
  emailCode: {
    sendCode: jest.fn(),
    verifyCode: jest.fn(),
  },
  mfa: {
    sendEmailCode: jest.fn(),
    verifyEmailCode: jest.fn(),
  },
};

// ─── external module mocks ───────────────────────────────────────────────────

jest.mock('@clerk/expo', () => ({
  useSignIn: () => ({
    signIn: mockSignIn,
    errors: { raw: [], fields: {} },
    fetchStatus: 'idle',
  }),
}));

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    __esModule: true,
    useRouter: () => mockRouter,
    Link: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

// The jest.fn is created inside the factory (module imports are hoisted above
// top-level consts, so a file-level fn would be undefined at factory time).
jest.mock('@/lib/sentry', () => ({
  sentryEnabled: true,
  Sentry: { captureException: jest.fn() },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockCaptureException = require('@/lib/sentry').Sentry
  .captureException as jest.Mock;

// Heavy presentational wrappers are replaced with light stand-ins (same
// convention as friends.test.tsx) so tests don't depend on safe-area /
// image-asset internals; the fields and buttons render for real.
jest.mock('@/components/Screen', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
  };
});
jest.mock('@/components/Mascot', () => ({ Mascot: () => null }));

// SSO buttons pull in Clerk useSSO + native browser modules — irrelevant here.
jest.mock('@/components/AppleAuthButton', () => ({
  AppleAuthButton: () => null,
}));
jest.mock('@/components/GoogleAuthButton', () => ({
  GoogleAuthButton: () => null,
}));

import SignInScreen from '@/app/(auth)/sign-in';

// ─── helpers ─────────────────────────────────────────────────────────────────

async function submitPassword() {
  fireEvent.changeText(
    screen.getByPlaceholderText('you@example.com'),
    'learner@example.com',
  );
  fireEvent.changeText(
    screen.getByPlaceholderText('Your password'),
    'hunter22!',
  );
  // Wrapped in act so the async submit handler's state updates (including
  // ones landing after the awaited Clerk calls) are flushed without warnings.
  await act(async () => {
    fireEvent.press(screen.getByText('Sign in'));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSignIn.status = undefined;
  mockSignIn.supportedSecondFactors = [];
});

// ─── tests ───────────────────────────────────────────────────────────────────

describe('needs_client_trust with an email_code second factor', () => {
  it('sends the second-factor code, shows the code step, verifies via mfa, and finalizes', async () => {
    mockSignIn.password.mockImplementation(async () => {
      mockSignIn.status = 'needs_client_trust';
      mockSignIn.supportedSecondFactors = [{ strategy: 'email_code' }];
      return {};
    });
    mockSignIn.mfa.sendEmailCode.mockResolvedValue({});
    mockSignIn.mfa.verifyEmailCode.mockImplementation(async () => {
      mockSignIn.status = 'complete';
      return {};
    });
    mockSignIn.finalize.mockImplementation(
      async ({ navigate }: { navigate: () => void }) => {
        navigate();
        return {};
      },
    );

    render(<SignInScreen />);
    await submitPassword();

    // Second-factor send fired automatically; first-factor send did not.
    await waitFor(() =>
      expect(mockSignIn.mfa.sendEmailCode).toHaveBeenCalledTimes(1),
    );
    expect(mockSignIn.emailCode.sendCode).not.toHaveBeenCalled();

    // The existing code step appears, with the new-device notice.
    expect(screen.getByText('Enter your code')).toBeOnTheScreen();
    expect(screen.getByText(/new device/i)).toBeOnTheScreen();

    // Entering the six-digit code verifies via the SECOND-factor call.
    fireEvent.changeText(screen.getByPlaceholderText('123456'), '424242');
    fireEvent.press(screen.getByText('Verify & sign in'));

    await waitFor(() =>
      expect(mockSignIn.mfa.verifyEmailCode).toHaveBeenCalledWith({
        code: '424242',
      }),
    );
    expect(mockSignIn.emailCode.verifyCode).not.toHaveBeenCalled();

    // Session finalized and the app opened.
    expect(mockSignIn.finalize).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledWith('/(app)/(tabs)');

    // Nothing about this expected flow reached Sentry.
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('"Send a new code" on the client-trust step resends via mfa, not the first factor', async () => {
    mockSignIn.password.mockImplementation(async () => {
      mockSignIn.status = 'needs_client_trust';
      mockSignIn.supportedSecondFactors = [{ strategy: 'email_code' }];
      return {};
    });
    mockSignIn.mfa.sendEmailCode.mockResolvedValue({});

    render(<SignInScreen />);
    await submitPassword();
    await waitFor(() =>
      expect(screen.getByText('Enter your code')).toBeOnTheScreen(),
    );

    fireEvent.press(screen.getByText('Send a new code'));

    await waitFor(() =>
      expect(mockSignIn.mfa.sendEmailCode).toHaveBeenCalledTimes(2),
    );
    expect(mockSignIn.emailCode.sendCode).not.toHaveBeenCalled();
  });
});

describe('needs_client_trust without an email_code second factor', () => {
  it('shows the status + offered strategies on screen and reports to Sentry', async () => {
    mockSignIn.password.mockImplementation(async () => {
      mockSignIn.status = 'needs_client_trust';
      mockSignIn.supportedSecondFactors = [{ strategy: 'phone_code' }];
      return {};
    });

    render(<SignInScreen />);
    await submitPassword();

    // Diagnostic copy carries the exact status and the second-factor
    // strategies Clerk offered — never a generic message.
    const alert = await screen.findByText(/needs_client_trust/);
    expect(alert).toBeOnTheScreen();
    expect(alert.props.children).toContain('phone_code');

    // No second-factor send was attempted; the state reached Sentry.
    expect(mockSignIn.mfa.sendEmailCode).not.toHaveBeenCalled();
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const reported = mockCaptureException.mock.calls[0][0] as Error;
    expect(reported.message).toContain('needs_client_trust');
    expect(reported.message).toContain('phone_code');
  });
});

// ─── the way back in, for a learner who cannot remember their password ──────

/**
 * THE ESCAPE EXISTED AND WAS UNLABELLED, which is the whole point of this pin.
 *
 * "Email me a sign-in code instead" has always run this handler, and it has
 * always worked; a locked-out learner scanning for the words "forgot" and
 * "password" simply never recognised it as recovery. These tests hold the
 * label, and they hold the fact that it does the same thing, so nobody
 * "tidies" one of the two away and quietly closes the only door out.
 *
 * It matters more on this fork than the others: India's Clerk instance runs
 * min_length 0 with min_zxcvbn_strength 2, so a refused password has no length
 * rule for the learner to reason about.
 */
describe('a locked-out learner can find the way back in', () => {
  it('offers "Forgot your password?" on the credentials step', () => {
    render(<SignInScreen />);
    expect(screen.getByText('Forgot your password?')).toBeOnTheScreen();
    // The passwordless entry point stays: it answers a DIFFERENT question,
    // "I never had a password", which is every web sign-up.
    expect(screen.getByText('Email me a sign-in code instead')).toBeOnTheScreen();
  });

  it('emails a code from it, rather than dead-ending', async () => {
    mockSignIn.emailCode.sendCode.mockResolvedValue({});
    render(<SignInScreen />);
    fireEvent.changeText(
      screen.getByPlaceholderText('you@example.com'),
      'learner@example.com',
    );
    await act(async () => {
      fireEvent.press(screen.getByText('Forgot your password?'));
    });
    expect(mockSignIn.emailCode.sendCode).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Enter your code')).toBeOnTheScreen();
  });

  it('says what to do first when there is no email yet, instead of nothing', async () => {
    render(<SignInScreen />);
    await act(async () => {
      fireEvent.press(screen.getByText('Forgot your password?'));
    });
    expect(mockSignIn.emailCode.sendCode).not.toHaveBeenCalled();
    expect(screen.getByText(/Enter your email above first/)).toBeOnTheScreen();
  });
});
