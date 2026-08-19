import { Sentry, sentryEnabled } from '@/lib/sentry';

// Shared error handling for the auth screens. Two hard rules (production
// incident, July 2026, silent sign-in failure with nothing in Sentry):
//
// 1. NO SILENT FAILURES: every auth operation that errors or stops at a
//    non-complete status must produce a user-visible message AND (unless it
//    is an expected user-input mistake) a Sentry event.
// 2. OBSERVABILITY OVER GENERIC COPY: when a flow stops at an unexpected
//    status, the status and the factors Clerk offered must appear both in
//    the user-visible copy and in the Sentry event, never hidden behind a
//    generic "something went wrong".
//
// PII: never pass email addresses, passwords, or codes into these helpers.
// Factor lists must be strategy strings only (e.g. 'email_code'), never the
// factor objects (they carry safeIdentifier). lib/sentry.ts scrubbing is the
// backstop, not the primary defense.

/**
 * Clerk error codes that represent expected user-input mistakes (bad
 * credential/code/format entered by the user). These are shown to the user
 * but NOT reported to Sentry, a wrong password is not an exception.
 * Deliberately narrow: operational/auth-state failures (rate limits,
 * session conflicts, nil params) are NOT here and DO reach Sentry.
 */
const EXPECTED_USER_ERROR_CODES = new Set([
  'form_password_incorrect',
  'form_identifier_not_found',
  'form_identifier_exists',
  'form_code_incorrect',
  'form_param_format_invalid',
  'form_password_length_too_short',
  'form_password_pwned',
  'form_password_validation_failed',
  'verification_failed', // wrong code entered
  'verification_expired', // code entered too late
]);

type ClerkErrorEntry = {
  code?: string;
  message?: string;
  longMessage?: string;
};

function firstClerkError(err: unknown): ClerkErrorEntry | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const list = (err as { errors?: unknown }).errors;
  if (Array.isArray(list) && list.length > 0 && typeof list[0] === 'object') {
    return list[0] as ClerkErrorEntry;
  }
  const code = (err as ClerkErrorEntry).code;
  const message = (err as ClerkErrorEntry).message;
  if (typeof code === 'string' || typeof message === 'string') {
    return err as ClerkErrorEntry;
  }
  return undefined;
}

export function authErrorCode(err: unknown): string | undefined {
  const entry = firstClerkError(err);
  return typeof entry?.code === 'string' ? entry.code : undefined;
}

/** Best human-readable message from a Clerk (or unknown) error. */
export function authErrorMessage(err: unknown): string {
  const entry = firstClerkError(err);
  const m = entry?.longMessage ?? entry?.message;
  if (typeof m === 'string' && m.length > 0) return m;
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong. Please try again.';
}

/** True for expected user-input mistakes (wrong password, bad code, ...). */
export function isExpectedUserError(err: unknown): boolean {
  const code = authErrorCode(err);
  return code !== undefined && EXPECTED_USER_ERROR_CODES.has(code);
}

/**
 * Report an auth failure to Sentry unless it is an expected user-input
 * error. `context` names the operation (e.g. 'signIn.password');
 * `extra` may carry only non-PII details (status, factor strategies).
 */
export function reportAuthError(
  context: string,
  err: unknown,
  extra?: Record<string, unknown>,
): void {
  if (isExpectedUserError(err)) return;
  if (!sentryEnabled) return;
  const exception =
    err instanceof Error
      ? err
      : new Error(`${context} failed: ${authErrorMessage(err)}`);
  Sentry.captureException(exception, {
    tags: { authContext: context },
    extra: { authContext: context, clerkErrorCode: authErrorCode(err), ...extra },
  });
}

/** Error type for flows that stopped at a non-complete Clerk status. */
export class AuthIncompleteStateError extends Error {
  constructor(context: string, status: string, factors: string[]) {
    super(
      `${context} stopped at status "${status}" (factors: ${
        factors.length > 0 ? factors.join(', ') : 'none offered'
      })`,
    );
    this.name = 'AuthIncompleteStateError';
  }
}

/**
 * Report a flow that returned success but did not reach status 'complete'
 * and could not be routed to a supported factor. Always reported, this is
 * the exact shape of the July 2026 silent-failure incident.
 */
export function reportAuthIncompleteState(
  context: string,
  status: string,
  factorStrategies: string[],
  /**
   * Non-PII detail about WHERE the flow stopped: which phase of an SSO
   * transfer, the verification statuses, the sign-up fields still missing.
   * The reviewer's rejected session was unreadable without these.
   */
  extra?: Record<string, unknown>,
): void {
  if (!sentryEnabled) return;
  Sentry.captureException(
    new AuthIncompleteStateError(context, status, factorStrategies),
    {
      tags: { authContext: context, signInStatus: status },
      extra: { authContext: context, status, factorStrategies, ...extra },
    },
  );
}

/**
 * User-visible copy for a non-complete status. Deliberately includes the
 * status and offered factors so an unexpected state is observable from a
 * user's screenshot, not just from Sentry.
 */
export function incompleteStateMessage(
  status: string,
  factorStrategies: string[],
): string {
  const factors =
    factorStrategies.length > 0
      ? `available sign-in methods: ${factorStrategies.join(', ')}`
      : 'no sign-in methods offered';
  return `Sign-in did not complete (status: ${status}; ${factors}). Please try again, if this keeps happening, contact support and mention this message.`;
}
