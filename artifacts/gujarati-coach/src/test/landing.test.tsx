import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { Router, Route } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// The landing page is the first thing a new visitor sees. It renders the hero,
// the live SpeakingDemo, the diaspora-ordered language showcase, the five-step
// "how it works" section, the "Why Bolo!" comparison, the families section,
// the pricing preview, and the bottom CTA. We drive all of those for real and
// mock ONLY the languages data source and the analytics transport, so a broken
// import or motion primitive anywhere in that chain fails this check before it
// reaches production.

const h = vi.hoisted(() => ({
  languages: undefined as unknown,
  track: vi.fn(),
}));

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  useGetProgressSummary: vi.fn(() => ({ data: undefined, isLoading: false })),
  getGetProgressSummaryQueryKey: vi.fn(() => ["progress-summary"]),
  useListLanguages: () => ({ data: h.languages, isLoading: false }),
}));

vi.mock("@/lib/analytics", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/analytics")>("@/lib/analytics");
  return { ...actual, track: h.track };
});

// Imported after the mocks are declared so the pages pick up the mocked hooks.
import Landing from "@/pages/landing";
import LearnLanguage from "@/pages/learn-language";
import { ANALYTICS_EVENTS } from "@/lib/analyticsEvents";

function renderAt(ui: ReactElement, path = "/") {
  const { hook } = memoryLocation({ path, record: true });
  return render(<Router hook={hook}>{ui}</Router>);
}

// Every "Get started free" CTA points sign-ups at /sign-up.
function signUpHrefs() {
  return screen
    .getAllByRole("link", { name: /Get started free/i })
    .map((link) => link.getAttribute("href"));
}

beforeEach(() => {
  h.languages = undefined;
  h.track.mockClear();
});

// The hero store badge follows the visitor's platform: an iPhone or iPad gets
// Apple's badge, an Android phone gets Google Play's, and desktop or anything
// unrecognized gets neither. Nobody ever gets both, so every case below
// asserts the absence of the other store as well.
describe("store badges (platform-following)", () => {
  const originalUserAgent = navigator.userAgent;

  function setUserAgent(value: string) {
    Object.defineProperty(window.navigator, "userAgent", {
      value,
      configurable: true,
    });
  }

  afterEach(() => {
    setUserAgent(originalUserAgent);
  });

  // SCOPED TO THE HERO. Since 2026-08-30 the sticky get-the-app bar carries the
  // real App Store artwork too, so the page holds two of these badges on an
  // iPhone - deliberately: the hero's scrolls away and the bar stays (see the
  // header of store-banner.tsx). These tests are about the HERO's
  // platform-following badge, so they query inside <main> rather than the whole
  // document, which the bar sits outside of.
  const hero = () => within(screen.getByRole("main"));

  const IPHONE_UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
  // The same Android user agent home-add-to-home.test.tsx pins.
  const ANDROID_UA =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

  test("pre-release state: iOS user agents see a muted unlinked badge with the coming-soon caption, nothing tracked", () => {
    setUserAgent(IPHONE_UA);
    // Injected, not inherited. APP_STORE_LIVE went true on 2026-08-22 and this
    // test read the shipping const, so launch day broke a test about the
    // pre-release rendering. Both states are now stated outright.
    renderAt(<Landing appStoreLive={false} />);

    expect(hero().getByAltText("Download on the App Store")).toBeInTheDocument();
    expect(screen.getByText("Coming soon to the App Store")).toBeInTheDocument();
    expect(
      hero().queryByRole("link", { name: /Download on the App Store/i }),
    ).not.toBeInTheDocument();
    expect(h.track).not.toHaveBeenCalledWith(
      ANALYTICS_EVENTS.CTA_CLICK,
      expect.objectContaining({ placement: "hero-appstore-badge" }),
    );

    // Never both stores at once.
    expect(hero().queryByAltText("Get it on Google Play")).not.toBeInTheDocument();
    expect(screen.queryByText("Coming soon to Google Play")).not.toBeInTheDocument();
  });

  test("live state: iOS user agents see the badge linking to the App Store listing, and clicks are tracked", () => {
    setUserAgent(IPHONE_UA);
    renderAt(<Landing appStoreLive />);

    const badge = hero().getByRole("link", { name: /Download on the App Store/i });
    expect(badge).toHaveAttribute("href", "https://apps.apple.com/app/id6790907772");
    expect(screen.queryByText("Coming soon to the App Store")).not.toBeInTheDocument();
    expect(hero().queryByAltText("Get it on Google Play")).not.toBeInTheDocument();

    fireEvent.click(badge);
    expect(h.track).toHaveBeenCalledWith(ANALYTICS_EVENTS.CTA_CLICK, {
      placement: "hero-appstore-badge",
    });
  });

  test("pre-release state: Android user agents see a muted unlinked Play badge with the coming-soon caption, nothing tracked", () => {
    setUserAgent(ANDROID_UA);
    // Injected for the same reason as the iOS case above, so flipping
    // PLAY_STORE_LIVE does not break a test about the pre-release rendering.
    renderAt(<Landing playStoreLive={false} />);

    expect(hero().getByAltText("Get it on Google Play")).toBeInTheDocument();
    expect(screen.getByText("Coming soon to Google Play")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Get it on Google Play/i }),
    ).not.toBeInTheDocument();
    expect(h.track).not.toHaveBeenCalledWith(
      ANALYTICS_EVENTS.CTA_CLICK,
      expect.objectContaining({ placement: "hero-playstore-badge" }),
    );

    // Never both stores at once.
    expect(hero().queryByAltText("Download on the App Store")).not.toBeInTheDocument();
    expect(screen.queryByText("Coming soon to the App Store")).not.toBeInTheDocument();
  });

  test("live state: Android user agents see the badge linking to the Play listing, and clicks are tracked", () => {
    setUserAgent(ANDROID_UA);
    renderAt(<Landing playStoreLive />);

    const badge = screen.getByRole("link", { name: /Get it on Google Play/i });
    expect(badge).toHaveAttribute(
      "href",
      "https://play.google.com/store/apps/details?id=com.bolo.mobile",
    );
    expect(screen.queryByText("Coming soon to Google Play")).not.toBeInTheDocument();
    expect(hero().queryByAltText("Download on the App Store")).not.toBeInTheDocument();

    fireEvent.click(badge);
    expect(h.track).toHaveBeenCalledWith(ANALYTICS_EVENTS.CTA_CLICK, {
      placement: "hero-playstore-badge",
    });
  });

  test("desktop and unrecognized user agents see neither store badge in either state", () => {
    renderAt(<Landing />);
    expect(hero().queryByAltText("Download on the App Store")).not.toBeInTheDocument();
    expect(screen.queryByText("Coming soon to the App Store")).not.toBeInTheDocument();
    expect(hero().queryByAltText("Get it on Google Play")).not.toBeInTheDocument();
    expect(screen.queryByText("Coming soon to Google Play")).not.toBeInTheDocument();
  });
});

describe("Chacha-ji call section", () => {
  test("loops the call clip, lazily, and says it is an app feature", () => {
    const { container } = renderAt(<Landing />);

    expect(
      screen.getByRole("heading", { name: "Chacha-ji rings you" }),
    ).toBeInTheDocument();

    const video = container.querySelector(
      '[data-testid="looping-video"]',
    ) as HTMLVideoElement | null;
    expect(video).not.toBeNull();
    // muted + playsInline are what make an autoplaying clip legal at all on
    // iOS Safari; loop is the ask; and preload="none" keeps a 229 KB file off
    // the wire for a visitor who never scrolls this far, on a page whose whole
    // remaining asset budget is about 120 KB of lazy screenshots.
    expect(video).toHaveAttribute("loop");
    expect(video).toHaveAttribute("playsinline");
    expect(video).toHaveAttribute("preload", "none");
    expect(video?.muted).toBe(true);
    // A poster, so the slot is never an empty black box before play starts.
    expect(video?.getAttribute("poster")).toMatch(/chachaji-call-poster\.webp$/);
    // Not decorative: it is the whole point of the section, so it carries a
    // description rather than aria-hidden.
    expect(video?.getAttribute("aria-label")).toMatch(/Chacha-ji calls in Hindi/);

    // THE PLATFORM LINE IS LOAD-BEARING, not a footnote. The call is iOS-only
    // and a browser cannot place one, so without this the section demos
    // something the page it sits on cannot do.
    expect(
      screen.getByText("Chacha-ji's calls are in the iPhone app."),
    ).toBeInTheDocument();
  });
});

describe("Landing page", () => {
  test("renders the South Asian hero headline and both hero CTAs", () => {
    renderAt(<Landing />);

    // Headline is split across a <br>, so match on its distinctive halves.
    expect(screen.getByText(/Actually speak your/i)).toBeInTheDocument();
    expect(screen.getByText(/family's language\./i)).toBeInTheDocument();
    // The repositioned breadth copy lives in the subheadline.
    expect(
      screen.getByText(/22 South Asian languages, taught out loud/i),
    ).toBeInTheDocument();
    // Tagline survives the rebuild.
    expect(screen.getByText(/Talk, don't tap/i)).toBeInTheDocument();

    // BOTH ACTIONS LIVE IN THE STICKY HEADER NOW, 2026-08-30. They used to be
    // a row inside the hero as well; repeating them bought a duplicate button
    // at the cost of the ~90px the showcase needed to clear the fold, and
    // "I have an account" was always the same door as the header's "Sign in".
    // Asserted where they actually are rather than deleted.
    expect(signUpHrefs().length).toBeGreaterThan(0);
    expect(signUpHrefs()).toContain("/sign-up");
    expect(screen.getByRole("link", { name: /^Sign in$/i })).toHaveAttribute(
      "href",
      "/sign-in",
    );
    // Scoped to the header: "Get started free" also appears in the pricing
    // card and the bottom CTA, which is fine and deliberate.
    const header = within(screen.getByTestId("site-header"));
    expect(
      header.getByRole("link", { name: /Get started free/i }),
    ).toHaveAttribute("href", "/sign-up");
    expect(header.getByRole("link", { name: /^Sign in$/i })).toBeInTheDocument();
  });

  test("no stale 'Indian languages' positioning remains anywhere on the page", () => {
    const { container } = renderAt(<Landing />);
    expect(container.textContent).not.toMatch(/Indian languages/i);
    expect(container.textContent).not.toMatch(/22 official/i);
  });

  // THIS REPLACED A TEST FOR SpeakingDemo, a hand-drawn mock of a practice
  // screen that used to sit here. The mock had gone quietly untrue — it said
  // "Tap, then speak" over "LISTENING... STOPS ON ITS OWN", describing an
  // auto-stop recorder, while the real screen says "Hold and say it out loud"
  // and submits on release (pages/practice.tsx). Nothing could fail when the
  // app changed under it, which is the whole argument against drawing a screen
  // twice. The hero now rotates CAPTURES of the real app.
  test("names every platform, and derives coming-soon from the store flags", () => {
    const { container } = renderAt(<Landing />);

    expect(screen.getByTestId("platform-strip")).toBeInTheDocument();
    for (const id of ["ios", "web", "ipad", "android"]) {
      expect(screen.getByTestId(`platform-${id}`)).toBeInTheDocument();
    }

    // iPhone is on the App Store and web is the page you are reading; iPad and
    // Android are not open yet. These come off APP_STORE_LIVE / IPAD_LIVE /
    // PLAY_STORE_LIVE, so the day a store opens this strip corrects itself
    // rather than carrying a stale promise.
    expect(screen.getByTestId("platform-ios")).toHaveAttribute("data-live", "yes");
    expect(screen.getByTestId("platform-web")).toHaveAttribute("data-live", "yes");
    expect(screen.getByTestId("platform-ipad")).toHaveAttribute("data-live", "no");
    expect(screen.getByTestId("platform-android")).toHaveAttribute("data-live", "no");

    // STATE IS IN WORDS, not only in colour. Two of each, spelled out, so a
    // colour-blind reader is told the same thing everyone else is.
    expect(screen.getAllByText("Available now")).toHaveLength(2);
    expect(screen.getAllByText("Coming soon")).toHaveLength(2);

    // No brand marks were drawn by hand: the licensed Apple and Google artwork
    // is the store badges, and these tiles are form-factor glyphs only.
    expect(container.querySelector('[data-testid="platform-strip"] img')).toBeNull();
  });

  test("rotates real captures of the app, and stays operable", () => {
    const { container } = renderAt(<Landing />);

    expect(screen.getByTestId("hero-showcase")).toBeInTheDocument();

    // Every panel is a file, not a drawing. Home leads because it is what the
    // app opens on, and the call is the silent looping clip right behind it.
    expect(container.querySelector('[data-testid="showcase-image-home"]'))
      .toBeInTheDocument();

    // ONLY THREE PANELS ARE MOUNTED: the active one and the two flanking it.
    // The rest are not in the DOM at all, so seven phone screenshots never
    // become seven requests on a page whose whole point is loading fast.
    // `practice` sits at index 2 and is therefore absent while home leads.
    expect(container.querySelectorAll("[data-testid^='showcase-image-']"))
      .toHaveLength(2);
    expect(container.querySelector('[data-testid="showcase-image-practice"]'))
      .toBeNull();
    const call = container.querySelector(
      '[data-testid="showcase-video-call"]',
    ) as HTMLVideoElement | null;
    expect(call).not.toBeNull();
    expect(call).toHaveAttribute("loop");
    expect(call).toHaveAttribute("playsinline");
    expect(call?.muted).toBe(true);

    // The caption names the panel on screen, and it starts on practice.
    expect(screen.getByTestId("showcase-caption")).toHaveTextContent(
      "Pick up where you left off",
    );

    // AN AUTO-ROTATING CAROUSEL MUST BE OPERABLE, not just watchable: one
    // labelled tab per panel plus real prev/next buttons, so it can be driven
    // from a keyboard and named by a screen reader.
    expect(screen.getAllByRole("tab")).toHaveLength(7);
    expect(screen.getByLabelText("Next screen")).toBeInTheDocument();
    expect(screen.getByLabelText("Previous screen")).toBeInTheDocument();
  });

  test("taking hold of the showcase moves it and stops it rotating", () => {
    renderAt(<Landing />);
    fireEvent.click(screen.getByLabelText("Next screen"));
    // A carousel that keeps moving under someone who just took hold of it is
    // the worst version of this pattern, so pressing a control ends the
    // rotation for good rather than pausing it. Next from home is the call,
    // which also pins the order the owner asked for: home, then Chacha-ji.
    expect(screen.getByTestId("showcase-caption")).toHaveTextContent(
      "Chacha-ji rings you",
    );
  });

  test("shows the diaspora-leader fallback chips (incl. RTL Urdu) when the API is empty", () => {
    h.languages = undefined;
    renderAt(<Landing />);

    for (const native of [
      "हिन्दी", // Hindi
      "ਪੰਜਾਬੀ", // Punjabi
      "اردو", // Urdu (RTL path exercised in fallback)
      "বাংলা", // Bengali
      "தமிழ்", // Tamil
      "తెలుగు", // Telugu
      "ગુજરાતી", // Gujarati
      "मराठी", // Marathi
    ]) {
      expect(screen.getByText(native)).toBeInTheDocument();
    }
  });

  test("renders the server language list in diaspora-priority order with per-language links", () => {
    h.languages = [
      { code: "as", name: "Assamese", nativeName: "অসমীয়া", fontFamily: "Noto Sans Bengali", rtl: false },
      { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી", fontFamily: "Noto Sans Gujarati", rtl: false },
      { code: "hi", name: "Hindi", nativeName: "हिन्दी", fontFamily: "Noto Sans Devanagari", rtl: false },
    ];
    renderAt(<Landing />);

    // Diaspora leaders come before the alphabetical tail.
    const hindi = screen.getByRole("link", { name: /हिन्दी\s*Hindi/i });
    const assamese = screen.getByRole("link", { name: /অসমীয়া\s*Assamese/i });
    expect(
      hindi.compareDocumentPosition(assamese) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Each chip deep-links to its public per-language page.
    expect(hindi).toHaveAttribute("href", "/languages/hindi");
    expect(
      screen.getByRole("link", { name: /ગુજરાતી\s*Gujarati/i }),
    ).toHaveAttribute("href", "/languages/gujarati");
  });

  test("renders the five how-it-works steps in order with lazy screenshots", () => {
    renderAt(<Landing />);

    expect(
      screen.getByRole("heading", { name: /What using Bolo! is actually like/i }),
    ).toBeInTheDocument();

    const titles = [
      /Speak and get coached/i,
      /Chat with Bolo/i,
      /Ride the journey map/i,
      /Play the games arcade/i,
      /Spaced review makes it stick/i,
    ];
    const headings = titles.map(
      (t) => screen.getByRole("heading", { name: t }),
    );
    // Sequenced: each step heading precedes the next in the DOM.
    for (let i = 0; i < headings.length - 1; i++) {
      expect(
        headings[i]!.compareDocumentPosition(headings[i + 1]!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }

    // Real product screenshots, lazy-loaded, every one with alt text.
    const imgs = screen.getAllByRole("img");
    expect(imgs.length).toBeGreaterThanOrEqual(5);
    for (const img of imgs) {
      expect(img).toHaveAttribute("alt");
      expect(img.getAttribute("alt")).not.toBe("");
    }
    const screenshots = imgs.filter((i) =>
      (i.getAttribute("src") ?? "").includes("screens/"),
    );
    expect(screenshots).toHaveLength(5);
    for (const img of screenshots) {
      expect(img).toHaveAttribute("loading", "lazy");
    }

    // Honest free-tier copy (M1 teaser framing).
    // Appears in the how-it-works note and again in the Free pricing card.
    expect(
      screen.getAllByText(/free starter phrases in every topic/i).length,
    ).toBeGreaterThanOrEqual(1);
  });

  test("renders the families section, without selling a withdrawn plan", () => {
    renderAt(<Landing />);

    expect(
      screen.getByRole("heading", { name: /Built for the whole family/i }),
    ).toBeInTheDocument();
    // INVERTED 2026-08-24, not deleted. The section stays because families are
    // who this app is for; the SEAT-COUNT SENTENCE goes, because it advertises
    // a plan neither mobile store sells or honours. Flip back with
    // FAMILY_PLAN_ENABLED.
    expect(screen.queryByText(/covers up to 4 people/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/each person's progress stays their own/i),
    ).toBeInTheDocument();
    // Both the in-section link and the footer link match this name; the
    // families section one must point at /privacy like the rest.
    const privacyLinks = screen.getAllByRole("link", { name: /privacy policy/i });
    for (const link of privacyLinks) {
      expect(link).toHaveAttribute("href", "/privacy");
    }
  });

  test("renders the pricing preview from the shared pricing config, no daily-limit copy", () => {
    const { container } = renderAt(<Landing />);

    expect(
      screen.getByRole("heading", { name: /Honest pricing, up front/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Free$/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /^All-Access$/i }),
    ).toBeInTheDocument();
    // INVERTED 2026-08-24: the Family card is withdrawn from sale, so the
    // pricing preview must not offer it. Its $24.99 is still in the catalog and
    // simply is not rendered.
    expect(screen.queryByRole("heading", { name: /^Family$/i })).toBeNull();

    // Prices come from the live Stripe catalog, never a hardcoded string.
    expect(screen.getByText("$12.99")).toBeInTheDocument();
    expect(screen.queryByText("$24.99")).not.toBeInTheDocument();

    // The annual line says what it works out to per month, requested
    // 2026-08-24: an annual price with no monthly figure gives the reader
    // nothing to compare against the monthly plan beside it.
    expect(container.textContent).toMatch(/just \$\d+\.\d\d\/mo/);

    // The Free daily lesson cap was retired; no stale daily-limit claims.
    expect(container.textContent).not.toMatch(/per day|daily limit|lessons a day/i);
  });

  test("renders the bottom CTA and footer links", () => {
    renderAt(<Landing />);

    expect(
      screen.getByRole("heading", { name: /Ready to actually say something\?/i }),
    ).toBeInTheDocument();
    expect(signUpHrefs()).toContain("/sign-up");
    expect(signUpHrefs().length).toBeGreaterThanOrEqual(2);

    const footer = screen.getByRole("contentinfo");
    expect(
      within(footer).getByRole("link", { name: /Privacy Policy/i }),
    ).toHaveAttribute("href", "/privacy");
    expect(
      within(footer).getByRole("link", { name: /Terms/i }),
    ).toHaveAttribute("href", "/terms");
  });

  test("fires the public-surface analytics events with the reviewed names", () => {
    renderAt(<Landing />);

    // homepage_view on mount.
    expect(h.track).toHaveBeenCalledWith(ANALYTICS_EVENTS.HOMEPAGE_VIEW);
    expect(ANALYTICS_EVENTS.HOMEPAGE_VIEW).toBe("homepage_view");
    expect(ANALYTICS_EVENTS.SECTION_IN_VIEWPORT).toBe("section_in_viewport");
    expect(ANALYTICS_EVENTS.PER_LANGUAGE_PAGE_VIEW).toBe("per_language_page_view");

    // The sticky header's primary CTA: cta_click by placement plus the
    // signup_started attribution. Placement renamed hero-primary ->
    // header-primary with the move, so the funnel does not silently keep
    // reporting clicks against a button that no longer exists.
    fireEvent.click(screen.getAllByRole("link", { name: /Get started free/i })[0]!);
    expect(h.track).toHaveBeenCalledWith(ANALYTICS_EVENTS.CTA_CLICK, {
      placement: "header-primary",
    });
    expect(h.track).toHaveBeenCalledWith(ANALYTICS_EVENTS.SIGNUP_STARTED, {
      source: "header-primary",
    });
    expect(ANALYTICS_EVENTS.CTA_CLICK).toBe("cta_click");
    expect(ANALYTICS_EVENTS.SIGNUP_STARTED).toBe("signup_started");

    // And the sign-in beside it.
    fireEvent.click(screen.getByRole("link", { name: /^Sign in$/i }));
    expect(h.track).toHaveBeenCalledWith(ANALYTICS_EVENTS.CTA_CLICK, {
      placement: "header-signin",
    });

    // Language chip click carries the language name.
    fireEvent.click(screen.getByRole("link", { name: /हिन्दी\s*Hindi/i }));
    expect(h.track).toHaveBeenCalledWith(ANALYTICS_EVENTS.LANGUAGE_ENTRY_CLICK, {
      language: "Hindi",
    });
    expect(ANALYTICS_EVENTS.LANGUAGE_ENTRY_CLICK).toBe("language_entry_click");
  });
});

describe("Per-language page (/languages/:slug)", () => {
  function renderLanguagePage(slug: string) {
    return renderAt(
      <Route path="/languages/:slug" component={LearnLanguage} />,
      `/languages/${slug}`,
    );
  }

  test("renders a known language with native script, phrases, and signup CTA", () => {
    renderLanguagePage("gujarati");

    expect(
      screen.getByRole("heading", { name: /Actually speak Gujarati\./i }),
    ).toBeInTheDocument();
    // Native name in script.
    expect(screen.getByText("ગુજરાતી")).toBeInTheDocument();

    // Sample phrases with romanization from the free starter set.
    expect(screen.getByText("કેમ છો?")).toBeInTheDocument();
    expect(screen.getByText(/kem chho\?/i)).toBeInTheDocument();
    expect(screen.getByText(/How are you\?/i)).toBeInTheDocument();

    // Signup CTAs route to /sign-up.
    const cta = screen.getByRole("link", {
      name: /Start speaking Gujarati free/i,
    });
    expect(cta).toHaveAttribute("href", "/sign-up");

    // Unique per-page title + view event.
    expect(document.title).toMatch(/Learn to speak Gujarati \| Bolo!/);
    expect(h.track).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.PER_LANGUAGE_PAGE_VIEW,
      { language: "Gujarati" },
    );

    // per-language CTA analytics.
    fireEvent.click(cta);
    expect(h.track).toHaveBeenCalledWith(ANALYTICS_EVENTS.CTA_CLICK, {
      placement: "per-language-cta",
    });
    expect(h.track).toHaveBeenCalledWith(ANALYTICS_EVENTS.SIGNUP_STARTED, {
      source: "per-language-cta",
    });
  });

  test("renders the RTL Urdu page with dir=rtl native text", () => {
    renderLanguagePage("urdu");

    expect(
      screen.getByRole("heading", { name: /Actually speak Urdu\./i }),
    ).toBeInTheDocument();
    const native = screen.getByText("اردو");
    expect(native).toHaveAttribute("dir", "rtl");
  });

  test("unknown slugs fall through to the not-found surface", () => {
    renderLanguagePage("klingon");
    expect(
      screen.queryByRole("heading", { name: /Actually speak/i }),
    ).not.toBeInTheDocument();
  });
});
