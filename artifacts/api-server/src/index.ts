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

// Seed missing content (idempotent, advisory-locked) before serving traffic;
// a content-empty database renders every learner-facing endpoint useless, so
// failing loudly here is better than serving an empty app.
await runStartupSeed();

// Backfill Scoring Core v2: populate xp_ledger, user_item_memory, and
// user_ability from existing attempt/game/quiz history. Idempotent — safe to
// run on every deploy; subsequent runs are fast (all ON CONFLICT DO NOTHING).
// Throws (killing startup) if the FSRS mastered-count drop exceeds 30 %.
await runBackfillScoringV2();

// Trigger fallback (July 29, 2026): install the lesson-group scope triggers
// BEFORE any lesson-group assignment writes (the backfill below), so the
// first prod boot after publish has enforcement in place before assignments
// happen. Idempotent; logs "created" vs "already present" distinctly.
await ensureLessonGroupScopeTriggers();

// D1a Slice 1: partition existing phrases into lesson groups (journey-map
// stations). Idempotent and advisory-locked; pairs already grouped are
// skipped, so subsequent startups are fast.
await runBackfillLessonGroups();

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
