import posthog from "posthog-js";
import { firstTouchAcquisition, ORGANIC, type Acquisition } from "./acquisition";
import { ANALYTICS_EVENTS, type AnalyticsEvent } from "./analyticsEvents";

// Product analytics. Initialized only when VITE_POSTHOG_KEY is present
// (never committed); without it every call below is a silent no-op.
//
// Payload policy (enforced by convention + review): NO phrase content,
// transcripts, audio, or user email. User id and language code are fine.
// Autocapture and automatic pageviews are OFF — the event set in
// analyticsEvents.ts is the complete, deliberate list.

// WHICH APP THIS IS, sent on every event as a super property.
//
// LARK's PostHog plan allows exactly ONE project, so all six BOLO apps (and
// BollyMoves) write into the same one. Filter on `app`. The mobile twin
// (bolo-mobile/lib/analytics.ts) sends the same value.
export const APP_ID = "bolo-india";

// Committed production fallback: a PostHog project key is public and
// write-only (it ships in every client bundle). The Replit deployment build
// does not reliably see production env vars at build time (see App.tsx Clerk
// note), so a missing VITE_POSTHOG_KEY in a production build falls back here.
// Every BOLO app shares this one project and is told apart by `app`.
const PROD_POSTHOG_KEY = "phc_rVRdQdrVqY8WCSSuN5LmDCJmbNP3jcev6Fj38rizwHnZ";

const key =
  (import.meta.env.VITE_POSTHOG_KEY as string | undefined) ??
  (import.meta.env.PROD ? PROD_POSTHOG_KEY : undefined);
const host =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ??
  "https://us.i.posthog.com";

let initialized = false;
let acquisition: Acquisition = { ...ORGANIC };

type Props = Record<string, string | number | boolean>;

/** The properties every event carries. */
export function baseProperties(hostname: string): Props {
  return {
    app: APP_ID,
    platform: "web",
    // Replit dev workspaces write into the same project; tag them so real
    // numbers can exclude them (audit 2026-09-16).
    environment: import.meta.env.PROD && !/\.replit\.dev$|^localhost$/.test(hostname) ? "production" : "development",
  };
}

export function initAnalytics(): void {
  if (!key || initialized) return;
  posthog.init(key, {
    api_host: host,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    person_profiles: "identified_only",
  });
  initialized = true;
  acquisition = firstTouchAcquisition(window.location.href);
  // Registered rather than passed per-event: a super property rides on every
  // capture, including ones added later by someone who has never read this file.
  posthog.register({ ...baseProperties(window.location.hostname), ...acquisition });
}

/**
 * Identify by Clerk user id only — never email or name. First-touch acquisition
 * is set ONCE on the person, so a later visit cannot rewrite it.
 */
export function identifyUser(userId: string | null): void {
  if (!initialized) return;
  if (userId) {
    posthog.identify(userId, { app: APP_ID }, { ...acquisition, first_platform: "web" });
  } else {
    posthog.reset();
  }
}

export function track(event: AnalyticsEvent, properties?: Props): void {
  if (!initialized) return;
  posthog.capture(event, properties);
}

/** The stored first-touch acquisition, for events that want it inline. */
export function currentAcquisition(): Acquisition {
  return acquisition;
}

const ONCE_PREFIX = "bolo.analytics.once.";

/** Fire an event at most once per browser (per event name, or per `scope`). */
export function trackOnce(event: AnalyticsEvent, properties?: Props, scope?: string): void {
  if (!initialized) return;
  try {
    const k = ONCE_PREFIX + event + (scope ? `.${scope}` : "");
    if (localStorage.getItem(k)) return;
    localStorage.setItem(k, "1");
  } catch {
    // Storage unavailable: still emit rather than silently dropping.
  }
  track(event, properties);
}

/** A share sheet or copy was opened. `surface` names where. */
export function trackShare(surface: string, properties?: Props): void {
  track(ANALYTICS_EVENTS.SHARE_CLICKED, { surface, ...properties });
}

/** A referral link was shared, copied, or landed on. */
export function trackReferral(
  surface: string,
  action: "share" | "copy" | "landing_view",
  referralCode?: string,
): void {
  track(ANALYTICS_EVENTS.REFERRAL_CLICKED, {
    surface,
    action,
    ...(referralCode ? { referral_code: referralCode } : {}),
  });
}

export { ANALYTICS_EVENTS };
