// The official native-app store badges: Apple's "Download on the App Store"
// and Google's "Get it on Google Play".
//
// Extracted verbatim from the signed-out landing hero so the signed-in home
// page shows the same badge instead of a second copy that could drift. The
// markup is unchanged, including the fragment shape: the caller owns the
// wrapper, its layout classes and any entrance animation, so the hero keeps
// its own timing and home stays still.
//
// One component, two stores, chosen by the `store` prop and defaulting to
// Apple so the original call sites read the same. Callers pick the store from
// the visitor's platform; nobody is ever shown both.
//
// Behavior is unchanged too. While the store's LIVE const is false the badge
// is muted, unlinked and untracked under a coming-soon caption; flip the const
// at launch and it links to the listing and tracks a cta_click carrying the
// caller's placement.
import { track, ANALYTICS_EVENTS } from "@/lib/analytics";

// The numeric id is ascAppId from bolo-mobile/eas.json.
export const APP_STORE_URL = "https://apps.apple.com/app/id6790907772";
// LIT on 2026-08-22, at the owner's word and verified against the public
// listing: apps.apple.com/app/id6790907772 resolves to "Bolo! Speak Hindi &
// Gujurati", free with in-app purchases. Play stays dark below until the
// Android listing leaves closed testing.
export const APP_STORE_LIVE = true;

// The package name is the Android applicationId from bolo-mobile.
export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.bolo.mobile";
// Flip to true when the listing is approved and live in Google Play.
export const PLAY_STORE_LIVE = false;

/**
 * IPADOS SHIPS THROUGH THE SAME APP STORE LISTING, so this is not about a
 * store being open. It is whether the app has been laid out for a tablet:
 * today it is the iPhone build running letterboxed, which is not something to
 * advertise. Flip it when the iPad layout actually lands.
 */
export const IPAD_LIVE = false;

export type BadgeStore = "apple" | "play";

// Apple's badge is drawn edge to edge, so its CSS height is its ink height.
// Google's is distributed with clear space baked into the artwork (the badge
// itself is 168/250 of the file's height), which must not be cropped out, so
// it gets a taller box and a negative margin that pulls the transparent
// margin back out of the layout. h-[4.5rem] minus 12px a side lands the ink at
// the same 48px tall slot Apple's h-12 occupies, so the two read as one size.
// max-w-none is load-bearing, not tidying: the negative margins shrink the
// column the badge sits in, and preflight's img { max-width: 100% } then
// clamps the badge to that shrunken column and squashes the artwork.
const STORES: Record<
  BadgeStore,
  { file: string; alt: string; url: string; live: boolean; caption: string; className: string }
> = {
  apple: {
    file: "appstore-badge.svg",
    alt: "Download on the App Store",
    url: APP_STORE_URL,
    live: APP_STORE_LIVE,
    caption: "Coming soon to the App Store",
    className: "h-12 w-auto",
  },
  play: {
    file: "googleplay-badge.svg",
    alt: "Get it on Google Play",
    url: PLAY_STORE_URL,
    live: PLAY_STORE_LIVE,
    caption: "Coming soon to Google Play",
    className: "h-[4.5rem] w-auto max-w-none -m-3",
  },
};

export function AppStoreBadge({
  store = "apple",
  live,
  placement,
}: {
  /** Which store's badge to render. Defaults to Apple. */
  store?: BadgeStore;
  /** Tests inject the live state; a same-module const cannot be vi.mocked. */
  live?: boolean;
  /** Analytics placement for the linked state, e.g. "hero-appstore-badge". */
  placement: string;
}) {
  const badge = STORES[store];
  const isLive = live ?? badge.live;
  const src = `${import.meta.env.BASE_URL}${badge.file}`;

  if (isLive) {
    return (
      <a href={badge.url} onClick={() => track(ANALYTICS_EVENTS.CTA_CLICK, { placement })}>
        <img src={src} alt={badge.alt} className={badge.className} />
      </a>
    );
  }

  return (
    <>
      {/* Pre-release: same slot, muted, unlinked, no tracking. */}
      <img src={src} alt={badge.alt} className={`${badge.className} opacity-50`} />
      <p className="mt-2 text-xs font-semibold text-muted-foreground">{badge.caption}</p>
    </>
  );
}
