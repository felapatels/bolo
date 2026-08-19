import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChachaEncounterDialog } from "@/components/chacha-encounter";
import { useRecordChachaEncounter, useBuyOutfit, useGetChachaLines, useGetTokens, useSynthesizeSpeech } from "@workspace/api-client-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { isChachaEncounterStation } from "@/lib/quick-games";
import { speakChachaLine, stopChachaVoice } from "@/lib/chachaVoice";
import { loadCoachVoicePref } from "@/lib/coachVoicePref";

// Mock wouter
vi.mock("wouter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("wouter")>();
  return {
    ...actual,
    useLocation: () => ["/", vi.fn()],
  };
});

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useRecordChachaEncounter: vi.fn(),
    useBuyOutfit: vi.fn(),
    useGetChachaLines: vi.fn(),
    useGetTokens: vi.fn(),
    useSynthesizeSpeech: vi.fn(),
  };
});

// Chacha's voice is observed, not played: these tests pin WHICH line speaks at
// WHICH moment. The queue's own ordering guarantee is covered separately in
// chacha-voice.test.ts.
vi.mock("@/lib/chachaVoice", () => ({
  speakChachaLine: vi.fn(),
  stopChachaVoice: vi.fn(),
  __resetChachaVoiceQueueForTests: vi.fn(),
}));

vi.mock("@/lib/coachVoicePref", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return { ...actual, loadCoachVoicePref: vi.fn(() => true) };
});

// Mock language context since we don't have clerk set up in test
vi.mock("@/lib/language-context", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useLanguage: vi.fn().mockReturnValue({ activeLang: "hi", activeLanguage: { name: "Hindi" } }),
    useNativeText: vi.fn().mockReturnValue({ style: {}, dir: "ltr", isNastaliq: false }),
  };
});

describe("Chacha-ji station placement", () => {
  it("places him at every fourth station from the third", () => {
    expect([3, 7, 11, 15, 51].every(isChachaEncounterStation)).toBe(true);
  });

  it("leaves every other station alone", () => {
    expect([1, 2, 4, 5, 6, 8, 9, 10, 12].some(isChachaEncounterStation)).toBe(false);
  });
});

describe("ChachaEncounterDialog", () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadCoachVoicePref).mockReturnValue(true);
    vi.mocked(useGetChachaLines).mockReturnValue({ data: undefined } as any);
    vi.mocked(useGetTokens).mockReturnValue({ data: 100 } as any);
    vi.mocked(useSynthesizeSpeech).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ audioBase64: "bW9jaw==", format: "mp3" })
    } as any);
    vi.mocked(useBuyOutfit).mockReturnValue({
      mutate: vi.fn(),
      isPending: false
    } as any);
  });

  it("opens at an encounter station and shows celebration only when granted", async () => {
    const mutate = vi.fn();
    vi.mocked(useRecordChachaEncounter).mockReturnValue({
      mutate,
      isPending: false,
      isSuccess: true,
      data: {
        station: 3,
        ordinal: 1,
        granted: true,
        chaiGranted: 3,
        balance: 10,
        phrase: null,
        offer: null
      }
    } as any);
    
    render(
      <ChachaEncounterDialog stationIndex={3} firstItemHref="/practice/1?group=3" open={true} onOpenChange={() => {}} />,
      { wrapper }
    );
    
    expect(mutate).toHaveBeenCalled();
    expect(screen.getAllByText("Chacha-ji's Chai Stall")[0]).toBeInTheDocument();
    expect(screen.getByText("Chacha-ji pours you a chai.")).toBeInTheDocument();
    expect(screen.getByText("+3")).toBeInTheDocument();
  });

  it("renders exact copy strings, offer hidden when no offer, and closing line when ordinal multiple of 3", () => {
    vi.mocked(useRecordChachaEncounter).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isSuccess: true,
      data: {
        station: 11,
        ordinal: 3,
        granted: false,
        chaiGranted: 3,
        balance: 10,
        phrase: null,
        offer: null
      }
    } as any);

    render(
      <ChachaEncounterDialog stationIndex={11} firstItemHref="/practice/1?group=11" open={true} onOpenChange={() => {}} />,
      { wrapper }
    );

    expect(screen.getByText("Chacha-ji pours you a chai.")).toBeInTheDocument();
    expect(screen.getByText('"Come back soon, beta."')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Thanks, Chacha-ji/i })).toBeInTheDocument();
  });

  it("shows offer when present", () => {
    vi.mocked(useRecordChachaEncounter).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isSuccess: true,
      data: {
        station: 7,
        ordinal: 2,
        granted: false,
        chaiGranted: 3,
        balance: 10,
        phrase: null,
        offer: {
          outfitId: "safari_hat",
          name: "Safari Hat",
          tagline: "For adventure",
          cost: 50,
          kind: "accessory"
        }
      }
    } as any);

    render(
      <ChachaEncounterDialog stationIndex={7} firstItemHref="/practice/1?group=7" open={true} onOpenChange={() => {}} />,
      { wrapper }
    );

    expect(screen.getByText("Safari Hat")).toBeInTheDocument();
    expect(screen.getByText("For adventure")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Buy Safari Hat/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Not today, Chacha-ji/i })).toBeInTheDocument();
  });
});

/**
 * Task #1095: Chacha-ji speaks his own three lines at the stall.
 *
 * These pin the ENCOUNTER CONTRACT, which line speaks at which moment, and
 * what stays silent. His lines are flavour dialogue: nothing here is scored,
 * recorded or graded, and the phrase card is untouched by all of it.
 */
describe("Chacha-ji's spoken lines", () => {
  const LINES = [
    { key: "greeting", text: "Aao, aao. Chai piyo.", english: "Come, come. Have some chai.", audioBase64: "R1JFRVQ=", format: "mp3" },
    { key: "gift", text: "Yeh lo. Garam hai.", english: "Here you go. It's hot.", audioBase64: "R0lGVA==", format: "mp3" },
    { key: "farewell", text: "Phir aana, beta.", english: "Come again, beta.", audioBase64: "RkFSRQ==", format: "mp3" },
  ];

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  /** Keys of the lines spoken so far, in the order they were queued. */
  const spoken = () =>
    vi.mocked(speakChachaLine).mock.calls.map(([clip]) => {
      const found = LINES.find((l) => l.audioBase64 === clip.audioBase64);
      return found?.key ?? "unknown";
    });

  const arrival = (over: Record<string, unknown> = {}) => ({
    station: 3,
    ordinal: 1,
    granted: true,
    chaiGranted: 3,
    balance: 10,
    phrase: null,
    offer: null,
    ...over,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadCoachVoicePref).mockReturnValue(true);
    vi.mocked(useGetChachaLines).mockReturnValue({ data: { lines: LINES } } as any);
    vi.mocked(useGetTokens).mockReturnValue({ data: 100 } as any);
    vi.mocked(useSynthesizeSpeech).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ audioBase64: "bW9jaw==", format: "mp3" }),
    } as any);
    vi.mocked(useBuyOutfit).mockReturnValue({ mutate: vi.fn(), isPending: false } as any);
    vi.mocked(useRecordChachaEncounter).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isSuccess: true,
      data: arrival(),
    } as any);
  });

  const renderStall = (onOpenChange = () => {}) =>
    render(
      <ChachaEncounterDialog
        stationIndex={3}
        firstItemHref="/practice/1?group=3"
        open={true}
        onOpenChange={onOpenChange}
      />,
      { wrapper },
    );

  it("greets on open, with his line and its English meaning on screen", async () => {
    // The caption is driven by the queue's onStart hook, so play it through.
    vi.mocked(speakChachaLine).mockImplementation((_clip, hooks) => {
      hooks?.onStart?.();
    });
    // A revisit, so the greeting is the only line and stays on screen.
    vi.mocked(useRecordChachaEncounter).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isSuccess: true,
      data: arrival({ granted: false }),
    } as any);
    renderStall();

    expect(spoken()).toContain("greeting");
    await waitFor(() => {
      expect(screen.getByTestId("chacha-spoken-line")).toBeInTheDocument();
    });
    expect(screen.getByText("Aao, aao. Chai piyo.")).toBeInTheDocument();
    expect(screen.getByText("Come, come. Have some chai.")).toBeInTheDocument();
  });

  it("adds the gift line after the greeting when the Chai was actually granted", () => {
    renderStall();
    // Order matters: the queue plays them in the order they were handed over,
    // and the gift must follow the greeting rather than talk over it.
    expect(spoken()).toEqual(["greeting", "gift"]);
  });

  it("skips the gift line on a revisit that granted nothing", () => {
    vi.mocked(useRecordChachaEncounter).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isSuccess: true,
      data: arrival({ granted: false, chaiGranted: 0 }),
    } as any);

    renderStall();

    expect(spoken()).toContain("greeting");
    expect(spoken()).not.toContain("gift");
  });

  const OFFER = {
    outfitId: "safari_hat",
    name: "Safari Hat",
    tagline: "For adventure",
    cost: 50,
    kind: "accessory",
  };

  it.each([
    // "Not today, Chacha-ji" only exists on an offer round; "Thanks,
    // Chacha-ji" only exists when there is nothing to sell.
    [/Thanks, Chacha-ji/i, null],
    [/Not today, Chacha-ji/i, OFFER],
  ])("does not speak the farewell when the learner leaves via %s", (name, offer) => {
    vi.mocked(useRecordChachaEncounter).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isSuccess: true,
      data: arrival({ granted: false, offer }),
    } as any);

    const onOpenChange = vi.fn();
    renderStall(onOpenChange);
    expect(spoken()).not.toContain("farewell");

    fireEvent.click(screen.getByRole("button", { name }));

    // The farewell was removed deliberately: it was queued here and
    // the route changed on the next line, so it played over the
    // lesson that followed.
    expect(spoken()).not.toContain("farewell");
    expect(stopChachaVoice).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("says each line at most once per encounter", () => {
    renderStall();
    fireEvent.click(screen.getByRole("button", { name: /Thanks, Chacha-ji/i }));
    fireEvent.click(screen.getByRole("button", { name: /Thanks, Chacha-ji/i }));

    expect(spoken()).toEqual(["greeting", "gift"]);
  });

  it("stops the voice when the dialog unmounts, not just on a close tap", () => {
    const { unmount } = renderStall();

    unmount();

    expect(stopChachaVoice).toHaveBeenCalled();
  });

  it("is completely silent, and asks for nothing, when Bolo's voice is off", () => {
    vi.mocked(loadCoachVoicePref).mockReturnValue(false);
    renderStall();

    expect(speakChachaLine).not.toHaveBeenCalled();
    // The request is suppressed too, not merely its playback.
    const opts = vi.mocked(useGetChachaLines).mock.calls[0]?.[0] as any;
    expect(opts.query.enabled).toBe(false);
    expect(screen.queryByTestId("chacha-spoken-line")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Thanks, Chacha-ji/i }));
    expect(speakChachaLine).not.toHaveBeenCalled();
  });

  it("leaves the phrase card on the unchanged coach-voice path", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ audioBase64: "bW9jaw==", format: "mp3" });
    vi.mocked(useSynthesizeSpeech).mockReturnValue({ mutateAsync } as any);
    vi.mocked(useRecordChachaEncounter).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isSuccess: true,
      data: arrival({
        phrase: { id: 1, nativeScript: "નમસ્તે", romanized: "namaste", english: "hello" },
      }),
    } as any);

    renderStall();
    fireEvent.click(screen.getByLabelText("Hear the phrase"));

    // The phrase still goes through synthesizeSpeech (coach voice), NOT
    // through Chacha's line player.
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const clips = vi.mocked(speakChachaLine).mock.calls.map(([clip]) => clip.audioBase64);
    expect(clips).not.toContain("bW9jaw==");
  });

  it("scores, records and grades nothing anywhere in the encounter", () => {
    const mutate = vi.fn();
    vi.mocked(useRecordChachaEncounter).mockReturnValue({
      mutate,
      isPending: false,
      isSuccess: true,
      data: arrival(),
    } as any);

    renderStall();
    fireEvent.click(screen.getByRole("button", { name: /Thanks, Chacha-ji/i }));

    // The ONLY write the stall makes is the arrival itself. No attempt, no
    // evaluation token, no progress call rides along with his voice.
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual({
      data: { languageCode: "hi", station: 3 },
    });
  });
});
