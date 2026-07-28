import AsyncStorage from '@react-native-async-storage/async-storage';
import PostHog from 'posthog-react-native';

import { ANALYTICS_EVENTS, type AnalyticsEvent } from './analyticsEvents';

// Product analytics. Initialized only when EXPO_PUBLIC_POSTHOG_KEY is present
// (never committed); without it every call below is a silent no-op.
//
// Payload policy (enforced by convention + review): NO phrase content,
// transcripts, audio, or user email. User id and language code are fine.
// Autocapture is OFF — analyticsEvents.ts is the complete, deliberate list.

const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

let client: PostHog | null = null;

export function initAnalytics(): void {
  if (!key || client) return;
  client = new PostHog(key, {
    host,
    // Explicitly no autocapture / screen tracking: deliberate events only.
    captureAppLifecycleEvents: false,
  });
}

/** Identify by Clerk user id only — never email or name. */
export function identifyUser(userId: string | null): void {
  if (!client) return;
  if (userId) client.identify(userId);
  else client.reset();
}

export function track(
  event: AnalyticsEvent,
  properties?: Record<string, string | number | boolean>,
): void {
  client?.capture(event, properties);
}

const ONCE_PREFIX = 'bolo.analytics.once.';

/** Fire an event at most once per install (per event name). */
export async function trackOnce(
  event: AnalyticsEvent,
  properties?: Record<string, string | number | boolean>,
): Promise<void> {
  if (!client) return;
  try {
    const k = ONCE_PREFIX + event;
    if (await AsyncStorage.getItem(k)) return;
    await AsyncStorage.setItem(k, '1');
  } catch {
    // Storage unavailable: still emit rather than silently dropping.
  }
  track(event, properties);
}

export { ANALYTICS_EVENTS };
