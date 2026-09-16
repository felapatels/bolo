import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import PostHog from 'posthog-react-native';

import { firstTouchAcquisition, ORGANIC, type Acquisition } from './acquisition';
import { ANALYTICS_EVENTS, type AnalyticsEvent } from './analyticsEvents';

// Product analytics. Initialized only when EXPO_PUBLIC_POSTHOG_KEY is present
// (never committed); without it every call below is a silent no-op.
//
// Payload policy (enforced by convention + review): NO phrase content,
// transcripts, audio, or user email. User id and language code are fine.
// Autocapture is OFF — analyticsEvents.ts is the complete, deliberate list.

// WHICH APP THIS IS, sent on every event as a super property.
//
// LARK's PostHog plan allows exactly ONE project, so all six BOLO apps (and
// BollyMoves) write into the same one. Filter on `app`. The web twin
// (gujarati-coach/src/lib/analytics.ts) sends the same value.
export const APP_ID = 'bolo-india';

const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

let client: PostHog | null = null;

// Resolved once per launch from the link that first opened this install.
let acquisitionReady: Promise<Acquisition> = Promise.resolve({ ...ORGANIC });

type Props = Record<string, string | number | boolean>;

/** The properties every event carries. Pure, so it can be pinned in a test. */
export function baseProperties(): Props {
  return {
    app: APP_ID,
    // React Native events carry no OS of their own, so without this iOS and
    // Android cannot be told apart in PostHog (audit 2026-09-16).
    platform: Platform.OS,
    app_version: Constants.expoConfig?.version ?? 'unknown',
    // The simulator dev client writes into the same project; tag it so real
    // numbers can exclude it.
    environment: __DEV__ ? 'development' : 'production',
  };
}

export function initAnalytics(): void {
  if (!key || client) return;
  client = new PostHog(key, {
    host,
    // Explicitly no autocapture / screen tracking: deliberate events only.
    captureAppLifecycleEvents: false,
  });
  // Registered rather than passed per-event: a super property rides on every
  // capture, including ones added later by someone who has never read this file.
  void client.register(baseProperties());
  acquisitionReady = Linking.getInitialURL()
    .catch(() => null)
    .then((url) => firstTouchAcquisition(url))
    .then((acq) => {
      void client?.register({ ...acq });
      return acq;
    });
}

/**
 * Identify by Clerk user id only — never email or name. First-touch acquisition
 * and the first platform are set ONCE on the person, so later devices and links
 * cannot rewrite where the learner came from.
 */
export function identifyUser(userId: string | null): void {
  if (!client) return;
  if (!userId) {
    client.reset();
    return;
  }
  const c = client;
  void acquisitionReady.then((acq) => {
    c.identify(userId, {
      $set: { app: APP_ID, platform: Platform.OS },
      $set_once: { ...acq, first_platform: Platform.OS },
    });
  });
}

export function track(event: AnalyticsEvent, properties?: Props): void {
  client?.capture(event, properties);
}

/** The stored first-touch acquisition, for events that want it inline. */
export function currentAcquisition(): Promise<Acquisition> {
  return acquisitionReady;
}

const ONCE_PREFIX = 'bolo.analytics.once.';

/** Fire an event at most once per install (per event name, or per `scope`). */
export async function trackOnce(
  event: AnalyticsEvent,
  properties?: Props,
  scope?: string,
): Promise<void> {
  if (!client) return;
  try {
    const k = ONCE_PREFIX + event + (scope ? `.${scope}` : '');
    if (await AsyncStorage.getItem(k)) return;
    await AsyncStorage.setItem(k, '1');
  } catch {
    // Storage unavailable: still emit rather than silently dropping.
  }
  track(event, properties);
}

/** A share sheet or copy-link was opened. `surface` names where. */
export function trackShare(surface: string, properties?: Props): void {
  track(ANALYTICS_EVENTS.SHARE_CLICKED, { surface, ...properties });
}

/** A referral link was shared or copied. The code is the learner's own invite code. */
export function trackReferral(surface: string, action: 'share' | 'copy', referralCode?: string): void {
  track(ANALYTICS_EVENTS.REFERRAL_CLICKED, {
    surface,
    action,
    ...(referralCode ? { referral_code: referralCode } : {}),
  });
}

export { ANALYTICS_EVENTS };
