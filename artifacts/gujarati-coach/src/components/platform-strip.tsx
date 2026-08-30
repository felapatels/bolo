// WHERE YOU CAN ACTUALLY USE BOLO. Asked for 2026-08-30: show iOS, iPadOS,
// Android and web, with iPadOS and Android marked coming soon.
//
// AVAILABILITY IS DERIVED, NOT TYPED IN. Each row reads the same flags the
// store badges read (APP_STORE_LIVE, PLAY_STORE_LIVE, IPAD_LIVE), so the day
// Play opens this strip stops saying "coming soon" on its own. A hardcoded
// "coming soon" here is a promise that outlives the thing it described, and
// this page already had one of those.
//
// STATE IS NEVER CARRIED BY COLOUR ALONE. Every tile says "Available now" or
// "Coming soon" in words, and the two states differ in border weight and glyph
// as well as in fill, because a status told only in green and grey is not told
// at all to a colour-blind reader.
//
// NO BRAND MARKS. Apple's logo and the Android robot are trademarks with their
// own placement rules, and the licensed way to show them is the official store
// badges this app already ships (components/app-store-badge.tsx). These are
// FORM-FACTOR glyphs instead — a phone is a phone — and the word underneath
// carries the platform. iPhone and Android share the phone glyph on purpose:
// they are the same shape of device, and inventing a difference would be
// drawing a logo by another route.
import { Check, Clock, Globe, Smartphone, Tablet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";
import { ANALYTICS_EVENTS } from "@/lib/analyticsEvents";
import {
  APP_STORE_LIVE,
  APP_STORE_URL,
  IPAD_LIVE,
  PLAY_STORE_LIVE,
} from "@/components/app-store-badge";

interface Platform {
  id: string;
  name: string;
  Icon: LucideIcon;
  live: boolean;
  /** What you get there, once it is open. */
  detail: string;
  /**
   * Where the tile goes, when it goes anywhere. A tile that names a shipped
   * platform and does nothing when you press it is a broken link that happens
   * not to be blue: reported 2026-08-30, "I want to click on any of the app
   * store links and get to that app store page. Doesn't work."
   *
   * The two that are not open yet stay inert on purpose. Sending someone to a
   * Play listing that does not exist is worse than a tile that plainly says
   * Coming soon.
   */
  href?: string;
  /** True for an off-site store link, which needs a new tab and rel guards. */
  external?: boolean;
}

export function platformsFor({
  appStoreLive = APP_STORE_LIVE,
  playStoreLive = PLAY_STORE_LIVE,
  ipadLive = IPAD_LIVE,
}: {
  appStoreLive?: boolean;
  playStoreLive?: boolean;
  ipadLive?: boolean;
} = {}): Platform[] {
  return [
    {
      id: "ios",
      name: "iPhone",
      Icon: Smartphone,
      live: appStoreLive,
      detail: "On the App Store",
      href: appStoreLive ? APP_STORE_URL : undefined,
      external: true,
    },
    {
      id: "web",
      name: "Web",
      Icon: Globe,
      // The visitor is reading this in a browser, so claiming anything else
      // would be contradicted by the page it is printed on.
      live: true,
      detail: "Right here, no install",
      // You are already in a browser, so the useful destination is the thing
      // the page is asking you to do, not a download.
      href: "/sign-up",
    },
    {
      id: "ipad",
      name: "iPad",
      Icon: Tablet,
      live: ipadLive,
      detail: "Built for the bigger screen",
    },
    {
      id: "android",
      name: "Android",
      Icon: Smartphone,
      live: playStoreLive,
      detail: "On Google Play",
    },
  ];
}

export function PlatformStrip({
  appStoreLive = APP_STORE_LIVE,
  playStoreLive = PLAY_STORE_LIVE,
  ipadLive = IPAD_LIVE,
}: {
  appStoreLive?: boolean;
  playStoreLive?: boolean;
  ipadLive?: boolean;
} = {}) {
  const platforms = platformsFor({ appStoreLive, playStoreLive, ipadLive });
  return (
    <ul
      className="grid grid-cols-2 gap-3 sm:grid-cols-4 items-stretch"
      data-testid="platform-strip"
    >
      {platforms.map(({ id, name, Icon, live, detail, href, external }) => {
        const body = (
          <>
            <Icon
              className={cn(
                "h-6 w-6",
                live ? "text-primary" : "text-muted-foreground",
              )}
              aria-hidden="true"
            />
            <span className="mt-2 text-sm font-black text-foreground">{name}</span>
            <span
              className={cn(
                "mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold",
                live ? "text-foreground/70" : "text-muted-foreground",
              )}
            >
              {live ? (
                <Check className="h-3 w-3 shrink-0" aria-hidden="true" />
              ) : (
                <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
              )}
              {live ? "Available now" : "Coming soon"}
            </span>
            <span className="mt-1 text-[11px] font-medium text-muted-foreground">
              {detail}
            </span>
          </>
        );
        const tile = cn(
          "flex h-full flex-col items-center rounded-2xl px-3 py-4 text-center transition-colors",
          live
            ? "border-2 border-primary/30 bg-card"
            : "border border-dashed border-border bg-card/50",
          href && "hover:border-primary/60",
        );
        const onClick = () =>
          track(ANALYTICS_EVENTS.CTA_CLICK, { placement: `platform-${id}` });
        return (
          <li key={id} data-testid={`platform-${id}`} data-live={live ? "yes" : "no"}>
            {href ? (
              external ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onClick}
                  className={tile}
                >
                  {body}
                </a>
              ) : (
                <Link href={href} onClick={onClick} className={tile}>
                  {body}
                </Link>
              )
            ) : (
              // Not a link and not focusable: there is nowhere to go yet, and a
              // tab stop that does nothing is worse than no tab stop.
              <div className={tile}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
