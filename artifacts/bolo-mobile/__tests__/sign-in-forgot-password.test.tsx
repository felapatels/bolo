/**
 * Mobile's password recovery, built 2026-09-15 (ledger X109).
 *
 * WHY IT EXISTS. The owner switched email-code SIGN-IN off in all six Bolo
 * Clerk instances ("only emails a code on signup not every login"). Both of
 * this screen's recovery doors, "Forgot your password?" and "Email me a
 * sign-in code instead", ran signIn.emailCode.sendCode, which from then on
 * could only fail with factor_not_found (163 Sentry events across the six
 * apps in the 30 days to 2026-09-15), so mobile had no working recovery.
 *
 * These tests pin its replacement, Clerk's reset flow on the signal API
 * (@clerk/expo 3.7.8 over @clerk/shared 4.29.3):
 *
 *  1. signIn.create({ identifier }), resetPasswordEmailCode.sendCode(),
 *     .verifyCode({ code }) to status needs_new_password, .submitPassword()
 *     to status complete, then finalize into the app, in that order.
 *  2. An account whose fresh sign-in offers no reset factor is told so
 *     plainly, pointed at the Apple and Google buttons, and sent nothing.
 *  3. No path reaches signIn.emailCode.sendCode, and "Email me a sign-in
 *     code instead" is gone.
 *  4. Expected user errors render under their fields and stay out of Sentry;
 *     an unexpected Clerk error, thrown or returned, is visible AND reported.
 *  5. A password Clerk refuses as breached, or a password sign-in stopped at
 *     needs_first_factor with the reset factor offered, routes into the reset
 *     with a line saying why; the code steps never loop back into one.
 *
 * THE MOCK COPIES CLERK, NOT THE SCREEN. A hand-written mock is a second copy
 * of the contract and can encode the very bug it guards, so the reset calls
 * here behave the way clerk-js 6.29.3 does, read from its dist rather than
 * assumed: sendCode THROWS when no sign-in exists and returns
 * factor_not_found when the sign-in offers no reset factor, verifyCode moves
 * the status to needs_new_password, submitPassword moves it to complete, and
 * finalize throws without a created session. The sign-in code send fails
 * exactly the way production does today.
 *
 * NONE OF THIS HAS RUN AGAINST A LIVE CLERK INSTANCE. It needs a device check.
 */

import React from 'react';
import { Platform } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

// ─── mutable state controlled per-test ──────────────────────────────────────

const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn() };

type Factor = { strategy: string };

const mockSignIn = {
  id: undefined as string | undefined,
  status: 'needs_identifier' as string,
  createdSessionId: null as string | null,
  supportedFirstFactors: [] as Factor[],
  supportedSecondFactors: [] as Factor[],
  create: jest.fn(),
  password: jest.fn(),
  finalize: jest.fn(),
  emailCode: {
    sendCode: jest.fn(),
    verifyCode: jest.fn(),
  },
  resetPasswordEmailCode: {
    sendCode: jest.fn(),
    verifyCode: jest.fn(),
    submitPassword: jest.fn(),
  },
  mfa: {
    sendEmailCode: jest.fn(),
    verifyEmailCode: jest.fn(),
  },
};

// Mutable so a test can mirror the real hook, which surfaces Clerk's field
// errors through errors.fields after a failure.
const mockErrors = {
  raw: [] as unknown[],
  fields: {} as Record<string, { message: string } | undefined>,
};

// ─── external module mocks ───────────────────────────────────────────────────

// Same emitter convention as sign-up-failed-create.test.tsx: mutating the mock
// objects cannot re-render the tree, and an expected error changes no screen
// state of its own, so a test pushes the change with notifyClerkChanged(), as
// the real signal does.
jest.mock('@clerk/expo', () => {
  const React = require('react');
  const listeners = new Set<() => void>();
  return {
    __notify: () => listeners.forEach((l) => l()),
    useSignIn: () => {
      const [, setTick] = React.useState(0);
      React.useEffect(() => {
        const listener = () => setTick((t: number) => t + 1);
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }, []);
      return {
        signIn: mockSignIn,
        errors: mockErrors,
        fetchStatus: 'idle',
      };
    },
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

// The jest.fn is created inside the factory (module imports are hoisted above
// top-level consts, so a file-level fn would be undefined at factory time).
jest.mock('@/lib/sentry', () => ({
  sentryEnabled: true,
  Sentry: { captureException: jest.fn() },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockCaptureException = require('@/lib/sentry').Sentry
  .captureException as jest.Mock;

jest.mock('@/components/Screen', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
  };
});
jest.mock('@/components/Mascot', () => ({ Mascot: () => null }));

// SSO buttons pull in Clerk useSSO + native browser modules, irrelevant here.
jest.mock('@/components/AppleAuthButton', () => ({
  AppleAuthButton: () => null,
}));
jest.mock('@/components/GoogleAuthButton', () => ({
  GoogleAuthButton: () => null,
}));

import SignInScreen from '@/app/(auth)/sign-in';

// ─── helpers ─────────────────────────────────────────────────────────────────

const EMAIL = 'learner@example.com';
const NEW_PASSWORD = 'bolo1234';

/** Clerk-shaped API error: { errors: [{ code, message, longMessage }] }. */
function clerkError(code: string, message: string) {
  return { errors: [{ code, message, longMessage: message }] };
}

const offers = (strategy: string) =>
  mockSignIn.supportedFirstFactors.some((f) => f.strategy === strategy);

/**
 * What POST /v1/client/sign_ins with only an identifier leaves on the
 * resource: an id, needs_first_factor, and the factors Clerk offers that
 * account.
 */
function signInCreatesWith(strategies: string[]) {
  mockSignIn.create.mockImplementation(async () => {
    mockSignIn.id = 'sia_reset';
    mockSignIn.status = 'needs_first_factor';
    mockSignIn.supportedFirstFactors = strategies.map((strategy) => ({
      strategy,
    }));
    return { error: null };
  });
}

function renderWithEmail() {
  render(<SignInScreen />);
  fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), EMAIL);
}

async function press(label: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(label));
  });
}

/** From the credentials form to the reset code step, via the forgot link. */
async function openResetCodeStep() {
  renderWithEmail();
  await press('Forgot your password?');
  await screen.findByText('Enter your code');
}

/** On to the new-password step, with the default Clerk behaviour. */
async function openNewPasswordStep() {
  await openResetCodeStep();
  fireEvent.changeText(screen.getByPlaceholderText('123456'), '424242');
  await press('Verify code');
  await screen.findByText('Choose a new password');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSignIn.id = undefined;
  mockSignIn.status = 'needs_identifier';
  mockSignIn.createdSessionId = null;
  mockSignIn.supportedFirstFactors = [];
  mockSignIn.supportedSecondFactors = [];
  mockErrors.raw = [];
  mockErrors.fields = {};

  // A password account, as a fresh sign-in sees it with email-code sign-in off.
  signInCreatesWith(['password', 'reset_password_email_code']);

  // clerk-js 6.29.3 sendResetPasswordEmailCode: its "no sign-in" guard sits
  // outside the wrapper that converts failures into { error }, so it throws;
  // a missing factor comes back as a returned factor_not_found.
  mockSignIn.resetPasswordEmailCode.sendCode.mockImplementation(async () => {
    if (!mockSignIn.id) {
      throw new Error('Cannot reset password without a sign in.');
    }
    if (!offers('reset_password_email_code')) {
      return {
        error: {
          code: 'factor_not_found',
          message: 'Reset password email code factor not found',
        },
      };
    }
    return { error: null };
  });
  mockSignIn.resetPasswordEmailCode.verifyCode.mockImplementation(async () => {
    mockSignIn.status = 'needs_new_password';
    return { error: null };
  });
  mockSignIn.resetPasswordEmailCode.submitPassword.mockImplementation(
    async () => {
      mockSignIn.status = 'complete';
      mockSignIn.createdSessionId = 'sess_reset';
      return { error: null };
    },
  );
  mockSignIn.finalize.mockImplementation(
    async ({ navigate }: { navigate: () => void }) => {
      if (!mockSignIn.createdSessionId) {
        throw new Error('Cannot finalize sign-in without a created session.');
      }
      navigate();
      return { error: null };
    },
  );
  // Production since 2026-09-15: the email-code first factor is off, so the
  // sign-in code send can only fail. Nothing may call it.
  mockSignIn.emailCode.sendCode.mockResolvedValue({
    error: { code: 'factor_not_found', message: 'Email code factor not found' },
  });
});

// ─── 1. the whole reset ──────────────────────────────────────────────────────

describe('"Forgot your password?" resets the password, start to finish', () => {
  it('creates a sign-in, sends the reset code, verifies it, saves the new password and opens the app', async () => {
    renderWithEmail();
    await press('Forgot your password?');

    // A fresh sign-in for the typed email, THEN the reset code.
    await waitFor(() =>
      expect(mockSignIn.resetPasswordEmailCode.sendCode).toHaveBeenCalledTimes(1),
    );
    expect(mockSignIn.create).toHaveBeenCalledTimes(1);
    expect(mockSignIn.create).toHaveBeenCalledWith({ identifier: EMAIL });
    expect(mockSignIn.create.mock.invocationCallOrder[0]).toBeLessThan(
      mockSignIn.resetPasswordEmailCode.sendCode.mock.invocationCallOrder[0],
    );
    // It takes no arguments: Clerk resets the first email on the account.
    expect(mockSignIn.resetPasswordEmailCode.sendCode).toHaveBeenCalledWith();

    // The code step says where the code went and what it is for.
    expect(screen.getByText('Enter your code')).toBeOnTheScreen();
    expect(
      screen.getByText(
        `We sent a 6-digit code to ${EMAIL}. Enter it to choose a new password.`,
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText('Reset code')).toBeOnTheScreen();

    fireEvent.changeText(screen.getByPlaceholderText('123456'), '424242');
    await press('Verify code');

    // The reset verify, never the sign-in code or the new-device one.
    await waitFor(() =>
      expect(mockSignIn.resetPasswordEmailCode.verifyCode).toHaveBeenCalledWith({
        code: '424242',
      }),
    );
    expect(mockSignIn.emailCode.verifyCode).not.toHaveBeenCalled();
    expect(mockSignIn.mfa.verifyEmailCode).not.toHaveBeenCalled();

    // needs_new_password opens the new-password step, with sign-up's checklist.
    expect(screen.getByText('Choose a new password')).toBeOnTheScreen();
    fireEvent.changeText(
      screen.getByPlaceholderText('At least 8 characters'),
      NEW_PASSWORD,
    );
    expect(screen.getByTestId('password-checklist')).toBeOnTheScreen();
    await press('Save password & sign in');

    // The new password, other devices signed out, then into the app.
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith('/(app)/(tabs)'),
    );
    expect(mockSignIn.resetPasswordEmailCode.submitPassword).toHaveBeenCalledWith({
      password: NEW_PASSWORD,
      signOutOfOtherSessions: true,
    });
    expect(mockSignIn.finalize).toHaveBeenCalledTimes(1);

    // Never the dead door, and nothing about a working reset reaches Sentry.
    expect(mockSignIn.emailCode.sendCode).not.toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('"Send a new code" resends the reset code on the sign-in in hand, not a sign-in or new-device code', async () => {
    await openResetCodeStep();

    await press('Send a new code');

    await waitFor(() =>
      expect(mockSignIn.resetPasswordEmailCode.sendCode).toHaveBeenCalledTimes(2),
    );
    expect(mockSignIn.create).toHaveBeenCalledTimes(1);
    expect(screen.getByText(`We sent a new code to ${EMAIL}.`)).toBeOnTheScreen();
    expect(mockSignIn.emailCode.sendCode).not.toHaveBeenCalled();
    expect(mockSignIn.mfa.sendEmailCode).not.toHaveBeenCalled();
  });
});

// ─── 2. nothing to reset ─────────────────────────────────────────────────────

describe('an account with no password to reset', () => {
  it('says so plainly, points at Continue with Apple and Google, and sends nothing', async () => {
    // The brief's example: an account whose sign-in offers no reset factor.
    signInCreatesWith(['oauth_google']);
    renderWithEmail();
    await press('Forgot your password?');

    const line = await screen.findByText(/This account has no password to reset/);
    // jest-expo renders as iOS, where both buttons are on screen.
    expect(Platform.OS).toBe('ios');
    expect(line.props.children).toContain('Continue with Apple');
    expect(line.props.children).toContain('Continue with Google');

    // Expected routing: nothing sent by either door, nothing in Sentry, and
    // the learner stays on the form where those buttons are.
    expect(mockSignIn.create).toHaveBeenCalledTimes(1);
    expect(mockSignIn.resetPasswordEmailCode.sendCode).not.toHaveBeenCalled();
    expect(mockSignIn.emailCode.sendCode).not.toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(screen.getByText('Welcome back')).toBeOnTheScreen();
  });

  it('never points an Android learner at an Apple button that is not there', async () => {
    const savedOS = Platform.OS;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Platform as any).OS = 'android';
    try {
      signInCreatesWith(['oauth_apple']);
      renderWithEmail();
      await press('Forgot your password?');

      const line = await screen.findByText(
        /This account has no password to reset/,
      );
      expect(line.props.children).toContain('Continue with Google');
      expect(line.props.children).not.toContain('Continue with Apple');
      expect(line.props.children).toContain('sign in on an iPhone or iPad');
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Platform as any).OS = savedOS;
    }
  });
});

// ─── 3. the dead doors ───────────────────────────────────────────────────────

describe('the email-code sign-in doors are closed', () => {
  it('no longer offers "Email me a sign-in code instead"', () => {
    render(<SignInScreen />);
    expect(screen.getByText('Forgot your password?')).toBeOnTheScreen();
    expect(screen.queryByText('Email me a sign-in code instead')).toBeNull();
    expect(screen.queryByText(/sign-in code/i)).toBeNull();
  });
});

// ─── 4. errors ───────────────────────────────────────────────────────────────

describe('expected errors stay under their fields, unexpected ones are seen and reported', () => {
  it('an unknown email renders under the Email field and stays out of Sentry', async () => {
    mockSignIn.create.mockImplementation(async () => {
      mockErrors.fields.identifier = { message: "Couldn't find your account." };
      notifyClerkChanged();
      return {
        error: clerkError('form_identifier_not_found', "Couldn't find your account."),
      };
    });
    renderWithEmail();
    await press('Forgot your password?');

    expect(await screen.findByText("Couldn't find your account.")).toBeOnTheScreen();
    expect(mockSignIn.resetPasswordEmailCode.sendCode).not.toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('a wrong reset code stays on the code step and out of Sentry', async () => {
    mockSignIn.resetPasswordEmailCode.verifyCode.mockImplementation(async () => {
      mockErrors.fields.code = { message: 'Incorrect code' };
      notifyClerkChanged();
      return { error: clerkError('form_code_incorrect', 'Incorrect code') };
    });
    await openResetCodeStep();
    fireEvent.changeText(screen.getByPlaceholderText('123456'), '000000');
    await press('Verify code');

    expect(await screen.findByText('Incorrect code')).toBeOnTheScreen();
    expect(screen.queryByText('Choose a new password')).toBeNull();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('a refused new password renders under its field, does not reroute, and an expected refusal stays out of Sentry', async () => {
    const reason = 'Password has been found in an online data breach.';
    mockSignIn.resetPasswordEmailCode.submitPassword.mockImplementation(
      async () => {
        mockErrors.fields.password = { message: reason };
        notifyClerkChanged();
        return { error: clerkError('form_password_pwned', reason) };
      },
    );
    await openNewPasswordStep();
    fireEvent.changeText(
      screen.getByPlaceholderText('At least 8 characters'),
      NEW_PASSWORD,
    );
    await press('Save password & sign in');

    expect(await screen.findByText(reason)).toBeOnTheScreen();
    // Still choosing: the breached-password route belongs to sign-in only.
    expect(screen.getByText('Choose a new password')).toBeOnTheScreen();
    expect(mockSignIn.resetPasswordEmailCode.sendCode).toHaveBeenCalledTimes(1);
    expect(mockSignIn.finalize).not.toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('an unexpected Clerk error on the reset send is on screen and in Sentry', async () => {
    mockSignIn.resetPasswordEmailCode.sendCode.mockResolvedValue({
      error: clerkError(
        'too_many_requests',
        'Too many requests. Please try again in a bit.',
      ),
    });
    renderWithEmail();
    await press('Forgot your password?');

    expect(
      await screen.findByText('Too many requests. Please try again in a bit.'),
    ).toBeOnTheScreen();
    // No code step claims a send that failed.
    expect(screen.queryByText('Enter your code')).toBeNull();
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException.mock.calls[0][1].tags.authContext).toBe(
      'signIn.forgotPassword.resetPasswordEmailCode.sendCode',
    );
    // And the dead door is not tried as a fallback.
    expect(mockSignIn.emailCode.sendCode).not.toHaveBeenCalled();
  });

  it('a THROWN reset send (no sign-in to reset) is on screen and in Sentry, never silent', async () => {
    // create() answers without leaving a sign-in behind, so clerk-js's own
    // guard throws instead of returning { error }.
    mockSignIn.create.mockImplementation(async () => {
      mockSignIn.supportedFirstFactors = [
        { strategy: 'password' },
        { strategy: 'reset_password_email_code' },
      ];
      return { error: null };
    });
    renderWithEmail();
    await press('Forgot your password?');

    expect(
      await screen.findByText('Cannot reset password without a sign in.'),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Enter your code')).toBeNull();
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});

// ─── 5. routed into the reset ────────────────────────────────────────────────

describe('a password Clerk will not accept routes into the reset', () => {
  it('a breached password (form_password_pwned) sends the reset code with the reason, and nothing reaches Sentry', async () => {
    mockSignIn.password.mockResolvedValue({
      error: clerkError(
        'form_password_pwned',
        'Password has been found in an online data breach. For account safety, please reset your password.',
      ),
    });
    renderWithEmail();
    fireEvent.changeText(screen.getByPlaceholderText('Your password'), 'password1');
    await press('Sign in');

    await waitFor(() =>
      expect(mockSignIn.resetPasswordEmailCode.sendCode).toHaveBeenCalledTimes(1),
    );
    expect(mockSignIn.create).toHaveBeenCalledWith({ identifier: EMAIL });
    expect(screen.getByText('Enter your code')).toBeOnTheScreen();
    expect(screen.getByText(/appeared in a data breach/)).toBeOnTheScreen();
    expect(mockSignIn.emailCode.sendCode).not.toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('a password sign-in stopped at needs_first_factor with the reset factor sends the reset code, with the status on screen', async () => {
    mockSignIn.password.mockImplementation(async () => {
      mockSignIn.id = 'sia_password';
      mockSignIn.status = 'needs_first_factor';
      mockSignIn.supportedFirstFactors = [
        { strategy: 'password' },
        { strategy: 'reset_password_email_code' },
      ];
      return { error: null };
    });
    renderWithEmail();
    fireEvent.changeText(screen.getByPlaceholderText('Your password'), 'hunter22!');
    await press('Sign in');

    await waitFor(() =>
      expect(mockSignIn.resetPasswordEmailCode.sendCode).toHaveBeenCalledTimes(1),
    );
    // The sign-in in hand already carries the identifier.
    expect(mockSignIn.create).not.toHaveBeenCalled();
    expect(screen.getByText(/status: needs_first_factor/)).toBeOnTheScreen();
    expect(mockSignIn.emailCode.sendCode).not.toHaveBeenCalled();
    // A password account should have completed in one shot: still reported.
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect((mockCaptureException.mock.calls[0][0] as Error).message).toContain(
      'needs_first_factor',
    );
  });

  it('needs_first_factor without the reset factor keeps the observable incomplete-state error', async () => {
    mockSignIn.password.mockImplementation(async () => {
      mockSignIn.id = 'sia_password';
      mockSignIn.status = 'needs_first_factor';
      mockSignIn.supportedFirstFactors = [{ strategy: 'password' }];
      return { error: null };
    });
    renderWithEmail();
    fireEvent.changeText(screen.getByPlaceholderText('Your password'), 'hunter22!');
    await press('Sign in');

    expect(
      await screen.findByText(/Sign-in did not complete \(status: needs_first_factor/),
    ).toBeOnTheScreen();
    expect(mockSignIn.resetPasswordEmailCode.sendCode).not.toHaveBeenCalled();
    expect(mockSignIn.emailCode.sendCode).not.toHaveBeenCalled();
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('a reset code that verifies into anything but needs_new_password stops observably and never loops into another reset', async () => {
    // Verified, yet the status never moved: the code step must not start a
    // fresh reset from here.
    mockSignIn.resetPasswordEmailCode.verifyCode.mockResolvedValue({ error: null });
    await openResetCodeStep();
    fireEvent.changeText(screen.getByPlaceholderText('123456'), '424242');
    await press('Verify code');

    expect(
      await screen.findByText(/Sign-in did not complete \(status: needs_first_factor/),
    ).toBeOnTheScreen();
    expect(mockSignIn.resetPasswordEmailCode.sendCode).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Choose a new password')).toBeNull();
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});
