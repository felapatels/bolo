import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// Build 37: the wallet sheet's own contract. The wallet had no web test — the
// mobile port (bolo-mobile/__tests__/chai-wallet.test.tsx) carried them all —
// so these pin the three things this build changed on the web side:
//   1. The sheet opens on the stall header, with the balance struck across it.
//   2. Bolo Bazaar is reached by a real button (not a worded link), and the
//      row copy does not call Bolo a boy.
//   3. The "unlock a language with Chai" row is FREE-TIER ONLY, and explains
//      itself in a dialog rather than navigating anywhere.
const h = vi.hoisted(() => ({
  tokens: undefined as unknown,
  isPaid: false,
  spend: vi.fn(),
}));

vi.mock("@/lib/entitlements", () => ({
  useEntitlements: () => ({ isPaid: h.isPaid, isLoading: false }),
}));

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
    getGetTokensQueryKey: () => ["tokens"],
    useGetTokens: () => h.tokens,
    useSpendTokens: () => ({ mutate: h.spend, isPending: false }),
  };
});

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import { ChaiWalletSheet } from "@/components/chai-wallet";

function renderWallet(path = "/") {
  const { hook } = memoryLocation({ path, record: true });
  const result = render(
    <Router hook={hook}>
      <ChaiWalletSheet open onOpenChange={vi.fn()} />
    </Router>,
  );
  return result;
}

beforeEach(() => {
  h.isPaid = false;
  h.spend = vi.fn();
  h.tokens = {
    data: {
      balance: 12,
      stationPausesEquipped: 1,
      expressMultiplierActiveUntil: null,
    },
    isLoading: false,
  };
});

describe("Chai wallet sheet", () => {
  test("opens on the stall header with the balance struck across it", () => {
    renderWallet();

    const header = screen.getByTestId("wallet-header");
    const art = header.querySelector("img");
    expect(art).not.toBeNull();
    expect(art?.getAttribute("src")).toContain("stall/wallet-header");
    // Painted scene, not content: it must not be announced.
    expect(art?.getAttribute("alt")).toBe("");

    // The balance sits on the art, inside that same header.
    const band = screen.getByTestId("wallet-balance-band");
    expect(header.contains(band)).toBe(true);
    expect(band).toHaveTextContent("12");
    // The title survives on the art (Radix needs it for the sheet's name).
    expect(screen.getByText("Chai Wallet")).toBeInTheDocument();
  });

  test("reaches the bazaar through a real button, and Bolo is not a boy", async () => {
    const user = userEvent.setup();
    renderWallet();

    const browse = screen.getByTestId("wallet-open-wardrobe");
    expect(browse.tagName).toBe("BUTTON");
    expect(browse).toHaveTextContent("Browse");
    expect(
      screen.getByText("Outfits for Bolo. Buy once, hers for good."),
    ).toBeInTheDocument();

    await user.click(browse);
    // Navigation is the button's job now; the row itself is not a link.
    expect(browse.closest("a")).toBeNull();
  });

  test("offers the language row to free learners and explains it in place", async () => {
    const user = userEvent.setup();
    renderWallet();

    expect(screen.getByTestId("wallet-language-row")).toBeInTheDocument();
    expect(screen.queryByTestId("wallet-language-info-dialog")).toBeNull();

    await user.click(screen.getByTestId("wallet-language-info"));
    expect(
      screen.getByText(
        /You can use Chai to unlock additional non-Hindi stops\./,
      ),
    ).toBeInTheDocument();
  });

  test("hides the language row once a plan is paid for", () => {
    h.isPaid = true;
    renderWallet();

    expect(screen.queryByTestId("wallet-language-row")).toBeNull();
    // The spend rows are unaffected by tier.
    expect(screen.getByTestId("wallet-equip-pause")).toBeInTheDocument();
    expect(screen.getByTestId("wallet-start-express")).toBeInTheDocument();
  });
});
