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

function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth-limit]';
  if (typeof value === 'string') return value.replace(EMAIL_RE, '[email]');
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
        out[k] = '[redacted]';
      } else {
        out[k] = scrubValue(v, depth + 1);
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
