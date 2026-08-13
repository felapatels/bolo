import { describe, it, expect } from "vitest";
import { scrubEvent } from "@/lib/sentry";

// The PII scrubber runs in beforeSend on every Sentry event. It has to strip
// sensitive values WITHOUT destroying the parts of the event that make an
// error debuggable — the depth guard used to sit at 6, which is exactly one
// level above a stack frame's own fields, so every trace arrived as
// "[depth-limit]" and told us nothing.
function errorEvent() {
  return {
    event_id: "e1",
    exception: {
      values: [
        {
          type: "ReferenceError",
          value: "planChachaStalls is not defined",
          stacktrace: {
            frames: [
              {
                filename: "https://bolo-india.app/assets/journey-abc.js",
                function: "Journey",
                lineno: 1285,
                colno: 33,
                in_app: true,
              },
            ],
          },
        },
      ],
    },
  } as any;
}

describe("scrubEvent", () => {
  it("keeps stack frames readable", () => {
    const frame = scrubEvent(errorEvent()).exception.values[0].stacktrace.frames[0];

    expect(frame.filename).toBe("https://bolo-india.app/assets/journey-abc.js");
    expect(frame.function).toBe("Journey");
    expect(frame.lineno).toBe(1285);
    expect(frame.colno).toBe(33);
    expect(frame.in_app).toBe(true);
  });

  it("keeps the exception type and message", () => {
    const value = scrubEvent(errorEvent()).exception.values[0];

    expect(value.type).toBe("ReferenceError");
    expect(value.value).toBe("planChachaStalls is not defined");
  });

  it("still redacts sensitive keys, however deeply they are nested", () => {
    const event = {
      breadcrumbs: {
        values: [
          {
            category: "xhr",
            data: {
              response: { attempt: { transcript: "नमस्ते", phrase: "hello", score: 82 } },
            },
          },
        ],
      },
    } as any;

    const data = scrubEvent(event).breadcrumbs.values[0].data.response.attempt;
    expect(data.transcript).toBe("[redacted]");
    expect(data.phrase).toBe("[redacted]");
    expect(data.score).toBe(82);
  });

  it("still masks email addresses in free text", () => {
    const event = { message: "failed for learner@example.com" } as any;
    expect(scrubEvent(event).message).toBe("failed for [email]");
  });

  it("survives a circular reference without recursing forever", () => {
    const event: any = { contexts: {} };
    event.contexts.self = event;

    expect(scrubEvent(event).contexts.self).toBe("[circular]");
  });
});
