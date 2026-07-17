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

function quota(count: number, limit: number): ElevenLabsQuota {
  return {
    characterCount: count,
    characterLimit: limit,
    remaining: Math.max(0, limit - count),
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
  const monitor = createQuotaMonitor({
    fetchQuota: async () => quota(8500, 10000), // 1500 left < 20% of 10000
    log,
    now: () => 1_000_000,
    intervalMs: 600_000,
    warnFraction: 0.2,
  });

  await monitor.maybeCheck();
  assert.equal(warns.length, 1);
  assert.match(warns[0].msg, /running low/i);
});

test("quota monitor: warns EXHAUSTED at zero remaining", async () => {
  const { log, warns } = makeLog();
  const monitor = createQuotaMonitor({
    fetchQuota: async () => quota(10000, 10000),
    log,
    now: () => 1_000_000,
    intervalMs: 600_000,
    warnFraction: 0.2,
  });

  await monitor.maybeCheck();
  assert.equal(warns.length, 1);
  assert.match(warns[0].msg, /EXHAUSTED/);
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
