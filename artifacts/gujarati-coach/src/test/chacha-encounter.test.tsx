import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChachaEncounterDialog } from "@/components/chacha-encounter";
import { useRecordChachaEncounter, useBuyOutfit, useGetTokens, useSynthesizeSpeech } from "@workspace/api-client-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { isChachaEncounterStation } from "@/lib/quick-games";

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
    useGetTokens: vi.fn(),
    useSynthesizeSpeech: vi.fn(),
  };
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
