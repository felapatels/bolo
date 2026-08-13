import * as Sentry from "@sentry/node";

// Error reporting. Initialized only when SENTRY_DSN is present in the
// environment (never committed); a missing DSN makes every Sentry call a
// no-op, so dev environments without the secret behave exactly as before.
//
// PII policy: no user email addresses and no phrase/transcript content may
// leave the process. `scrubEvent` strips known sensitive keys and masks
// anything that still looks like an email address.

// Compared against keys normalized to lowercase alphanumerics, so one entry
// covers camelCase, snake_case, and kebab-case variants (targetNative,
// target_native, ... all normalize to "targetnative").
const SENSITIVE_KEYS = new Set([
  "email",
  "emailaddress",
  "primaryemailaddress",
  "transcript",
  "transcription",
  "transcriptenglish",
  "audiobase64",
  "audio",
  "nativescript",
  "romanized",
  "english",
  "phrase",
  "phrasetext",
  "targetnative",
  "targetromanized",
  "targetenglish",
  "text",
  "expected",
  "acceptedanswers",
]);

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

// Depth guard. This is a runaway/cycle backstop ONLY — it must never be
// shallow enough to reach the parts of a Sentry event we need to read.
//
// Trap (cost a full debugging session, Aug 2026): the guard used to be
// `depth > 6`, and a stack frame sits at depth 7:
//   event(0) → exception(1) → values(2) → values[0](3) → stacktrace(4)
//   → frames(5) → frames[n](6) → filename/function/lineno(7)
// so EVERY frame field shipped as the literal string "[depth-limit]" and
// every trace in Sentry was unreadable. The frames were being destroyed
// here, in our own beforeSend — not lost to missing source maps.
//
// Cycles are handled by `seen` (Sentry events can hold repeated references),
// so the depth number no longer has to be small to be safe.
const MAX_DEPTH = 24;

function scrubValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > MAX_DEPTH) return "[depth-limit]";
  if (typeof value === "string") return value.replace(EMAIL_RE, "[email]");
  if (Array.isArray(value)) {
    if (seen.has(value)) return "[circular]";
    seen.add(value);
    return value.map((v) => scrubValue(v, depth + 1, seen));
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) return "[circular]";
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase().replace(/[^a-z0-9]/g, ""))) {
        out[k] = "[redacted]";
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

export const sentryEnabled = Boolean(process.env.SENTRY_DSN);

if (sentryEnabled) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "development",
    sendDefaultPii: false,
    // Error reporting only; no performance tracing to keep quota + payloads small.
    tracesSampleRate: 0,
    beforeSend(event) {
      // Never leak learner emails or phrase/transcript content. Request
      // bodies (attached by the default RequestData integration) can carry
      // phrase text and audio, so drop request data wholesale — the stack
      // trace, route name in the message, and tags are enough to debug.
      delete event.request;
      if (event.user) event.user = { id: event.user.id };
      return scrubEvent(event);
    },
    beforeBreadcrumb(breadcrumb) {
      return scrubEvent(breadcrumb as Sentry.Event) as typeof breadcrumb;
    },
  });
}

export { Sentry };
