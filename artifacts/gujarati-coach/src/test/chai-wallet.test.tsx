import type { ReactNode } from "react";
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
  repairOffer: undefined as unknown,
  repair: vi.fn(),
  repairHandlers: undefined as
    | {
        onError?: (e: unknown) => void;
        onSuccess?: (r: unknown) => void;
        onSettled?: () => void;
      }
    | undefined,
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
    getGetStreakRepairQueryKey: () => ["streak-repair"],
    getGetProgressSummaryQueryKey: () => ["/api/progress/summary"],
    useGetTokens: () => h.tokens,
    useSpendTokens: () => ({ mutate: h.spend, isPending: false }),
    useBuyFirstClass: () => ({ mutate: vi.fn(), isPending: false }),
    useGetStreakRepair: () => h.repairOffer,
    useRepairStreak: (opts?: {
      mutation?: {
        onError?: (e: unknown) => void;
        onSuccess?: (r: unknown) => void;
        onSettled?: () => void;
      };
    }) => {
      h.repairHandlers = opts?.mutation;
      return { mutate: h.repair, isPending: false };
    },
  };
});

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import {
  ChaiWalletSheet,
  ExpressMultiplierRow,
  LanguageSignpostRow,
  StationPauseRow,
  StreakRepairRow,
} from "@/components/chai-wallet";

function renderWallet(path = "/") {
  const { hook } = memoryLocation({ path, record: true });
  const result = render(
    <Router hook={hook}>
      <ChaiWalletSheet open onOpenChange={vi.fn()} />
    </Router>,
  );
  return result;
}

// The sheet stopped selling. Every spend row it used to carry is stocked on
// the bazaar street instead, so the rows are exercised here on their own,
// exactly as pages/bazaar.tsx mounts them.
function renderRows(node: ReactNode, path = "/") {
  const { hook } = memoryLocation({ path, record: true });
  return render(<Router hook={hook}>{node}</Router>);
}

beforeEach(() => {
  h.isPaid = false;
  h.spend = vi.fn();
  h.repair = vi.fn();
  h.repairHandlers = undefined;
  // Default: no break to mend, so the row is absent from every other test.
  h.repairOffer = {
    data: {
      eligible: false,
      missedDay: null,
      restoresStreakDays: 0,
      cost: 25,
      balance: 12,
    },
    isLoading: false,
  };
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
      screen.getByText("Outfits, passes and everything else Chai buys."),
    ).toBeInTheDocument();

    await user.click(browse);
    // Navigation is the button's job now; the row itself is not a link.
    expect(browse.closest("a")).toBeNull();
  });

  test("offers the language row to free learners and explains it in place", async () => {
    const user = userEvent.setup();
    renderRows(<LanguageSignpostRow />);

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
    renderRows(
      <>
        <LanguageSignpostRow />
        <StationPauseRow />
        <ExpressMultiplierRow />
      </>,
    );

    expect(screen.queryByTestId("wallet-language-row")).toBeNull();
    // The spend rows are unaffected by tier.
    expect(screen.getByTestId("wallet-equip-pause")).toBeInTheDocument();
    expect(screen.getByTestId("wallet-start-express")).toBeInTheDocument();
  });

  // The sheet is a balance and a door. Everything it used to sell is stocked
  // on the bazaar street, and selling the same thing on two surfaces is how
  // the two drift apart, so the strip is pinned rather than left to habit.
  test("sells nothing itself: no spend rows in the sheet", () => {
    renderWallet();

    expect(screen.getByTestId("wallet-balance-band")).toBeInTheDocument();
    expect(screen.getByTestId("wallet-open-wardrobe")).toBeInTheDocument();
    expect(screen.queryByTestId("wallet-equip-pause")).toBeNull();
    expect(screen.queryByTestId("wallet-start-express")).toBeNull();
    expect(screen.queryByTestId("wallet-first-class-row")).toBeNull();
    expect(screen.queryByTestId("wallet-language-row")).toBeNull();
  });
});

// Streak repair. The row is a conditional offer, not a permanent shelf item:
// on a day nothing is broken there must be nothing to see, because a greyed
// "mend your streak" button on an unbroken streak is a small daily reproach.
describe("streak repair row", () => {
  const eligible = {
    data: {
      eligible: true,
      missedDay: "2026-08-04", // a Tuesday
      restoresStreakDays: 9,
      cost: 25,
      balance: 40,
    },
    isLoading: false,
  };

  test("shows nothing at all when there is no break to mend", () => {
    renderRows(<StreakRepairRow />);
    expect(screen.queryByTestId("wallet-streak-repair")).toBeNull();
    expect(screen.queryByText("Mend the line")).toBeNull();
  });

  test("names the day, the streak it restores, and the server's price", () => {
    h.repairOffer = eligible;
    renderRows(<StreakRepairRow />);

    const row = screen.getByTestId("wallet-streak-repair");
    expect(row).toHaveTextContent("Mend the line");
    // Warm, never shaming: the day is named, the learner is not blamed.
    expect(row).toHaveTextContent(
      "Tuesday got away from you. Cover it and your 9-day streak rides on.",
    );
    // Price comes from the payload, never from a client constant.
    expect(screen.getByTestId("wallet-repair-streak")).toHaveTextContent(
      "Mend · 25",
    );
  });

  test("mends with an empty request — the client never names the day", async () => {
    h.repairOffer = eligible;
    const user = userEvent.setup();
    renderRows(<StreakRepairRow />);

    await user.click(screen.getByTestId("wallet-repair-streak"));
    expect(h.repair).toHaveBeenCalledTimes(1);
    // No arguments: the server picks the day it is willing to sell.
    expect(h.repair.mock.calls[0]).toHaveLength(0);
  });
});
