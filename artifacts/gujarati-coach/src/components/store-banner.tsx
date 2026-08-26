// The sticky "get the app" bar on the signed-out home page.
//
// "on the web home page, i want a sticky banner telling users that the app is
// now live on Apple App store with a direct link to the app. Also mention that
// the app will be live on google play very soon!" 2026-08-25.
//
// WHY THIS EXISTS WHEN THE HERO ALREADY HAS A BADGE. The hero's AppStoreBadge
// is above the fold and scrolls away; a visitor who reads the whole landing
// page has no way back to it without scrolling up. This bar stays.
//
// WHAT APPLE'S OWN SOLUTION DOES AND WHERE IT STOPS. The Smart App Banner meta
// tag has been in index.html since before this:
//
//   <meta name="apple-itunes-app" content="app-id=6790907772" />
//
// Safari on iPhone and iPad renders that as native browser chrome at the TOP
// of the page, offering VIEW to install or OPEN to deep link into an installed
// copy, and it remembers its own dismissal. It is the right answer for that
// case and it costs nothing.
//
// It covers ONLY Safari on iOS and iPadOS. Chrome and Firefox on iOS do not
// render it, desktop Safari does not, and Android has no equivalent at all:
// Chrome dropped the native Play install banner, and a web manifest's
// `related_applications` does not bring it back. So the Android half of the
// ask cannot be done with a meta tag by anybody, which is why this is a
// component rather than one more line in the head.
//
// IT SITS AT THE BOTTOM on purpose, so an iPhone already showing Apple's
// banner at the top is not wearing two.
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { detectShortcutPlatform } from "@/lib/platform";
import {
  APP_STORE_URL,
  APP_STORE_LIVE,
  PLAY_STORE_LIVE,
} from "@/components/app-store-badge";
import { track, ANALYTICS_EVENTS } from "@/lib/analytics";

const DISMISS_KEY = "bolo.storeBanner.dismissed";

export function StoreBanner() {
  // Starts hidden and is revealed by the effect below, so the first paint
  // never flashes a banner at somebody who dismissed it last week.
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "unknown">(
    "unknown",
  );

  useEffect(() => {
    // A visitor who already installed Bolo to their home screen is not pitched
    // a native app on top of it. Same standalone check the hero badge makes,
    // and it lives at the call site there for the same reason: neither
    // platform helper should grow it.
    const standalone =
      typeof navigator !== "undefined" &&
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    setPlatform(detectShortcutPlatform());
    // Read in an effect rather than in useState's initialiser: a Safari
    // private window THROWS on localStorage access rather than returning null,
    // and a throw during render would take the landing page down with it.
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      // Unreadable storage means show it. The alternative is hiding the bar
      // from the browsers most likely to be a first-time visitor.
    }
    setShow(true);
  }, []);

  // Nothing to announce until at least one store is actually live. Reads the
  // same two consts the hero badge does, so the day Play leaves closed testing
  // this copy changes with it rather than needing to be found and edited.
  if (!show || (!APP_STORE_LIVE && !PLAY_STORE_LIVE)) return null;

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // A browser that will not store the dismissal shows the bar again next
      // visit. That is the right failure direction for a launch announcement.
    }
  }

  const bothLive = APP_STORE_LIVE && PLAY_STORE_LIVE;
  const headline = bothLive
    ? "Bolo! is live on the App Store and Google Play"
    : APP_STORE_LIVE
      ? "Bolo! is live on the App Store"
      : "Bolo! is live on Google Play";

  // Android gets told what is coming rather than handed an iPhone link, and
  // the App Store button is not drawn for them at all: a button that installs
  // nothing on the device holding it is worse than no button.
  const sub = bothLive
    ? "Get it on your phone, or carry on here in the browser."
    : platform === "android"
      ? "Google Play is coming very soon. Until then it runs right here in your browser."
      : "Google Play is coming very soon.";

  const showAppStoreCta = APP_STORE_LIVE && platform !== "android";

  return (
    <div
      data-testid="store-banner"
      role="region"
      aria-label="Get the Bolo app"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-foreground">{headline}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
        </div>

        {showAppStoreCta && (
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="store-banner-appstore"
            onClick={() =>
              track(ANALYTICS_EVENTS.CTA_CLICK, {
                placement: "store-banner-appstore",
              })
            }
            className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
          >
            Get it
          </a>
        )}

        <button
          type="button"
          onClick={dismiss}
          data-testid="store-banner-dismiss"
          aria-label="Dismiss"
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
