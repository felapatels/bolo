import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import {
  buildPackOffers,
  __seedPricingForTests,
  type PricingCatalog,
} from "@/lib/pricing";
import {
  ChaiPackShop,
  ChaiPurchaseReturn,
  CHAI_PACKS_LIVE,
  PACK_COPY,
} from "@/components/chai-packs";
import { PRICING_CATALOG } from "./fixtures";

// Chai packs ship DARK: the shop surface is behind CHAI_PACKS_LIVE while the
// plumbing under it (pricing, checkout call, the server's webhook credit) is
// live. These tests pin both halves of that, flag off shows nothing AND the
// machinery still works, so flipping the flag is a display change rather than
// the first run of untried code.

const beginChaiPackCheckout = vi.hoisted(() => vi.fn());
vi.mock("@/lib/billing", () => ({ beginChaiPackCheckout }));

// A catalog the server has priced all three packs in. Amounts are Stripe's;
// the Chai counts are the server catalog's.
const CATALOG_WITH_PACKS: PricingCatalog = {
  ...PRICING_CATALOG,
  packs: {
    small: { amountCents: 199, currency: "usd", chai: 25 },
    medium: { amountCents: 499, currency: "usd", chai: 75 },
    large: { amountCents: 999, currency: "usd", chai: 200 },
  },
};

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  beginChaiPackCheckout.mockReset();
  beginChaiPackCheckout.mockResolvedValue(undefined);
  __seedPricingForTests(CATALOG_WITH_PACKS);
});

afterEach(() => {
  // The suite-wide default (setup.ts) seeds the pack-less catalog; restore it
  // so no other file inherits packs from here.
  __seedPricingForTests(PRICING_CATALOG);
  window.history.replaceState({}, "", "/");
});

describe("the flag", () => {
  test("ships LIT, so the shop is on by default", () => {
    // INVERTED on 2026-08-18. Was false: the packs shipped dark through review
    // while the paths behind them were exercised. The owner lit them for the
    // next submission build. The both-states coverage below is unchanged, so
    // the dark path is still tested via the `live` prop.
    expect(CHAI_PACKS_LIVE).toBe(true);
  });

  test("renders nothing at all while it is off", () => {
    renderWithClient(<ChaiPackShop live={false} />);

    expect(screen.queryByTestId("chai-pack-shop")).toBeNull();
    expect(screen.queryByText(PACK_COPY.title)).toBeNull();
  });

  test("the plumbing under the flag is unaffected by it", () => {
    // What the shop would render is derived by a pure function on the server
    // catalog, and it is correct whether or not the surface is shown.
    expect(buildPackOffers(CATALOG_WITH_PACKS)).toEqual([
      { id: "small", chai: 25, price: "$1.99" },
      { id: "medium", chai: 75, price: "$4.99" },
      { id: "large", chai: 200, price: "$9.99" },
    ]);
  });
});

describe("the shop, with the flag on", () => {
  test("shows the three packs at the server's prices", () => {
    renderWithClient(<ChaiPackShop live />);

    expect(screen.getByTestId("chai-pack-shop")).toBeInTheDocument();
    for (const [id, chai, price] of [
      ["small", "25", "$1.99"],
      ["medium", "75", "$4.99"],
      ["large", "200", "$9.99"],
    ] as const) {
      const card = screen.getByTestId(`chai-pack-${id}`);
      expect(card).toHaveTextContent(chai);
      expect(card).toHaveTextContent(price);
    }
  });

  test("renders nothing when the server priced no packs", () => {
    // Never invent an amount client-side: an unpriced shop is no shop.
    __seedPricingForTests(PRICING_CATALOG);

    renderWithClient(<ChaiPackShop live />);

    expect(screen.queryByTestId("chai-pack-shop")).toBeNull();
  });

  test("starts checkout for the pack that was tapped", async () => {
    const user = userEvent.setup();
    renderWithClient(<ChaiPackShop live />);

    await user.click(screen.getByTestId("chai-pack-medium"));

    // The client names a pack id and nothing else, no price, no Chai amount.
    expect(beginChaiPackCheckout).toHaveBeenCalledWith("medium");
    expect(beginChaiPackCheckout).toHaveBeenCalledTimes(1);
  });

  test("says nothing was charged when checkout cannot start", async () => {
    beginChaiPackCheckout.mockRejectedValue(new Error("stripe down"));
    const user = userEvent.setup();
    renderWithClient(<ChaiPackShop live />);

    await user.click(screen.getByTestId("chai-pack-small"));

    const error = await screen.findByTestId("chai-pack-error");
    expect(error).toHaveTextContent(PACK_COPY.failed);
    // ...and the packs are tappable again, not stuck pending.
    expect(screen.getByTestId("chai-pack-small")).toBeEnabled();
  });
});

describe("coming back from Stripe", () => {
  test("acknowledges a purchase without claiming the Chai has landed", async () => {
    // The webhook credits, not this redirect, so the copy promises a moment.
    window.history.replaceState({}, "", "/?chai=success");

    renderWithClient(<ChaiPurchaseReturn />);

    expect(await screen.findByTestId("chai-purchase-return")).toHaveTextContent(
      PACK_COPY.success,
    );
    // The param is dropped so a refresh does not replay the banner.
    await waitFor(() => expect(window.location.search).toBe(""));
  });

  test("says nothing was charged on a cancel", async () => {
    window.history.replaceState({}, "", "/?chai=cancel");

    renderWithClient(<ChaiPurchaseReturn />);

    expect(await screen.findByTestId("chai-purchase-return")).toHaveTextContent(
      PACK_COPY.canceled,
    );
  });

  test("is absent on a normal visit", () => {
    renderWithClient(<ChaiPurchaseReturn />);

    expect(screen.queryByTestId("chai-purchase-return")).toBeNull();
  });

  test("keeps other query params when it drops its own", async () => {
    window.history.replaceState({}, "", "/?tour=1&chai=success");

    renderWithClient(<ChaiPurchaseReturn />);

    await waitFor(() => expect(window.location.search).toBe("?tour=1"));
  });
});
