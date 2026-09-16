// FIRST-TOUCH ACQUISITION for analytics (owner audit, 2026-09-16).
//
// The first page a browser lands on keeps its utm_* parameters and any
// /join/<code> referral forever (localStorage), so a signup days later still
// knows where the visitor came from. Never overwritten. posthog-js already puts
// utm_* on the landing events themselves; this carries them to signup and onto
// the person. Mobile twin: bolo-mobile/lib/acquisition.ts (same keys, same
// "organic" defaults).

export interface Acquisition {
  acquisition_source: string;
  acquisition_medium: string;
  acquisition_campaign: string;
  referral_code: string;
}

const KEY = "bolo.analytics.acquisition";

export const ORGANIC: Acquisition = {
  acquisition_source: "organic",
  acquisition_medium: "none",
  acquisition_campaign: "none",
  referral_code: "none",
};

/** Pure: read utm_* and a referral code out of a URL. */
export function parseAcquisition(url: string | null | undefined): Acquisition {
  const out: Acquisition = { ...ORGANIC };
  if (!url) return out;
  let parsed: URL;
  try {
    parsed = new URL(url, "https://example.invalid");
  } catch {
    return out;
  }
  const get = (k: string) => (parsed.searchParams.get(k) ?? "").trim().slice(0, 100);
  if (get("utm_source")) out.acquisition_source = get("utm_source");
  if (get("utm_medium")) out.acquisition_medium = get("utm_medium");
  if (get("utm_campaign")) out.acquisition_campaign = get("utm_campaign");
  if (get("ref")) out.referral_code = get("ref");
  const join = parsed.pathname.match(/\/join\/([A-Za-z0-9_-]{2,64})/);
  if (join) out.referral_code = join[1];
  if (out.referral_code !== "none" && out.acquisition_source === "organic") {
    out.acquisition_source = "referral";
    out.acquisition_medium = "referral";
  }
  // A visitor from another site with no utm_* still has a source worth keeping.
  if (out.acquisition_source === "organic" && typeof document !== "undefined" && document.referrer) {
    try {
      const host = new URL(document.referrer).hostname;
      if (host && host !== parsed.hostname) {
        out.acquisition_source = host;
        out.acquisition_medium = "referrer";
      }
    } catch {
      // An unparseable referrer is simply not a source.
    }
  }
  return out;
}

/** The stored first touch, capturing it from the current URL when none exists yet. */
export function firstTouchAcquisition(currentUrl: string): Acquisition {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored) return { ...ORGANIC, ...(JSON.parse(stored) as Partial<Acquisition>) };
    const captured = parseAcquisition(currentUrl);
    localStorage.setItem(KEY, JSON.stringify(captured));
    return captured;
  } catch {
    return parseAcquisition(currentUrl);
  }
}
