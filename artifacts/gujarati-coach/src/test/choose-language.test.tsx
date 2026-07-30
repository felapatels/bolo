import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Spec B1: the language-selection onboarding step.
//   - the /app gate routes first-time (and seeded-but-not-chosen) accounts to
//     the step, while chosen accounts and same-session skippers go straight
//     home;
//   - the step itself confirms with ONE write (activeLanguage +
//     hasChosenLanguage), routes locked picks to the journey showroom, and
//     shows the listening badge only for speech-unsupported languages;
//   - skipping is session-local: a marker, never a server write;
//   - an explicit home-picker change also persists the choice flag.
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => ({
  isSignedIn: true as boolean,
  accountData: undefined as any,
  accountLoading: false as boolean,
  entitlementsData: undefined as any,
  languages: [
    {
      code: "hi",
      name: "Hindi",
      nativeName: "हिन्दी",
      rtl: false,
      fontFamily: "Noto Sans Devanagari",
      speechCapability: "supported",
      communityReviewed: true,
    },
    {
      code: "gu",
      name: "Gujarati",
      nativeName: "ગુજરાતી",
      rtl: false,
      fontFamily: "Noto Sans Gujarati",
      speechCapability: "supported",
      communityReviewed: false,
    },
    {
      code: "ks",
      name: "Kashmiri",
      nativeName: "کٲشُر",
      rtl: true,
      fontFamily: "Noto Nastaliq Urdu",
      speechCapability: "degraded",
      communityReviewed: false,
    },
    {
      code: "mni",
      name: "Meitei",
      nativeName: "ꯃꯤꯇꯩꯂꯣꯟ",
      rtl: false,
      fontFamily: "Noto Sans Meetei Mayek",
      speechCapability: "unsupported",
      communityReviewed: false,
    },
  ],
  updatePrefs: vi.fn(),
  navigate: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/", h.navigate],
  Redirect: ({ to }: { to: string }) => (
    <div data-testid="redirect" data-to={to} />
  ),
}));

vi.mock("@clerk/react", () => ({
  useUser: () => ({ isSignedIn: h.isSignedIn }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    getQueryData: vi.fn(() => h.accountData),
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock("@workspace/api-client-react", () => ({
  useListLanguages: () => ({ data: h.languages, isLoading: false }),
  useGetEntitlements: () => ({ data: h.entitlementsData }),
  getGetEntitlementsQueryKey: () => ["entitlements"],
  useGetProgressSummary: vi.fn(() => ({ data: undefined, isLoading: false })),
  getGetProgressSummaryQueryKey: vi.fn(() => ["progress-summary"]),
  useGetAccount: () => ({ data: h.accountData, isLoading: h.accountLoading }),
  getGetAccountQueryKey: () => ["account"],
  useUpdateAccountPreferences: () => ({
    mutate: h.updatePrefs,
    isPending: false,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: h.toast }),
}));

import { LanguageProvider } from "@/lib/language-context";
import ChooseLanguage from "@/pages/choose-language";
import { LanguageChoiceGate } from "@/components/language-choice-gate";
import { LanguagePicker } from "@/components/language-picker";

function accountWith(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    preferences: {
      learning: {
        // Seeded-but-not-chosen is the REALISTIC fresh state: the provider's
        // reconcile pushes a local default before the learner ever picks.
        activeLanguage: "hi",
        dailyGoal: 10,
        theme: "system",
        // Non-null so the provider's timezone auto-report doesn't fire a
        // preferences write these tests would misattribute to the step.
        timezone: "UTC",
        hasChosenLanguage: false,
        ...overrides,
      },
      notifications: { dailyReminderEnabled: false, dailyReminderTime: null },
    },
  };
}

function renderStep() {
  return render(
    <LanguageProvider>
      <ChooseLanguage />
    </LanguageProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  h.isSignedIn = true;
  h.accountData = accountWith();
  h.accountLoading = false;
  h.entitlementsData = { allowedLanguages: ["hi", "gu", "ks", "mni"] };
  // Default: the preference write succeeds, echoing the patch back like the
  // real endpoint does.
  h.updatePrefs.mockImplementation((vars: any, opts: any) => {
    opts?.onSuccess?.({
      preferences: accountWith({ ...vars.data }).preferences,
    });
  });
});

// ---------------------------------------------------------------------------
// The selection step
// ---------------------------------------------------------------------------

describe("choose-language step", () => {
  test("shows every language; listening badge ONLY for speech-unsupported", () => {
    renderStep();

    for (const lang of h.languages) {
      expect(screen.getByTestId(`choose-lang-${lang.code}`)).toBeInTheDocument();
    }
    // Native name prominent, English secondary.
    expect(screen.getByText("हिन्दी")).toBeInTheDocument();
    expect(screen.getByText("Hindi")).toBeInTheDocument();

    // mni is unsupported → badge; ks is only DEGRADED → treated as supported
    // here (no badge); hi/gu obviously none.
    expect(screen.getByTestId("listening-badge-mni")).toBeInTheDocument();
    expect(screen.queryByTestId("listening-badge-ks")).toBeNull();
    expect(screen.queryByTestId("listening-badge-hi")).toBeNull();

    // No plan gating on the step: nothing is marked locked or Plus.
    expect(screen.queryByText(/plus/i)).toBeNull();
    expect(screen.queryByText(/lock/i)).toBeNull();

    // Provenance note appears once as a footer (a rollout language exists).
    expect(screen.getByTestId("community-note")).toBeInTheDocument();
  });

  test("confirming persists ONE explicit-choice write and lands home", () => {
    renderStep();
    fireEvent.click(screen.getByTestId("choose-lang-gu"));

    expect(h.updatePrefs).toHaveBeenCalledWith(
      { data: { activeLanguage: "gu", hasChosenLanguage: true } },
      expect.anything(),
    );
    expect(h.navigate).toHaveBeenCalledWith("/app");
  });

  test("a locked pick is welcome and routes to the journey showroom", () => {
    h.entitlementsData = { allowedLanguages: ["hi"] };
    renderStep();
    fireEvent.click(screen.getByTestId("choose-lang-gu"));

    expect(h.updatePrefs).toHaveBeenCalledWith(
      { data: { activeLanguage: "gu", hasChosenLanguage: true } },
      expect.anything(),
    );
    expect(h.navigate).toHaveBeenCalledWith("/journey");
  });

  test("skip sets only a session marker — never a server write", () => {
    renderStep();
    fireEvent.click(screen.getByTestId("skip-language-step"));

    expect(sessionStorage.getItem("bolo.langStepSkipped")).toBe("1");
    expect(h.updatePrefs).not.toHaveBeenCalled();
    expect(h.navigate).toHaveBeenCalledWith("/app");
  });

  test("a failed save keeps the learner on the step with a toast", () => {
    h.updatePrefs.mockImplementation((_vars: any, opts: any) => {
      opts?.onError?.(new Error("offline"));
    });
    renderStep();
    fireEvent.click(screen.getByTestId("choose-lang-hi"));

    expect(h.toast).toHaveBeenCalled();
    expect(h.navigate).not.toHaveBeenCalled();
  });

  test("an account that already chose is bounced off the step", () => {
    h.accountData = accountWith({ hasChosenLanguage: true });
    renderStep();

    expect(screen.getByTestId("redirect")).toHaveAttribute("data-to", "/app");
    expect(screen.queryByTestId("choose-lang-hi")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The /app gate
// ---------------------------------------------------------------------------

function renderGate() {
  return render(
    <LanguageChoiceGate>
      <div data-testid="home" />
    </LanguageChoiceGate>,
  );
}

describe("LanguageChoiceGate", () => {
  test("a first-time account is routed to the step before home", () => {
    h.accountData = accountWith({ activeLanguage: null });
    renderGate();

    expect(screen.getByTestId("redirect")).toHaveAttribute(
      "data-to",
      "/choose-language",
    );
    expect(screen.queryByTestId("home")).toBeNull();
  });

  test("seeded-but-not-chosen still sees the step (activeLanguage is NOT the signal)", () => {
    h.accountData = accountWith(); // activeLanguage "hi", flag false
    renderGate();

    expect(screen.getByTestId("redirect")).toHaveAttribute(
      "data-to",
      "/choose-language",
    );
  });

  test("an account that has chosen goes straight home", () => {
    h.accountData = accountWith({ hasChosenLanguage: true });
    renderGate();

    expect(screen.getByTestId("home")).toBeInTheDocument();
    expect(screen.queryByTestId("redirect")).toBeNull();
  });

  test("a same-session skip suppresses the step (it returns next session)", () => {
    sessionStorage.setItem("bolo.langStepSkipped", "1");
    renderGate();

    expect(screen.getByTestId("home")).toBeInTheDocument();
    expect(screen.queryByTestId("redirect")).toBeNull();
  });

  test("waits for the account before deciding — no home flash for new users", () => {
    h.accountData = undefined;
    h.accountLoading = true;
    renderGate();

    expect(screen.getByTestId("language-gate-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("home")).toBeNull();
    expect(screen.queryByTestId("redirect")).toBeNull();
  });

  test("fails open: if the account can't load, home still renders", () => {
    h.accountData = undefined;
    h.accountLoading = false; // query settled with an error
    renderGate();

    expect(screen.getByTestId("home")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// The home picker: explicit changes persist the flag too
// ---------------------------------------------------------------------------

describe("language picker explicit choice", () => {
  test("picking a language persists activeLanguage + hasChosenLanguage", () => {
    render(
      <LanguageProvider>
        <LanguagePicker open onOpenChange={() => {}} />
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByText("Gujarati"));

    expect(h.updatePrefs).toHaveBeenCalledWith(
      { data: { activeLanguage: "gu", hasChosenLanguage: true } },
      expect.anything(),
    );
  });
});
