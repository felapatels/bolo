import pino from "pino";
import { Sentry, sentryEnabled } from "./sentry";
import { recordPulse } from "./errorPulse";

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

/**
 * WHY THIS IS A FUNCTION AND NOT ONE Proxy, AND IT IS THE WHOLE BUG.
 *
 * A CHILD LOGGER ESCAPED THE PROXY, so nothing this server has ever logged from
 * inside a request reached Sentry. `pinoHttp({ logger })` is handed this proxy
 * and then calls `.child()` on it to build `req.log`. `child` is not in
 * FORWARDED, so the proxy returned pino's raw method, and pino's raw method
 * returns a plain, unwrapped child. `req.log.error(...)` then wrote a perfect
 * log line and told Sentry nothing.
 *
 * That is EVERY unhandled route error, because app.ts's error handler is
 * `req.log?.error({ err }, "Unhandled route error")`. It is also most of the
 * warn sites, which are inside request handlers too.
 *
 * Demonstrated rather than reasoned, 2026-09-01:
 *
 *     proxy.error('direct')        -> base.error, then FORWARDED TO SENTRY
 *     proxy.child({}).error('...') -> child.error, and nothing else
 *
 * This is the second of two independent faults, and the one that mattered. The
 * first is in app.ts: `Sentry.setupExpressErrorHandler` cannot work here at
 * all, because build.mjs bundles express into dist/index.mjs and Sentry patches
 * express as a MODULE. There is no module to patch, which is what the
 * "[Sentry] express is not instrumented" line at every boot has been saying.
 * Fixing that one needs express externalized; fixing this one restores full
 * coverage without touching the bundle, because the logger already sits at
 * every site that matters and carries more context than the handler would.
 *
 * So: wrap recursively. A child of a wrapped logger is itself wrapped, for as
 * many generations as pino makes.
 */
type PinoLike = typeof base;

function wrapLogger<T extends PinoLike>(target: T): T {
  return new Proxy(target, {
    get(t, prop, receiver) {
      const value = Reflect.get(t, prop, receiver);

      // THE LINE THIS FILE EXISTS FOR. Without it every req.log is silent.
      if (prop === "child" && typeof value === "function") {
        return (...args: unknown[]) =>
          wrapLogger(
            (value as (...a: unknown[]) => PinoLike).apply(t, args),
          );
      }

      if (typeof prop !== "string" || !FORWARDED.includes(prop as never)) {
        return value;
      }
      return (...args: LogArgs) => {
        (value as (...a: LogArgs) => void).apply(t, args);
        // Never let a reporting failure break the request that logged.
        try {
          // THE PULSE IS RECORDED WHETHER OR NOT SENTRY IS ON, and that is the
          // point of it. forward() below returns immediately without a DSN, so
          // for most of this project's life every complaint went nowhere at
          // all. This one is in memory and always available to /nest/summary.
          const [first, second] = args as [unknown, string | undefined];
          recordPulse(
            prop as "warn" | "error" | "fatal",
            typeof first === "string" ? first : second,
          );
          forward(prop as (typeof FORWARDED)[number], args);
        } catch {
          /* Reporting is best effort, in both directions */
        }
      };
    },
  }) as T;
}

export const logger = wrapLogger(base);
