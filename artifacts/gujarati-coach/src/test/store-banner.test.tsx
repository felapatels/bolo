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
vi.mock("@/components/app-store-badge", () => ({
  APP_STORE_URL: "https://apps.apple.com/app/id6790907772",
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
    expect(
      screen.getByTestId("store-banner-appstore").getAttribute("href"),
    ).toBe("https://apps.apple.com/app/id6790907772");
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
