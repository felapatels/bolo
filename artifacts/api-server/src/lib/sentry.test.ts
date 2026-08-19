import { test } from "node:test";
import assert from "node:assert/strict";

// The module initializes Sentry at import time when SENTRY_DSN is present, so
// the DSN is unset for the import: this file exercises the pure scrubber and
// must never start a reporting client inside the test process.
const previousDsn = process.env.SENTRY_DSN;
delete process.env.SENTRY_DSN;
const { scrubEvent } = await import("./sentry");
if (previousDsn !== undefined) process.env.SENTRY_DSN = previousDsn;

// The PII scrubber runs in beforeSend on every Sentry event. It has to strip
// sensitive values WITHOUT destroying the parts of the event that make an
// error debuggable, the depth guard used to sit at 6, which is exactly one
// level above a stack frame's own fields, so every trace arrived as
// "[depth-limit]" and told us nothing.
function errorEvent() {
  return {
    event_id: "e1",
    exception: {
      values: [
        {
          type: "TypeError",
          value: "Cannot read properties of undefined (reading 'id')",
          stacktrace: {
            frames: [
              {
                filename: "/home/runner/workspace/artifacts/api-server/src/routes/learning.ts",
                function: "listLessonGroups",
                lineno: 412,
                colno: 19,
                in_app: true,
              },
            ],
          },
        },
      ],
    },
  } as any;
}

test("scrubEvent keeps stack frames readable", () => {
  const frame = scrubEvent(errorEvent()).exception.values[0].stacktrace.frames[0];

  assert.equal(
    frame.filename,
    "/home/runner/workspace/artifacts/api-server/src/routes/learning.ts",
  );
  assert.equal(frame.function, "listLessonGroups");
  assert.equal(frame.lineno, 412);
  assert.equal(frame.colno, 19);
  assert.equal(frame.in_app, true);
});

test("scrubEvent keeps the exception type and message", () => {
  const value = scrubEvent(errorEvent()).exception.values[0];

  assert.equal(value.type, "TypeError");
  assert.equal(value.value, "Cannot read properties of undefined (reading 'id')");
});

test("scrubEvent still redacts sensitive keys, however deeply they are nested", () => {
  const event = {
    breadcrumbs: {
      values: [
        {
          category: "http",
          data: {
            response: { attempt: { transcript: "नमस्ते", phrase: "hello", score: 82 } },
          },
        },
      ],
    },
  } as any;

  const data = scrubEvent(event).breadcrumbs.values[0].data.response.attempt;
  assert.equal(data.transcript, "[redacted]");
  assert.equal(data.phrase, "[redacted]");
  assert.equal(data.score, 82);
});

test("scrubEvent still masks email addresses in free text", () => {
  const event = { message: "failed for learner@example.com" } as any;
  assert.equal(scrubEvent(event).message, "failed for [email]");
});

test("scrubEvent survives a circular reference without recursing forever", () => {
  const event: any = { contexts: {} };
  event.contexts.self = event;

  assert.equal(scrubEvent(event).contexts.self, "[circular]");
});
