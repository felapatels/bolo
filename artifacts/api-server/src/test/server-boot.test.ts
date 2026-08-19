/**
 * server-boot.test.ts
 *
 * Smoke-tests that the server's main entry-point modules parse and initialise
 * without error.  A parse-level or structural corruption in any route file
 * (e.g. a bad auto-merge leaving a dangling `else` block) causes this test to
 * fail immediately with the offending SyntaxError, rather than the corruption
 * sitting silently until the server is manually started.
 *
 * Why this matters: the merge that produced the July 2026 openai.ts scramble
 * (Task 952 auto-merging on top of Task 948's changes to the same file) was
 * not caught by any gate because no post-merge typecheck or boot verification
 * ran.  This test provides that gate at the test-suite level.
 *
 * Requirements:
 *   - DATABASE_URL must be set (used by the db module at import time).
 *   - SESSION_SECRET must be set (used by evaluationToken at import time).
 *   Neither requirement is unusual, the full api-server suite needs both.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

test("app module imports cleanly and exports an express Application", async () => {
  // Importing app.ts transitively imports every route file (via routes/index.ts)
  // so a SyntaxError in any route surfaces here rather than at server start.
  const { default: app } = await import("../app.js");
  assert.ok(app, "app export must be defined");
  assert.strictEqual(
    typeof app,
    "function",
    "app must be an express Application (a callable function)",
  );
});

test("openai route module imports cleanly and exports a Router", async () => {
  // Direct import of the most complex (and historically scramble-prone) route.
  // Any parse-level corruption, dangling else, mismatched braces, throws here.
  const { default: router } = await import("../routes/openai.js");
  assert.ok(router, "openai router must be defined");
  assert.strictEqual(
    typeof router,
    "function",
    "openai router must be an express Router (callable)",
  );
});
