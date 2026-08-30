import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

// THE SWITCHER'S SEARCH AND RECENT ROW (2026-08-30, owner: "Language switcher
// on web should have the same search and recent functionality as mobile").
// Pins mobile's contract (app/(app)/language.tsx):
// (1) the subtitle says what the screen does, unconditionally;
// (2) the search matches the English name, the native name and the code,
//     folding case and diacritics, and says so when nothing matches;
// (3) Recent shows the languages last switched to, never the active one,
//     hides while searching, and a chip switches like a tile;
// (4) a pick, tile or chip, is recorded at the front of the recent list.
const h = vi.hoisted(() => ({
  languages: [
    { code: "hi", name: "Hindi", nativeName: "हिन्दी", rtl: false, fontFamily: "Noto Sans Devanagari", speechCapability: "supported", communityReviewed: true },
    { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી", rtl: false, fontFamily: "Noto Sans Gujarati", speechCapability: "supported", communityReviewed: false },
    { code: "ks", name: "Kashmiri", nativeName: "کٲشُر", rtl: true, fontFamily: "Noto Nastaliq Urdu", speechCapability: "degraded", communityReviewed: false },
    { code: "mni", name: "Meitei", nativeName: "ꯃꯤꯇꯩꯂꯣꯟ", rtl: false, fontFamily: "Noto Sans Meetei Mayek", speechCapability: "unsupported", communityReviewed: false },
  ],
  updatePrefs: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/", h.navigate],
}));
vi.mock("@clerk/react", () => ({
  useUser: () => ({ isSignedIn: true }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    getQueryData: vi.fn(() => undefined),
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn(),
  }),
}));
vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  useListLanguages: () => ({ data: h.languages, isLoading: false }),
  useGetEntitlements: () => ({ data: undefined }),
  getGetEntitlementsQueryKey: () => ["entitlements"],
  useGetProgressSummary: vi.fn(() => ({ data: undefined, isLoading: false })),
  getGetProgressSummaryQueryKey: vi.fn(() => ["progress-summary"]),
  useGetAccount: () => ({ data: undefined, isLoading: false }),
  getGetAccountQueryKey: () => ["account"],
  useUpdateAccountPreferences: () => ({ mutate: h.updatePrefs, isPending: false }),
}));

import { LanguageProvider } from "@/lib/language-context";
import { LanguagePicker } from "@/components/language-picker";
import { RECENT_LANGUAGES_KEY, foldForSearch, loadRecentLanguages, recordRecentLanguage } from "@/lib/recent-languages";

function renderPicker() {
  return render(
    <LanguageProvider>
      <LanguagePicker open onOpenChange={() => {}} />
    </LanguageProvider>,
  );
}

const search = () => screen.getByTestId("language-search") as HTMLInputElement;
// Scoped to the dialog: the picker's own trigger prints the active language's
// name outside it, so an unscoped query for "Hindi" finds two.
const dialog = () => within(screen.getByRole("dialog"));

beforeEach(() => {
  localStorage.clear();
  h.updatePrefs.mockClear();
});

describe("the switcher's search", () => {
  test("the subtitle says what the screen does", () => {
    renderPicker();
    expect(screen.getByTestId("picker-subtitle")).toHaveTextContent(
      "Tap a language to switch. Each one keeps its own progress.",
    );
  });

  test("filters by the English name, folding case", () => {
    renderPicker();
    fireEvent.change(search(), { target: { value: "GUJ" } });
    expect(dialog().getByText("Gujarati")).toBeInTheDocument();
    expect(dialog().queryByText("Hindi")).toBeNull();
    expect(dialog().queryByText("Kashmiri")).toBeNull();
  });

  test("filters by the native name and by the code", () => {
    renderPicker();
    fireEvent.change(search(), { target: { value: "کٲش" } });
    expect(dialog().getByText("Kashmiri")).toBeInTheDocument();
    expect(dialog().queryByText("Hindi")).toBeNull();
    fireEvent.change(search(), { target: { value: "mni" } });
    expect(dialog().getByText("Meitei")).toBeInTheDocument();
    expect(dialog().queryByText("Kashmiri")).toBeNull();
  });

  test("folds diacritics, so a plain spelling finds an accented one", () => {
    expect(foldForSearch("Gujarātī")).toBe("gujarati");
    expect(foldForSearch("GUJARATI")).toBe("gujarati");
  });

  test("says so when nothing matches, and the clear button empties the box", () => {
    renderPicker();
    fireEvent.change(search(), { target: { value: "klingon" } });
    expect(screen.getByTestId("language-no-match")).toHaveTextContent('No language matches "klingon".');
    fireEvent.click(screen.getByLabelText("Clear search"));
    expect(search().value).toBe("");
    expect(dialog().getByText("Hindi")).toBeInTheDocument();
  });
});

describe("the switcher's Recent row", () => {
  test("shows the languages last switched to, never the active one, and hides while searching", () => {
    // Hindi is the provider's default active language here.
    localStorage.setItem(RECENT_LANGUAGES_KEY, JSON.stringify(["ks", "hi", "gu"]));
    renderPicker();
    const row = screen.getByTestId("language-recent");
    expect(within(row).getByTestId("language-recent-ks")).toBeInTheDocument();
    expect(within(row).getByTestId("language-recent-gu")).toBeInTheDocument();
    expect(within(row).queryByTestId("language-recent-hi")).toBeNull();
    fireEvent.change(search(), { target: { value: "g" } });
    expect(screen.queryByTestId("language-recent")).toBeNull();
  });

  test("with nothing switched to yet there is no row", () => {
    renderPicker();
    expect(screen.queryByTestId("language-recent")).toBeNull();
  });

  test("a chip switches like a tile, and the pick goes to the front of the list", () => {
    localStorage.setItem(RECENT_LANGUAGES_KEY, JSON.stringify(["ks", "gu"]));
    renderPicker();
    fireEvent.click(screen.getByTestId("language-recent-gu"));
    expect(h.updatePrefs).toHaveBeenCalledWith(
      { data: { activeLanguage: "gu", hasChosenLanguage: true } },
      expect.anything(),
    );
    expect(loadRecentLanguages()).toEqual(["gu", "ks"]);
  });

  test("a tile pick is recorded too, and the store keeps four at most", () => {
    renderPicker();
    fireEvent.click(dialog().getByText("Gujarati"));
    expect(loadRecentLanguages()).toEqual(["gu"]);
    for (const code of ["a", "b", "c", "d"]) recordRecentLanguage(code);
    expect(loadRecentLanguages()).toEqual(["d", "c", "b", "a"]);
    localStorage.setItem(RECENT_LANGUAGES_KEY, "not json");
    expect(loadRecentLanguages()).toEqual([]);
  });
});
