import AsyncStorage from '@react-native-async-storage/async-storage';

// FIRST-TOUCH ACQUISITION for analytics (owner audit, 2026-09-16).
//
// The phone app had no attribution at all: no deep-link read, no install
// referrer, no SDK. This is the smallest honest step: the link that FIRST opened
// this install (a campaign link with utm_* parameters, or a /join/<code>
// referral link) is kept forever and attached to analytics. An App Store or Play
// install with no link reports source "organic". True install attribution
// (store click to first open) needs an attribution SDK and is out of scope.
//
// Written once, never overwritten, so a later link cannot rewrite where a
// learner came from. The web twin is gujarati-coach/src/lib/acquisition.ts.

export interface Acquisition {
  acquisition_source: string;
  acquisition_medium: string;
  acquisition_campaign: string;
  referral_code: string;
}

const KEY = 'bolo.analytics.acquisition';

export const ORGANIC: Acquisition = {
  acquisition_source: 'organic',
  acquisition_medium: 'none',
  acquisition_campaign: 'none',
  referral_code: 'none',
};

/** Pure: read utm_* and a referral code out of a URL. Unknown parts stay at the organic defaults. */
export function parseAcquisition(url: string | null | undefined): Acquisition {
  if (!url) return { ...ORGANIC };
  const out: Acquisition = { ...ORGANIC };
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : '';
  for (const pair of query.split('&')) {
    const [rawKey, rawValue = ''] = pair.split('=');
    if (!rawKey) continue;
    let value = rawValue;
    try {
      value = decodeURIComponent(rawValue.replace(/\+/g, ' '));
    } catch {
      // A malformed escape keeps the raw text rather than dropping the value.
    }
    value = value.trim().slice(0, 100);
    if (!value) continue;
    if (rawKey === 'utm_source') out.acquisition_source = value;
    else if (rawKey === 'utm_medium') out.acquisition_medium = value;
    else if (rawKey === 'utm_campaign') out.acquisition_campaign = value;
    else if (rawKey === 'ref' && out.referral_code === 'none') out.referral_code = value;
  }
  const join = url.match(/\/join\/([A-Za-z0-9_-]{2,64})/);
  if (join) out.referral_code = join[1];
  if (out.referral_code !== 'none' && out.acquisition_source === 'organic') {
    out.acquisition_source = 'referral';
    out.acquisition_medium = 'referral';
  }
  return out;
}

/**
 * The stored first touch, capturing it from `openingUrl` when none exists yet.
 * Storage failures fall back to parsing the URL without persisting.
 */
export async function firstTouchAcquisition(openingUrl: string | null): Promise<Acquisition> {
  try {
    const stored = await AsyncStorage.getItem(KEY);
    if (stored) return { ...ORGANIC, ...(JSON.parse(stored) as Partial<Acquisition>) };
    const captured = parseAcquisition(openingUrl);
    await AsyncStorage.setItem(KEY, JSON.stringify(captured));
    return captured;
  } catch {
    return parseAcquisition(openingUrl);
  }
}
