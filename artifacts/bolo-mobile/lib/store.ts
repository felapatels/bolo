import { Linking, Platform } from 'react-native';
import * as StoreReview from 'expo-store-review';

// Where a learner finishes managing/canceling a *store* subscription. Apple and
// Google don't permit an app to cancel its own store subscription in-process, so
// the authoritative action is a deep link into the OS store's subscription
// settings. RevenueCat also hands us a per-customer `managementUrl` (via the
// backend's paymentMethod summary); when present it's the most direct link, so
// we prefer it and fall back to the platform's generic subscriptions page.
const APPLE_SUBSCRIPTIONS = 'https://apps.apple.com/account/subscriptions';
const GOOGLE_SUBSCRIPTIONS =
  'https://play.google.com/store/account/subscriptions';

// The Bolo! web app, where a Stripe (web) subscription is managed. Injected at
// build time the same way the privacy policy URL is (see lib/legal.ts).
const WEB_DOMAIN = process.env.EXPO_PUBLIC_DOMAIN;

/** Human name for the current platform's store, for button/label copy. */
export function storeName(): string {
  if (Platform.OS === 'ios') return 'the App Store';
  if (Platform.OS === 'android') return 'Google Play';
  return 'the store';
}

/** The platform's generic subscription-management page, if one exists. */
function platformSubscriptionsUrl(): string | null {
  if (Platform.OS === 'ios') return APPLE_SUBSCRIPTIONS;
  if (Platform.OS === 'android') return GOOGLE_SUBSCRIPTIONS;
  return null;
}

/**
 * Opens the native store's subscription management for the caller. Prefers the
 * provider-supplied `managementUrl` (RevenueCat's per-customer deep link) and
 * falls back to the platform's generic subscriptions page. Returns whether a URL
 * could be opened, so callers can message the learner when there's nowhere to go
 * (e.g. web preview, where no store exists).
 */
export async function openStoreSubscriptions(
  managementUrl?: string | null,
): Promise<boolean> {
  const url = managementUrl?.trim() || platformSubscriptionsUrl();
  if (!url) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Opens the web billing portal for a Stripe (web) subscription. Prefers a
 * provider-supplied `managementUrl`; otherwise sends the learner to the Bolo!
 * web app where they can manage billing. Returns whether a URL was opened.
 */
export async function openWebBillingPortal(
  managementUrl?: string | null,
): Promise<boolean> {
  const url =
    managementUrl?.trim() || (WEB_DOMAIN ? `https://${WEB_DOMAIN}/` : null);
  if (!url) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// "RATE BOLO!", build 19. The Play testers asked for a way to rate the app
// from inside it. Web twin: pages/account.tsx links straight to the listing.
//
// TWO DIFFERENT ANSWERS, ONE PER STORE, and the difference is measured, not
// stylistic:
//
// - ANDROID uses the in-app review flow (expo-store-review over Play's
//   ReviewManager). It works on the internal and closed testing tracks, which
//   is where every Android learner is today, and the star sheet appears
//   without leaving the app. If Play refuses (sideloaded APK, no Play
//   services, quota) the row falls back to the listing itself, market:// first
//   so the Play app opens, then https for a device with no Play app.
// - iOS OPENS THE APP STORE'S WRITE-REVIEW PAGE instead of calling
//   SKStoreReviewController. Apple's review sheet never appears in TestFlight
//   builds, is capped at three showings a year, and Apple's own guidance is
//   not to fire it from a button, so a "Rate" row driving it would look dead
//   to exactly the people testing this. The write-review URL is the
//   documented answer for an explicit rate button and opens the App Store
//   app directly (https resolves as a universal link, so no itms-apps scheme
//   and no LSApplicationQueriesSchemes entry is needed).
//
// Dependencies are injectable so the decision tree is tested on both
// platforms under jest, where neither store exists.
// ---------------------------------------------------------------------------

/** ascAppId in eas.json and APP_STORE_URL in the web's app-store-badge.tsx. */
export const APP_STORE_ID = '6790907772';
export const APP_STORE_WRITE_REVIEW_URL = `https://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`;
/** android.package in app.json. */
export const PLAY_PACKAGE = 'com.bolo.mobile';
export const PLAY_MARKET_URL = `market://details?id=${PLAY_PACKAGE}`;
export const PLAY_LISTING_URL = `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`;

export type RateOutcome = 'in-app' | 'store' | 'none';

export type RateDeps = {
  platform: string;
  isAvailable: () => Promise<boolean>;
  requestReview: () => Promise<void>;
  open: (url: string) => Promise<unknown>;
};

const liveRateDeps: RateDeps = {
  platform: Platform.OS,
  isAvailable: () => StoreReview.isAvailableAsync(),
  requestReview: () => StoreReview.requestReview(),
  open: (url) => Linking.openURL(url),
};

/** The store the row's caption names: "Tell the App Store what you think". */
export function rateDestination(platform: string = Platform.OS): string {
  if (platform === 'ios') return 'the App Store';
  if (platform === 'android') return 'Google Play';
  return 'the store';
}

/** The first URL that opens wins; a URL nothing handles throws and is skipped. */
async function openFirst(urls: string[], open: RateDeps['open']): Promise<RateOutcome> {
  for (const url of urls) {
    try {
      await open(url);
      return 'store';
    } catch {
      // No handler for this scheme on this device; try the next one.
    }
  }
  return 'none';
}

/**
 * Rate Bolo, the way this platform allows. Resolves with what happened so the
 * caller can tell the learner when NOTHING could be opened (a simulator, or a
 * device with no store), rather than a row that does nothing on tap.
 */
export async function rateBolo(overrides: Partial<RateDeps> = {}): Promise<RateOutcome> {
  const deps: RateDeps = { ...liveRateDeps, ...overrides };
  if (deps.platform === 'android') {
    try {
      if (await deps.isAvailable()) {
        await deps.requestReview();
        return 'in-app';
      }
    } catch {
      // Play declined the in-app flow; the listing is the fallback below.
    }
    return openFirst([PLAY_MARKET_URL, PLAY_LISTING_URL], deps.open);
  }
  if (deps.platform === 'ios') {
    return openFirst([APP_STORE_WRITE_REVIEW_URL], deps.open);
  }
  return 'none';
}
