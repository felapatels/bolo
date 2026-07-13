import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";
import type { FriendRequest } from "@workspace/api-client-react";

// BottomNav shares the react-query cache with the Friends page via
// useListIncomingFriendRequests to drive its pending-request badge. That badge
// is the surface that regressed silently before (a Home render only worked once
// the hook was stubbed), so cover it directly against the real component.
const h = vi.hoisted(() => ({
  incoming: undefined as unknown,
}));

vi.mock("@workspace/api-client-react", () => ({
  useListIncomingFriendRequests: () => h.incoming,
}));

// Imported after the mock is declared.
import { BottomNav } from "@/components/layout/bottom-nav";

function renderNav(ui: ReactElement, path = "/app") {
  const { hook } = memoryLocation({ path });
  return render(<Router hook={hook}>{ui}</Router>);
}

function requestsOfLength(n: number): FriendRequest[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    status: "pending",
    createdAt: "2026-01-01T00:00:00.000Z",
    user: {
      id: `u${i + 1}`,
      displayName: `Learner ${i + 1}`,
      email: `learner${i + 1}@example.com`,
    },
  }));
}

beforeEach(() => {
  h.incoming = { data: [] as FriendRequest[] };
});

describe("BottomNav pending-request badge", () => {
  test("renders the three primary destinations", () => {
    renderNav(<BottomNav />);

    expect(screen.getByRole("link", { name: /Home/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Friends/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Progress/i })).toBeInTheDocument();
  });

  test("shows no badge when there are no incoming requests", () => {
    h.incoming = { data: [] };
    renderNav(<BottomNav />);

    expect(screen.queryByLabelText(/pending friend/i)).not.toBeInTheDocument();
  });

  test("shows no badge while the request list is still loading (undefined data)", () => {
    h.incoming = { data: undefined };
    renderNav(<BottomNav />);

    expect(screen.queryByLabelText(/pending friend/i)).not.toBeInTheDocument();
  });

  test("shows a single-request badge with a singular label", () => {
    h.incoming = { data: requestsOfLength(1) };
    renderNav(<BottomNav />);

    const badge = screen.getByLabelText("1 pending friend request");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("1");
  });

  test("shows the exact count with a plural label for several requests", () => {
    h.incoming = { data: requestsOfLength(4) };
    renderNav(<BottomNav />);

    const badge = screen.getByLabelText("4 pending friend requests");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("4");
  });

  test("caps the display at 9+ once past nine requests", () => {
    h.incoming = { data: requestsOfLength(12) };
    renderNav(<BottomNav />);

    const badge = screen.getByLabelText("12 pending friend requests");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("9+");
  });
});
