import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  FIRST_WORD_PRIMER_COPY,
  FIRST_WORD_PRIMER_KEY,
  loadFirstWordPrimerSeen,
  saveFirstWordPrimerSeen,
  shouldShowFirstWordPrimer,
} from "@/lib/first-word-primer";
import { FirstWordPrimer } from "@/components/first-word-primer";

// THE FIRST-WORD LIGHTBOX, build 19 (owner ask, 2026-08-29). Mobile twin:
// bolo-mobile/__tests__/first-word-primer.test.tsx, same pins.
vi.mock("@/components/mascot", () => ({
  Mascot: ({ pose }: { pose: string }) => <div data-testid={`mascot-${pose}`} />,
}));

beforeEach(() => {
  localStorage.clear();
});

describe("shouldShowFirstWordPrimer", () => {
  test("shows for a first word: unseen here, zero attempts on the account", () => {
    expect(shouldShowFirstWordPrimer({ seenOnDevice: false, totalAttempts: 0 })).toBe(true);
  });

  test("never shows twice in one browser", () => {
    expect(shouldShowFirstWordPrimer({ seenOnDevice: true, totalAttempts: 0 })).toBe(false);
  });

  test("never calls a word first for a learner who practised elsewhere", () => {
    expect(shouldShowFirstWordPrimer({ seenOnDevice: false, totalAttempts: 3 })).toBe(false);
  });

  test("judges by the browser alone when the account count is unknown", () => {
    expect(shouldShowFirstWordPrimer({ seenOnDevice: false, totalAttempts: undefined })).toBe(true);
  });
});

describe("the browser marker", () => {
  test("reads unseen, then seen once saved", () => {
    expect(loadFirstWordPrimerSeen()).toBe(false);
    saveFirstWordPrimerSeen();
    expect(loadFirstWordPrimerSeen()).toBe(true);
    expect(localStorage.getItem(FIRST_WORD_PRIMER_KEY)).toBe("yes");
  });
});

describe("the dialog", () => {
  test("says the agreed words, with no em dash anywhere, and hands the click back", () => {
    const onDismiss = vi.fn();
    render(<FirstWordPrimer open onDismiss={onDismiss} />);
    expect(screen.getByTestId("first-word-primer")).toBeInTheDocument();
    expect(screen.getByText(FIRST_WORD_PRIMER_COPY.title)).toBeInTheDocument();
    expect(screen.getByText(FIRST_WORD_PRIMER_COPY.body)).toBeInTheDocument();
    expect(screen.getByTestId("mascot-cheer")).toBeInTheDocument();
    for (const line of Object.values(FIRST_WORD_PRIMER_COPY)) {
      expect(line).not.toMatch(/[—–]/);
    }
    fireEvent.click(screen.getByTestId("first-word-primer-cta"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test("renders nothing when closed", () => {
    render(<FirstWordPrimer open={false} onDismiss={vi.fn()} />);
    expect(screen.queryByTestId("first-word-primer")).not.toBeInTheDocument();
  });
});
