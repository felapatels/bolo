import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useLanguage } from "@/lib/language-context";

// ---------------------------------------------------------------------------
// Shared mutable state that each test can override
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => ({
  isSignedIn: false as boolean,
  accountData: undefined as unknown,
  entitlementsData: undefined as unknown,
  languages: [
    {
      code: "hi",
      name: "Hindi",
      nativeName: "हिन्दी",
      rtl: false,
      fontFamily: "Noto Sans Devanagari",
    },
    {
      code: "gu",
      name: "Gujarati",
      nativeName: "ગુજરાતી",
      rtl: false,
      fontFamily: "Noto Sans Gujarati",
    },
  ],
  updatePrefs: vi.fn(),
}));

vi.mock("@clerk/react", () => ({
  useUser: () => ({ isSignedIn: h.isSignedIn }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    getQueryData: vi.fn(),
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock("@workspace/api-client-react", () => ({
  useListLanguages: () => ({ data: h.languages, isLoading: false }),
  useGetEntitlements: () => ({ data: h.entitlementsData }),
  getGetEntitlementsQueryKey: () => ["entitlements"],
  useGetAccount: () => ({ data: h.accountData }),
  getGetAccountQueryKey: () => ["account"],
  useUpdateAccountPreferences: () => ({ mutate: h.updatePrefs }),
}));

// ---------------------------------------------------------------------------
// A tiny consumer that exposes activeLang in the DOM so tests can assert on it
// ---------------------------------------------------------------------------
import { LanguageProvider } from "@/lib/language-context";

function LangDisplay() {
  const { activeLang } = useLanguage();
  return <div data-testid="lang">{activeLang}</div>;
}

function renderWithProvider() {
  return render(
    <LanguageProvider>
      <LangDisplay />
    </LanguageProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Reset state
  h.isSignedIn = false;
  h.accountData = undefined;
  h.entitlementsData = undefined;
  // Ensure localStorage is empty for each test
  localStorage.clear();
});

describe("language-context default language", () => {
  test("initialises to 'hi' when localStorage is empty and user is not signed in", () => {
    renderWithProvider();
    expect(screen.getByTestId("lang")).toHaveTextContent("hi");
  });

  test("initialises to 'hi' when localStorage is empty and account has no saved language", async () => {
    h.isSignedIn = true;
    h.accountData = {
      preferences: {
        learning: { activeLanguage: null, dailyGoal: 10, theme: "system" },
        notifications: { dailyReminderEnabled: false, dailyReminderTime: null },
      },
    };

    renderWithProvider();

    // The initial render should already show "hi" (from DEFAULT_LANG)
    expect(screen.getByTestId("lang")).toHaveTextContent("hi");

    // After reconciliation the server has no language, so local default stays
    await waitFor(() => {
      expect(screen.getByTestId("lang")).toHaveTextContent("hi");
    });
  });

  test("adopts the server language when account has one stored", async () => {
    h.isSignedIn = true;
    h.accountData = {
      preferences: {
        learning: { activeLanguage: "gu", dailyGoal: 10, theme: "system" },
        notifications: { dailyReminderEnabled: false, dailyReminderTime: null },
      },
    };

    renderWithProvider();

    // After reconciliation the server's "gu" should win
    await waitFor(() => {
      expect(screen.getByTestId("lang")).toHaveTextContent("gu");
    });
  });

  test("restores from localStorage when a value was previously stored", () => {
    localStorage.setItem("bolo.activeLang", "gu");
    renderWithProvider();
    expect(screen.getByTestId("lang")).toHaveTextContent("gu");
  });
});
