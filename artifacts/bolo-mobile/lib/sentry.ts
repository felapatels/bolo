import * as Sentry from '@sentry/react-native';

// Error reporting. Initialized only when EXPO_PUBLIC_SENTRY_DSN is present
// (never committed); without it every Sentry call is a no-op, and Expo Go
// dev sessions behave exactly as before.
//
// PII policy: no user email addresses and no phrase/transcript content may
// leave the device. `scrubEvent` strips known sensitive keys and masks
// anything that still looks like an email address.

const SENSITIVE_KEYS = new Set([
  'email',
  'emailaddress',
  'email_address',
  'primaryemailaddress',
  'transcript',
  'transcription',
  'audiobase64',
  'audio_base64',
  'nativescript',
  'native_script',
  'romanized',
  'english',
  'targetnative',
  'targetromanized',
  'targetenglish',
  'transcriptenglish',
  'text',
  'audio',
  'phrase',
  'phrasetext',
  'expected',
  'acceptedanswers',
  'accepted_answers',
]);

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

// Depth guard. This is a runaway/cycle backstop ONLY, it must never be
// shallow enough to reach the parts of a Sentry event we need to read.
//
// Trap (cost a full debugging session, Aug 2026): the guard used to be
// `depth > 6`, and a stack frame sits at depth 7:
//   event(0) → exception(1) → values(2) → values[0](3) → stacktrace(4)
//   → frames(5) → frames[n](6) → filename/function/lineno(7)
// so EVERY frame field shipped as the literal string '[depth-limit]' and
// every trace in Sentry was unreadable. The frames were being destroyed
// here, in our own beforeSend, not lost to missing source maps.
//
// Cycles are handled by `seen` (Sentry events can hold repeated references),
// so the depth number no longer has to be small to be safe.
const MAX_DEPTH = 24;

function scrubValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > MAX_DEPTH) return '[depth-limit]';
  if (typeof value === 'string') return value.replace(EMAIL_RE, '[email]');
  if (Array.isArray(value)) {
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    return value.map((v) => scrubValue(v, depth + 1, seen));
  }
  if (value && typeof value === 'object') {
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
        out[k] = '[redacted]';
      } else {
        out[k] = scrubValue(v, depth + 1, seen);
      }
    }
    return out;
  }
  return value;
}

export function scrubEvent<T extends Sentry.Event>(event: T): T {
  return scrubValue(event) as T;
}

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export const sentryEnabled = Boolean(dsn);

export function initSentry(): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: __DEV__ ? 'development' : 'production',
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.user) event.user = { id: event.user.id };
      return scrubEvent(event);
    },
    beforeBreadcrumb(breadcrumb) {
      return scrubEvent(breadcrumb as Sentry.Event) as typeof breadcrumb;
    },
  });

  // Dev-only deliberate error so reporting can be verified end to end:
  // set EXPO_PUBLIC_SENTRY_TEST=1 and reload the dev app once.
  if (__DEV__ && process.env.EXPO_PUBLIC_SENTRY_TEST === '1') {
    Sentry.captureException(
      new Error('Sentry verification error (bolo-mobile, dev only)'),
    );
  }
}

/** Attach the signed-in user's id (and nothing else) to error reports. */
export function setSentryUser(userId: string | null): void {
  if (!sentryEnabled) return;
  Sentry.setUser(userId ? { id: userId } : null);
}

export { Sentry };
