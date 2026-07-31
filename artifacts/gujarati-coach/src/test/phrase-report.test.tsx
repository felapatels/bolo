import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// Spec B2 client behavior: fire-and-forget with an optimistic toast, optional
// note in the payload, and silent failure (nothing user-visible on error).
const mutateSpy = vi.fn();
vi.mock("@workspace/api-client-react", () => ({
  useReportPhrase: () => ({ mutate: mutateSpy }),
}));

const toastSpy = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy }),
}));

import { PhraseReportButton } from "@/components/phrase-report";

const FLAG_LABEL = "Report a problem with this phrase";

beforeEach(() => {
  mutateSpy.mockClear();
  toastSpy.mockClear();
});

describe("PhraseReportButton", () => {
  it("renders nothing without a phrase id", () => {
    render(<PhraseReportButton phraseId={undefined} />);
    expect(screen.queryByLabelText(FLAG_LABEL)).toBeNull();
  });

  it("two taps: flag then reason fires the mutation and the thanks toast", () => {
    render(<PhraseReportButton phraseId={7} />);
    fireEvent.click(screen.getByLabelText(FLAG_LABEL));
    fireEvent.click(screen.getByText("Translation wrong"));

    expect(mutateSpy).toHaveBeenCalledTimes(1);
    expect(mutateSpy.mock.calls[0][0]).toEqual({
      id: 7,
      data: { reason: "translation_wrong" }, // no note key when empty
    });
    expect(toastSpy).toHaveBeenCalledWith({
      description: "Thanks, we'll check it",
    });
    // Popover closed after submit — reasons no longer rendered.
    expect(screen.queryByText("Translation wrong")).toBeNull();
  });

  it("includes the trimmed optional note in the payload", () => {
    render(<PhraseReportButton phraseId={9} />);
    fireEvent.click(screen.getByLabelText(FLAG_LABEL));
    fireEvent.change(screen.getByLabelText("Optional note"), {
      target: { value: "  gloss is off  " },
    });
    fireEvent.click(screen.getByText("Audio wrong"));

    expect(mutateSpy.mock.calls[0][0]).toEqual({
      id: 9,
      data: { reason: "audio_wrong", note: "gloss is off" },
    });
  });

  it("is fire-and-forget: toast precedes settlement and failure is silent", () => {
    render(<PhraseReportButton phraseId={11} />);
    fireEvent.click(screen.getByLabelText(FLAG_LABEL));
    fireEvent.click(screen.getByText("Other"));

    // Toast fired synchronously on tap, before any network settlement.
    expect(toastSpy).toHaveBeenCalledTimes(1);
    // The mutation swallows errors via an onError handler.
    const options = mutateSpy.mock.calls[0][1];
    expect(typeof options.onError).toBe("function");
    expect(() => options.onError(new Error("boom"))).not.toThrow();
    expect(toastSpy).toHaveBeenCalledTimes(1); // no error surface
  });
});
