import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";

// The landing page is the first thing a new visitor sees. It renders the hero,
// the live SpeakingDemo, the language showcase, the "how it works" grid, the
// "Why Bolo!" comparison, and the bottom CTA — plus the shared Mascot and motion
// primitives. We drive all of those for real and mock ONLY the languages data
// source (mirroring the other web tests), so a broken import or motion primitive
// anywhere in that chain fails this check before it reaches production.

const h = vi.hoisted(() => ({
  languages: undefined as unknown,
}));

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  useGetProgressSummary: vi.fn(() => ({ data: undefined, isLoading: false })),
  getGetProgressSummaryQueryKey: vi.fn(() => ['progress-summary']),
  useListLanguages: () => ({ data: h.languages, isLoading: false }),
}));

// Imported after the mock is declared so the page picks up the mocked hook.
import Landing from "@/pages/landing";

function renderLanding(ui: ReactElement, path = "/") {
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
});

describe("Landing page", () => {
  test("renders the hero headline and both hero CTAs", () => {
    renderLanding(<Landing />);

    // Headline is split across a <br>, so match on its distinctive halves.
    expect(screen.getByText(/Actually speak all 22/i)).toBeInTheDocument();
    expect(
      screen.getByText(/official Indian languages\./i),
    ).toBeInTheDocument();

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

  test("drives the real SpeakingDemo component", () => {
    renderLanding(<Landing />);

    // The demo renders one of its scripted phrases and the caption below it —
    // proof the component (and its motion primitives) mounted without throwing.
    expect(
      screen.getByText(/Watch the speak-out-loud loop in action/i),
    ).toBeInTheDocument();
    // The demo renders its first scripted phrase (native + romanized) and the
    // opening caption — proof the component and its motion primitives mounted.
    expect(screen.getByText("કેમ છો?")).toBeInTheDocument();
    expect(screen.getByText(/Kem cho\?/i)).toBeInTheDocument();
    expect(screen.getByText(/Hear it first/i)).toBeInTheDocument();
  });

  test("shows the offline fallback language chips when the API is empty", () => {
    // No data from the languages endpoint → the hard-coded fallback set renders
    // so the showcase is never blank on first paint.
    h.languages = undefined;
    renderLanding(<Landing />);

    for (const native of [
      "ગુજરાતી", // Gujarati
      "हिन्दी", // Hindi
      "বাংলা", // Bengali
      "తెలుగు", // Telugu
      "தமிழ்", // Tamil
      "ਪੰਜਾਬੀ", // Punjabi
    ]) {
      expect(screen.getByText(native)).toBeInTheDocument();
    }
  });

  test("renders the server language list once it loads", () => {
    h.languages = [
      {
        code: "mr",
        name: "Marathi",
        nativeName: "मराठी",
        fontFamily: "Noto Sans Devanagari",
        rtl: false,
      },
    ];
    renderLanding(<Landing />);

    expect(screen.getByText("मराठी")).toBeInTheDocument();
    expect(screen.getByText("Marathi")).toBeInTheDocument();
    // Once real data arrives, the fallback set is replaced entirely.
    expect(screen.queryByText("ગુજરાતી")).not.toBeInTheDocument();
  });

  test("renders the section headings, the learning-loop cards, and the comparison", () => {
    renderLanding(<Landing />);

    // Language showcase + comparison section headings.
    expect(
      screen.getByRole("heading", { name: /All 22 official Indian languages/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Why Bolo! hits different/i }),
    ).toBeInTheDocument();

    // The real end-to-end learning loop: hear → say → coached → comes back.
    expect(
      screen.getByRole("heading", { name: /The loop that makes it stick/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /^Hear it$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Say it out loud/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Get coached/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /^It comes back$/i }),
    ).toBeInTheDocument();

    // "Why Bolo!" comparison: the two columns.
    expect(
      screen.getByRole("heading", { name: /Other apps/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /With Bolo!/i }),
    ).toBeInTheDocument();
  });

  test("showcases the real feature set: chat, journey map, games, retention loop", () => {
    renderLanding(<Landing />);

    expect(
      screen.getByRole("heading", { name: /Way more than flashcards/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Chat with Bolo/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Your journey map/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /The games arcade/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /It keeps you coming back/i }),
    ).toBeInTheDocument();

    // Script Trace is called out by name (card copy + retention chip).
    expect(screen.getAllByText(/Script Trace/i).length).toBeGreaterThanOrEqual(1);

    // Retention-loop chips.
    // Anchored: the chip labels also appear inside card body copy.
    for (const chip of [
      /^Daily streaks$/i,
      /^Spaced review$/i,
      /^Badges to earn$/i,
      /^Friends leaderboard$/i,
    ]) {
      expect(screen.getByText(chip)).toBeInTheDocument();
    }

    // Honest free-vs-Plus note, no hard sell.
    expect(
      screen.getByRole("heading", { name: /Free to start\. Really\./i }),
    ).toBeInTheDocument();
  });

  test("renders the bottom CTA and footer links", () => {
    renderLanding(<Landing />);

    const cta = screen.getByRole("heading", {
      name: /Ready to actually say something\?/i,
    });
    expect(cta).toBeInTheDocument();

    // The bottom CTA carries its own "Get started free" link to /sign-up.
    expect(signUpHrefs()).toContain("/sign-up");
    // At least two sign-up CTAs on the page (hero + bottom).
    expect(signUpHrefs().length).toBeGreaterThanOrEqual(2);

    const footer = screen.getByRole("contentinfo");
    expect(
      within(footer).getByRole("link", { name: /Privacy Policy/i }),
    ).toHaveAttribute("href", "/privacy");
    expect(
      within(footer).getByRole("link", { name: /Terms/i }),
    ).toHaveAttribute("href", "/terms");
  });
});
