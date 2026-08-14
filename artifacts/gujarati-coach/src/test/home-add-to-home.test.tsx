import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";
import { PLUS_ENTITLEMENTS } from "./fixtures";

// Add-to-home-screen guidance plus the App Store badge at the bottom of the
// SIGNED-IN home page (/app). Two things are pinned here:
//
// (1) the badge is the shared component in its pre-release state (muted,
//     unlinked, coming-soon caption), not a second hand-written copy;
// (2) platform steps never cross-contaminate. An iPad visitor must never be
//     told to open a Chrome menu and an Android visitor must never be told to
//     tap Safari's Share button. iPadOS matters most: Safari sends a
//     Macintosh user agent by default, so the iPad is recognized by touch
//     points rather than by the UA string.
vi.mock("@/components/XpCounter", () => ({ XpCounter: () => null }));
vi.mock("@/components/name-prompt-card", () => ({ NamePromptCard: () => null }));

vi.mock("@clerk/react", () => ({
  useUser: () => ({ isSignedIn: true, user: { firstName: "Test" } }),
  useClerk: () => ({ signOut: vi.fn() }),
}));

vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({
    languages: [{ code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" }],
    activeLang: "gu",
    activeLanguage: { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" },
    setActiveLang: vi.fn(),
    isLoading: false,
  }),
  useNativeText: () => ({ style: {}, dir: "ltr" as const, isNastaliq: false }),
  nativeTextProps: () => ({ style: {}, dir: "ltr" as const }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  }),
}));

// Reduced motion: skips the cold-load brand splash so the page content is on
// screen at first paint (splash behavior lives in home-brand-splash.test.tsx).
vi.mock("framer-motion", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useReducedMotion: () => true,
}));

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  useGetEntitlements: () => ({ data: PLUS_ENTITLEMENTS, isLoading: false }),
  getGetEntitlementsQueryKey: () => ["entitlements"],
  useUpdateAccountPreferences: () => ({ mutate: vi.fn(), isPending: false }),
  getGetAccountQueryKey: () => ["account"],
  useGetProgressSummary: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    isPlaceholderData: false,
    refetch: vi.fn(),
  }),
  getGetProgressSummaryQueryKey: () => ["summary"],
  useGetAccount: () => ({ data: undefined }),
  useListCategories: () => ({ data: [], isLoading: false }),
  getListCategoriesQueryKey: () => ["categories"],
  useListRecentAttempts: () => ({ data: [], isLoading: false }),
  useListReviewPhrases: () => ({ data: [], isLoading: false }),
  getListReviewPhrasesQueryKey: () => ["review"],
  useListBadges: () => ({ data: undefined, isLoading: false }),
  useListIncomingFriendRequests: () => ({ data: [], isLoading: false }),
  useListCategoryLessonGroups: () => ({
    data: { lessonGroups: [] },
    isLoading: false,
    isError: false,
  }),
}));

// Imported after the mocks are declared.
import Home from "@/pages/home";
import { detectShortcutPlatform } from "@/lib/platform";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
// What an iPad actually sends with the factory "Request Desktop Website"
// setting: no iPad token anywhere in the string.
const IPADOS_DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const MAC_DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const originalUserAgent = navigator.userAgent;
const originalPlatform = navigator.platform;
const originalTouchPoints = navigator.maxTouchPoints;

function setNavigator({
  ua,
  platform = "",
  maxTouchPoints = 0,
}: {
  ua: string;
  platform?: string;
  maxTouchPoints?: number;
}) {
  Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });
  Object.defineProperty(window.navigator, "platform", { value: platform, configurable: true });
  Object.defineProperty(window.navigator, "maxTouchPoints", {
    value: maxTouchPoints,
    configurable: true,
  });
}

function renderHome() {
  const { hook } = memoryLocation({ path: "/app" });
  return render((<Router hook={hook}>{(<Home />) as ReactElement}</Router>) as ReactElement);
}

beforeEach(() => {
  setNavigator({ ua: MAC_DESKTOP_UA });
});

afterEach(() => {
  setNavigator({
    ua: originalUserAgent,
    platform: originalPlatform,
    maxTouchPoints: originalTouchPoints,
  });
});

describe("platform detection for home-screen guidance", () => {
  test("an iPhone is iOS", () => {
    setNavigator({ ua: IPHONE_UA, platform: "iPhone", maxTouchPoints: 5 });
    expect(detectShortcutPlatform()).toBe("ios");
  });

  test("an iPad is iOS despite its Macintosh user agent", () => {
    setNavigator({ ua: IPADOS_DESKTOP_UA, platform: "MacIntel", maxTouchPoints: 5 });
    expect(detectShortcutPlatform()).toBe("ios");
  });

  test("a desktop Mac with the same user agent is not iOS: no touch points", () => {
    setNavigator({ ua: MAC_DESKTOP_UA, platform: "MacIntel", maxTouchPoints: 0 });
    expect(detectShortcutPlatform()).toBe("unknown");
  });

  test("Android is Android", () => {
    setNavigator({ ua: ANDROID_UA, platform: "Linux armv8l", maxTouchPoints: 5 });
    expect(detectShortcutPlatform()).toBe("android");
  });
});

describe("home add-to-home-screen block", () => {
  test("iOS: Safari steps, the App Store badge in its coming-soon state, no Android copy", () => {
    setNavigator({ ua: IPHONE_UA, platform: "iPhone", maxTouchPoints: 5 });
    renderHome();

    expect(screen.getByTestId("add-to-home")).toBeInTheDocument();
    expect(screen.getByTestId("add-to-home-ios")).toBeInTheDocument();
    expect(screen.getByText("Keep Bolo one tap away")).toBeInTheDocument();
    expect(
      screen.getByText(/Tap the Share button in Safari/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Scroll down the list and tap Add to Home Screen/)).toBeInTheDocument();

    // Pre-release badge: present, unlinked, captioned, from the shared component.
    expect(screen.getByTestId("home-appstore-badge")).toBeInTheDocument();
    expect(screen.getByAltText("Download on the App Store")).toBeInTheDocument();
    expect(screen.getByText("Coming soon to the App Store")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Download on the App Store/i }),
    ).not.toBeInTheDocument();

    // Never both stores at once.
    expect(screen.queryByTestId("home-playstore-badge")).toBeNull();
    expect(screen.queryByAltText("Get it on Google Play")).toBeNull();
    expect(screen.queryByText("Coming soon to Google Play")).toBeNull();

    // No cross-contamination.
    expect(screen.queryByTestId("add-to-home-android")).toBeNull();
    expect(screen.queryByText(/Chrome/)).toBeNull();
    expect(screen.queryByText(/three dot menu/)).toBeNull();
  });

  test("iPadOS reporting a desktop user agent still gets the iOS steps", () => {
    setNavigator({ ua: IPADOS_DESKTOP_UA, platform: "MacIntel", maxTouchPoints: 5 });
    renderHome();

    expect(screen.getByTestId("add-to-home-ios")).toBeInTheDocument();
    expect(screen.getByText(/Tap the Share button in Safari/)).toBeInTheDocument();
    expect(screen.queryByTestId("add-to-home-android")).toBeNull();
  });

  test("Android: Chrome steps, the Play badge in its coming-soon state, no Safari copy, no Apple badge", () => {
    setNavigator({ ua: ANDROID_UA, platform: "Linux armv8l", maxTouchPoints: 5 });
    renderHome();

    expect(screen.getByTestId("add-to-home-android")).toBeInTheDocument();
    expect(screen.getByText(/Tap the three dot menu in Chrome/)).toBeInTheDocument();
    expect(screen.getByText(/Tap Add to Home screen, then tap Add/)).toBeInTheDocument();

    // Pre-release badge: present, unlinked, captioned, from the shared component.
    expect(screen.getByTestId("home-playstore-badge")).toBeInTheDocument();
    expect(screen.getByAltText("Get it on Google Play")).toBeInTheDocument();
    expect(screen.getByText("Coming soon to Google Play")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Get it on Google Play/i })).toBeNull();

    // Never both stores at once.
    expect(screen.queryByTestId("add-to-home-ios")).toBeNull();
    expect(screen.queryByText(/Safari/)).toBeNull();
    expect(screen.queryByTestId("home-appstore-badge")).toBeNull();
    expect(screen.queryByAltText("Download on the App Store")).toBeNull();
    expect(screen.queryByText("Coming soon to the App Store")).toBeNull();
  });

  test("unknown platform: neutral steps, neither platform's wording, neither store badge", () => {
    setNavigator({ ua: MAC_DESKTOP_UA, platform: "MacIntel", maxTouchPoints: 0 });
    renderHome();

    expect(screen.getByTestId("add-to-home-unknown")).toBeInTheDocument();
    expect(screen.getByText(/Open your browser's share or menu button/)).toBeInTheDocument();
    expect(screen.queryByText(/Safari/)).toBeNull();
    expect(screen.queryByText(/Chrome/)).toBeNull();
    expect(screen.queryByAltText("Download on the App Store")).toBeNull();
    expect(screen.queryByAltText("Get it on Google Play")).toBeNull();
  });

  test("the copy never promises an installed app", () => {
    setNavigator({ ua: IPHONE_UA, platform: "iPhone", maxTouchPoints: 5 });
    renderHome();
    expect(
      screen.getByText(
        "It still opens in Safari. This is a shortcut to the website, not the App Store app.",
      ),
    ).toBeInTheDocument();
  });
});
