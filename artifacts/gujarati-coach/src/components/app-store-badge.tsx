// Apple's official "Download on the App Store" badge.
//
// Extracted verbatim from the signed-out landing hero so the signed-in home
// page shows the same badge instead of a second copy that could drift. The
// markup is unchanged, including the fragment shape: the caller owns the
// wrapper, its layout classes and any entrance animation, so the hero keeps
// its own timing and home stays still.
//
// Behavior is unchanged too. While APP_STORE_LIVE is false the badge is
// muted, unlinked and untracked under a coming-soon caption; flip the const
// at launch and it links to the listing and tracks a cta_click carrying the
// caller's placement.
import { track, ANALYTICS_EVENTS } from "@/lib/analytics";

// The numeric id is ascAppId from bolo-mobile/eas.json.
export const APP_STORE_URL = "https://apps.apple.com/app/id6790907772";
// Flip to true when the listing is approved and live in the App Store.
export const APP_STORE_LIVE = false;

export function AppStoreBadge({
  live = APP_STORE_LIVE,
  placement,
}: {
  /** Tests inject the live state; a same-module const cannot be vi.mocked. */
  live?: boolean;
  /** Analytics placement for the linked state, e.g. "hero-appstore-badge". */
  placement: string;
}) {
  const src = `${import.meta.env.BASE_URL}appstore-badge.svg`;

  if (live) {
    return (
      <a href={APP_STORE_URL} onClick={() => track(ANALYTICS_EVENTS.CTA_CLICK, { placement })}>
        <img src={src} alt="Download on the App Store" className="h-12 w-auto" />
      </a>
    );
  }

  return (
    <>
      {/* Pre-release: same slot, muted, unlinked, no tracking. */}
      <img src={src} alt="Download on the App Store" className="h-12 w-auto opacity-50" />
      <p className="mt-2 text-xs font-semibold text-muted-foreground">
        Coming soon to the App Store
      </p>
    </>
  );
}
