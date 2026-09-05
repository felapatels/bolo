/**
 * A rejected sign-up submit must never masquerade as a sent email.
 *
 * The 2026-08-31 incident (Sentry BOLO-MOBILE-13, cross-checked against
 * Clerk's application and email logs): a learner's create was rejected by
 * Clerk's password checks (422), yet the screen flipped to the code step and
 * announced "We sent a 6-digit code" — the 422 response piggybacks client
 * state, and a missing_requirements attempt in it drives the derived
 * awaitingCode. Her actual error only renders on the form branch, so the flip
 * hid it. Clerk's email log shows zero emails were ever sent to her. Her
 * escape attempt (client.destroy) then orphaned the local SignUp resource,
 * and the next submit PATCHed the dead attempt: "No sign up was found with
 * id sua_...", a wall no retry could pass.
 *
 * These tests pin the three defenses:
 *
 *  1. THE FLIP GUARD: a failed password() keeps the form view, even when
 *     Clerk's piggybacked state says missing_requirements. The rejection
 *     stays visible where it renders; no send is ever claimed or attempted.
 *  2. THE SELF-HEAL: password() failing with resource_not_found retries once
 *     through signUp.create(), which starts a fresh attempt and deactivates
 *     the stale one. Reported to Sentry so every heal stays observable.
 *  3. HONEST COPY: "We sent a 6-digit code" requires a send THIS SESSION
 *     confirmed. A failed send says so; a rehydrated code step (relaunch
 *     into a pending attempt) claims nothing it did not do.
 */

import React from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react-native';

// ─── mutable state controlled per-test ──────────────────────────────────────

const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn() };

const mockSignUp = {
  status: undefined as string | undefined,
  unverifiedFields: [] as string[],
  missingFields: [] as string[],
  password: jest.fn(),
  create: jest.fn(),
  finalize: jest.fn(),
  verifications: {
    sendEmailCode: jest.fn(),
    verifyEmailCode: jest.fn(),
  },
};

// Mutable so a test can mirror the real hook, which surfaces Clerk's field
// errors (e.g. a rejected password) through errors.fields after a failure.
const mockErrors = {
  raw: [] as unknown[],
  fields: {} as Record<string, { message: string } | undefined>,
};

const mockClerk = {
  session: null as { id?: string } | null,
  client: { destroy: jest.fn() } as { destroy: jest.Mock } | null,
};

// ─── external module mocks ───────────────────────────────────────────────────

// Same emitter convention as sign-up-abandon-attempt.test.tsx: mutating the
// mock objects cannot re-render the tree, so each render subscribes to a tiny
// emitter and tests push changes with notifyClerkChanged().
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
        errors: mockErrors,
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
jest.mock('@/components/AppleAuthButton', () => ({
  AppleAuthButton: () => null,
}));
jest.mock('@/components/GoogleAuthButton', () => ({
  GoogleAuthButton: () => null,
}));

import SignUpScreen from '@/app/(auth)/sign-up';

// ─── helpers ─────────────────────────────────────────────────────────────────

const EMAIL = 'learner@example.com';
const PASSWORD = 'hunter22!';

/** Clerk-shaped API error: { errors: [{ code, message }] }. */
function clerkError(code: string, message: string) {
  return { errors: [{ code, message, longMessage: message }] };
}

/** The piggybacked state the 2026-08-31 422 left on the client. */
function flipStateToAwaitingCode() {
  mockSignUp.status = 'missing_requirements';
  mockSignUp.unverifiedFields = ['email_address'];
  notifyClerkChanged();
}

function fillForm() {
  render(<SignUpScreen />);
  fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), EMAIL);
  fireEvent.changeText(
    screen.getByPlaceholderText('At least 8 characters'),
    PASSWORD,
  );
}

async function submit() {
  await act(async () => {
    fireEvent.press(screen.getByText('Create account'));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSignUp.status = undefined;
  mockSignUp.unverifiedFields = [];
  mockSignUp.missingFields = [];
  mockErrors.raw = [];
  mockErrors.fields = {};
  mockClerk.session = null;
  mockClerk.client = { destroy: jest.fn() };
});

// ─── 1. the flip guard ───────────────────────────────────────────────────────

describe('a rejected submit stays on the form', () => {
  it('keeps the form view and the visible rejection when password() fails while the piggybacked state says missing_requirements', async () => {
    fillForm();
    const rejection = clerkError(
      'form_password_pwned',
      'Password has been found in an online data breach.',
    );
    mockSignUp.password.mockImplementation(async () => {
      // The exact incident shape: the request fails AND the 422 response
      // piggybacks a missing_requirements attempt onto the client.
      mockErrors.fields.password = {
        message: 'Password has been found in an online data breach.',
      };
      flipStateToAwaitingCode();
      return { error: rejection };
    });

    await submit();

    // Still the form, not the code step: no flip, no false promise.
    expect(screen.getByText('Start speaking today')).toBeOnTheScreen();
    expect(screen.queryByText('Check your email')).toBeNull();

    // The rejection renders where the learner can read it.
    expect(
      screen.getByText('Password has been found in an online data breach.'),
    ).toBeOnTheScreen();

    // No send was attempted, so no send may ever be claimed.
    expect(mockSignUp.verifications.sendEmailCode).not.toHaveBeenCalled();

    // An expected user-input mistake is not an exception (existing policy).
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});

// ─── 2. the self-heal ────────────────────────────────────────────────────────

describe('a stale sign-up attempt heals itself', () => {
  it('retries via create() when password() hits resource_not_found, and reports the heal', async () => {
    fillForm();
    mockSignUp.password.mockResolvedValue({
      error: clerkError(
        'resource_not_found',
        'No sign up was found with id sua_3IhsKmW5mxqagxLylrWEGrWZ7Na',
      ),
    });
    mockSignUp.create.mockImplementation(async () => {
      flipStateToAwaitingCode();
      return {};
    });
    mockSignUp.verifications.sendEmailCode.mockResolvedValue({});

    await submit();

    // The fresh create carried the same credentials, exactly once.
    expect(mockSignUp.create).toHaveBeenCalledTimes(1);
    expect(mockSignUp.create).toHaveBeenCalledWith({
      emailAddress: EMAIL,
      password: PASSWORD,
    });

    // The learner lands where the working flow lands, send confirmed.
    expect(screen.getByText('Check your email')).toBeOnTheScreen();
    expect(screen.getByText(/We sent a 6-digit code/)).toBeOnTheScreen();

    // The heal is visible in Sentry, tagged with its own context.
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException.mock.calls[0][1].tags.authContext).toBe(
      'signUp.password.staleAttempt',
    );
  });

  it('stays on the form with the error visible when the create retry also fails', async () => {
    fillForm();
    mockSignUp.password.mockResolvedValue({
      error: clerkError('resource_not_found', 'No sign up was found with id sua_x'),
    });
    mockSignUp.create.mockResolvedValue({
      error: clerkError('resource_not_found', 'No sign up was found with id sua_x'),
    });

    await submit();

    expect(screen.getByText('Start speaking today')).toBeOnTheScreen();
    expect(screen.queryByText('Check your email')).toBeNull();
    expect(
      screen.getByText('No sign up was found with id sua_x'),
    ).toBeOnTheScreen();
    // Reported twice: once for the heal attempt, once for the final failure.
    expect(mockCaptureException).toHaveBeenCalledTimes(2);
  });
});

// ─── 3. honest copy on the code step ─────────────────────────────────────────

describe('the sent claim requires a confirmed send', () => {
  it('says no email is coming, with Start over primary, when the send fails', async () => {
    fillForm();
    mockSignUp.password.mockImplementation(async () => {
      flipStateToAwaitingCode();
      return {};
    });
    mockSignUp.verifications.sendEmailCode.mockResolvedValue({
      error: clerkError('rate_limit_exceeded', 'Too many requests.'),
    });

    await submit();

    expect(screen.getByText('We could not send the code')).toBeOnTheScreen();
    expect(screen.queryByText(/We sent a 6-digit code/)).toBeNull();
    expect(screen.getByText('Start over')).toBeOnTheScreen();
    expect(screen.queryByText('Verify & continue')).toBeNull();
  });

  it('claims no send on a rehydrated code step (relaunch into a pending attempt)', () => {
    // The derived-state relaunch: status arrives from the server before any
    // submit in this session. The screen may show the code step, but it did
    // not send anything and must not say it did.
    mockSignUp.status = 'missing_requirements';
    mockSignUp.unverifiedFields = ['email_address'];

    render(<SignUpScreen />);

    expect(screen.getByText('Check your email')).toBeOnTheScreen();
    expect(screen.queryByText(/We sent a 6-digit code/)).toBeNull();
    expect(
      screen.getByText(/If nothing arrived, send a new code below/),
    ).toBeOnTheScreen();
    expect(screen.getByText('Send a new code')).toBeOnTheScreen();
    expect(mockSignUp.verifications.sendEmailCode).not.toHaveBeenCalled();
  });
});

// ─── 4. the only thing that tells her WHY ────────────────────────────────────

/**
 * EVERY PASSWORD REFUSAL REACHES THE LEARNER THROUGH ONE PROP, and nothing
 * else on this screen would say a word if it went.
 *
 * All three refusal codes are in EXPECTED_USER_ERROR_CODES (lib/authErrors.ts),
 * so handleUnexpected returns EARLY and never sets formError. That is correct:
 * these are the learner's problem, not a crash. The consequence is that the
 * banner stays empty and the ONLY thing rendering Clerk's reason is
 * `error={fieldError(errors.fields.password)}` on the password Field. Delete
 * that one prop and the screen refuses the account in silence.
 *
 * THIS MATTERS MOST ON INDIA'S PRODUCTION INSTANCE, which enforces zxcvbn
 * strength (min_zxcvbn_strength 2) rather than a length floor. The client
 * checklist knows nothing about zxcvbn, so a dictionary password like
 * "password1" turns every rule green, enables the button, and is refused by
 * Clerk. What the learner reads is whatever comes back through this prop.
 */
describe('a password refusal is always visible to the learner', () => {
  it.each([
    ['form_password_length_too_short', 'Passwords must be 8 characters or more.'],
    ['form_password_validation_failed', 'Password is too weak. Try a longer phrase.'],
  ])('renders the reason Clerk gives for %s', async (code, message) => {
    fillForm();
    const rejection = clerkError(code, message);
    mockSignUp.password.mockImplementation(async () => {
      mockErrors.fields.password = { message };
      return { error: rejection };
    });

    await submit();

    // On the form, and the reason is on screen where the field is.
    expect(screen.getByText('Start speaking today')).toBeOnTheScreen();
    expect(screen.getByText(message)).toBeOnTheScreen();
  });

  it('renders nothing when Clerk names no field, rather than inventing a reason', async () => {
    // The guard on the other side: an empty errors.fields must not put a
    // stray blank error under the password box.
    fillForm();
    mockSignUp.password.mockImplementation(async () => {
      mockErrors.fields = {};
      return { error: clerkError('form_password_validation_failed', 'Too weak.') };
    });

    await submit();

    expect(screen.getByText('Start speaking today')).toBeOnTheScreen();
    expect(screen.queryByText('Too weak.')).toBeNull();
  });
});
