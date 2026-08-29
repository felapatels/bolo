import { describe, expect, test } from "vitest";
import { rateLinkFor, APP_STORE_WRITE_REVIEW_URL } from "@/lib/rate-link";
import { PLAY_STORE_URL } from "@/components/app-store-badge";

// "Rate Bolo!" on the web account page, build 19. Which listing a visitor is
// sent to, and when they are sent nowhere.
describe("rateLinkFor", () => {
  const bothLive = { appStore: true, play: true };

  test("Apple devices and desktops get the App Store write-review link", () => {
    expect(rateLinkFor("ios", bothLive)).toEqual({
      href: APP_STORE_WRITE_REVIEW_URL,
      store: "the App Store",
    });
    expect(rateLinkFor("unknown", bothLive)?.href).toBe(APP_STORE_WRITE_REVIEW_URL);
    expect(APP_STORE_WRITE_REVIEW_URL).toBe(
      "https://apps.apple.com/app/id6790907772?action=write-review",
    );
  });

  test("Android gets Google Play once the listing is live", () => {
    expect(rateLinkFor("android", bothLive)).toEqual({
      href: PLAY_STORE_URL,
      store: "Google Play",
    });
  });

  test("Android gets NO row while Play is still in closed testing", () => {
    // A link a visitor cannot rate on is worse than no row.
    expect(rateLinkFor("android", { appStore: true, play: false })).toBeNull();
  });

  test("nobody gets a row before any store is live", () => {
    expect(rateLinkFor("ios", { appStore: false, play: false })).toBeNull();
  });

  test("the defaults follow the live consts, so today Android has no row", () => {
    expect(rateLinkFor("android")).toBeNull();
    expect(rateLinkFor("ios")?.store).toBe("the App Store");
  });
});
