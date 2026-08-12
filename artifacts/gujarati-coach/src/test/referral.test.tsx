import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { Router, Route } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";
import { ApiError } from "@workspace/api-client-react";

// Referral R2, web slice. Covers the shareable surface, the link, the code
// surviving the signup round trip, and all three of R1's refusals.

const h = vi.hoisted(() => ({
  isSignedIn: false as boolean,
  isLoaded: true as boolean,
  referral: undefined as unknown,
  redeem: vi.fn(async (_args: unknown) => ({ redeemed: true })),
}));

vi.mock("@clerk/react", () => ({
  useUser: () => ({ isSignedIn: h.isSignedIn, isLoaded: h.isLoaded }),
  // The real <Show> renders its children only for the matching auth state.
  Show: ({ when, children }: { when: string; children: React.ReactNode }) => {
    const signedIn = when === "signed-in";
    return signedIn === h.isSignedIn ? <>{children}</> : null;
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  useGetReferral: () => h.referral,
  useRedeemReferral: () => ({ mutateAsync: h.redeem }),
}));

// The bird pulls the outfit context and image assets in; neither is what this
// file is about.
vi.mock("@/components/mascot", () => ({
  Mascot: () => <div data-testid="mascot" />,
}));

import Join from "@/pages/join";
import { ReferralCard } from "@/components/referral-card";
import { ReferralRedemptionProvider } from "@/components/referral-redeemer";
import { referralLink } from "@/lib/referral-code";
import { safeAuthRedirect } from "@/lib/auth-redirect";

const STORAGE_KEY = "bolo.referralCode";

function renderAt(path: string, ui: ReactElement) {
  const { hook } = memoryLocation({ path, static: true });
  return render(
    <Router hook={hook}>
      <ReferralRedemptionProvider>{ui}</ReferralRedemptionProvider>
    </Router>,
  );
}

function renderJoinAt(path: string) {
  return renderAt(path, <Route path="/join/:code" component={Join} />);
}

beforeEach(() => {
  h.isSignedIn = false;
  h.isLoaded = true;
  h.referral = undefined;
  h.redeem = vi.fn(async () => ({ redeemed: true }));
  // Never localStorage.clear() here: setup.ts pins suite-wide preference
  // defaults in its own beforeEach and clearing would wipe them.
  localStorage.removeItem(STORAGE_KEY);
});

describe("referral surface", () => {
  test("shows the learner's code, their counts, and the Chai they earned", () => {
    h.referral = {
      data: {
        code: "K7XM2P",
        pendingCount: 2,
        activatedCount: 3,
        chaiEarned: 75,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };

    render(<ReferralCard />);

    expect(screen.getByTestId("referral-code")).toHaveTextContent("K7XM2P");
    expect(screen.getByTestId("referral-stat-joined")).toHaveTextContent("3");
    expect(screen.getByTestId("referral-stat-pending")).toHaveTextContent("2");
    expect(screen.getByTestId("referral-stat-chai-earned")).toHaveTextContent(
      "75",
    );
  });

  // Task #1049 lifted the share text and the navigator.share call out of this
  // card into lib/referral-share so the new home card shares through the same
  // path. The card is meant to be BYTE-for-byte unchanged in behaviour, so its
  // two buttons are pinned here: Copy link still copies and still flips to
  // "Copied!", Share still opens the sheet with the link, and Share with no
  // share sheet at all still falls back to the copy affordance.
  test("Copy link and Share still behave exactly as before the share refactor", async () => {
    h.referral = {
      data: {
        code: "K7XM2P",
        pendingCount: 0,
        activatedCount: 0,
        chaiEarned: 0,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    const writeText = vi.fn(async () => undefined);
    const share = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, share, clipboard: { writeText } });

    render(<ReferralCard />);
    const link = `${window.location.origin}/join/K7XM2P`;

    // fireEvent, not userEvent: userEvent.setup() installs its own
    // navigator.clipboard stub, which would displace the one under test.
    fireEvent.click(screen.getByTestId("referral-copy"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(link));
    await waitFor(() => {
      expect(screen.getByTestId("referral-copy")).toHaveTextContent("Copied!");
    });

    fireEvent.click(screen.getByTestId("referral-share"));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share.mock.calls[0][0]).toMatchObject({ url: link });

    // No share sheet: Share falls back to the copy affordance, as it always has.
    writeText.mockClear();
    vi.stubGlobal("navigator", {
      ...navigator,
      share: undefined,
      clipboard: { writeText },
    });
    fireEvent.click(screen.getByTestId("referral-share"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(link));

    vi.unstubAllGlobals();
  });

  test("the shareable link carries the code", () => {
    h.referral = {
      data: {
        code: "K7XM2P",
        pendingCount: 0,
        activatedCount: 0,
        chaiEarned: 0,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };

    render(<ReferralCard />);

    const link = referralLink("K7XM2P");
    expect(link).toBe(`${window.location.origin}/join/K7XM2P`);
    // The link is on screen too, so it can be copied by hand when the
    // clipboard is unavailable.
    expect(screen.getByText(link)).toBeInTheDocument();
  });
});

describe("referral code surviving signup", () => {
  test("a signed-out visitor's code is held, and redeemed once they exist", async () => {
    const { unmount } = renderJoinAt("/join/k7xm2p");

    // Signed out: the invite reads as an invite, and nothing is redeemed yet
    // (there is no account to attribute it to).
    expect(screen.getByTestId("join-invite-heading")).toBeInTheDocument();
    expect(h.redeem).not.toHaveBeenCalled();
    // Held uppercase, matching how R1 stores and normalizes codes.
    expect(localStorage.getItem(STORAGE_KEY)).toContain("K7XM2P");

    unmount();

    // Now they exist, and they landed somewhere else in the app entirely.
    h.isSignedIn = true;
    renderAt("/app", <div>home</div>);

    await waitFor(() => {
      expect(h.redeem).toHaveBeenCalledWith({ data: { code: "K7XM2P" } });
    });
    // The slot is emptied so the code cannot re-fire on the next page load.
    await waitFor(() => {
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  test("the sign-up link sends the visitor back to the invite", () => {
    renderJoinAt("/join/K7XM2P");

    expect(screen.getByTestId("join-signup")).toHaveAttribute(
      "href",
      `/sign-up?redirect_url=${encodeURIComponent("/join/K7XM2P")}`,
    );
  });

  test("a signed-in arrival is confirmed, not left guessing", async () => {
    h.isSignedIn = true;
    renderJoinAt("/join/K7XM2P");

    await waitFor(() => {
      expect(screen.getByTestId("join-redeemed-heading")).toBeInTheDocument();
    });
    expect(h.redeem).toHaveBeenCalledWith({ data: { code: "K7XM2P" } });
  });
});

describe("referral refusals", () => {
  // R1 owns these strings and serves them in the error body; the surface
  // echoes the server rather than keeping a second copy that could drift.
  const cases = [
    {
      name: "a repeat redeem",
      status: 409,
      copy: "You have already used a referral code.",
    },
    {
      name: "a self-referral",
      status: 400,
      copy: "You cannot use your own code.",
    },
    {
      name: "an unknown code",
      status: 404,
      copy: "That code did not match. Check it and try again.",
    },
  ];

  for (const c of cases) {
    test(`${c.name} is refused with R1's wording, and still lets them in`, async () => {
      h.isSignedIn = true;
      h.redeem = vi.fn(async () => {
        // Built exactly the way custom-fetch builds it in production: the real
        // constructor reads the Response, so passing a bare status silently
        // throws a TypeError instead and the surface never sees an ApiError.
        throw new ApiError(
          new Response(JSON.stringify({ error: c.copy }), {
            status: c.status,
          }),
          { error: c.copy },
          { method: "POST", url: "/api/referral/redeem" },
        );
      });

      renderJoinAt("/join/K7XM2P");

      await waitFor(() => {
        expect(screen.getByTestId("join-refusal")).toHaveTextContent(c.copy);
      });
      // Never a dead end: the way into the app is still right there.
      expect(screen.getByTestId("join-continue")).toHaveAttribute(
        "href",
        "/app",
      );
      // A refusal is terminal for this code, so it is not left to retry.
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  }

  test("a 409 answering this browser's own earlier redeem is not a refusal", async () => {
    // The shape left behind by a reload mid-flight, or by the link opened in a
    // second tab: this browser already sent a redeem for this exact code.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        code: "K7XM2P",
        savedAt: Date.now(),
        attemptedAt: Date.now(),
      }),
    );
    h.isSignedIn = true;
    h.redeem = vi.fn(async () => {
      throw new ApiError(
        new Response(
          JSON.stringify({ error: "You have already used a referral code." }),
          { status: 409 },
        ),
        { error: "You have already used a referral code." },
        { method: "POST", url: "/api/referral/redeem" },
      );
    });

    renderJoinAt("/join/K7XM2P");

    // Attribution landed on the first attempt; telling a first-time referee
    // they had already used a code would be a lie about their own redemption.
    await waitFor(() => {
      expect(screen.getByTestId("join-redeemed-heading")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("join-refusal")).not.toBeInTheDocument();
  });
});

describe("auth redirect_url guard", () => {
  const BASE = "/app-base";

  test("sends the visitor back to a same-origin app path", () => {
    expect(safeAuthRedirect("?redirect_url=%2Fjoin%2FK7XM2P", BASE)).toBe(
      "/app-base/join/K7XM2P",
    );
  });

  test("ignores an absent param", () => {
    expect(safeAuthRedirect("", BASE)).toBeUndefined();
  });

  // A referral link is shared around, so its query string is attacker-supplied.
  // The literal-backslash form is the one a startsWith("/") check waves
  // through: the URL parser reads "\" as "/" for http(s), so "/\evil.example"
  // becomes the scheme-relative external target "//evil.example".
  const hostile = [
    "//evil.example",
    "/\\evil.example",
    "/\\\\evil.example",
    "https://evil.example/steal",
    "javascript:alert(1)",
  ];

  for (const target of hostile) {
    test(`refuses to redirect off-origin: ${target}`, () => {
      expect(
        safeAuthRedirect(
          `?redirect_url=${encodeURIComponent(target)}`,
          BASE,
        ),
      ).toBeUndefined();
    });
  }

  test("a percent-encoded backslash stays a literal same-origin path", () => {
    // Not an escape hatch, and worth pinning: unlike a literal "\", "%5C" is
    // never re-decoded into a separator, so this is just an odd path on our
    // own origin rather than an off-origin target.
    expect(safeAuthRedirect("?redirect_url=%2F%255Cevil.example", BASE)).toBe(
      "/app-base/%5Cevil.example",
    );
  });
});
