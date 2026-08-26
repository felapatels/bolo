import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { groupOutfits } from "@/components/outfit-card";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  mascotAssetSrc,
  CANONICAL_POSE_FILES,
  OUTFIT_POSE_FILES,
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

// The bazaar is a STREET now: the tailor's rack is the first stall, and the
// ticket counter, signal box and chai stall below it render the WALLET'S OWN
// rows. Those rows bring their own hooks, so this full-replacement mock has to
// answer for them too or the page cannot mount. They are stubbed flat and
// silent here on purpose - the rows' behaviour is pinned in
// chai-wallet.test.tsx; these tests are still only about the tailor.
vi.mock("@workspace/api-client-react", () => {
  class ApiError extends Error {
    constructor(
      public status: number,
      public data: unknown,
    ) {
      super(`api ${status}`);
    }
  }
  return {
    ApiError,
    useGetOutfits: () => mockState.outfits,
    getGetOutfitsQueryKey: () => ["/api/outfits"],
    getGetTokensQueryKey: () => ["/api/tokens"],
    getGetStreakRepairQueryKey: () => ["/api/streak-repair"],
    getGetProgressSummaryQueryKey: () => ["/api/progress/summary"],
    useBuyOutfit: () => ({
      isPending: false,
      mutate: (vars: unknown) => mockState.buyCalls.push(vars),
    }),
    useEquipOutfit: () => ({
      isPending: false,
      mutate: (vars: unknown) => mockState.equipCalls.push(vars),
    }),
    useGetTokens: () => ({ data: undefined }),
    useSpendTokens: () => ({ isPending: false, mutate: vi.fn() }),
    useBuyFirstClass: () => ({ isPending: false, mutate: vi.fn() }),
    // No break to mend, so the signal box's first row stays silent.
    useGetStreakRepair: () => ({ data: { eligible: false } }),
    useRepairStreak: () => ({ isPending: false, mutate: vi.fn() }),
  };
});

// The language signpost is a free-tier row and reads entitlements; without the
// provider the hook throws.
vi.mock("@/lib/entitlements", () => ({
  useEntitlements: () => ({ isPaid: false, isLoading: false }),
}));

// The mascot crossfades between looks, so mid-transition BOTH images are
// mounted and DOM order does not say which is which. The bird itself is
// exercised in mascot-outfit.test.tsx; here it only has to report which
// costume the shop asked it to wear.
vi.mock("@/components/mascot", () => ({
  Mascot: ({
    outfit,
    accessory,
  }: {
    outfit?: string | null;
    accessory?: string | null;
  }) => (
    <>
      <span data-testid="preview-outfit">{outfit ?? "canonical"}</span>
      <span data-testid="preview-accessory">{accessory ?? "bareheaded"}</span>
    </>
  ),
}));

import OutfitsPage from "@/pages/bazaar";

const NAVRATRI = {
  id: "navratri",
  name: "Navratri chaniya choli",
  tagline: "Nine nights of colour.",
  cost: 25,
  owned: false,
  kind: "garment",
  preview: "full",
};

// An accessory: cheaper than a garment, and framed on the head rather than
// the whole bird.
const PAGDI = {
  id: "pagdi",
  name: "Marigold pagdi",
  tagline: "Marigold silk, gold zari and one peacock feather.",
  cost: 10,
  owned: false,
  kind: "accessory",
  preview: "head",
};

function renderShop(data: {
  balance: number;
  equipped: string | null;
  /** The head slot. Omitted means bare-headed, as an older payload would be. */
  equippedAccessory?: string | null;
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

/** What is on the preview bird's head right now. */
function previewAccessory(): string {
  return screen.getByTestId("preview-accessory").textContent ?? "";
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

  test("every outfit this app ships dresses all five poses", () => {
    // The fallback below is right for an old client meeting a new server, and
    // wrong as a shipping state: a pose missing from an outfit we DO ship is
    // Bolo turning up undressed for that one pose, after the learner paid,
    // with nothing raised anywhere. Completeness is the thing to pin.
    const poses = Object.keys(CANONICAL_POSE_FILES) as Array<
      keyof typeof CANONICAL_POSE_FILES
    >;
    const ids = Object.keys(OUTFIT_POSE_FILES);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      for (const pose of poses) {
        expect(
          OUTFIT_POSE_FILES[id]?.[pose],
          `${id} is missing ${pose}`,
        ).toBe(`outfits/${id}/mascot-${pose}.png`);
      }
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

    // The booth only opens on an item: with nothing being tried on, the
    // street is the rack, not a bird standing in an empty changing room.
    expect(screen.queryByTestId("outfit-dressing-room")).toBeNull();

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

    // Backing out closes the booth again.
    fireEvent.click(screen.getByTestId("outfit-cancel-preview"));
    expect(screen.queryByTestId("outfit-dressing-room")).toBeNull();
  });

  test("buying sends the outfit id and shows the server's price", () => {
    renderShop({ balance: 40, equipped: null, outfits: [NAVRATRI] });
    fireEvent.click(screen.getByTestId("outfit-card-navratri"));

    const buy = screen.getByTestId("outfit-buy");
    expect(buy).toHaveTextContent("Buy · 25");
    fireEvent.click(buy);
    // BUYING ASKS FIRST since 2026-08-26. Chai is earned slowly, an outfit is
    // bought once, and there is no refund and no undo, so the tap that used to
    // be final now opens a confirmation.
    expect(mockState.buyCalls).toEqual([]);
    fireEvent.click(screen.getByTestId("outfit-buy-confirm-yes"));
    expect(mockState.buyCalls).toEqual([{ data: { outfitId: "navratri" } }]);
  });

  test("backing out of the confirmation spends nothing", () => {
    // The half that matters: a dialog nobody can decline is a slower tap, not
    // a safeguard.
    renderShop({ balance: 40, equipped: null, outfits: [NAVRATRI] });
    fireEvent.click(screen.getByTestId("outfit-card-navratri"));
    fireEvent.click(screen.getByTestId("outfit-buy"));
    expect(screen.getByTestId("outfit-buy-confirm")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Not yet"));
    expect(mockState.buyCalls).toEqual([]);
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

    // Tapping what he already wears opens the booth on it, and the booth
    // offers to take that slot off.
    fireEvent.click(screen.getByTestId("outfit-card-navratri"));
    expect(previewOutfit()).toBe("navratri");
    fireEvent.click(screen.getByTestId("outfit-unequip"));
    expect(mockState.equipCalls).toEqual([
      { data: { outfitId: null, slot: "garment" } },
    ]);
  });
});

// ── Two slots ──────────────────────────────────────────────────────────────
//
// A hat and an outfit are worn at the same time (owner ruling, Aug 8 2026),
// which is only true if every path keeps the slots apart: previewing one must
// not strip the other, and taking one off must name which one.

describe("a hat and an outfit are worn together", () => {
  test("both slots ride the bird at once", () => {
    renderShop({
      balance: 40,
      equipped: "navratri",
      equippedAccessory: "pagdi",
      outfits: [
        { ...NAVRATRI, owned: true },
        { ...PAGDI, owned: true },
      ],
    });

    // The booth opens on whichever item is tapped, and it shows him as he
    // actually is: both slots at once.
    fireEvent.click(screen.getByTestId("outfit-card-navratri"));
    expect(previewOutfit()).toBe("navratri");
    expect(previewAccessory()).toBe("pagdi");
  });

  test("trying a hat on leaves the outfit where it is", () => {
    renderShop({
      balance: 40,
      equipped: "navratri",
      outfits: [{ ...NAVRATRI, owned: true }, PAGDI],
    });

    fireEvent.click(screen.getByTestId("outfit-card-pagdi"));
    expect(previewAccessory()).toBe("pagdi");
    // The garment is untouched: this is the whole point of the second slot.
    expect(previewOutfit()).toBe("navratri");
  });

  test("taking the hat off says which slot, so the outfit stays on", () => {
    renderShop({
      balance: 40,
      equipped: "navratri",
      equippedAccessory: "pagdi",
      outfits: [
        { ...NAVRATRI, owned: true },
        { ...PAGDI, owned: true },
      ],
    });

    fireEvent.click(screen.getByTestId("outfit-takeoff-pagdi"));
    expect(mockState.equipCalls).toEqual([
      { data: { outfitId: null, slot: "accessory" } },
    ]);
  });

  test("wearing from the rack names the slot it lands in", () => {
    renderShop({
      balance: 40,
      equipped: null,
      outfits: [{ ...NAVRATRI, owned: true }, { ...PAGDI, owned: true }],
    });

    fireEvent.click(screen.getByTestId("outfit-wear-pagdi"));
    fireEvent.click(screen.getByTestId("outfit-wear-navratri"));
    expect(mockState.equipCalls).toEqual([
      { data: { outfitId: "pagdi", slot: "accessory" } },
      { data: { outfitId: "navratri", slot: "garment" } },
    ]);
  });

  test("with nothing being tried on, the shop offers to strip both slots", () => {
    renderShop({
      balance: 40,
      equipped: null,
      equippedAccessory: "pagdi",
      outfits: [NAVRATRI, { ...PAGDI, owned: true }],
    });

    // The booth only exists while something is being tried on, so with
    // nothing tapped there is no strip button on the page at all.
    expect(screen.queryByTestId("outfit-dressing-room")).toBeNull();
    expect(screen.queryByTestId("outfit-unequip")).toBeNull();

    // Nothing in the garment slot, but a hat is on: tapping the hat opens the
    // booth on it, and taking it off names the head slot so a garment worn
    // alongside it would survive.
    fireEvent.click(screen.getByTestId("outfit-card-pagdi"));
    fireEvent.click(screen.getByTestId("outfit-unequip"));
    expect(mockState.equipCalls).toEqual([
      { data: { outfitId: null, slot: "accessory" } },
    ]);
  });
});

// ── The rack, as it grows ──────────────────────────────────────────────────

describe("the rack shows stock as pictures, grouped by what it is", () => {
  test("every card previews the item on Bolo, from the item's own art", () => {
    renderShop({ balance: 40, equipped: null, outfits: [NAVRATRI, PAGDI] });

    // The thumbnail is the item worn, not a separate illustration that could
    // drift from what the learner actually gets.
    const garment = screen
      .getByTestId("outfit-card-navratri")
      .querySelector("img");
    const accessory = screen
      .getByTestId("outfit-card-pagdi")
      .querySelector("img");
    expect(garment?.getAttribute("src")).toContain("outfits/navratri/");
    expect(accessory?.getAttribute("src")).toContain("outfits/pagdi/");

    // An accessory is framed on the head; a garment shows the whole bird.
    // Without the crop a pagdi is a few unreadable pixels.
    expect(accessory?.style.transform).toContain("scale(2.3)");
    expect(garment?.style.transform).toBe("scale(1.04)");
  });

  test("garments and accessories are separate sections", () => {
    renderShop({ balance: 40, equipped: null, outfits: [NAVRATRI, PAGDI] });

    const garments = screen.getByTestId("outfit-section-garment");
    const accessories = screen.getByTestId("outfit-section-accessory");
    expect(within(garments).getByTestId("outfit-card-navratri")).toBeTruthy();
    expect(within(accessories).getByTestId("outfit-card-pagdi")).toBeTruthy();
    // The row is the try-on now, so the only button it carries is the till.
    expect(within(accessories).queryByTestId("outfit-tryon-pagdi")).toBeNull();
    expect(within(accessories).getByTestId("outfit-buynow-pagdi")).toBeTruthy();
  });

  test("each card sells at its own price, not one flat shop price", () => {
    renderShop({ balance: 40, equipped: null, outfits: [NAVRATRI, PAGDI] });

    expect(screen.getByTestId("outfit-buynow-pagdi")).toHaveTextContent(
      "Buy · 10",
    );
    expect(screen.getByTestId("outfit-buynow-navratri")).toHaveTextContent(
      "Buy · 25",
    );

    fireEvent.click(screen.getByTestId("outfit-buynow-pagdi"));
    // The grid asks too: it can start a purchase for an outfit that is not the
    // previewed one, which is why the confirmation holds an id rather than a
    // boolean.
    fireEvent.click(screen.getByTestId("outfit-buy-confirm-yes"));
    expect(mockState.buyCalls).toEqual([{ data: { outfitId: "pagdi" } }]);
    // Buying previews what was just bought, so the curtain opens on it — a
    // hat lands on the head slot, which is why the garment slot is untouched.
    expect(previewAccessory()).toBe("pagdi");
  });

  test("stock whose kind this client does not know is still shoppable", () => {
    // A newer server, an older app: an unrecognised kind must not fall
    // through the floor and vanish from the rack.
    const grouped = groupOutfits([
      NAVRATRI,
      PAGDI,
      { ...NAVRATRI, id: "mystery", kind: "hovercraft" },
    ]);
    const ids = grouped.flatMap((s) => s.items.map((i) => i.id));
    expect(ids).toContain("mystery");
    // Empty sections do not print a heading over nothing.
    expect(groupOutfits([PAGDI]).map((s) => s.kind)).toEqual(["accessory"]);
  });
});
