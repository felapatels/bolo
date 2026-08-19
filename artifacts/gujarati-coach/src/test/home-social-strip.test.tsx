/**
 * HomeSocialStrip, component unit tests.
 *
 * Pins four contracts:
 *   1. Empty state  , no friends → invite affordance, share button, "Add friends" link
 *   2. Loading state, component stays absent (no layout shift)
 *   3. Populated state, friends present: rank rows, "See all" link to /leaderboard
 *   4. Self outside top 4, rank-5+ learner sees their own row appended below the top 4
 */
import React from "react";
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { FeedEntry, LeaderboardEntry } from "@workspace/api-client-react";

// ── hoisted mutable state ─────────────────────────────────────────────────────

const h = vi.hoisted(() => ({
  leaderboardData: [] as LeaderboardEntry[],
  leaderboardLoading: false,
  leaderboardError: false,
  referralCode: "K7XM2P" as string | undefined,
  referralLoading: false,
  referralError: false,
  feedData: [] as FeedEntry[],
  outfits: [] as { id: string; name: string }[],
}));

// ── module mocks ──────────────────────────────────────────────────────────────

vi.mock("framer-motion", () => ({
  motion: {
    section: ({
      children,
      initial: _i,
      animate: _a,
      transition: _t,
      ...rest
    }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement("section", rest, children),
    div: ({
      children,
      initial: _i,
      animate: _a,
      transition: _t,
      ...rest
    }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement("div", rest, children),
  },
  useReducedMotion: () => true,
}));

vi.mock("wouter", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: { href: string; children: React.ReactNode } & Record<string, unknown>) =>
    React.createElement("a", { href, ...rest }, children),
}));

vi.mock("@/lib/motion", () => ({
  springs: { snappy: {}, gentle: {} },
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetFriendsLeaderboard: () => ({
    data: h.leaderboardData,
    isLoading: h.leaderboardLoading,
    isError: h.leaderboardError,
  }),
  useGetReferral: () => ({
    data: h.referralCode ? { code: h.referralCode } : undefined,
    isLoading: h.referralLoading,
    isError: h.referralError,
  }),
  // The card now also shows the single most recent friend moment above the
  // rank rows. These tests are about the ranks, so the feed stays empty and
  // the line stays absent; the feed line has its own coverage.
  useGetFriendsFeed: () => ({
    data: h.feedData,
    isLoading: false,
    isError: false,
  }),
  getGetFriendsFeedQueryKey: () => ["feed"],
  useGetOutfits: () => ({ data: { outfits: h.outfits } }),
}));

vi.mock("@/lib/referral-code", () => ({
  REFERRAL_REWARD_CHAI: 50,
  referralLink: (code: string) => `https://bolo.example.com/join/${code}`,
}));

const mockShare = vi.fn();
vi.mock("@/lib/referral-share", () => ({
  shareReferralLink: (...args: unknown[]) => mockShare(...args),
  copyReferralLink: vi.fn(),
}));

// Lucide icons, render as plain spans so assertions aren't about SVGs.
vi.mock("lucide-react", () => ({
  Users: () => React.createElement("span", { "data-icon": "users" }),
  Crown: () => React.createElement("span", { "data-icon": "crown" }),
  Gift: () => React.createElement("span", { "data-icon": "gift" }),
}));

// cn is a pure utility, use the real one (or a passthrough).
vi.mock("@/lib/utils", () => ({
  cn: (...classes: unknown[]) =>
    classes.filter(Boolean).join(" "),
}));

import { HomeSocialStrip } from "@/components/home-social-strip";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeEntry(
  userId: string,
  rank: number,
  xp: number,
  displayName: string,
  isSelf = false,
): LeaderboardEntry {
  return {
    userId,
    rank,
    xp,
    isSelf,
    displayName,
    email: null,
    equippedOutfit: null,
    equippedAccessory: null,
  } as unknown as LeaderboardEntry;
}

const SELF = makeEntry("me", 1, 300, "Priya", true);
const FRIEND_A = makeEntry("a", 2, 250, "Arjun");
const FRIEND_B = makeEntry("b", 3, 200, "Mira");
const FRIEND_C = makeEntry("c", 4, 150, "Dev");
const FRIEND_D = makeEntry("d", 5, 100, "Anaya");

// ── setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  h.leaderboardData = [];
  h.leaderboardLoading = false;
  h.leaderboardError = false;
  h.referralCode = "K7XM2P";
  h.referralLoading = false;
  h.referralError = false;
  mockShare.mockReset();
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe("HomeSocialStrip, empty state (no friends)", () => {
  test("shows the invite affordance and share button", () => {
    h.leaderboardData = [];
    render(<HomeSocialStrip />);

    expect(
      screen.getByText("Invite a friend, earn Chai"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("home-referral-share")).toBeInTheDocument();
  });

  test("shows 'Add friends' link pointing to /friends", () => {
    h.leaderboardData = [];
    render(<HomeSocialStrip />);

    const link = screen.getByRole("link", { name: /add friends/i });
    expect(link).toHaveAttribute("href", "/friends");
  });

  test("strip is absent while the leaderboard loads", () => {
    h.leaderboardLoading = true;
    h.leaderboardData = [];
    render(<HomeSocialStrip />);

    expect(screen.queryByTestId("home-social-strip")).not.toBeInTheDocument();
  });

  test("share button triggers shareReferralLink with the learner's link", () => {
    h.leaderboardData = [];
    render(<HomeSocialStrip />);

    fireEvent.click(screen.getByTestId("home-referral-share"));

    expect(mockShare).toHaveBeenCalledWith(
      "https://bolo.example.com/join/K7XM2P",
      expect.any(Function),
    );
  });

  test("share button is absent when the referral code is not yet available", () => {
    h.leaderboardData = [];
    h.referralCode = undefined;
    render(<HomeSocialStrip />);

    expect(screen.queryByTestId("home-referral-share")).not.toBeInTheDocument();
    // But the invite copy is still shown (the strip itself is present).
    expect(screen.getByText("Invite a friend, earn Chai")).toBeInTheDocument();
  });
});

describe("HomeSocialStrip, populated state (has friends)", () => {
  test("shows rank rows for the leaderboard entries", () => {
    h.leaderboardData = [SELF, FRIEND_A, FRIEND_B];
    render(<HomeSocialStrip />);

    expect(screen.getByText("Priya")).toBeInTheDocument();
    expect(screen.getByText("Arjun")).toBeInTheDocument();
    expect(screen.getByText("Mira")).toBeInTheDocument();
  });

  // Standing goes to the board. The empty state's "Add friends" link stays on
  // /friends, which is where friends are actually added.
  test("shows 'See all' link pointing to /leaderboard", () => {
    h.leaderboardData = [SELF, FRIEND_A];
    render(<HomeSocialStrip />);

    const link = screen.getByRole("link", { name: /see all/i });
    expect(link).toHaveAttribute("href", "/leaderboard");
  });

  test("does not show the invite affordance when friends are present", () => {
    h.leaderboardData = [SELF, FRIEND_A];
    render(<HomeSocialStrip />);

    expect(screen.queryByText("Invite a friend, earn Chai")).not.toBeInTheDocument();
    expect(screen.queryByTestId("home-referral-share")).not.toBeInTheDocument();
  });

  test("labels the self row with '(You)'", () => {
    h.leaderboardData = [SELF, FRIEND_A];
    render(<HomeSocialStrip />);

    expect(screen.getByText(/\(You\)/)).toBeInTheDocument();
  });
});

describe("HomeSocialStrip, self outside top 4", () => {
  test("appends the self entry even when the learner ranks 5th", () => {
    // Entries sorted by rank; learner is rank 5.
    const selfRank5 = makeEntry("me", 5, 80, "Priya", true);
    h.leaderboardData = [FRIEND_A, FRIEND_B, FRIEND_C, FRIEND_D, selfRank5];
    render(<HomeSocialStrip />);

    // Top 4 by rank are shown.
    expect(screen.getByText("Arjun")).toBeInTheDocument();
    expect(screen.getByText("Mira")).toBeInTheDocument();
    expect(screen.getByText("Dev")).toBeInTheDocument();
    expect(screen.getByText("Anaya")).toBeInTheDocument();

    // Self is appended below even though ranked 5th.
    expect(screen.getByText("Priya")).toBeInTheDocument();
    expect(screen.getByText(/\(You\)/)).toBeInTheDocument();
  });

  test("does not duplicate self when they rank in the top 4", () => {
    h.leaderboardData = [SELF, FRIEND_A, FRIEND_B, FRIEND_C, FRIEND_D];
    render(<HomeSocialStrip />);

    // 'Priya (You)' should appear exactly once, not deduplicated into two rows.
    const selfRows = screen.getAllByText(/\(You\)/);
    expect(selfRows).toHaveLength(1);
  });
});
