import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
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
  isPlus: false as boolean,
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: h.toast }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: h.invalidateQueries,
    clear: h.clear,
    setQueryData: vi.fn(),
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
  useEntitlements: () => ({ isLanguageAllowed: () => true, isPlus: h.isPlus }),
}));

vi.mock("@/lib/theme-context", () => ({
  useTheme: () => ({ theme: "system", setTheme: h.setTheme }),
}));

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  ApiError,
  getGetAccountQueryKey: () => ["account"],
  useGetAccount: () => h.account,
    useGetProgressSummary: vi.fn(() => ({ data: undefined, isLoading: false })),
    getGetProgressSummaryQueryKey: vi.fn(() => ['progress-summary']),
  useUpdateAccountProfile: () => h.updateProfile,
  useUpdateAccountPreferences: () => h.updatePrefs,
  useDeleteAccount: () => h.deleteAccount,
}));

import Account, { _clearVoiceSampleCache, VoiceCard } from "@/pages/account";

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
  h.isPlus = false;
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

  // The voice picker section is deliberately unmounted in account.tsx
  // ({false && …}) while the TTS provider is being evaluated. Until it is
  // re-enabled, the page must render NO trace of it for any tier.
  test("voice picker stays hidden for non-Plus learners while voice selection is disabled", () => {
    renderAccount(<Account />);
    expect(screen.queryByText(/Voice selection is a/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Auto \(recommended\)/i }),
    ).not.toBeInTheDocument();
  });

  test("voice picker stays hidden for Plus learners while voice selection is disabled", () => {
    h.isPlus = true;
    renderAccount(<Account />);
    expect(screen.queryByText(/Voice selection is a/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Auto \(recommended\)/i }),
    ).not.toBeInTheDocument();
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

// ---------------------------------------------------------------------------
// Voice preview button, cache-key isolation
// ---------------------------------------------------------------------------
// The VoiceCard preview button fetches audio keyed by the selected voice ID.
// Switching voices must never re-use a cached clip synthesised for a different
// voice; each voice ID must produce an independent cache slot and its own
// TTS request.

// NOTE: the picker section is currently unmounted in the Account page
// ({false && …} while the TTS provider is evaluated), so these tests render
// VoiceCard directly, the component still ships and its cache behaviour
// must hold when the picker is re-enabled.
describe("Voice preview button", () => {
  // George and Brian are the first two entries in VOICE_CATALOG (same order
  // as they appear in account.tsx) so previewButtons[0] → George, [1] → Brian.
  const GEORGE_ID = "JBFqnCBsd6RMkjVDRZzb";
  const BRIAN_ID  = "nPczCjzI2devNBz1zQrb";

  function renderVoiceCards() {
    return render(
      <>
        <VoiceCard
          id={GEORGE_ID}
          name="George"
          gender="male"
          description="Warm British male."
          active={false}
          locked={false}
          onSelect={() => {}}
        />
        <VoiceCard
          id={BRIAN_ID}
          name="Brian"
          gender="male"
          description="Deep American male."
          active={false}
          locked={false}
          onSelect={() => {}}
        />
      </>,
    );
  }

  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let playSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Wipe the module-level sample cache so every test starts cold.
    _clearVoiceSampleCache();
    h.isPlus = true;

    // Patch the prototype so jsdom's HTMLAudioElement.play() doesn't fire a
    // "not implemented" unhandled rejection, and so we can assert call count.
    playSpy = vi
      .spyOn(HTMLAudioElement.prototype, "play")
      .mockResolvedValue(undefined);

    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ audioBase64: "dGVzdA==", format: "mp3" }),
    } as Response);
  });

  afterEach(() => {
    playSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  test("preview button sends the selected voice ID in the TTS request body", async () => {
    const user = userEvent.setup();
    renderVoiceCards();

    const previewButtons = screen.getAllByLabelText("Play voice sample");

    // Click George's preview → expect a fetch with George's voice ID.
    await user.click(previewButtons[0]);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const georgeBody = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    ) as { previewVoiceId?: string };
    expect(georgeBody.previewVoiceId).toBe(GEORGE_ID);

    // Click Brian's preview → expect a fresh fetch with Brian's voice ID,
    // NOT a cache hit from George's earlier request.
    fetchSpy.mockClear();
    await user.click(previewButtons[1]);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const brianBody = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    ) as { previewVoiceId?: string };
    expect(brianBody.previewVoiceId).toBe(BRIAN_ID);
  });

  test("switching voices always fetches fresh audio, the old voice's cache slot is not reused", async () => {
    const user = userEvent.setup();
    renderVoiceCards();

    const previewButtons = screen.getAllByLabelText("Play voice sample");

    // Prime George's cache entry.
    await user.click(previewButtons[0]);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    // Switch to Brian, his slot is cold, so a new request is required.
    fetchSpy.mockClear();
    await user.click(previewButtons[1]);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    // Brian's request must carry Brian's voice ID, not a hit from George's slot.
    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    ) as { previewVoiceId?: string };
    expect(body.previewVoiceId).toBe(BRIAN_ID);
  });

  test("card recovers to idle state when the TTS endpoint returns a non-200 response", async () => {
    // Stub fetch to simulate a 502 from the audio server.
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.resolve({}),
    } as Response);

    const user = userEvent.setup();
    renderVoiceCards();

    const previewButtons = screen.getAllByLabelText("Play voice sample");

    // Click George's preview button, the fetch will fail with a 502.
    await user.click(previewButtons[0]);

    // The card must return to idle ("Play voice sample" label, button enabled)
    // rather than staying stuck in the loading/playing state.
    await waitFor(() =>
      expect(screen.getAllByLabelText("Play voice sample").length).toBeGreaterThan(0),
    );
    // Confirm the button for George's card is not disabled (i.e. not stuck loading).
    expect(previewButtons[0]).not.toBeDisabled();
    // Audio playback must not have been attempted.
    expect(playSpy).not.toHaveBeenCalled();
  });

  test("re-playing the same voice is served from the in-memory cache, no duplicate TTS fetch", async () => {
    const user = userEvent.setup();
    renderVoiceCards();

    const previewButtons = screen.getAllByLabelText("Play voice sample");

    // First play, fetches from the network and caches the result.
    await user.click(previewButtons[0]);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(
      JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string),
    ).toMatchObject({ previewVoiceId: GEORGE_ID });

    // Toggle off then re-play the same voice.
    await user.click(previewButtons[0]); // stop
    fetchSpy.mockClear();
    await user.click(previewButtons[0]); // re-play
    // Cache hit: play is called again but fetch must NOT be called.
    await waitFor(() => expect(playSpy).toHaveBeenCalledTimes(2));
    expect(fetchSpy).toHaveBeenCalledTimes(0);
  });
});
