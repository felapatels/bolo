import { Linking, Platform } from 'react-native';

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
