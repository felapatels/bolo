import app from "./app";
import { logger } from "./lib/logger";
import { runStartupSeed } from "./lib/startupSeed";
import { scheduleTtsPrewarm } from "./lib/ttsPrewarm";
import { scheduleStripeReconcileSweep } from "./lib/stripeReconcile";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Seed missing content (idempotent, advisory-locked) before serving traffic;
// a content-empty database renders every learner-facing endpoint useless, so
// failing loudly here is better than serving an empty app.
await runStartupSeed();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Pre-warm the TTS cache in the background after the server is up.
  // This is fire-and-forget: a failure here never affects request handling.
  scheduleTtsPrewarm();

  // Periodically reconcile stored subscription tiers against Stripe so a
  // missed webhook (endpoint drift, secret rotation, outage) self-heals
  // instead of silently desyncing learners' Plus status.
  scheduleStripeReconcileSweep();
});
