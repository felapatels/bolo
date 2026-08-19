/**
 * Shared TTS synthesis utilities used by both the startup pre-warmer
 * (ttsPrewarm.ts) and the offline full-catalog script
 * (scripts/prewarmFullTtsCache.ts).
 *
 * Keeping these here avoids duplication and ensures both callers use
 * identical concurrency, pacing, and circuit-breaker settings.
 */

// Re-export so callers can import everything TTS-related from one place.
export { ttsCacheKey, legacyTtsCacheKey, TTS_PROVIDER_VERSION } from "./ttsCache";

// ---------------------------------------------------------------------------
// Concurrency / pacing / circuit-breaker constants
// ---------------------------------------------------------------------------

/**
 * Maximum concurrent TTS synthesis calls sent to ElevenLabs.
 *
 * Free-tier keys allow only a couple of concurrent requests, and bursting
 * has been observed to trip the provider's "unusual activity" abuse flag
 * (temporarily disabling the whole account). Two at a time, with pacing,
 * keeps synthesis under that radar.
 */
export const CONCURRENCY = 2;

/**
 * Minimum delay between synthesis calls per worker slot.
 * Pairs with CONCURRENCY to keep burst rates low enough to avoid abuse flags.
 */
export const PACING_MS = 500;

/**
 * Abort the whole run after this many consecutive failures.
 *
 * When the provider rejects several calls in a row (quota exhausted, account
 * flagged, outage), continuing just hammers a dead endpoint.
 */
export const MAX_CONSECUTIVE_FAILURES = 5;

// ---------------------------------------------------------------------------
// Quota-exhaustion error detection
// ---------------------------------------------------------------------------

/**
 * Returns true when `err` is an ElevenLabs quota-exhaustion error.
 *
 * The audio client throws `ElevenLabs TTS failed with status <n>: <detail>`;
 * exhausted credits surface as a 401 with `quota_exceeded` in the body
 * (and rate/credit pressure as a 429).
 *
 * Shared between the startup pre-warmer (ttsPrewarm.ts) and the offline
 * full-catalog script (scripts/prewarmFullTtsCache.ts) to keep detection
 * logic in one place.
 */
export function isQuotaExhaustedError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    /quota_exceeded/i.test(message) ||
    /ElevenLabs TTS failed with status 429\b/.test(message)
  );
}

// ---------------------------------------------------------------------------
// Bounded-concurrency pool
// ---------------------------------------------------------------------------

/**
 * Run a bounded-concurrency pool over an array of async tasks.
 *
 * Each item in `items` is passed to `worker`; at most `limit` tasks run at
 * the same time. After each task (success or failure) the worker slot pauses
 * for `pacingMs` milliseconds before picking up the next item, which keeps
 * burst rates low enough for free-tier ElevenLabs keys.
 *
 * Individual failures are caught and re-thrown so the caller's `worker` can
 * handle them (e.g. update counters), but they never abort the whole run, * unless `maxConsecutiveFailures` is exceeded, at which point the queue is
 * drained and the pool returns early.
 *
 * @param items - Work items to process.
 * @param limit - Maximum concurrent workers.
 * @param worker - Async function called once per item; must not throw unless
 *   the caller wants the circuit breaker to count the failure.
 * @param pacingMs - Delay after each task (default {@link PACING_MS}).
 * @param maxConsecutiveFailures - Circuit-breaker threshold (default
 *   {@link MAX_CONSECUTIVE_FAILURES}).
 * @param onCircuitBreak - Optional callback fired when the circuit breaker
 *   triggers, receiving the number of remaining queue items.
 */
export async function pool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
  pacingMs = PACING_MS,
  maxConsecutiveFailures = MAX_CONSECUTIVE_FAILURES,
  onCircuitBreak?: (remaining: number) => void,
): Promise<void> {
  const queue = items.slice();
  const active: Promise<void>[] = [];
  let consecutiveFailures = 0;

  async function run(item: T): Promise<void> {
    try {
      await worker(item);
      consecutiveFailures = 0;
    } catch {
      consecutiveFailures++;
    }
  }

  while (queue.length > 0 || active.length > 0) {
    if (consecutiveFailures >= maxConsecutiveFailures) {
      onCircuitBreak?.(queue.length);
      queue.length = 0;
      await Promise.all(active);
      return;
    }
    while (active.length < limit && queue.length > 0) {
      const item = queue.shift()!;
      const p = run(item)
        .then(() => new Promise<void>((r) => setTimeout(r, pacingMs)))
        .then(() => {
          active.splice(active.indexOf(p), 1);
        });
      active.push(p);
    }
    if (active.length > 0) {
      await Promise.race(active);
    }
  }
}
