import { describe, test, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SpeechSpeedPill, useSpeechRate } from "@/components/speech-speed-pill";
import {
  SPEECH_RATE_PREF_KEY,
  applySpeechRate,
  nextSpeechRate,
  speechRateLabel,
} from "@/lib/speechRatePref";

// THE SPEAKING-SPEED PILL (owner, 2026-09-17: "it should be on chat screen and
// lesson screens, wherever bolo or coach speaks"). One stored preference, many
// doors: every pill and the account page must agree without a reload.

function AccountLikeReader() {
  const rate = useSpeechRate();
  return <span data-testid="account-reader">{String(rate)}</span>;
}

beforeEach(() => {
  localStorage.removeItem(SPEECH_RATE_PREF_KEY);
});

describe("SpeechSpeedPill", () => {
  test("renders the stored speed as the account page's word, not a number", () => {
    localStorage.setItem(SPEECH_RATE_PREF_KEY, "0.8");
    render(<SpeechSpeedPill testId="pill" />);
    expect(screen.getByTestId("pill")).toHaveTextContent("Slow");
    expect(screen.getByTestId("pill")).not.toHaveTextContent("0.8");
    expect(screen.getByTestId("pill")).toHaveAccessibleName("Speaking speed: Slow");
  });

  test("defaults to Normal, and an unrecognised stored value reads as Normal", () => {
    render(<SpeechSpeedPill testId="pill" />);
    expect(screen.getByTestId("pill")).toHaveTextContent("Normal");
    localStorage.setItem(SPEECH_RATE_PREF_KEY, "0.42");
    const { unmount } = render(<SpeechSpeedPill testId="pill2" />);
    expect(screen.getByTestId("pill2")).toHaveTextContent("Normal");
    unmount();
  });

  test("a click cycles Normal, Slow, Slower, Normal and writes the shared key", () => {
    render(<SpeechSpeedPill testId="pill" />);
    const pill = screen.getByTestId("pill");
    fireEvent.click(pill);
    expect(localStorage.getItem(SPEECH_RATE_PREF_KEY)).toBe("0.8");
    expect(pill).toHaveTextContent("Slow");
    fireEvent.click(pill);
    expect(localStorage.getItem(SPEECH_RATE_PREF_KEY)).toBe("0.65");
    expect(pill).toHaveTextContent("Slower");
    fireEvent.click(pill);
    expect(localStorage.getItem(SPEECH_RATE_PREF_KEY)).toBe("1");
    expect(pill).toHaveTextContent("Normal");
  });

  test("a second mounted pill and an account-style reader follow the change", () => {
    render(
      <>
        <SpeechSpeedPill testId="chat" variant="labelled" />
        <SpeechSpeedPill testId="lesson" />
        <AccountLikeReader />
      </>,
    );
    fireEvent.click(screen.getByTestId("chat"));
    expect(screen.getByTestId("lesson")).toHaveTextContent("Slow");
    expect(screen.getByTestId("account-reader")).toHaveTextContent("0.8");
  });

  test("a write from another tab (storage event) updates a mounted pill", () => {
    render(<SpeechSpeedPill testId="pill" />);
    act(() => {
      localStorage.setItem(SPEECH_RATE_PREF_KEY, "0.65");
      window.dispatchEvent(new StorageEvent("storage", { key: SPEECH_RATE_PREF_KEY }));
    });
    expect(screen.getByTestId("pill")).toHaveTextContent("Slower");
  });

  // The whole point: the NEXT clip plays at the new speed with no reload,
  // because applySpeechRate reads the stored value at play time.
  test("the next applySpeechRate after a tap uses the new rate", () => {
    render(<SpeechSpeedPill testId="pill" />);
    fireEvent.click(screen.getByTestId("pill"));
    const el = document.createElement("audio");
    applySpeechRate(el);
    expect(el.playbackRate).toBe(0.8);
  });

  test("the labelled variant says Speed so the word is not a riddle", () => {
    render(<SpeechSpeedPill testId="pill" variant="labelled" />);
    expect(screen.getByTestId("pill")).toHaveTextContent("Speed");
  });

  test("nextSpeechRate and speechRateLabel agree with the options", () => {
    expect(nextSpeechRate(1)).toBe(0.8);
    expect(nextSpeechRate(0.65)).toBe(1);
    expect(speechRateLabel(0.65)).toBe("Slower");
    expect(speechRateLabel(0.42)).toBe("Normal");
  });
});
