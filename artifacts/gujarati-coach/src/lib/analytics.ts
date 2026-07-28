import posthog from "posthog-js";
import { ANALYTICS_EVENTS, type AnalyticsEvent } from "./analyticsEvents";

// Product analytics. Initialized only when VITE_POSTHOG_KEY is present
// (never committed); without it every call below is a silent no-op.
//
// Payload policy (enforced by convention + review): NO phrase content,
// transcripts, audio, or user email. User id and language code are fine.
// Autocapture and automatic pageviews are OFF — the event set in
// analyticsEvents.ts is the complete, deliberate list.

// Committed production fallback: a PostHog project key is public and
// write-only (it ships in every client bundle). The Replit deployment build
// does not reliably see production env vars at build time (see App.tsx Clerk
// note), so a missing VITE_POSTHOG_KEY in a production build falls back here.
const PROD_POSTHOG_KEY = "phc_rVRdQdrVqY8WCSSuN5LmDCJmbNP3jcev6Fj38rizwHnZ";

const key =
  (import.meta.env.VITE_POSTHOG_KEY as string | undefined) ??
  (import.meta.env.PROD ? PROD_POSTHOG_KEY : undefined);
const host =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ??
  "https://us.i.posthog.com";

let initialized = false;

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
}

/** Identify by Clerk user id only — never email or name. */
export function identifyUser(userId: string | null): void {
  if (!initialized) return;
  if (userId) posthog.identify(userId);
  else posthog.reset();
}

export function track(
  event: AnalyticsEvent,
  properties?: Record<string, string | number | boolean>,
): void {
  if (!initialized) return;
  posthog.capture(event, properties);
}

const ONCE_PREFIX = "bolo.analytics.once.";

/** Fire an event at most once per browser (per event name). */
export function trackOnce(
  event: AnalyticsEvent,
  properties?: Record<string, string | number | boolean>,
): void {
  if (!initialized) return;
  try {
    const k = ONCE_PREFIX + event;
    if (localStorage.getItem(k)) return;
    localStorage.setItem(k, "1");
  } catch {
    // Storage unavailable: still emit rather than silently dropping.
  }
  track(event, properties);
}

export { ANALYTICS_EVENTS };
