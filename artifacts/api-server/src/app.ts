import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { Sentry } from "./lib/sentry";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import { stripeWebhookHandler } from "./middlewares/stripeWebhook";

const app: Express = express();

// Behind Replit's reverse proxy in dev and Autoscale. Trusting the proxy makes
// req.ip reflect the real client (X-Forwarded-For) rather than the proxy hop.
app.set("trust proxy", true);

// Build an explicit allowlist of trusted browser origins. Credentialed CORS is
// only granted to these origins so a malicious third-party page cannot make
// logged-in calls on a visitor's behalf and read the responses.
const allowedOrigins = new Set<string>();
for (const domain of (process.env.REPLIT_DOMAINS ?? "").split(",")) {
  const trimmed = domain.trim();
  if (trimmed) allowedOrigins.add(`https://${trimmed}`);
}
if (process.env.REPLIT_DEV_DOMAIN) {
  allowedOrigins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
}
// The Expo app runs on its own dev domain (a different origin from the API's
// REPLIT_DEV_DOMAIN). When it runs in a browser (Expo web / preview), its
// cross-origin credentialed calls need this origin allowlisted or every
// preflight falls through to requireAuth and 401s. Dev-only; absent in prod.
if (process.env.REPLIT_EXPO_DEV_DOMAIN) {
  allowedOrigins.add(`https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`);
}
for (const origin of (process.env.CORS_ALLOWED_ORIGINS ?? "").split(",")) {
  const trimmed = origin.trim();
  if (trimmed) allowedOrigins.add(trimmed.replace(/\/+$/, ""));
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Clerk proxy must run before the body parsers (it streams raw bytes).
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      // Requests without an Origin header (same-origin navigations, curl,
      // native mobile clients using bearer tokens) are not subject to the
      // browser's cross-origin credential rules, so allow them through.
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      // Untrusted origin: respond without CORS headers so the browser blocks
      // the cross-origin read. Do not throw — that would 500 the request.
      callback(null, false);
    },
  }),
);
// Stripe webhook signature verification needs the raw body, so this route is
// registered with express.raw() BEFORE the JSON body parser below — exactly
// like the Clerk proxy above.
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookHandler,
);

app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// Resolve the publishable key from the incoming request host so the same
// server can serve multiple Clerk custom domains. Falls back to
// CLERK_PUBLISHABLE_KEY when the host doesn't map to a custom domain.
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

// Dev-only deliberate error to verify Sentry reporting end to end.
// Gated on NODE_ENV: this route does not exist in production.
if (process.env.NODE_ENV !== "production") {
  app.get("/api/__sentry-test", () => {
    throw new Error("Sentry verification error (api-server, dev only)");
  });
}

app.use("/api", router);

// Capture unhandled route errors in Sentry (no-op when SENTRY_DSN unset),
// then respond 500 without leaking error internals to the client. This is
// the first global express error handler; before it, errors fell through to
// Express's default handler.
Sentry.setupExpressErrorHandler(app);
app.use(
  (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    req.log?.error({ err }, "Unhandled route error");
    if (res.headersSent) return;
    res.status(500).json({ error: "Internal server error" });
  },
);

export default app;
