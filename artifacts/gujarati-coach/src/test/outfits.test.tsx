import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  mascotAssetSrc,
  CANONICAL_POSE_FILES,
  MASCOT_BASE,
} from "@/lib/mascot-outfits";

// ---------------------------------------------------------------------------
// Bolo's outfits, web side.
//
// Outfits are a Chai sink: bought once, owned forever, worn on every mascot
// surface. What is pinned here:
//   1. Art resolution is pose + outfit in ONE place, and an outfit that does
//      not ship a pose falls back to canonical Bolo rather than blanking him.
//   2. The shop previews a costume on the learner's OWN Bolo (not a thumbnail
//      grid), and backing out restores what they actually wear.
//   3. Buying, wearing and taking off send the server the exact payloads, and
//      an empty tin never shows a buy button.
// The mascot's own outfit plumbing is pinned in mascot-outfit.test.tsx; the
// mobile twin lives in artifacts/bolo-mobile/__tests__/outfits.test.tsx.
// ---------------------------------------------------------------------------

const mockState: {
  outfits: any;
  buyCalls: unknown[];
  equipCalls: unknown[];
} = { outfits: null, buyCalls: [], equipCalls: [] };

vi.mock("@workspace/api-client-react", () => ({
  useGetOutfits: () => mockState.outfits,
  getGetOutfitsQueryKey: () => ["/api/outfits"],
  getGetTokensQueryKey: () => ["/api/tokens"],
  useBuyOutfit: () => ({
    isPending: false,
    mutate: (vars: unknown) => mockState.buyCalls.push(vars),
  }),
  useEquipOutfit: () => ({
    isPending: false,
    mutate: (vars: unknown) => mockState.equipCalls.push(vars),
  }),
  useGetTokens: () => ({ data: undefined }),
}));

// The mascot crossfades between looks, so mid-transition BOTH images are
// mounted and DOM order does not say which is which. The bird itself is
// exercised in mascot-outfit.test.tsx; here it only has to report which
// costume the shop asked it to wear.
vi.mock("@/components/mascot", () => ({
  Mascot: ({ outfit }: { outfit?: string | null }) => (
    <span data-testid="preview-outfit">{outfit ?? "canonical"}</span>
  ),
}));

import OutfitsPage from "@/pages/outfits";

const NAVRATRI = {
  id: "navratri",
  name: "Navratri chaniya choli",
  tagline: "Nine nights of colour.",
  cost: 25,
  owned: false,
};

function renderShop(data: {
  balance: number;
  equipped: string | null;
  outfits: (typeof NAVRATRI)[];
}) {
  mockState.outfits = { data };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <OutfitsPage />
    </QueryClientProvider>,
  );
}

/** What the preview bird is wearing right now. */
function previewOutfit(): string {
  return screen.getByTestId("preview-outfit").textContent ?? "";
}

beforeEach(() => {
  mockState.buyCalls = [];
  mockState.equipCalls = [];
});

// ── Art resolution ─────────────────────────────────────────────────────────

describe("pose art resolves from the equipped outfit", () => {
  test("no outfit is canonical Bolo", () => {
    expect(mascotAssetSrc("wave", null)).toBe(
      MASCOT_BASE + CANONICAL_POSE_FILES.wave,
    );
    expect(mascotAssetSrc("cheer", undefined)).toBe(
      MASCOT_BASE + CANONICAL_POSE_FILES.cheer,
    );
  });

  test("an equipped outfit dresses every pose", () => {
    for (const pose of Object.keys(CANONICAL_POSE_FILES) as Array<
      keyof typeof CANONICAL_POSE_FILES
    >) {
      const src = mascotAssetSrc(pose, "navratri");
      expect(src).toContain("outfits/navratri/");
      expect(src).not.toBe(MASCOT_BASE + CANONICAL_POSE_FILES[pose]);
    }
  });

  test("a pose the outfit does not ship falls back instead of blanking him", () => {
    // A deliberately incomplete outfit: it dresses the wave and nothing else.
    const partial = { halfdressed: { wave: "outfits/halfdressed/wave.png" } };
    expect(mascotAssetSrc("wave", "halfdressed", partial)).toBe(
      MASCOT_BASE + "outfits/halfdressed/wave.png",
    );
    expect(mascotAssetSrc("cheer", "halfdressed", partial)).toBe(
      MASCOT_BASE + CANONICAL_POSE_FILES.cheer,
    );
    // An outfit nobody ships art for is canonical, not broken.
    expect(mascotAssetSrc("cheer", "__unknown", partial)).toBe(
      MASCOT_BASE + CANONICAL_POSE_FILES.cheer,
    );
  });
});

// ── The shop ───────────────────────────────────────────────────────────────

describe("the wardrobe previews before it charges", () => {
  test("it opens on the learner's own Bolo and previews a costume on tap", () => {
    renderShop({ balance: 40, equipped: null, outfits: [NAVRATRI] });

    // Undressed to begin with — the preview is his real look, not a sample.
    expect(previewOutfit()).toBe("canonical");

    fireEvent.click(screen.getByTestId("outfit-card-navratri"));
    expect(previewOutfit()).toBe("navratri");
    // The preview names what he is trying on (the rack names it too, hence
    // the scoped query).
    expect(screen.getByTestId("outfit-preview")).toHaveTextContent(
      "Navratri chaniya choli",
    );

    // Nothing was spent by looking.
    expect(mockState.buyCalls).toEqual([]);
    expect(mockState.equipCalls).toEqual([]);

    // Backing out returns him to what he actually wears.
    fireEvent.click(screen.getByTestId("outfit-cancel-preview"));
    expect(previewOutfit()).toBe("canonical");
  });

  test("buying sends the outfit id and shows the server's price", () => {
    renderShop({ balance: 40, equipped: null, outfits: [NAVRATRI] });
    fireEvent.click(screen.getByTestId("outfit-card-navratri"));

    const buy = screen.getByTestId("outfit-buy");
    expect(buy).toHaveTextContent("Buy · 25");
    fireEvent.click(buy);
    expect(mockState.buyCalls).toEqual([{ data: { outfitId: "navratri" } }]);
  });

  test("an empty tin shows what is missing instead of a buy button", () => {
    renderShop({ balance: 13, equipped: null, outfits: [NAVRATRI] });
    fireEvent.click(screen.getByTestId("outfit-card-navratri"));

    expect(screen.queryByTestId("outfit-buy")).toBeNull();
    expect(screen.getByTestId("outfit-short")).toHaveTextContent(
      "12 more Chai",
    );
  });

  test("an owned outfit is worn, not bought again", () => {
    renderShop({
      balance: 5,
      equipped: null,
      outfits: [{ ...NAVRATRI, owned: true }],
    });
    fireEvent.click(screen.getByTestId("outfit-card-navratri"));

    // Owning it means the price is gone even though the tin is nearly empty.
    expect(screen.queryByTestId("outfit-buy")).toBeNull();
    expect(screen.queryByTestId("outfit-short")).toBeNull();
    fireEvent.click(screen.getByTestId("outfit-wear"));
    expect(mockState.equipCalls).toEqual([{ data: { outfitId: "navratri" } }]);
  });

  test("what he is wearing can be taken off", () => {
    renderShop({
      balance: 5,
      equipped: "navratri",
      outfits: [{ ...NAVRATRI, owned: true }],
    });

    // The shop opens showing him dressed, because that is how he looks.
    expect(previewOutfit()).toBe("navratri");
    fireEvent.click(screen.getByTestId("outfit-unequip"));
    expect(mockState.equipCalls).toEqual([{ data: { outfitId: null } }]);
  });
});
