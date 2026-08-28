import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// BoloMemories: the web control for what Bolo remembers about a learner.
//
// Web posts to the same /openai/chat that calls rememberFromTurn, so it has
// been keeping notes about learners with nothing on the platform to see or
// clear them. These tests hold the two things that make it a privacy control
// rather than a settings toy: it renders even when the list is EMPTY, and
// clearing is reachable in two clicks.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  query: {
    data: undefined as unknown,
    isLoading: false,
    isError: false,
  },
  forget: {
    mutateAsync: vi.fn(async () => ({ forgotten: 0 })),
    isPending: false,
  },
  invalidateQueries: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: h.toast }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: h.invalidateQueries }),
}));

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  useGetAccountMemories: () => h.query,
  useForgetAccountMemories: () => h.forget,
}));

import { BoloMemories } from "@/components/bolo-memories";

const MEMORIES = [
  {
    id: 2,
    memory: "You are learning Gujarati for a family wedding in March.",
    createdAt: "2026-08-26T10:00:00.000Z",
  },
  {
    id: 1,
    memory: "You have a dog called Rocky.",
    createdAt: "2026-08-25T10:00:00.000Z",
  },
];

beforeEach(() => {
  h.query.data = { memories: [] };
  h.query.isLoading = false;
  h.query.isError = false;
  h.forget.isPending = false;
  h.forget.mutateAsync = vi.fn(async () => ({ forgotten: 2 }));
  h.invalidateQueries.mockClear();
  h.toast.mockClear();
});

describe("BoloMemories — what is shown", () => {
  test("renders the section even when Bolo has kept nothing", () => {
    render(<BoloMemories />);

    // The whole point. A section that hides itself when empty reproduces the
    // silence being fixed: "nothing is held" is the answer a parent came for.
    expect(screen.getByTestId("bolo-memories")).toBeInTheDocument();
    expect(screen.getByTestId("bolo-memories-empty")).toBeInTheDocument();
  });

  test("offers no clear button when there is nothing to clear", () => {
    render(<BoloMemories />);
    expect(screen.queryByTestId("bolo-memories-forget")).not.toBeInTheDocument();
  });

  test("lists every memory sentence, newest first as the server sends them", () => {
    h.query.data = { memories: MEMORIES };
    render(<BoloMemories />);

    expect(
      screen.getByText("You are learning Gujarati for a family wedding in March."),
    ).toBeInTheDocument();
    expect(screen.getByText("You have a dog called Rocky.")).toBeInTheDocument();

    const rows = screen.getByTestId("bolo-memories-list").children;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute("data-testid", "bolo-memory-2");
  });

  test("says when it is still checking", () => {
    h.query.data = undefined;
    h.query.isLoading = true;
    render(<BoloMemories />);
    expect(screen.getByTestId("bolo-memories-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("bolo-memories-empty")).not.toBeInTheDocument();
  });

  test("a failed load says so rather than claiming nothing is held", () => {
    h.query.data = undefined;
    h.query.isError = true;
    render(<BoloMemories />);

    expect(screen.getByTestId("bolo-memories-error")).toBeInTheDocument();
    // The dangerous wrong answer: an error that renders as "nothing kept"
    // tells a parent the opposite of the truth.
    expect(screen.queryByTestId("bolo-memories-empty")).not.toBeInTheDocument();
  });

  test("a bad timestamp does not take the sentence down with it", () => {
    h.query.data = {
      memories: [{ id: 9, memory: "You like mangoes.", createdAt: "not-a-date" }],
    };
    render(<BoloMemories />);

    expect(screen.getByText("You like mangoes.")).toBeInTheDocument();
    expect(screen.getByText("Remembered earlier")).toBeInTheDocument();
  });
});

describe("BoloMemories — clearing", () => {
  test("confirming deletes everything, refetches, and reports how many went", async () => {
    const user = userEvent.setup();
    h.query.data = { memories: MEMORIES };
    render(<BoloMemories />);

    await user.click(screen.getByTestId("bolo-memories-forget"));
    await user.click(await screen.findByTestId("bolo-memories-forget-confirm"));

    await waitFor(() => expect(h.forget.mutateAsync).toHaveBeenCalledTimes(1));
    expect(h.invalidateQueries).toHaveBeenCalled();
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: "2 notes deleted." }),
    );
  });

  test("cancelling deletes nothing", async () => {
    const user = userEvent.setup();
    h.query.data = { memories: MEMORIES };
    render(<BoloMemories />);

    await user.click(screen.getByTestId("bolo-memories-forget"));
    await user.click(await screen.findByRole("button", { name: "Keep them" }));

    expect(h.forget.mutateAsync).not.toHaveBeenCalled();
  });

  test("a failed delete says so and does not claim success", async () => {
    const user = userEvent.setup();
    h.query.data = { memories: MEMORIES };
    h.forget.mutateAsync = vi.fn(async () => {
      throw new Error("boom");
    });
    render(<BoloMemories />);

    await user.click(screen.getByTestId("bolo-memories-forget"));
    await user.click(await screen.findByTestId("bolo-memories-forget-confirm"));

    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      ),
    );
  });

  test("the confirm names the count, so nobody clears more than they meant to", async () => {
    const user = userEvent.setup();
    h.query.data = { memories: MEMORIES };
    render(<BoloMemories />);

    await user.click(screen.getByTestId("bolo-memories-forget"));
    expect(await screen.findByText(/This deletes all 2 notes/)).toBeInTheDocument();
  });
});
