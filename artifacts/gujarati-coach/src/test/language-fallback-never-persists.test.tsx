import { test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// A FALLBACK LANGUAGE IS NEVER PERSISTED (web twin of the mobile test).
//
// Owner report 2026-09-17: "my language keeps getting set back to assamese".
// /languages sorts by sortOrder and Assamese is sortOrder 0, so languages[0]
// is Assamese. The validity guard used to store languages[0] in localStorage,
// where it then looked like a real choice: the next load seeded it to an
// account that had no language, and in the same commit as a reconcile it
// overwrote the server value the reconcile had just adopted.
//
// Rule: a fallback may apply locally for display; only an explicit choice (or
// this browser's own earlier choice, seeding an empty account) is written.

const h = vi.hoisted(() => ({
  accountData: undefined as unknown,
  languages: [
    { code: "as", name: "Assamese", nativeName: "অসমীয়া", rtl: false, fontFamily: "Noto Sans Bengali" },
    { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી", rtl: false, fontFamily: "Noto Sans Gujarati" },
    { code: "hi", name: "Hindi", nativeName: "हिन्दी", rtl: false, fontFamily: "Noto Sans Devanagari" },
  ],
  updatePrefs: vi.fn(),
}));

vi.mock("@clerk/react", () => ({
  useUser: () => ({ isSignedIn: true }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    getQueryData: vi.fn(),
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  useListLanguages: () => ({ data: h.languages, isLoading: false }),
  useGetAccount: () => ({ data: h.accountData }),
  getGetAccountQueryKey: () => ["account"],
  useUpdateAccountPreferences: () => ({ mutate: h.updatePrefs }),
}));

import { LanguageProvider, useLanguage } from "@/lib/language-context";

function LangDisplay() {
  const { activeLang } = useLanguage();
  return <div data-testid="lang">{activeLang}</div>;
}

function renderProvider() {
  return render(
    <LanguageProvider>
      <LangDisplay />
    </LanguageProvider>,
  );
}

function account(activeLanguage: string | null) {
  return {
    preferences: {
      learning: { activeLanguage, dailyGoal: 10, theme: "system", timezone: "Asia/Kolkata" },
      notifications: { dailyReminderEnabled: false, dailyReminderTime: null },
    },
  };
}

function activeLanguageWrites(): unknown[] {
  return h.updatePrefs.mock.calls
    .map((call) => (call[0] as { data?: Record<string, unknown> })?.data)
    .filter((data) => data && "activeLanguage" in data)
    .map((data) => data!.activeLanguage);
}

const settle = () => new Promise((r) => setTimeout(r, 50));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  h.accountData = undefined;
});

test("a stored code missing from the list keeps the account's language, not languages[0]", async () => {
  localStorage.setItem("bolo.activeLang", "xx");
  h.accountData = account("gu");

  renderProvider();

  await settle();
  expect(screen.getByTestId("lang")).toHaveTextContent("gu");
  expect(localStorage.getItem("bolo.activeLang")).toBe("gu");
  expect(activeLanguageWrites()).toEqual([]);
});

test("the display fallback is never stored, so it can never be seeded later", async () => {
  localStorage.setItem("bolo.activeLang", "xx");

  renderProvider();

  await settle();
  expect(screen.getByTestId("lang")).toHaveTextContent("hi");
  expect(localStorage.getItem("bolo.activeLang")).not.toBe("as");
  expect(localStorage.getItem("bolo.activeLang")).not.toBe("hi");
});

test("an empty account is not seeded from a fallback or a default", async () => {
  localStorage.setItem("bolo.activeLang", "xx");
  h.accountData = account(null);

  renderProvider();

  await settle();
  expect(activeLanguageWrites()).toEqual([]);
});

test("an empty account is still seeded from this browser's own earlier choice", async () => {
  localStorage.setItem("bolo.activeLang", "gu");
  h.accountData = account(null);

  renderProvider();

  await waitFor(() => expect(activeLanguageWrites()).toEqual(["gu"]));
});
