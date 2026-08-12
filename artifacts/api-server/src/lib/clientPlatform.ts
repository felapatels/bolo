/**
 * Noise production baseline: which kind of client an attempt came from.
 *
 * The baseline has to answer "does the failure concentrate on iOS?", because
 * iOS is where the fewest capture fixes are available. Nothing in the codebase
 * recorded a platform before, and the plan explicitly rules out client changes,
 * so this derives it server-side from the User-Agent that the client already
 * sends on every request — the SAME device that produced the recording, a few
 * seconds later.
 *
 * The value is written as a tag inside the attempts row's existing `flags`
 * column ("Comma-separated guard/flag tags for observability"), not a new
 * column: the plan's rule is to reuse what already exists.
 *
 * Deliberately coarse. This is a bucket for a sizing report, not analytics:
 * no UA string is stored, only one of the labels below.
 */

export type ClientPlatform =
  | "ios_app"
  | "android_app"
  | "ios_web"
  | "android_web"
  | "web"
  | "unknown";

/** Prefix used for the tag inside the attempts.flags column. */
export const PLATFORM_FLAG_PREFIX = "platform:";

/**
 * Buckets a User-Agent header into a coarse client platform.
 *
 * Native React Native networking identifies itself distinctly: iOS goes out
 * through CFNetwork/Darwin, Android through okhttp/Dalvik. Anything that looks
 * like a browser is bucketed by the device it runs on, so iOS Safari and the
 * iOS app stay separable (their capture pipelines differ).
 */
export function platformFromUserAgent(
  userAgent: string | undefined | null,
): ClientPlatform {
  const ua = (userAgent ?? "").toLowerCase();
  if (!ua) return "unknown";

  const looksLikeBrowser =
    ua.includes("mozilla/") || ua.includes("safari/") || ua.includes("chrome/");

  if (!looksLikeBrowser) {
    if (ua.includes("cfnetwork") || ua.includes("darwin")) return "ios_app";
    if (ua.includes("okhttp") || ua.includes("dalvik")) return "android_app";
    return "unknown";
  }

  if (ua.includes("android")) return "android_web";
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) {
    return "ios_web";
  }
  return "web";
}

/** Tag written when the dual-pass recognizer-glitch rescue scored the attempt. */
export const STT_GLITCH_RESCUE_FLAG = "stt_glitch_rescue";

/**
 * Builds the attempts row's `flags` value.
 *
 * Keeps the existing `latency_missing` tag byte-identical and appends the
 * platform tag when it could be identified. Returns null when there is nothing
 * to record, exactly as before.
 *
 * The recognizer-glitch rescue (owner ruling, Aug 12, 2026) rides here too, as
 * another tag rather than a new column or store: an attempt scored only
 * because one STT pass came back in an unverifiable script is countable
 * afterwards without touching the schema.
 */
export function buildAttemptFlags(opts: {
  latencyMissing: boolean;
  userAgent?: string | null;
  sttGlitchRescue?: boolean;
}): string | null {
  const tags: string[] = [];
  if (opts.latencyMissing) tags.push("latency_missing");
  const platform = platformFromUserAgent(opts.userAgent);
  if (platform !== "unknown") tags.push(`${PLATFORM_FLAG_PREFIX}${platform}`);
  if (opts.sttGlitchRescue) tags.push(STT_GLITCH_RESCUE_FLAG);
  return tags.length > 0 ? tags.join(",") : null;
}
