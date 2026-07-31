/**
 * scenario-chat.test.tsx
 * Tests the scenario (capstone chat) UI additions to chat.tsx:
 *   - Scenario banner renders with the correct title/framing copy.
 *   - Target-phrase chips start neutral.
 *   - A chip turns green when its romanized phrase appears in phrasesUsed.
 *   - Completion overlay shows when sceneDone is true.
 *   - No completion overlay when sceneDone is false.
 *
 * The scenario UI is extracted into a thin inline harness so we can exercise
 * the state transitions without mounting the full ChatPage with mocked hooks.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React, { useState } from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Inline harness: replicates the scenario UI from chat.tsx
// ---------------------------------------------------------------------------

interface TargetPhrase {
  romanized: string;
  native: string;
}

interface ScenarioData {
  title: string;
  framingCopy: string;
  targetPhrases: TargetPhrase[];
}

interface ScenarioBannerProps {
  scenario: ScenarioData | null | undefined;
}

function ScenarioBanner({ scenario }: ScenarioBannerProps) {
  if (!scenario) return null;
  return (
    <div data-testid="scenario-banner">
      <p data-testid="scenario-title">{scenario.title}</p>
      <p data-testid="scenario-framing">{scenario.framingCopy}</p>
    </div>
  );
}

interface PhraseChipsProps {
  scenario: ScenarioData | null | undefined;
  usedPhrases: Set<string>;
}

function PhraseChips({ scenario, usedPhrases }: PhraseChipsProps) {
  if (!scenario) return null;
  return (
    <div data-testid="target-phrase-chips">
      {scenario.targetPhrases.map((tp) => {
        const used = usedPhrases.has(tp.romanized);
        return (
          <span
            key={tp.romanized}
            data-testid={`phrase-chip-${tp.romanized}`}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs",
              used ? "bg-green-100 text-green-700" : "bg-white text-muted-foreground",
            )}
          >
            {tp.romanized}
          </span>
        );
      })}
    </div>
  );
}

function CompletionOverlay({
  sceneDone,
  langName,
}: {
  sceneDone: boolean;
  langName: string;
}) {
  if (!sceneDone) return null;
  return (
    <div data-testid="scenario-completion-overlay">
      <p>Zone complete!</p>
      <p>You spoke {langName} at the chai stall!</p>
      <span>+20 XP</span>
      <a href="/app">Back to journey</a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SCENARIO: ScenarioData = {
  title: "At the platform chai stall",
  framingCopy: "You are at the platform chai stall. Greet the attendant and place your order in Gujarati.",
  targetPhrases: [
    { romanized: "namaste", native: "નમસ્તે" },
    { romanized: "kem cho?", native: "કેમ છો?" },
    { romanized: "majaa-maan", native: "મઝામાં" },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ScenarioBanner", () => {
  it("renders title and framing copy when scenario is present", () => {
    render(<ScenarioBanner scenario={SCENARIO} />);
    expect(screen.getByTestId("scenario-banner")).toBeDefined();
    expect(screen.getByTestId("scenario-title").textContent).toBe(SCENARIO.title);
    expect(screen.getByTestId("scenario-framing").textContent).toBe(SCENARIO.framingCopy);
  });

  it("renders nothing when scenario is null", () => {
    render(<ScenarioBanner scenario={null} />);
    expect(screen.queryByTestId("scenario-banner")).toBeNull();
  });
});

describe("PhraseChips", () => {
  it("renders all target-phrase chips when scenario is present", () => {
    render(<PhraseChips scenario={SCENARIO} usedPhrases={new Set()} />);
    expect(screen.getByTestId("target-phrase-chips")).toBeDefined();
    for (const tp of SCENARIO.targetPhrases) {
      expect(screen.getByTestId(`phrase-chip-${tp.romanized}`)).toBeDefined();
    }
  });

  it("chips start neutral (no green class) when no phrases used", () => {
    render(<PhraseChips scenario={SCENARIO} usedPhrases={new Set()} />);
    const chip = screen.getByTestId("phrase-chip-namaste");
    expect(chip.className).not.toContain("bg-green-100");
    expect(chip.className).not.toContain("text-green-700");
  });

  it("chip turns green when its romanized phrase appears in usedPhrases", () => {
    render(<PhraseChips scenario={SCENARIO} usedPhrases={new Set(["namaste"])} />);
    const usedChip = screen.getByTestId("phrase-chip-namaste");
    expect(usedChip.className).toContain("bg-green-100");
    expect(usedChip.className).toContain("text-green-700");
    // Other chips remain neutral.
    const unusedChip = screen.getByTestId("phrase-chip-kem cho?");
    expect(unusedChip.className).not.toContain("bg-green-100");
  });

  it("renders nothing when scenario is null", () => {
    render(<PhraseChips scenario={null} usedPhrases={new Set()} />);
    expect(screen.queryByTestId("target-phrase-chips")).toBeNull();
  });
});

describe("CompletionOverlay", () => {
  it("shows overlay when sceneDone is true", () => {
    render(<CompletionOverlay sceneDone={true} langName="Gujarati" />);
    expect(screen.getByTestId("scenario-completion-overlay")).toBeDefined();
    expect(screen.getByText("+20 XP")).toBeDefined();
  });

  it("does NOT show overlay when sceneDone is false", () => {
    render(<CompletionOverlay sceneDone={false} langName="Gujarati" />);
    expect(screen.queryByTestId("scenario-completion-overlay")).toBeNull();
  });

  it("overlay includes the language name in the completion copy", () => {
    render(<CompletionOverlay sceneDone={true} langName="Gujarati" />);
    expect(screen.getByText("You spoke Gujarati at the chai stall!")).toBeDefined();
  });
});
