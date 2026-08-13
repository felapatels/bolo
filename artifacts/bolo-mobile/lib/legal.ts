import * as WebBrowser from 'expo-web-browser';

// The legal pages are hosted by the Bolo! web app at its public `/privacy` and
// `/terms` routes. Most links into the web app are built from the domain the
// build script injects (see scripts/build.js), which is the Replit dev domain
// in development and whatever host the build environment resolved otherwise.
const WEB_DOMAIN = process.env.EXPO_PUBLIC_DOMAIN;

// The two subscription-disclosure links are the exception, and they are NOT
// built from the injected domain.
//
// App Review Guideline 3.1.2(c) requires the purchase flow to link the Terms
// of Use (EULA) and the privacy policy, and it checks them against the URLs
// filed in App Store Connect. `scripts/build.js` resolves
// REPLIT_INTERNAL_APP_DOMAIN, then REPLIT_DEV_DOMAIN, then EXPO_PUBLIC_DOMAIN,
// so the injected value depends entirely on the environment the build ran in
// (in this workspace it resolves to the *.replit.dev dev domain). A build that
// picked up the wrong host, or none at all, would ship links that disagree
// with the filed URLs or lead nowhere. That is the rejection we are answering,
// so these two are a hardcoded constant on purpose: no env var can move them.
const LEGAL_DOMAIN = 'bolo-india.app';

/** Pinned to the published domain. Never derived from the build environment. */
export const TERMS_OF_USE_URL = `https://${LEGAL_DOMAIN}/terms`;
/** Pinned to the published domain. Never derived from the build environment. */
export const PRIVACY_POLICY_URL_ALWAYS = `https://${LEGAL_DOMAIN}/privacy`;

// Unchanged: the home screen only offers a privacy link when a domain was
// injected, and a test pins that behaviour.
export const PRIVACY_POLICY_URL = WEB_DOMAIN
  ? `https://${WEB_DOMAIN}/privacy`
  : undefined;

/** Opens the hosted privacy policy in an in-app browser. */
export async function openPrivacyPolicy(): Promise<void> {
  if (!PRIVACY_POLICY_URL) return;
  await WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL);
}

/** Opens the Terms of Use (EULA) filed with the store. */
export async function openTermsOfUse(): Promise<void> {
  await WebBrowser.openBrowserAsync(TERMS_OF_USE_URL);
}

/** Opens the privacy policy filed with the store. */
export async function openPrivacyPolicyAlways(): Promise<void> {
  await WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL_ALWAYS);
}
