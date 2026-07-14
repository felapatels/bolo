import app from "./app";
import { logger } from "./lib/logger";
import { runStartupSeed } from "./lib/startupSeed";

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
});
