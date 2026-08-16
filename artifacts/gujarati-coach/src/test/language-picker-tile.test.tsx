/**
 * Visual coverage for a single language-picker tile.
 *
 * Web had none, which is why the rail accent shipped on mobile in chat 13 and
 * never landed here: nothing on this platform asserted a tile's colours or
 * classes, so its absence stayed green. This closes that gap.
 *
 * The harness is lifted from entitlements-gating.test.tsx deliberately — same
 * hoisted state, same module mocks, same fixture list — so the two files agree
 * on what a Free learner's picker looks like instead of drifting apart.
 *
 * Class assertions only: jsdom computes no layout, so the rail's WIDTH and the
 * clipping behaviour cannot be verified here, only the classes that ask for
 * them.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";
import { FREE_ENTITLEMENTS } from "./fixtures";
import { getJourneyLine } from "@/lib/journeyLines";

// Mutable state the module mocks read from, so each test can set the exact
// server snapshot / data it needs before rendering.
const h = vi.hoisted(() => ({
  entitlements: undefined as unknown,
  languages: [] as Array<{ code: string; name: string; nativeName: string }>,
  activeLang: "gu",
  setActiveLang: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@clerk/react", () => ({
  useUser: () => ({ isSignedIn: true, user: { firstName: "Test" } }),
  useClerk: () => ({ signOut: h.signOut }),
}));

vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({
    languages: h.languages,
    activeLang: h.activeLang,
    activeLanguage: h.languages.find((l) => l.code === h.activeLang),
    setActiveLang: h.setActiveLang,
    isLoading: false,
  }),
  useNativeText: () => ({ style: {}, dir: "ltr" as const, isNastaliq: false }),
  nativeTextProps: () => ({ style: {}, dir: "ltr" as const }),
}));

// The language picker persists explicit picks (B1): it pulls the preferences
// mutation + query client, which this suite never asserts on — stub them.
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  }),
}));

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  useGetEntitlements: () => ({ data: h.entitlements, isLoading: false }),
  getGetEntitlementsQueryKey: () => ["entitlements"],
  useUpdateAccountPreferences: () => ({ mutate: vi.fn(), isPending: false }),
  getGetAccountQueryKey: () => ["account"],
  useGetAccount: () => ({ data: undefined }),
}));

// Imported after the mocks are declared.
import { LanguagePicker } from "@/components/language-picker";

function renderWithRouter(ui: ReactElement, path = "/app") {
  const { hook, history } = memoryLocation({ path, record: true });
  const utils = render(<Router hook={hook}>{ui}</Router>);
  return { ...utils, history };
}

/**
 * The rendered tile button for a language, by its English name. Scoped to the
 * dialog: the picker's own trigger also renders the ACTIVE language's name, so
 * an unscoped query matches twice for whichever language is selected.
 */
function tileFor(name: string) {
  return within(screen.getByRole("dialog")).getByText(name).closest("button")!;
}

beforeEach(() => {
  // Free: Gujarati is allowed (and active), Hindi is locked.
  h.entitlements = FREE_ENTITLEMENTS;
  h.languages = [
    { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" },
    { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
  ];
  h.activeLang = "gu";
  h.setActiveLang.mockClear();
});

describe("language picker tile", () => {
  test("every tile wears its own line accent, locked ones included", () => {
    renderWithRouter(<LanguagePicker open onOpenChange={() => {}} />);

    const guRail = screen.getByTestId("lang-rail-gu");
    const hiRail = screen.getByTestId("lang-rail-hi");

    // The accent comes from the real journeyLines table, not a copy of it: a
    // divergence between the picker and the journey map should fail here.
    expect(guRail).toHaveStyle({
      backgroundColor: getJourneyLine("gu").accent,
    });
    expect(hiRail).toHaveStyle({
      backgroundColor: getJourneyLine("hi").accent,
    });

    // Two languages, two DISTINCT colours — one shared accent would satisfy
    // the assertions above while defeating the whole point.
    expect(getJourneyLine("gu").accent).not.toBe(getJourneyLine("hi").accent);
  });

  test("a locked tile keeps its rail at full strength", () => {
    renderWithRouter(<LanguagePicker open onOpenChange={() => {}} />);

    // Hindi is locked under FREE_ENTITLEMENTS; the stripe is the invitation
    // to preview, so it is never dimmed along with the rest of the tile.
    const hindi = tileFor("Hindi");
    expect(within(hindi).getByTestId("picker-locked-hi")).toBeInTheDocument();

    const hiRail = within(hindi).getByTestId("lang-rail-hi");
    expect(hiRail).toHaveStyle({
      backgroundColor: getJourneyLine("hi").accent,
    });
    // Same treatment as the unlocked tile's stripe: full accent, same classes.
    const guRail = within(tileFor("Gujarati")).getByTestId("lang-rail-gu");
    expect(hiRail.className).toBe(guRail.className);
  });

  test("the tile clips, so the rail cannot overhang its rounded corner", () => {
    renderWithRouter(<LanguagePicker open onOpenChange={() => {}} />);

    for (const name of ["Gujarati", "Hindi"]) {
      expect(tileFor(name).className).toContain("overflow-hidden");
    }
  });

  test("only the locked tile is muted", () => {
    renderWithRouter(<LanguagePicker open onOpenChange={() => {}} />);

    const hindi = tileFor("Hindi");
    expect(hindi.className).toContain("bg-muted/40");
    expect(
      within(hindi).getByText("हिन्दी").className,
    ).toContain("text-muted-foreground");

    const gujarati = tileFor("Gujarati");
    expect(gujarati.className).not.toContain("bg-muted/40");
    expect(
      within(gujarati).getByText("ગુજરાતી").className,
    ).not.toContain("text-muted-foreground");
  });
});
