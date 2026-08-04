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

// The hero App Store badge is iOS-only: iPhone visitors get the official
// Apple badge linking to the native listing, everyone else renders nothing.
describe("App Store badge (iOS only)", () => {
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

  const IPHONE_UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

  test("pre-release default: iOS user agents see a muted unlinked badge with the coming-soon caption, nothing tracked", () => {
    setUserAgent(IPHONE_UA);
    renderAt(<Landing />);

    expect(screen.getByAltText("Download on the App Store")).toBeInTheDocument();
    expect(screen.getByText("Coming soon to the App Store")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Download on the App Store/i }),
    ).not.toBeInTheDocument();
    expect(h.track).not.toHaveBeenCalledWith(
      ANALYTICS_EVENTS.CTA_CLICK,
      expect.objectContaining({ placement: "hero-appstore-badge" }),
    );
  });

  test("live state: iOS user agents see the badge linking to the App Store listing, and clicks are tracked", () => {
    setUserAgent(IPHONE_UA);
    renderAt(<Landing appStoreLive />);

    const badge = screen.getByRole("link", { name: /Download on the App Store/i });
    expect(badge).toHaveAttribute("href", "https://apps.apple.com/app/id6790907772");
    expect(screen.queryByText("Coming soon to the App Store")).not.toBeInTheDocument();

    fireEvent.click(badge);
    expect(h.track).toHaveBeenCalledWith(ANALYTICS_EVENTS.CTA_CLICK, {
      placement: "hero-appstore-badge",
    });
  });

  test("non-iOS user agents see no App Store badge or caption in either state", () => {
    renderAt(<Landing />);
    expect(screen.queryByAltText("Download on the App Store")).not.toBeInTheDocument();
    expect(screen.queryByText("Coming soon to the App Store")).not.toBeInTheDocument();
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

    // Primary + secondary hero actions, plus the "I have an account" sign-in.
    expect(signUpHrefs().length).toBeGreaterThan(0);
    expect(signUpHrefs()).toContain("/sign-up");
    expect(
      screen.getByRole("link", { name: /I have an account/i }),
    ).toHaveAttribute("href", "/sign-in");
    expect(screen.getByRole("link", { name: /^Sign in$/i })).toHaveAttribute(
      "href",
      "/sign-in",
    );
  });

  test("no stale 'Indian languages' positioning remains anywhere on the page", () => {
    const { container } = renderAt(<Landing />);
    expect(container.textContent).not.toMatch(/Indian languages/i);
    expect(container.textContent).not.toMatch(/22 official/i);
  });

  test("drives the real SpeakingDemo component", () => {
    renderAt(<Landing />);

    expect(
      screen.getByText(/Watch the speak-out-loud loop in action/i),
    ).toBeInTheDocument();
    // The demo renders its first scripted phrase (native + romanized) and the
    // opening caption — proof the component and its motion primitives mounted.
    expect(screen.getByText("કેમ છો?")).toBeInTheDocument();
    expect(screen.getByText(/Kem cho\?/i)).toBeInTheDocument();
    expect(screen.getByText(/Hear it first/i)).toBeInTheDocument();
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

  test("renders the families section with the Family plan seat count and privacy link", () => {
    renderAt(<Landing />);

    expect(
      screen.getByRole("heading", { name: /Built for the whole family/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/covers up to 4 people/i)).toBeInTheDocument();
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
    expect(screen.getByRole("heading", { name: /^Family$/i })).toBeInTheDocument();

    // Prices come from the canonical shared config.
    expect(screen.getByText("$12.99")).toBeInTheDocument();
    expect(screen.getByText("$19.99")).toBeInTheDocument();

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

    // Hero primary CTA: cta_click by placement + signup_started attribution.
    fireEvent.click(screen.getAllByRole("link", { name: /Get started free/i })[0]!);
    expect(h.track).toHaveBeenCalledWith(ANALYTICS_EVENTS.CTA_CLICK, {
      placement: "hero-primary",
    });
    expect(h.track).toHaveBeenCalledWith(ANALYTICS_EVENTS.SIGNUP_STARTED, {
      source: "hero-primary",
    });
    expect(ANALYTICS_EVENTS.CTA_CLICK).toBe("cta_click");
    expect(ANALYTICS_EVENTS.SIGNUP_STARTED).toBe("signup_started");

    // Hero secondary CTA.
    fireEvent.click(screen.getByRole("link", { name: /I have an account/i }));
    expect(h.track).toHaveBeenCalledWith(ANALYTICS_EVENTS.CTA_CLICK, {
      placement: "hero-secondary",
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
