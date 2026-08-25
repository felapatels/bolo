// The home prompt, after it stopped asking for a display name.
//
// WHY THIS FILE EXISTS AT ALL. The card had no test of its own on either
// platform: every home suite mocked it out, so when it changed on 2026-08-25
// from asking for a display name to asking for a public username, both suites
// stayed green and told us nothing. A component that only ever appears as a
// mock is a component nobody is checking.
import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  username: null as string | null,
  mutateAsync: vi.fn(async () => ({})),
  invalidateQueries: vi.fn(async () => {}),
}));

vi.mock("@clerk/react", () => ({
  useUser: () => ({ user: { firstName: "Asha", reload: vi.fn() } }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: h.invalidateQueries }),
}));

vi.mock("@workspace/api-client-react", () => ({
  useUpdateAccountProfile: () => ({ mutateAsync: h.mutateAsync }),
  useGetAccount: () => ({ data: { profile: { username: h.username } } }),
  getGetAccountQueryKey: () => ["account"],
}));

vi.mock("@/components/mascot", () => ({
  Mascot: () => null,
}));

vi.mock("lucide-react", () => ({
  X: () => null,
}));

import {
  NamePromptCard,
  NAME_PROMPT_DISMISSED_KEY,
  USERNAME_PROMPT_DISMISSED_KEY,
} from "@/components/name-prompt-card";

beforeEach(() => {
  h.username = null;
  h.mutateAsync.mockClear();
  h.invalidateQueries.mockClear();
  window.localStorage.clear();
});

describe("the home username prompt", () => {
  test("asks a learner with no username, even though Clerk has their first name", () => {
    // The old card hid itself whenever Clerk had a first name, which is most
    // people. The username is the thing the app cannot derive, so having a
    // first name is no longer a reason not to ask.
    render(<NamePromptCard />);
    expect(screen.getByTestId("name-prompt-card")).toBeInTheDocument();
  });

  test("stays away once a username exists", () => {
    h.username = "meera";
    render(<NamePromptCard />);
    expect(screen.queryByTestId("name-prompt-card")).toBeNull();
  });

  test("saves the USERNAME, not the display name", async () => {
    render(<NamePromptCard />);
    fireEvent.change(screen.getByTestId("name-prompt-input"), {
      target: { value: "chai_wallah" },
    });
    fireEvent.click(screen.getByTestId("name-prompt-save"));
    await waitFor(() =>
      expect(h.mutateAsync).toHaveBeenCalledWith({
        data: { username: "chai_wallah" },
      }),
    );
  });

  test("shows the server's own refusal, never a generic retry", async () => {
    // Only the server knows WHICH rule broke: shape, a reserved word, the
    // profanity screen, or a name already taken. "Try again" would send the
    // learner round the same loop.
    h.mutateAsync.mockRejectedValueOnce({
      data: { error: "That username is taken. Please pick another." },
    });
    render(<NamePromptCard />);
    fireEvent.change(screen.getByTestId("name-prompt-input"), {
      target: { value: "meera" },
    });
    fireEvent.click(screen.getByTestId("name-prompt-save"));
    await waitFor(() =>
      expect(
        screen.getByText("That username is taken. Please pick another."),
      ).toBeInTheDocument(),
    );
  });

  test("an OLD name-prompt dismissal does not suppress it", () => {
    // The population that dismissed the old prompt is exactly the population
    // that needs asking, since every existing account has username null.
    // Reusing the key would have silently excluded them.
    window.localStorage.setItem(NAME_PROMPT_DISMISSED_KEY, "1");
    render(<NamePromptCard />);
    expect(screen.getByTestId("name-prompt-card")).toBeInTheDocument();
  });

  test("its own dismissal does suppress it", () => {
    window.localStorage.setItem(USERNAME_PROMPT_DISMISSED_KEY, "1");
    render(<NamePromptCard />);
    expect(screen.queryByTestId("name-prompt-card")).toBeNull();
  });
});
