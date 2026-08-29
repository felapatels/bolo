import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// THE FIRST-RUN GATE around /app, build 19. It routes a loaded account that
// still owes the walkthrough, once, and renders home for everyone else,
// including while loading and after a failed fetch (it fails open). Mobile
// twin: FirstRunBootstrapper, pinned in language-choice-gate.test.tsx.
const h = vi.hoisted(() => ({
  account: undefined as unknown,
}));

vi.mock("wouter", () => ({
  Redirect: ({ to }: { to: string }) => <div data-testid="redirect" data-to={to} />,
}));

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  useGetAccount: () => h.account,
}));

import { FirstRunGate } from "@/components/first-run-gate";
import { markWalkthroughDismissed } from "@/lib/walkthrough";

function accountWith(learning: Record<string, unknown>) {
  return { data: { preferences: { learning } }, isLoading: false, isError: false };
}

function renderGate() {
  return render(
    <FirstRunGate>
      <div data-testid="home" />
    </FirstRunGate>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  h.account = accountWith({ hasCompletedTour: false, hasChosenLanguage: false });
});

describe("FirstRunGate", () => {
  test("a fresh account is sent to the walkthrough, never to the old full-screen chooser", () => {
    // The picker opens from the welcome page itself (welcome.test.tsx), so
    // the gate has one destination.
    renderGate();
    expect(screen.getByTestId("redirect")).toHaveAttribute("data-to", "/welcome");
    expect(screen.queryByTestId("home")).not.toBeInTheDocument();
  });

  test("an account that already chose a language goes to the cards too", () => {
    h.account = accountWith({ hasCompletedTour: false, hasChosenLanguage: true });
    renderGate();
    expect(screen.getByTestId("redirect")).toHaveAttribute("data-to", "/welcome");
  });

  test("a finished account renders home untouched", () => {
    h.account = accountWith({ hasCompletedTour: true, hasChosenLanguage: false });
    renderGate();
    expect(screen.getByTestId("home")).toBeInTheDocument();
    expect(screen.queryByTestId("redirect")).not.toBeInTheDocument();
  });

  test("fails open while the account is loading and after a failed fetch", () => {
    h.account = { data: undefined, isLoading: true, isError: false };
    const { unmount } = renderGate();
    expect(screen.getByTestId("home")).toBeInTheDocument();
    unmount();

    h.account = { data: undefined, isLoading: false, isError: true };
    renderGate();
    expect(screen.getByTestId("home")).toBeInTheDocument();
    expect(screen.queryByTestId("redirect")).not.toBeInTheDocument();
  });

  test("an account that dismissed the walkthrough this session is not sent back", () => {
    // The PATCH may still be in flight; the session marker holds the door.
    markWalkthroughDismissed();
    renderGate();
    expect(screen.getByTestId("home")).toBeInTheDocument();
  });
});
