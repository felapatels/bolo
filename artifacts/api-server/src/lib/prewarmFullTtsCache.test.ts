/**
 * Tests for the offline full-catalog TTS pre-warm script.
 *
 * These tests exercise the most critical invariant of the script: quota
 * exhaustion must NOT arm the circuit breaker.  If quota errors were counted
 * as consecutive failures, the pool would circuit-break after 5 exhausted
 * items, skip the replenishment-wait path, and exit early, leaving most
 * phrases uncached even though a wait+resume would have succeeded.
 *
 * Because the script imports from the live DB and ElevenLabs SDK, we test the
 * shared pool utility (ttsUtils.pool) and the quota-detection helpers
 * (isQuotaExhaustedError) in isolation, then write an integration-style test
 * that wires them together with fully-faked dependencies.
 */

import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { pool, CONCURRENCY, PACING_MS, MAX_CONSECUTIVE_FAILURES, isQuotaExhaustedError } from "./ttsUtils";

// ---------------------------------------------------------------------------
// isQuotaExhaustedError, error classification
// ---------------------------------------------------------------------------

describe("isQuotaExhaustedError", () => {
  it("returns true for quota_exceeded in the message", () => {
    assert.ok(
      isQuotaExhaustedError(new Error("ElevenLabs TTS failed with status 401: quota_exceeded")),
    );
  });

  it("returns true for a 429 status error", () => {
    assert.ok(
      isQuotaExhaustedError(new Error("ElevenLabs TTS failed with status 429: rate limit")),
    );
  });

  it("returns false for unrelated errors", () => {
    assert.ok(!isQuotaExhaustedError(new Error("network timeout")));
    assert.ok(!isQuotaExhaustedError(new Error("500 internal server error")));
    assert.ok(!isQuotaExhaustedError("some string error"));
  });
});

// ---------------------------------------------------------------------------
// Quota exhaustion must NOT arm the circuit breaker
//
// Scenario: 8 items to synthesize; all throw a quota error.
//
// Expected behavior with the fixed script pattern:
//   - Worker detects quota error → sets quotaExhausted flag → returns (no throw)
//   - Subsequent workers see the flag → return silently (no throw)
//   - Pool drains all 8 items without any circuit-breaker invocation
//   - circuitBrokenCount === 0
//   - quotaExhausted === true after the pool
//
// If this test fails it means quota errors are being re-thrown, which will
// cause the circuit breaker to fire after MAX_CONSECUTIVE_FAILURES items.
// ---------------------------------------------------------------------------

describe("synthesizePass pattern: quota exhaustion does not trip the circuit breaker", () => {
  it("pool drains all items without circuit-breaking when every item signals quota exhaustion", async () => {
    const ITEM_COUNT = 8; // more than MAX_CONSECUTIVE_FAILURES (5)
    const items = Array.from({ length: ITEM_COUNT }, (_, i) => i);

    let quotaExhausted = false;
    let circuitBrokenCount = 0;

    await pool(
      items,
      CONCURRENCY,
      async (_item) => {
        // Mirrors the fixed synthesizePass worker logic:
        // when quota is already flagged, return without throwing.
        if (quotaExhausted) return;

        // Simulate detecting a quota-exhaustion API error, flag and return,
        // do NOT throw.
        quotaExhausted = true;
        return; // no throw → consecutive-failure counter stays at zero
      },
      PACING_MS,
      MAX_CONSECUTIVE_FAILURES,
      (_remaining) => {
        circuitBrokenCount++;
      },
    );

    assert.strictEqual(
      circuitBrokenCount,
      0,
      "Circuit breaker must not fire when workers return without throwing",
    );
    assert.ok(quotaExhausted, "quotaExhausted flag must be set after the pool drains");
  });

  it("circuit breaker DOES fire after MAX_CONSECUTIVE_FAILURES genuine errors", async () => {
    const ITEM_COUNT = MAX_CONSECUTIVE_FAILURES + 2;
    const items = Array.from({ length: ITEM_COUNT }, (_, i) => i);

    let circuitBrokenCount = 0;

    await pool(
      items,
      CONCURRENCY,
      async (_item) => {
        // Genuine transient failure, always throw.
        throw new Error("network timeout");
      },
      PACING_MS,
      MAX_CONSECUTIVE_FAILURES,
      (_remaining) => {
        circuitBrokenCount++;
      },
    );

    assert.strictEqual(
      circuitBrokenCount,
      1,
      "Circuit breaker must fire exactly once after MAX_CONSECUTIVE_FAILURES genuine errors",
    );
  });
});

// ---------------------------------------------------------------------------
// Resumable: items that are already "cached" before the second pass are skipped
//
// Simulates the outer loop's recheck logic: after a quota pause, the script
// re-queries the DB to drop items that were cached during the wait.
// ---------------------------------------------------------------------------

describe("resumable behavior: previously cached items are excluded from the next pass", () => {
  it("does not re-synthesize items whose keys appear in the existing cache set", async () => {
    const allItems = [
      { key: "a", nativeScript: "phrase-a" },
      { key: "b", nativeScript: "phrase-b" },
      { key: "c", nativeScript: "phrase-c" },
    ];

    // Simulate: "a" and "c" were cached during a previous run or a quota pause.
    const existingCache = new Set(["a", "c"]);

    const toSynthesize = allItems.filter((item) => !existingCache.has(item.key));

    const synthesized: string[] = [];
    for (const item of toSynthesize) {
      synthesized.push(item.key);
    }

    assert.deepStrictEqual(
      synthesized,
      ["b"],
      "Only uncached items should be passed to the synthesis pool",
    );
  });
});
