import express, { type Express } from "express";
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

app.use("/api", router);

export default app;
