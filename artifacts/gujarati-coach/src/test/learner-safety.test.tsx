import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// The Guideline 1.2 block control, added 2026-08-25. The report half already
// shipped; these tests are about the half that gives a learner relief now, and
// about the two not being confused with each other in the copy.
const blockSpy = vi.fn(async () => undefined);
const unblockSpy = vi.fn(async () => undefined);
const reportSpy = vi.fn(async () => undefined);
let blockedList: { userId: string; displayName: string; username: string | null }[] = [];

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  useReportUsername: () => ({ mutateAsync: reportSpy, isPending: false }),
  useBlockUser: () => ({ mutateAsync: blockSpy, isPending: false }),
  useUnblockUser: () => ({ mutateAsync: unblockSpy, isPending: false }),
  useListBlockedUsers: () => ({ data: blockedList, isLoading: false }),
}));

import {
  LearnerSafetyButton,
  BlockedLearnersList,
} from "@/components/board-scope";

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

beforeEach(() => {
  blockSpy.mockClear();
  unblockSpy.mockClear();
  reportSpy.mockClear();
  blockedList = [];
});

describe("LearnerSafetyButton", () => {
  it("offers BOTH report and block from one control", () => {
    renderWithClient(<LearnerSafetyButton userId="u1" username="ravi" />);
    fireEvent.click(screen.getByLabelText("Report or block ravi"));

    // Guideline 1.2 wants reporting AND blocking reachable. One icon, two
    // remedies, so an upset learner does not have to guess which is which.
    expect(screen.getByTestId("safety-report-u1")).toBeTruthy();
    expect(screen.getByTestId("safety-block-u1")).toBeTruthy();
  });

  it("blocks only after a confirm step, and says the friendship ends", async () => {
    renderWithClient(<LearnerSafetyButton userId="u1" username="ravi" />);
    fireEvent.click(screen.getByLabelText("Report or block ravi"));
    fireEvent.click(screen.getByTestId("safety-block-u1"));

    // The tap that opens the menu must not be the tap that blocks.
    expect(blockSpy).not.toHaveBeenCalled();
    // The consequence people are surprised by is stated before they commit.
    expect(screen.getByText(/if you are friends that ends too/i)).toBeTruthy();

    fireEvent.click(screen.getByTestId("safety-block-confirm-u1"));
    await waitFor(() => expect(blockSpy).toHaveBeenCalledTimes(1));
    expect(blockSpy.mock.calls[0][0]).toEqual({ id: "u1" });
    await screen.findByText("Blocked");
  });

  it("is available for a learner who never chose a username", () => {
    // They appear under a pseudonym rather than not at all, so "you can block
    // anybody you can see" has to hold for them. An unnamed row you cannot
    // block would be the exact gap this control exists to close.
    renderWithClient(
      <LearnerSafetyButton userId="u9" username="Learner 4821" />,
    );
    fireEvent.click(screen.getByLabelText("Report or block Learner 4821"));
    expect(screen.getByTestId("safety-block-u9")).toBeTruthy();
  });

  it("offers a block straight after a report, because a report gives no relief", async () => {
    renderWithClient(<LearnerSafetyButton userId="u1" username="ravi" />);
    fireEvent.click(screen.getByLabelText("Report or block ravi"));
    fireEvent.click(screen.getByTestId("safety-report-u1"));
    fireEvent.click(screen.getByText("Offensive or hateful"));

    await waitFor(() => expect(reportSpy).toHaveBeenCalledTimes(1));
    // A report goes to a queue somebody reads later and changes nothing on
    // screen. The learner who just filed one is exactly the learner who wants
    // the other remedy.
    fireEvent.click(await screen.findByTestId("safety-block-after-report-u1"));
    fireEvent.click(screen.getByTestId("safety-block-confirm-u1"));
    await waitFor(() => expect(blockSpy).toHaveBeenCalledTimes(1));
  });

  it("does not promise the report will change anything", () => {
    renderWithClient(<LearnerSafetyButton userId="u1" username="ravi" />);
    fireEvent.click(screen.getByLabelText("Report or block ravi"));
    // Nothing auto-hides a name on a report count, so the copy must not imply
    // it does. Promising removal would be a promise made by a queue nobody has
    // read yet.
    expect(
      screen.getByText(/Nothing changes on your screen/i),
    ).toBeTruthy();
  });
});

describe("BlockedLearnersList", () => {
  it("renders nothing when nobody is blocked", () => {
    const { container } = renderWithClient(<BlockedLearnersList />);
    // An empty "Blocked" section on every account screen teaches learners that
    // blocking is expected. It is only interesting once it has something in it.
    expect(container.textContent).toBe("");
  });

  it("lists the blocked and offers a way back", async () => {
    blockedList = [
      { userId: "u1", displayName: "ravi", username: "ravi" },
      { userId: "u9", displayName: "Learner 4821", username: null },
    ];
    renderWithClient(<BlockedLearnersList />);

    expect(screen.getByTestId("blocked-row-u1")).toBeTruthy();
    // The pseudonymous learner is listed under the same name the feed showed,
    // or the learner cannot tell who they blocked.
    expect(screen.getByText("Learner 4821")).toBeTruthy();

    // A BLOCK WITH NO WAY BACK IS A TRAP, NOT A CONTROL.
    fireEvent.click(screen.getByTestId("unblock-u1"));
    await waitFor(() => expect(unblockSpy).toHaveBeenCalledTimes(1));
    expect(unblockSpy.mock.calls[0][0]).toEqual({ id: "u1" });
  });
});
