import pino from "pino";
import { Sentry, sentryEnabled } from "./sentry";

const isProduction = process.env.NODE_ENV === "production";

const base = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});

/**
 * WARN AND ABOVE ALSO GO TO SENTRY.
 *
 * Two bugs that cost real money hid for weeks in 2026 because they only ever
 * logged here, and stdout on a Replit deployment is a place nobody opens:
 *
 *   - Chai pack purchases were charged and never credited. The webhook answered
 *     200 and dropped the event silently.
 *   - RevenueCat reconcile-on-read 401'd on every entitlements call for a month.
 *     It was diagnosed in CODEBASE-FACTS on 2026-07-29 and sat there.
 *
 * WARN is included deliberately, and it is the whole point. The RevenueCat
 * failure logged at warn, so forwarding only errors would have left the more
 * expensive of the two invisible. 27 warn call sites against 20 error and
 * fatal: that is a volume this project can carry, and a quiet Sentry is not
 * worth a silent outage.
 *
 * A missing SENTRY_DSN makes every call a no-op, so nothing changes locally or
 * in tests.
 */
const FORWARDED = ["warn", "error", "fatal"] as const;

/** pino says "warn", Sentry says "warning". */
const SEVERITY = {
  warn: "warning",
  error: "error",
  fatal: "fatal",
} as const satisfies Record<(typeof FORWARDED)[number], Sentry.SeverityLevel>;

type LogArgs = [obj: unknown, msg?: string] | [msg: string];

function forward(level: (typeof FORWARDED)[number], args: LogArgs): void {
  if (!sentryEnabled) return;
  const [first, second] = args as [unknown, string | undefined];
  const message = typeof first === "string" ? first : (second ?? level);
  const context = typeof first === "string" ? undefined : first;

  // An Error carried on the log gets reported as an exception so Sentry can
  // group it by stack. Everything else is a message keyed on its text, which
  // groups by the log line rather than by whichever field happened to vary.
  const err = (context as { err?: unknown } | undefined)?.err;
  Sentry.withScope((scope) => {
    scope.setLevel(SEVERITY[level]);
    if (context && typeof context === "object") {
      scope.setContext("log", context as Record<string, unknown>);
    }
    if (err instanceof Error) Sentry.captureException(err);
    else Sentry.captureMessage(message, SEVERITY[level]);
  });
}

export const logger = new Proxy(base, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (typeof prop !== "string" || !FORWARDED.includes(prop as never)) {
      return value;
    }
    return (...args: LogArgs) => {
      (value as (...a: LogArgs) => void).apply(target, args);
      // Never let a reporting failure break the request that logged.
      try {
        forward(prop as (typeof FORWARDED)[number], args);
      } catch {
        /* Sentry is best effort */
      }
    };
  },
});
