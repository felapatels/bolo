import * as WebBrowser from 'expo-web-browser';

// The legal pages are hosted by the Bolo! web app at its public `/privacy` and
// `/terms` routes. In dev this domain is the Replit dev domain; in a production
// build the build script injects the deployed domain (see scripts/build.js).
// These are the same URLs used for the app-store listings (see PLAY_STORE.md).
const WEB_DOMAIN = process.env.EXPO_PUBLIC_DOMAIN;

// App Review requires the paywall to link the Terms of Use (EULA) and the
// privacy policy, and a dead link there is a rejection (Guideline 3.1.2(c)).
// The env var is injected at build time and has been missing from a build
// before, so the legal links fall back to the production domain rather than
// rendering nothing: a link to the live site is always better than no link.
const PRODUCTION_DOMAIN = 'bolo-india.app';
const LEGAL_DOMAIN = WEB_DOMAIN || PRODUCTION_DOMAIN;

/** Always defined. Safe to render unconditionally on the paywall. */
export const TERMS_OF_USE_URL = `https://${LEGAL_DOMAIN}/terms`;
/** Always defined. Safe to render unconditionally on the paywall. */
export const PRIVACY_POLICY_URL_ALWAYS = `https://${LEGAL_DOMAIN}/privacy`;

// Kept as-is: the home screen only offers a privacy link when a domain was
// actually injected, and a test pins that behaviour.
export const PRIVACY_POLICY_URL = WEB_DOMAIN
  ? `https://${WEB_DOMAIN}/privacy`
  : undefined;

/** Opens the hosted privacy policy in an in-app browser. */
export async function openPrivacyPolicy(): Promise<void> {
  if (!PRIVACY_POLICY_URL) return;
  await WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL);
}

/** Opens the hosted Terms of Use (EULA) in an in-app browser. */
export async function openTermsOfUse(): Promise<void> {
  await WebBrowser.openBrowserAsync(TERMS_OF_USE_URL);
}

/** Opens the hosted privacy policy, falling back to the production domain. */
export async function openPrivacyPolicyAlways(): Promise<void> {
  await WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL_ALWAYS);
}
