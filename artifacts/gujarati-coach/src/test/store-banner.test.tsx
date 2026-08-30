import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// The sticky get-the-app bar, added 2026-08-25. The hero badge already existed
// and scrolls away; this one stays, so these tests are mostly about it not
// lying to the platform it is being read on.
vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
  ANALYTICS_EVENTS: { CTA_CLICK: "cta_click" },
}));

let platform: "ios" | "android" | "unknown" = "unknown";
vi.mock("@/lib/platform", () => ({
  detectShortcutPlatform: () => platform,
}));

// The two store flags are read from the badge module, so the banner and the
// hero can never disagree about whether a store is live.
let appLive = true;
let playLive = false;
// The bar renders the REAL Apple artwork and our matching web badge since
// 2026-08-30, so the mock has to supply both. They are stubbed rather than
// imported: this file is about the bar's own logic (which platform sees what,
// dismissal, copy), and pulling in the badges would drag wouter's Link and the
// SVG assets into every case for no gain. app-store-badge has its own tests.
vi.mock("@/components/app-store-badge", () => ({
  APP_STORE_URL: "https://apps.apple.com/app/id6790907772",
  AppStoreBadge: ({ placement }: { placement: string }) => (
    <img alt="Download on the App Store" data-placement={placement} />
  ),
  WebBadge: ({ placement }: { placement: string }) => (
    <a href="/sign-up" data-placement={placement}>
      In your browser
    </a>
  ),
  get APP_STORE_LIVE() {
    return appLive;
  },
  get PLAY_STORE_LIVE() {
    return playLive;
  },
}));

import { StoreBanner } from "@/components/store-banner";

beforeEach(() => {
  platform = "unknown";
  appLive = true;
  playLive = false;
  localStorage.clear();
});

describe("StoreBanner", () => {
  it("announces the App Store and says Play is coming", () => {
    render(<StoreBanner />);
    expect(screen.getByText("Bolo! is live on the App Store")).toBeTruthy();
    expect(screen.getByText(/Google Play is coming very soon/i)).toBeTruthy();
    // THE BAR NO LONGER OWNS THE ANCHOR. It used to draw its own "Get it"
    // button with the store URL on it; since 2026-08-30 it renders Apple's
    // official badge, and the href, the tracking and the pre-release muted
    // state all live in AppStoreBadge, which has its own tests. So this
    // asserts the delegation rather than re-testing the link through a mock,
    // which would only ever prove the mock.
    expect(screen.getByTestId("store-banner-appstore")).toBeTruthy();
    expect(screen.getByAltText("Download on the App Store")).toBeTruthy();
  });

  it("does NOT offer an App Store button on Android", () => {
    platform = "android";
    render(<StoreBanner />);
    // A button that installs nothing on the device holding it is worse than no
    // button. The line still tells them what is coming.
    expect(screen.queryByTestId("store-banner-appstore")).toBeNull();
    expect(screen.getByText(/runs right here in your browser/i)).toBeTruthy();
  });

  it("stays dismissed", () => {
    const { unmount } = render(<StoreBanner />);
    fireEvent.click(screen.getByTestId("store-banner-dismiss"));
    expect(screen.queryByTestId("store-banner")).toBeNull();
    unmount();

    render(<StoreBanner />);
    expect(screen.queryByTestId("store-banner")).toBeNull();
  });

  it("changes its own copy when Play goes live, with no edit here", () => {
    playLive = true;
    render(<StoreBanner />);
    // PLAY_STORE_LIVE is the single switch. The day the Android listing leaves
    // closed testing, this line has to change by itself or somebody has to
    // remember a file they will not remember.
    expect(
      screen.getByText("Bolo! is live on the App Store and Google Play"),
    ).toBeTruthy();
    expect(screen.queryByText(/coming very soon/i)).toBeNull();
  });

  it("renders nothing at all when neither store is live", () => {
    appLive = false;
    playLive = false;
    render(<StoreBanner />);
    expect(screen.queryByTestId("store-banner")).toBeNull();
  });
});
