import {
  getElevenLabsQuota,
  getElevenLabsUsageStats,
  type ElevenLabsQuota,
  type ElevenLabsUsageStats,
} from "@workspace/integrations-openai-ai-server/audio";
import { logger } from "./logger";

// How often the quota may be re-checked. The subscription endpoint is polled
// at most once per interval, piggybacked on TTS traffic — quiet periods make
// no calls at all.
const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// Warn loudly when less than this fraction of the monthly character allowance
// remains — the free plan's 10k credits can run out mid-month, at which point
// uncached phrases stop synthesizing via ElevenLabs.
const WARN_FRACTION = 0.2;

export interface QuotaMonitorDeps {
  fetchQuota: () => Promise<ElevenLabsQuota>;
  fetchUsage: () => ElevenLabsUsageStats;
  log: Pick<typeof logger, "info" | "warn">;
  now: () => number;
  intervalMs: number;
  warnFraction: number;
}

/**
 * Create a throttled quota checker. Call `maybeCheck()` from the TTS hot path
 * (fire-and-forget) — it performs at most one subscription-API call per
 * interval, logs the remaining quota at info level, and escalates to a warning
 * once remaining credits drop below the warn fraction (or hit zero).
 *
 * Factory + injectable deps so tests can drive it without real API calls.
 */
export function createQuotaMonitor(overrides: Partial<QuotaMonitorDeps> = {}) {
  const deps: QuotaMonitorDeps = {
    fetchQuota: getElevenLabsQuota,
    fetchUsage: getElevenLabsUsageStats,
    log: logger,
    now: Date.now,
    intervalMs: CHECK_INTERVAL_MS,
    warnFraction: WARN_FRACTION,
    ...overrides,
  };

  let lastCheckedAt = 0;
  let inFlight = false;
  let lastQuota: ElevenLabsQuota | null = null;
  // Set once the API key proves unable to read the subscription endpoint
  // (missing user_read permission) — from then on we only log in-process
  // usage counters instead of retrying a call that will always 401.
  let subscriptionUnreadable = false;

  async function maybeCheck(): Promise<void> {
    const now = deps.now();
    if (inFlight || now - lastCheckedAt < deps.intervalMs) return;
    inFlight = true;
    lastCheckedAt = now;
    try {
      if (subscriptionUnreadable) {
        deps.log.info(
          { ...deps.fetchUsage() },
          "ElevenLabs usage since server start (remaining quota unavailable — key lacks user_read)",
        );
        return;
      }
      const quota = await deps.fetchQuota();
      lastQuota = quota;
      const { characterCount, characterLimit, remaining } = quota;
      const fields = { characterCount, characterLimit, remaining };
      if (characterLimit > 0 && remaining <= characterLimit * deps.warnFraction) {
        deps.log.warn(
          fields,
          remaining === 0
            ? "ElevenLabs quota EXHAUSTED — phrase audio is falling back to gpt-audio until credits reset"
            : "ElevenLabs quota running low — uncached phrase audio will fall back to gpt-audio when it runs out",
        );
      } else {
        deps.log.info(fields, "ElevenLabs quota check");
      }
    } catch (err) {
      // Quota visibility is best-effort; never let it disturb the TTS path.
      const message = err instanceof Error ? err.message : String(err);
      if (/user_read|missing_permissions/i.test(message)) {
        subscriptionUnreadable = true;
        deps.log.warn(
          { ...deps.fetchUsage() },
          "ElevenLabs API key cannot read subscription quota (missing user_read permission). " +
            "Enable user_read on the key at elevenlabs.io to see remaining monthly credits; " +
            "falling back to in-process usage counters.",
        );
      } else {
        deps.log.warn({ err }, "ElevenLabs quota check failed");
      }
    } finally {
      inFlight = false;
    }
  }

  return {
    maybeCheck,
    /** Last successfully fetched quota (null before the first check). */
    getLastQuota: () => lastQuota,
  };
}

/** Shared singleton used by the TTS routes. */
export const elevenLabsQuotaMonitor = createQuotaMonitor();
