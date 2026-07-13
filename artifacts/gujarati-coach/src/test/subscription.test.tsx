import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { SubscriptionDetails } from "@workspace/api-client-react";

// The subscription-management page reads GET /account/subscription and drives the
// cancel / pause / retention endpoints. These tests mock the generated hooks so
// we assert the UI reflects each subscription state and wires each retention
// action to the matching endpoint.

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
  sub: undefined as unknown,
  cancel: vi.fn(),
  pause: vi.fn(),
  retention: vi.fn(),
  invalidateQueries: vi.fn(),
  beginAllAccessCheckout: vi.fn(),
  cancelPlus: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: h.invalidateQueries }),
}));

vi.mock("@/lib/entitlements", () => ({
  useEntitlements: () => ({ isLoading: false }),
}));

vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({
    languages: [
      { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" },
      { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
    ],
  }),
}));

vi.mock("@/lib/billing", () => ({
  beginAllAccessCheckout: (...args: unknown[]) => h.beginAllAccessCheckout(...args),
  cancelPlus: (...args: unknown[]) => h.cancelPlus(...args),
}));

vi.mock("@workspace/api-client-react", () => ({
  ApiError,
  useGetAccountSubscription: () => h.sub,
  useCancelAccountSubscription: () => ({ mutateAsync: h.cancel }),
  usePauseAccountSubscription: () => ({ mutateAsync: h.pause }),
  useAcceptRetentionOffer: () => ({ mutateAsync: h.retention }),
}));

import Subscription from "@/pages/subscription";

const PLUS_ACTIVE: SubscriptionDetails = {
  tier: "plus",
  status: "active",
  chosenLanguage: null,
  trialEndsAt: null,
  currentPeriodEnd: "2099-01-01T00:00:00.000Z",
  pauseUntil: null,
  cancelAtPeriodEnd: false,
  retentionOfferAcceptedAt: null,
  provider: "revenuecat",
  paymentMethod: { store: "app_store", managementUrl: "https://apps.apple.com/manage" },
  billingHistory: [
    {
      productId: "plus_annual",
      store: "app_store",
      purchasedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z",
      periodType: "normal",
      status: "active",
    },
  ],
};

function renderPage(path = "/account/subscription") {
  const { hook } = memoryLocation({ path });
  return render(
    <Router hook={hook}>
      <Subscription />
    </Router>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.sub = { data: PLUS_ACTIVE, isLoading: false, isError: false };
  h.cancel = vi.fn().mockResolvedValue({ ...PLUS_ACTIVE, status: "canceled" });
  h.pause = vi.fn().mockResolvedValue({ ...PLUS_ACTIVE, status: "paused" });
  h.retention = vi.fn().mockResolvedValue({
    ...PLUS_ACTIVE,
    retentionOfferAcceptedAt: "2026-07-13T00:00:00.000Z",
  });
});

describe("Subscription management", () => {
  test("shows a loading state until the snapshot arrives", () => {
    h.sub = { data: undefined, isLoading: true, isError: false };
    renderPage();
    expect(screen.queryByText("Billing history")).not.toBeInTheDocument();
  });

  test("renders plan, payment method and billing history for an active plan", () => {
    renderPage();
    expect(screen.getByText("All-Access")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Apple App Store")).toBeInTheDocument();
    expect(screen.getByText("Billing history")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Manage payment & billing/i }),
    ).toHaveAttribute("href", "https://apps.apple.com/manage");
  });

  test("opening cancel reveals the retention options", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /Cancel subscription/i }));

    expect(await screen.findByText(/\$7\.99 for 3 months/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Claim discount/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pause instead/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancel anyway/i })).toBeInTheDocument();
  });

  test("claiming the discount calls the retention endpoint and refetches", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /Cancel subscription/i }));
    await user.click(await screen.findByRole("button", { name: /Claim discount/i }));

    await waitFor(() => expect(h.retention).toHaveBeenCalled());
    expect(h.invalidateQueries).toHaveBeenCalled();
  });

  test("pausing sends a 3-month window and refetches", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /Cancel subscription/i }));
    await user.click(await screen.findByRole("button", { name: /Pause instead/i }));

    await waitFor(() =>
      expect(h.pause).toHaveBeenCalledWith({ data: { months: 3 } }),
    );
    expect(h.invalidateQueries).toHaveBeenCalled();
  });

  test("cancelling anyway calls the cancel endpoint and refetches", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /Cancel subscription/i }));
    await user.click(await screen.findByRole("button", { name: /Cancel anyway/i }));

    await waitFor(() => expect(h.cancel).toHaveBeenCalled());
    expect(h.invalidateQueries).toHaveBeenCalled();
  });

  test("hides the discount once the retention offer was already redeemed", async () => {
    h.sub = {
      data: {
        ...PLUS_ACTIVE,
        retentionOfferAcceptedAt: "2026-06-01T00:00:00.000Z",
      },
      isLoading: false,
      isError: false,
    };
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /Cancel subscription/i }));

    expect(
      screen.queryByRole("button", { name: /Claim discount/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pause instead/i })).toBeInTheDocument();
  });

  test("a one-language subscriber sees their language and an upgrade path", () => {
    h.sub = {
      data: {
        ...PLUS_ACTIVE,
        tier: "one_language",
        chosenLanguage: "gu",
        paymentMethod: null,
        billingHistory: [],
      },
      isLoading: false,
      isError: false,
    };
    renderPage();
    expect(screen.getByText("One Language")).toBeInTheDocument();
    expect(screen.getByText("Gujarati")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Upgrade to All-Access/i }),
    ).toBeInTheDocument();
    // No provider portal link when the payment method isn't exposed.
    expect(
      screen.queryByRole("link", { name: /Manage payment & billing/i }),
    ).not.toBeInTheDocument();
  });

  test("a paused subscription reads as paused and can still be canceled", () => {
    h.sub = {
      data: {
        ...PLUS_ACTIVE,
        tier: "free",
        status: "paused",
        pauseUntil: "2099-02-01T00:00:00.000Z",
      },
      isLoading: false,
      isError: false,
    };
    renderPage();
    expect(screen.getByText("Subscription paused")).toBeInTheDocument();
    expect(screen.getByText("Paused")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Cancel subscription/i }),
    ).toBeInTheDocument();
  });

  test("a plain Free learner is redirected to the upgrade surface", () => {
    h.sub = {
      data: {
        ...PLUS_ACTIVE,
        tier: "free",
        status: "expired",
        paymentMethod: null,
        billingHistory: [],
      },
      isLoading: false,
      isError: false,
    };
    const { hook } = memoryLocation({ path: "/account/subscription" });
    render(
      <Router hook={hook}>
        <Subscription />
      </Router>,
    );
    // Nothing manageable — the management surface never renders.
    expect(screen.queryByText("Billing history")).not.toBeInTheDocument();
    expect(screen.queryByText("Subscription paused")).not.toBeInTheDocument();
  });

  test("a Stripe subscriber cancels through the Stripe portal, not the local endpoint", async () => {
    h.sub = {
      data: { ...PLUS_ACTIVE, provider: "stripe", paymentMethod: null },
      isLoading: false,
      isError: false,
    };
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: /Cancel subscription/i }));

    // Cancellation must be provider-authoritative — Stripe's portal, never the
    // DB-only /account/subscription/cancel endpoint (which would leave Stripe
    // charging).
    await waitFor(() => expect(h.cancelPlus).toHaveBeenCalled());
    expect(h.cancel).not.toHaveBeenCalled();
    // No in-app retention flow for Stripe subscribers.
    expect(screen.queryByText(/Before you go/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Claim discount/i }),
    ).not.toBeInTheDocument();
  });

  test("a Stripe subscriber's manage-billing button opens the Stripe portal", async () => {
    h.sub = {
      data: { ...PLUS_ACTIVE, provider: "stripe", paymentMethod: null },
      isLoading: false,
      isError: false,
    };
    const user = userEvent.setup();
    renderPage();

    // Even without a provider-supplied managementUrl, Stripe subscribers always
    // get a working portal entry point.
    await user.click(
      screen.getByRole("button", { name: /Manage payment & billing/i }),
    );
    await waitFor(() => expect(h.cancelPlus).toHaveBeenCalled());
  });
});
