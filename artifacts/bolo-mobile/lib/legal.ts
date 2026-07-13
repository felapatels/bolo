import * as WebBrowser from 'expo-web-browser';

// The privacy policy is hosted by the Bolo! web app at its public `/privacy`
// route. In dev this domain is the Replit dev domain; in a production build the
// build script injects the deployed domain (see scripts/build.js). This is the
// same URL used for the app-store listing (see PLAY_STORE.md).
const WEB_DOMAIN = process.env.EXPO_PUBLIC_DOMAIN;

export const PRIVACY_POLICY_URL = WEB_DOMAIN
  ? `https://${WEB_DOMAIN}/privacy`
  : undefined;

/** Opens the hosted privacy policy in an in-app browser. */
export async function openPrivacyPolicy(): Promise<void> {
  if (!PRIVACY_POLICY_URL) return;
  await WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL);
}
