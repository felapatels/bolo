import { test } from "node:test";
import assert from "node:assert/strict";
import { createQuotaMonitor } from "./elevenLabsQuotaMonitor";
import type { ElevenLabsQuota } from "@workspace/integrations-openai-ai-server/audio";

// Unit tests for the throttled ElevenLabs quota monitor. All deps injected —
// no real API calls, no real clock.

function makeLog() {
  const infos: Array<{ fields: unknown; msg: string }> = [];
  const warns: Array<{ fields: unknown; msg: string }> = [];
  return {
    infos,
    warns,
    log: {
      info: (fields: unknown, msg?: string) =>
        infos.push({ fields, msg: msg ?? "" }),
      warn: (fields: unknown, msg?: string) =>
        warns.push({ fields, msg: msg ?? "" }),
    },
  };
}

function quota(count: number, limit: number, resetUnix = 1_800_000_000): ElevenLabsQuota {
  return {
    characterCount: count,
    characterLimit: limit,
    remaining: Math.max(0, limit - count),
    resetUnix,
  };
}

function makeAlerts(result: boolean | Error = true) {
  const sent: ElevenLabsQuota[] = [];
  return {
    sent,
    sendAlert: async (q: ElevenLabsQuota) => {
      if (result instanceof Error) throw result;
      sent.push(q);
      return result;
    },
  };
}

test("quota monitor: logs info when plenty of quota remains", async () => {
  const { log, infos, warns } = makeLog();
  let calls = 0;
  const monitor = createQuotaMonitor({
    fetchQuota: async () => {
      calls++;
      return quota(1000, 10000);
    },
    log,
    now: () => 1_000_000,
    intervalMs: 600_000,
    warnFraction: 0.2,
  });

  await monitor.maybeCheck();
  assert.equal(calls, 1);
  assert.equal(warns.length, 0);
  assert.equal(infos.length, 1);
  assert.deepEqual(infos[0].fields, {
    characterCount: 1000,
    characterLimit: 10000,
    remaining: 9000,
  });
  assert.deepEqual(monitor.getLastQuota(), quota(1000, 10000));
});

test("quota monitor: warns when remaining drops below the warn fraction", async () => {
  const { log, warns } = makeLog();
  const { sent, sendAlert } = makeAlerts();
  const monitor = createQuotaMonitor({
    fetchQuota: async () => quota(8500, 10000), // 1500 left < 20% of 10000
    log,
    now: () => 1_000_000,
    intervalMs: 600_000,
    warnFraction: 0.2,
    sendAlert,
  });

  await monitor.maybeCheck();
  assert.equal(warns.length, 1);
  assert.match(warns[0].msg, /running low/i);
  assert.equal(sent.length, 1, "low-credit email sent on threshold crossing");
  assert.deepEqual(sent[0], quota(8500, 10000));
});

test("quota monitor: warns EXHAUSTED at zero remaining", async () => {
  const { log, warns } = makeLog();
  const { sent, sendAlert } = makeAlerts();
  const monitor = createQuotaMonitor({
    fetchQuota: async () => quota(10000, 10000),
    log,
    now: () => 1_000_000,
    intervalMs: 600_000,
    warnFraction: 0.2,
    sendAlert,
  });

  await monitor.maybeCheck();
  assert.equal(warns.length, 1);
  assert.match(warns[0].msg, /EXHAUSTED/);
  assert.equal(sent.length, 1);
});

test("quota monitor: throttles to one check per interval", async () => {
  const { log } = makeLog();
  let calls = 0;
  let clock = 1_000_000;
  const monitor = createQuotaMonitor({
    fetchQuota: async () => {
      calls++;
      return quota(0, 10000);
    },
    log,
    now: () => clock,
    intervalMs: 600_000,
    warnFraction: 0.2,
    sendAlert: async () => true,
  });

  await monitor.maybeCheck();
  await monitor.maybeCheck();
  clock += 599_999;
  await monitor.maybeCheck();
  assert.equal(calls, 1, "within-interval checks must be skipped");

  clock += 2;
  await monitor.maybeCheck();
  assert.equal(calls, 2, "a fresh interval allows a new check");
});

test("quota monitor: a failing fetch is swallowed and logged as a warning", async () => {
  const { log, warns } = makeLog();
  const monitor = createQuotaMonitor({
    fetchQuota: async () => {
      throw new Error("subscription endpoint down");
    },
    log,
    now: () => 1_000_000,
    intervalMs: 600_000,
    warnFraction: 0.2,
  });

  await assert.doesNotReject(() => monitor.maybeCheck());
  assert.equal(warns.length, 1);
  assert.match(warns[0].msg, /quota check failed/i);
  assert.equal(monitor.getLastQuota(), null);
});

test("quota monitor: missing user_read permission disables subscription checks and falls back to usage counters", async () => {
  const { log, warns, infos } = makeLog();
  let fetches = 0;
  let clock = 1_000_000;
  const monitor = createQuotaMonitor({
    fetchQuota: async () => {
      fetches++;
      throw new Error(
        'ElevenLabs subscription check failed with status 401: {"detail":{"code":"unauthorized","message":"The API key you used is missing the permission user_read to execute this operation.","status":"missing_permissions"}}',
      );
    },
    fetchUsage: () => ({ requests: 3, charactersUsed: 42, lastCharacterCost: 7 }),
    log,
    now: () => clock,
    intervalMs: 600_000,
    warnFraction: 0.2,
  });

  await monitor.maybeCheck();
  assert.equal(fetches, 1);
  assert.equal(warns.length, 1, "actionable warning logged once");
  assert.match(warns[0].msg, /user_read/);
  assert.deepEqual(warns[0].fields, {
    requests: 3,
    charactersUsed: 42,
    lastCharacterCost: 7,
  });

  // Next interval: no more subscription calls; logs usage stats at info.
  clock += 600_001;
  await monitor.maybeCheck();
  assert.equal(fetches, 1, "must not retry a call that always 401s");
  assert.equal(warns.length, 1);
  assert.equal(infos.length, 1);
  assert.match(infos[0].msg, /usage since server start/i);
});

test("quota monitor: alert email fires once per billing cycle, not on every check", async () => {
  const { log } = makeLog();
  const { sent, sendAlert } = makeAlerts();
  let clock = 1_000_000;
  const monitor = createQuotaMonitor({
    fetchQuota: async () => quota(8500, 10000, 111),
    log,
    now: () => clock,
    intervalMs: 600_000,
    warnFraction: 0.2,
    sendAlert,
  });

  await monitor.maybeCheck();
  clock += 600_001;
  await monitor.maybeCheck();
  clock += 600_001;
  await monitor.maybeCheck();
  assert.equal(sent.length, 1, "still-below-threshold checks must not re-email");
});

test("quota monitor: alert re-arms on a new billing cycle (different resetUnix)", async () => {
  const { log } = makeLog();
  const { sent, sendAlert } = makeAlerts();
  let clock = 1_000_000;
  let resetUnix = 111;
  const monitor = createQuotaMonitor({
    fetchQuota: async () => quota(8500, 10000, resetUnix),
    log,
    now: () => clock,
    intervalMs: 600_000,
    warnFraction: 0.2,
    sendAlert,
  });

  await monitor.maybeCheck();
  assert.equal(sent.length, 1);

  // New cycle: reset timestamp changes (still below threshold, e.g. tiny plan).
  resetUnix = 222;
  clock += 600_001;
  await monitor.maybeCheck();
  assert.equal(sent.length, 2, "new cycle re-arms the alert");
});

test("quota monitor: alert re-arms after credits climb back above the threshold", async () => {
  const { log } = makeLog();
  const { sent, sendAlert } = makeAlerts();
  let clock = 1_000_000;
  let count = 8500;
  const monitor = createQuotaMonitor({
    fetchQuota: async () => quota(count, 10000, 111),
    log,
    now: () => clock,
    intervalMs: 600_000,
    warnFraction: 0.2,
    sendAlert,
  });

  await monitor.maybeCheck();
  assert.equal(sent.length, 1);

  // Top-up: back above the threshold. Same cycle key.
  count = 1000;
  clock += 600_001;
  await monitor.maybeCheck();
  assert.equal(sent.length, 1);

  // Drops below again within the same cycle → alert again.
  count = 9000;
  clock += 600_001;
  await monitor.maybeCheck();
  assert.equal(sent.length, 2);
});

test("quota monitor: a failed email send is retried on the next check and never throws", async () => {
  const { log, warns } = makeLog();
  let clock = 1_000_000;
  let sendResult: boolean | "throw" = false;
  let attempts = 0;
  const monitor = createQuotaMonitor({
    fetchQuota: async () => quota(8500, 10000, 111),
    log,
    now: () => clock,
    intervalMs: 600_000,
    warnFraction: 0.2,
    sendAlert: async () => {
      attempts++;
      if (sendResult === "throw") throw new Error("resend down");
      return sendResult;
    },
  });

  await monitor.maybeCheck();
  assert.equal(attempts, 1);
  assert.ok(
    warns.some((w) => /alert email was not sent/i.test(w.msg)),
    "failed send is logged",
  );

  // A throwing sender must also be swallowed.
  sendResult = "throw";
  clock += 600_001;
  await assert.doesNotReject(() => monitor.maybeCheck());
  assert.equal(attempts, 2);

  // Once sending succeeds, the alert disarms for the cycle.
  sendResult = true;
  clock += 600_001;
  await monitor.maybeCheck();
  assert.equal(attempts, 3);
  clock += 600_001;
  await monitor.maybeCheck();
  assert.equal(attempts, 3, "disarmed after a successful send");
});

test("quota monitor: unreadable subscription never attempts email", async () => {
  const { log } = makeLog();
  const { sent, sendAlert } = makeAlerts();
  const monitor = createQuotaMonitor({
    fetchQuota: async () => {
      throw new Error("missing_permissions user_read");
    },
    fetchUsage: () => ({ requests: 1, charactersUsed: 5, lastCharacterCost: 5 }),
    log,
    now: () => 1_000_000,
    intervalMs: 600_000,
    warnFraction: 0.2,
    sendAlert,
  });

  await monitor.maybeCheck();
  assert.equal(sent.length, 0);
});
