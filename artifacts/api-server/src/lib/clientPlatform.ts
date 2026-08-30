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

/** Prefix for the build tag inside attempts.flags, mirroring the platform one. */
export const BUILD_FLAG_PREFIX = "build:";

/**
 * The app BUILD NUMBER, when the User-Agent carries it.
 *
 * WHY THIS IS FREE ON iOS AND IMPOSSIBLE ON ANDROID, which is the whole shape
 * of what this can and cannot answer.
 *
 * React Native's iOS networking is NSURLSession, and it sets a User-Agent of
 * "<CFBundleName>/<CFBundleVersion> CFNetwork/... Darwin/...". app.json sets
 * expo.name to "Bolo!" and ios.buildNumber to the build, so an iOS request
 * arrives reading "Bolo!/528 CFNetwork/1568.100.1 Darwin/24.1.0" and the build
 * is simply there.
 *
 * Android goes out through OkHttp, whose User-Agent is "okhttp/4.12.0" and
 * carries NOTHING about the app. No parsing can recover what was never sent.
 * ANDROID WILL READ AS NULL UNTIL A CLIENT HEADER EXISTS, and that needs a
 * release, which is exactly what recording this was meant to avoid.
 *
 * Asked for 2026-08-30, to find people on old builds. PostHog already knows the
 * version and the Nest cannot read PostHog, so this puts the answer where the
 * cockpit can see it, for the platform that is most of the traffic: 125 app
 * attempts on iOS against 15 on Android at the time of writing.
 *
 * THE LEADING TOKEN ONLY, and guarded on CFNetwork being present. "CFNetwork"
 * and "Darwin" are themselves name/number tokens, so a looser match would
 * happily report the networking stack's version as the app's.
 */
export function buildFromUserAgent(userAgent: string | undefined | null): string | null {
  if (typeof userAgent !== "string") return null;
  const ua = userAgent.trim();
  // Only the Apple stack carries it. Without this guard, any first token that
  // happened to be name/digits would be read as a build number.
  if (!/CFNetwork/i.test(ua)) return null;
  const first = ua.split(/\s+/)[0] ?? "";
  const m = /^([^/\s]+)\/(\d{1,7})$/.exec(first);
  if (!m) return null;
  if (/^(cfnetwork|darwin)$/i.test(m[1])) return null;
  return m[2];
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
  /** The clip's leading silence reached HESITATION_MS (build 20). */
  hesitated?: boolean;
}): string | null {
  const tags: string[] = [];
  if (opts.latencyMissing) tags.push("latency_missing");
  const platform = platformFromUserAgent(opts.userAgent);
  if (platform !== "unknown") tags.push(`${PLATFORM_FLAG_PREFIX}${platform}`);
  // Same column, same shape as the platform tag. Absent rather than "unknown"
  // when the agent did not carry one, which is every Android request.
  const build = buildFromUserAgent(opts.userAgent);
  if (build) tags.push(`${BUILD_FLAG_PREFIX}${build}`);
  if (opts.sttGlitchRescue) tags.push(STT_GLITCH_RESCUE_FLAG);
  if (opts.hesitated) tags.push("hesitated");
  return tags.length > 0 ? tags.join(",") : null;
}
