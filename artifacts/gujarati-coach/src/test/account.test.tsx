import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";
import type { Account } from "@workspace/api-client-react";

// Stand-in for the ApiError the real client throws; account.tsx narrows on
// `err instanceof ApiError`.
const { ApiError } = vi.hoisted(() => {
  class ApiError extends Error {
    status: number;
    data: unknown;
    constructor(status: number, data: unknown) {
      super("ApiError");
      this.name = "ApiError";
      this.status = status;
      this.data = data;
    }
  }
  return { ApiError };
});

const h = vi.hoisted(() => ({
  account: undefined as unknown,
  updateProfile: vi.fn(),
  updatePrefs: vi.fn(),
  deleteAccount: vi.fn(),
  invalidateQueries: vi.fn(),
  clear: vi.fn(),
  toast: vi.fn(),
  signOut: vi.fn(),
  openUserProfile: vi.fn(),
  setActiveLang: vi.fn(),
  setTheme: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: h.toast }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: h.invalidateQueries,
    clear: h.clear,
  }),
}));

vi.mock("@clerk/react", () => ({
  useUser: () => ({
    user: { primaryEmailAddress: { emailAddress: "learner@example.com" } },
  }),
  useClerk: () => ({ signOut: h.signOut, openUserProfile: h.openUserProfile }),
}));

vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({
    languages: [
      { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી", rtl: false, fontFamily: "Noto Sans Gujarati" },
      { code: "hi", name: "Hindi", nativeName: "हिन्दी", rtl: false, fontFamily: "Noto Sans Devanagari" },
    ],
    activeLang: "gu",
    activeLanguage: { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી", rtl: false, fontFamily: "Noto Sans Gujarati" },
    setActiveLang: h.setActiveLang,
  }),
  nativeTextProps: () => ({ style: {}, dir: "ltr" as const }),
}));

vi.mock("@/lib/entitlements", () => ({
  useEntitlements: () => ({ isLanguageAllowed: () => true }),
}));

vi.mock("@/lib/theme-context", () => ({
  useTheme: () => ({ theme: "system", setTheme: h.setTheme }),
}));

vi.mock("@workspace/api-client-react", () => ({
  ApiError,
  getGetAccountQueryKey: () => ["account"],
  useGetAccount: () => h.account,
  useUpdateAccountProfile: () => h.updateProfile,
  useUpdateAccountPreferences: () => h.updatePrefs,
  useDeleteAccount: () => h.deleteAccount,
}));

import Account from "@/pages/account";

const ACCOUNT: Account = {
  profile: {
    id: "user_1",
    email: "learner@example.com",
    displayName: "Asha Patel",
    avatarUrl: null,
  },
  preferences: {
    notifications: { dailyReminderEnabled: false, dailyReminderTime: null },
    learning: { activeLanguage: "gu", dailyGoal: 10, theme: "system" },
  },
  subscription: {
    tier: "free",
    status: "free",
    chosenLanguage: null,
    trialEndsAt: null,
    currentPeriodEnd: null,
    pauseUntil: null,
    cancelAtPeriodEnd: false,
    retentionOfferAcceptedAt: null,
  },
};

function renderAccount(ui: ReactElement, path = "/account") {
  const { hook } = memoryLocation({ path });
  return render(<Router hook={hook}>{ui}</Router>);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.account = { data: ACCOUNT, isLoading: false };
  h.updateProfile = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
  h.updatePrefs = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
  h.deleteAccount = { mutateAsync: vi.fn().mockResolvedValue({ deleted: true }), isPending: false };
});

describe("Account settings", () => {
  test("shows a loading state until the account arrives", () => {
    h.account = { data: undefined, isLoading: true };
    renderAccount(<Account />);
    expect(screen.queryByText("Profile")).not.toBeInTheDocument();
  });

  test("renders every settings section seeded from the account", () => {
    renderAccount(<Account />);
    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getByText("Sign-in & security")).toBeInTheDocument();
    expect(screen.getByText("Notifications")).toBeInTheDocument();
    expect(screen.getByText("Learning")).toBeInTheDocument();
    expect(screen.getByText("Delete account")).toBeInTheDocument();

    expect(screen.getByLabelText("Display name")).toHaveValue("Asha Patel");
    expect(screen.getAllByText("learner@example.com").length).toBeGreaterThan(0);
  });

  test("saves the profile and invalidates the account query", async () => {
    const user = userEvent.setup();
    renderAccount(<Account />);

    const nameField = screen.getByLabelText("Display name");
    await user.clear(nameField);
    await user.type(nameField, "Asha R. Patel");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() =>
      expect(h.updateProfile.mutateAsync).toHaveBeenCalledWith({
        data: { displayName: "Asha R. Patel", avatarUrl: null },
      }),
    );
    expect(h.invalidateQueries).toHaveBeenCalled();
  });

  test("opens Clerk's flow to manage email & password", async () => {
    const user = userEvent.setup();
    renderAccount(<Account />);
    await user.click(screen.getByText("Manage email & password"));
    expect(h.openUserProfile).toHaveBeenCalled();
  });

  test("toggling the daily reminder persists with a default time", async () => {
    const user = userEvent.setup();
    renderAccount(<Account />);
    await user.click(screen.getByRole("switch", { name: "Daily reminder" }));
    await waitFor(() =>
      expect(h.updatePrefs.mutateAsync).toHaveBeenCalledWith({
        data: { dailyReminderEnabled: true, dailyReminderTime: "18:00" },
      }),
    );
  });

  test("picking a theme applies it immediately and persists it", async () => {
    const user = userEvent.setup();
    renderAccount(<Account />);
    await user.click(screen.getByRole("button", { name: /Dark/ }));
    expect(h.setTheme).toHaveBeenCalledWith("dark");
    await waitFor(() =>
      expect(h.updatePrefs.mutateAsync).toHaveBeenCalledWith({
        data: { theme: "dark" },
      }),
    );
  });

  test("deleting the account calls the endpoint then signs out", async () => {
    const user = userEvent.setup();
    renderAccount(<Account />);
    await user.click(screen.getByRole("button", { name: /Delete my account/ }));
    await user.click(screen.getByRole("button", { name: "Delete forever" }));

    await waitFor(() => expect(h.deleteAccount.mutateAsync).toHaveBeenCalled());
    await waitFor(() => expect(h.signOut).toHaveBeenCalled());
  });
});
