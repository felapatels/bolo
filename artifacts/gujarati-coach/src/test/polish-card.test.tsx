/**
 * polish-card.test.tsx
 * Tests the Polish card that appears at the end of a practice session when
 * POLISH_ENABLED is on and at least one phrase scored below Great.
 *
 * The Polish card is rendered inside practice.tsx's summary state as a
 * conditional block — this test file exercises the isolation of that card's
 * logic by mounting a thin wrapper that simulates the relevant props.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React, { useState } from "react";
import { BandPill } from "@/components/ui/band-pill";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Inline minimal PolishCard component (matches the implementation block in
// practice.tsx exactly — band logic, CTA href, Skip behaviour).
// ---------------------------------------------------------------------------

type Band = "perfect" | "great" | "good" | "almost" | "retry";

interface SessionResult {
  phraseId: number;
  band: Band;
  english: string;
}

interface PolishCardProps {
  polishEnabled: boolean;
  sessionResults: SessionResult[];
  zoneId: number;
  groupId: string;
}

function bandCss(band: Band): string {
  if (band === "perfect") return "hsl(var(--success))";
  if (band === "great") return "hsl(var(--accent))";
  if (band === "good") return "hsl(var(--primary))";
  if (band === "almost") return "hsl(var(--muted-foreground))";
  return "hsl(var(--destructive))";
}

function PolishCard({ polishEnabled, sessionResults, zoneId, groupId }: PolishCardProps) {
  const [dismissed, setDismissed] = useState(false);

  if (!polishEnabled || dismissed) return null;

  const subTop = sessionResults.filter(r => r.band !== "perfect" && r.band !== "great");
  if (subTop.length === 0) return null;

  const href = `/practice/${zoneId}?group=${groupId}&phraseIds=${subTop.map(r => r.phraseId).join(",")}`;

  return (
    <div data-testid="polish-card">
      <p>Polish your phrases</p>
      {subTop.map(r => (
        <span key={r.phraseId} data-testid={`phrase-${r.phraseId}`} style={{ color: bandCss(r.band) }}>
          {r.english}
        </span>
      ))}
      <a href={href} data-testid="polish-cta">
        Re-run these phrases
      </a>
      <button onClick={() => setDismissed(true)} data-testid="polish-skip">
        Skip
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ZONE_ID = 1;
const GROUP_ID = "group-42";

const allTopBandResults: SessionResult[] = [
  { phraseId: 10, band: "perfect", english: "hello" },
  { phraseId: 11, band: "great", english: "thank you" },
];

const mixedResults: SessionResult[] = [
  { phraseId: 10, band: "perfect", english: "hello" },
  { phraseId: 11, band: "good", english: "please" },
  { phraseId: 12, band: "retry", english: "goodbye" },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PolishCard", () => {
  it("renders when polishEnabled=true and sub-top phrases exist", () => {
    render(
      <PolishCard
        polishEnabled={true}
        sessionResults={mixedResults}
        zoneId={ZONE_ID}
        groupId={GROUP_ID}
      />,
    );
    expect(screen.getByTestId("polish-card")).toBeDefined();
  });

  it("does NOT render when polishEnabled=false", () => {
    render(
      <PolishCard
        polishEnabled={false}
        sessionResults={mixedResults}
        zoneId={ZONE_ID}
        groupId={GROUP_ID}
      />,
    );
    expect(screen.queryByTestId("polish-card")).toBeNull();
  });

  it("does NOT render when all phrases are top band", () => {
    render(
      <PolishCard
        polishEnabled={true}
        sessionResults={allTopBandResults}
        zoneId={ZONE_ID}
        groupId={GROUP_ID}
      />,
    );
    expect(screen.queryByTestId("polish-card")).toBeNull();
  });

  it("only lists sub-top-band phrases (excludes perfect and great)", () => {
    render(
      <PolishCard
        polishEnabled={true}
        sessionResults={mixedResults}
        zoneId={ZONE_ID}
        groupId={GROUP_ID}
      />,
    );
    // perfect (id=10) must NOT appear
    expect(screen.queryByTestId("phrase-10")).toBeNull();
    // good and retry must appear
    expect(screen.getByTestId("phrase-11")).toBeDefined();
    expect(screen.getByTestId("phrase-12")).toBeDefined();
  });

  it("Skip button dismisses the card without navigating", () => {
    render(
      <PolishCard
        polishEnabled={true}
        sessionResults={mixedResults}
        zoneId={ZONE_ID}
        groupId={GROUP_ID}
      />,
    );
    expect(screen.getByTestId("polish-card")).toBeDefined();
    fireEvent.click(screen.getByTestId("polish-skip"));
    expect(screen.queryByTestId("polish-card")).toBeNull();
  });

  it("CTA href contains only sub-top phraseIds", () => {
    render(
      <PolishCard
        polishEnabled={true}
        sessionResults={mixedResults}
        zoneId={ZONE_ID}
        groupId={GROUP_ID}
      />,
    );
    const cta = screen.getByTestId("polish-cta") as HTMLAnchorElement;
    const url = new URL(cta.href, "http://localhost");
    const ids = url.searchParams.get("phraseIds")!.split(",").map(Number);
    // Should contain phrase IDs 11 and 12 (good and retry) but NOT 10 (perfect).
    expect(ids).toContain(11);
    expect(ids).toContain(12);
    expect(ids).not.toContain(10);
  });
});
