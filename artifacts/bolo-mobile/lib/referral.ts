import { buildReferralLink } from '@workspace/referral-link';

// Referral links point at the Bolo! WEB app, which owns the /join/<code>
// landing page — mobile only hands the link out. Exactly the same shape as
// lib/legal.ts: the hosted domain comes from EXPO_PUBLIC_DOMAIN (the Replit
// dev domain in dev, the deployed domain injected by scripts/build.js in a
// production build), and the URL itself is built by the one shared module the
// web app also builds its links with (@workspace/referral-link).
const WEB_DOMAIN = process.env.EXPO_PUBLIC_DOMAIN;

/** Origin of the hosted web app, or undefined when none is configured. */
export const WEB_ORIGIN = WEB_DOMAIN ? `https://${WEB_DOMAIN}` : undefined;

/**
 * The shareable referral link for a code, or undefined when no web domain is
 * configured — in which case the caller must hide its share surface rather
 * than hand out a broken link (same rule the privacy link follows).
 */
export function referralLinkFor(code: string | undefined): string | undefined {
  if (!WEB_ORIGIN || !code) return undefined;
  return buildReferralLink(WEB_ORIGIN, code);
}
