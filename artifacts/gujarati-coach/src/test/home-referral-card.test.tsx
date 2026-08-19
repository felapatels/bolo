import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  REFERRAL_REWARD_CHAI,
  buildReferralLink,
} from "@workspace/referral-link";

// Task #1049, the compact referral card at the bottom of home.
//
// It is deliberately NOT the settings card: no raw code, no URL text, no
// Joined / Pending / Chai earned row, no Copy link button. One button, which
// opens the share sheet with the learner's link. Those omissions are the whole
// point of the card, so they are pinned as hard as the copy is.

const h = vi.hoisted(() => ({
  referral: undefined as unknown,
}));

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  useGetReferral: () => h.referral,
}));

import { HomeReferralCard } from "@/components/home-referral-card";

const READY = {
  data: { code: "K7XM2P", pendingCount: 2, activatedCount: 3, chaiEarned: 75 },
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
};

beforeEach(() => {
  h.referral = READY;
  vi.unstubAllGlobals();
});

describe("home referral card", () => {
  test("renders the approved copy with the reward from the shared constant", () => {
    render(<HomeReferralCard />);

    expect(screen.getByText("Invite a friend, earn Chai")).toBeInTheDocument();
    expect(
      screen.getByTestId("home-referral-card"),
    ).toHaveTextContent(
      `You both get ${REFERRAL_REWARD_CHAI} Chai when they finish their first practice.`,
    );
    expect(
      screen.getByRole("button", { name: "Share invite" }),
    ).toBeInTheDocument();
  });

  test("the button opens the share sheet carrying the referral link", async () => {
    const share = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, share });

    render(<HomeReferralCard />);
    // fireEvent, not userEvent: userEvent.setup() installs its own
    // navigator.clipboard stub, which would displace the one under test here
    // and in the no-share-sheet case below.
    fireEvent.click(screen.getByTestId("home-referral-share"));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share.mock.calls[0][0]).toMatchObject({
      url: `${window.location.origin}/join/K7XM2P`,
    });
  });

  test("with no share sheet at all, the link still lands on the clipboard", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, share: undefined, clipboard: { writeText } });

    render(<HomeReferralCard />);
    fireEvent.click(screen.getByTestId("home-referral-share"));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/join/K7XM2P`,
      ),
    );
    // Quietly: home never grows the settings card's "Copied!" affordance.
    expect(screen.queryByText("Copied!")).toBeNull();
  });

  test("never shows the code, the URL text, or the stat row", () => {
    render(<HomeReferralCard />);
    const card = screen.getByTestId("home-referral-card");

    expect(card).not.toHaveTextContent("K7XM2P");
    expect(card).not.toHaveTextContent("/join/");
    for (const label of ["Joined", "Pending", "Chai earned", "Copy link"]) {
      expect(card).not.toHaveTextContent(label);
    }
    expect(screen.queryByTestId("referral-code")).toBeNull();
    expect(screen.queryByTestId("referral-copy")).toBeNull();
    expect(screen.queryByTestId("referral-stat-joined")).toBeNull();
  });

  test("renders nothing while the referral query is loading or failed", () => {
    h.referral = { data: undefined, isLoading: true, isError: false };
    const loading = render(<HomeReferralCard />);
    expect(screen.queryByTestId("home-referral-card")).toBeNull();
    loading.unmount();

    h.referral = { data: undefined, isLoading: false, isError: true };
    render(<HomeReferralCard />);
    expect(screen.queryByTestId("home-referral-card")).toBeNull();
  });
});

describe("referral link module", () => {
  test("web builds its link through the one shared builder", async () => {
    const { referralLink } = await import("@/lib/referral-code");

    expect(referralLink("k7xm2p")).toBe(
      buildReferralLink(
        window.location.origin,
        "k7xm2p",
        import.meta.env.BASE_URL || "/",
      ),
    );
    // The same call mobile makes with https://<EXPO_PUBLIC_DOMAIN>, pinned on
    // the mobile side in __tests__/home-referral-card.test.tsx.
    expect(buildReferralLink("https://bolo.example.com", "k7xm2p")).toBe(
      "https://bolo.example.com/join/K7XM2P",
    );
  });
});
