// "RATE BOLO!" on the web, build 19. The Play testers asked for a way to rate
// the app from inside it; on mobile the row drives the stores' own review
// flows (bolo-mobile/lib/store.ts). A browser has no in-app review, so the
// web row is a link to the listing the visitor could actually rate on.
//
// Reads the same LIVE consts the hero badge and the store banner read, so the
// day Play leaves closed testing an Android visitor's row lights up with it
// rather than needing to be found and edited. Until then an Android visitor
// gets no row at all: a link they cannot rate on is worse than none.
import {
  APP_STORE_LIVE,
  APP_STORE_URL,
  PLAY_STORE_LIVE,
  PLAY_STORE_URL,
} from "@/components/app-store-badge";
import type { ShortcutPlatform } from "@/lib/platform";

export type RateLink = { href: string; store: "the App Store" | "Google Play" };

/** Apple's documented deep link for an explicit "write a review" action. */
export const APP_STORE_WRITE_REVIEW_URL = `${APP_STORE_URL}?action=write-review`;

export function rateLinkFor(
  platform: ShortcutPlatform,
  live: { appStore: boolean; play: boolean } = {
    appStore: APP_STORE_LIVE,
    play: PLAY_STORE_LIVE,
  },
): RateLink | null {
  if (platform === "android") {
    return live.play ? { href: PLAY_STORE_URL, store: "Google Play" } : null;
  }
  // iPhone, iPad and desktop alike: apps.apple.com opens the App Store app on
  // Apple devices and the listing page everywhere else.
  return live.appStore
    ? { href: APP_STORE_WRITE_REVIEW_URL, store: "the App Store" }
    : null;
}
