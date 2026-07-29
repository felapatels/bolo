// Sentry must initialize before the app (and its instrumented deps) load.
import "./lib/sentry";
import app from "./app";
import { logger } from "./lib/logger";
import { runStartupSeed } from "./lib/startupSeed";
import { runBackfillScoringV2 } from "./scripts/backfillScoringV2";
import { runBackfillLessonGroups } from "./scripts/backfillLessonGroups";
import { ensureLessonGroupScopeTriggers } from "./scripts/ensureLessonGroupScopeTriggers";
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

// Startup pipeline, run AFTER the port opens (see listen below). The order
// inside the pipeline is load-bearing and must not change:
//   1. runStartupSeed — seed missing content (idempotent, advisory-locked).
//   2. runBackfillScoringV2 — populate xp_ledger / user_item_memory /
//      user_ability from history. Idempotent (ON CONFLICT DO NOTHING).
//      Throws if the FSRS mastered-count drop exceeds 30 %.
//   3. ensureLessonGroupScopeTriggers — trigger fallback (July 29, 2026):
//      scope triggers must be installed BEFORE any lesson-group assignment
//      writes so enforcement exists before assignments happen.
//   4. runBackfillLessonGroups — partition phrases into lesson groups.
//      Idempotent and advisory-locked; already-grouped pairs are skipped.
//
// Why listen-first: publishing waits ~60 s for the port to open, and a
// content-heavy seed (e.g. the C1 sentence rollout) blew that window when
// the pipeline ran before listen, failing the promote step. Seeding is
// advisory-locked and append-only, so briefly serving while it completes is
// safe; a pipeline failure still exits the process loudly (a content-empty
// or half-migrated database must not keep silently serving).
async function runStartupPipeline(): Promise<void> {
  await runStartupSeed();
  await runBackfillScoringV2();
  await ensureLessonGroupScopeTriggers();
  await runBackfillLessonGroups();
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  runStartupPipeline()
    .then(() => {
      logger.info("Startup pipeline complete");

      // Pre-warm the TTS cache in the background once content is in place.
      // Fire-and-forget: a failure here never affects request handling.
      scheduleTtsPrewarm();

      // Periodically reconcile stored subscription tiers against Stripe so a
      // missed webhook (endpoint drift, secret rotation, outage) self-heals
      // instead of silently desyncing learners' Plus status.
      scheduleStripeReconcileSweep();
    })
    .catch((err: unknown) => {
      logger.fatal({ err }, "Startup pipeline failed; exiting");
      process.exit(1);
    });
});
