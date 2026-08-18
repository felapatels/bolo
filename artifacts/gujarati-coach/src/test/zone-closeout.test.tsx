import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// Chunk 6B Story 4: the zone closeout two-beat overlay. Pins:
// (1) first sight seeds already-done zones straight to "done" (no
//     retro-celebration);
// (2) beat 1 celebrates with the arrival fact and the plan-split game CTA
//     (Plus -> Speed Round, free -> Express Listening pinned to the zone);
// (3) beat 1's skip advances to beat 2 only when a capstone scenario exists
//     and the zone has no stamp yet; otherwise the closeout finishes quietly;
// (4) beat 2 offers the capstone chat and "Maybe later" finishes the state
//     machine (nothing ever gates the map);
// (5) a persisted "beat2" stage resumes at beat 2 on the next visit.

const h = vi.hoisted(() => ({ isPlus: false as boolean | undefined }));

vi.mock("@/lib/entitlements", () => ({
  useEntitlements: () => ({ isPlus: h.isPlus, isLoading: false }),
}));

vi.mock("@/components/mascot", () => ({ Mascot: () => null }));

import {
  ZoneCloseoutOverlay,
  type CloseoutZone,
} from "@/components/zone-closeout";
import {
  readCloseoutStages,
  seedCloseoutStages,
  writeCloseoutStage,
} from "@/lib/quick-games";

const Z = (over: Partial<CloseoutZone> = {}): CloseoutZone => ({
  zoneIndex: 0,
  zoneId: 1,
  geoName: "Ahmedabad",
  title: "Greetings & Manners",
  allDone: true,
  scenarioId: "greetings-manners",
  hasStamp: false,
  ...over,
});

function renderOverlay(zones: CloseoutZone[]) {
  const { hook } = memoryLocation({ path: "/journey" });
  return render(
    <Router hook={hook}>
      <ZoneCloseoutOverlay lang="gu" lineName="Gujarat Express" accent="#e11d48" zones={zones} />
    </Router>,
  );
}

beforeEach(() => {
  h.isPlus = false;
  localStorage.removeItem("bolo-zone-closeout:gu");
});

describe("seeding on first sight", () => {
  test("zones already complete when the feature first ships never celebrate", () => {
    renderOverlay([Z()]);
    expect(screen.queryByTestId("zone-closeout-overlay")).not.toBeInTheDocument();
    expect(readCloseoutStages("gu")).toEqual({ 0: "done" });
  });
});

describe("beat 1: celebration + game CTA", () => {
  test("a newly-done zone celebrates with the arrival fact and the free game CTA", () => {
    seedCloseoutStages("gu", []);
    renderOverlay([Z()]);
    expect(screen.getByTestId("closeout-beat1")).toBeInTheDocument();
    expect(screen.getByText("Zone 1 complete!")).toBeInTheDocument();
    expect(screen.getByTestId("closeout-arrival-fact").textContent!.length).toBeGreaterThan(0);
    // Free riders celebrate with Express Listening pinned to the zone topic.
    expect(screen.getByTestId("closeout-game-cta")).toHaveAttribute(
      "href",
      "/games/express-listening?cat=1&ctx=closeout",
    );
    expect(screen.getByText("Celebrate with Express Listening")).toBeInTheDocument();
  });

  test("Plus riders celebrate with a Speed Round", () => {
    h.isPlus = true;
    seedCloseoutStages("gu", []);
    renderOverlay([Z()]);
    expect(screen.getByTestId("closeout-game-cta")).toHaveAttribute(
      "href",
      "/games/speed-round?ctx=closeout",
    );
  });

  test("launching the game parks the zone at beat2 for the return visit", () => {
    seedCloseoutStages("gu", []);
    renderOverlay([Z()]);
    fireEvent.click(screen.getByTestId("closeout-game-cta"));
    expect(readCloseoutStages("gu")[0]).toBe("beat2");
  });
});

describe("beat 2: capstone offer", () => {
  test("skip advances to the capstone offer and Maybe later finishes", () => {
    seedCloseoutStages("gu", []);
    renderOverlay([Z()]);
    fireEvent.click(screen.getByTestId("closeout-skip"));
    expect(screen.getByTestId("closeout-beat2")).toBeInTheDocument();
    // Copy changed Aug 18 2026: the capstone is framed as a test, not a treat.
    // The words appear twice, as the heading and on the CTA, so this asserts
    // the CTA specifically rather than a bare text match.
    expect(screen.getByTestId("closeout-chat-cta")).toHaveTextContent(
      "Test your knowledge",
    );
    expect(screen.getByTestId("closeout-chat-cta")).toHaveAttribute(
      "href",
      "/chat?scenario=greetings-manners",
    );
    fireEvent.click(screen.getByTestId("closeout-later"));
    expect(screen.queryByTestId("zone-closeout-overlay")).not.toBeInTheDocument();
    expect(readCloseoutStages("gu")).toEqual({ 0: "done" });
  });

  // INVERTED Aug 18 2026, twins converged. These three asserted that beat 2 was
  // SKIPPED whenever there was no capstone to offer, which meant five of six
  // zones ended on silence the moment the closeout game was over. Beat 2 now
  // always runs; what changes is what it says. The old expectations are kept
  // here as their opposites rather than deleted, because the thing they were
  // really protecting -- that the stage machine always reaches "done" and never
  // blocks the map -- still holds and is still asserted.
  test("no capstone scenario: skip still reaches beat 2, offering the wallet", () => {
    seedCloseoutStages("gu", []);
    renderOverlay([Z({ zoneIndex: 1, zoneId: 2, scenarioId: undefined })]);
    fireEvent.click(screen.getByTestId("closeout-skip"));
    expect(screen.getByTestId("closeout-beat2")).toBeInTheDocument();
    expect(screen.getByTestId("closeout-wallet-cta")).toBeInTheDocument();
    // No capstone means no chat CTA, which is the half that did change.
    expect(screen.queryByTestId("closeout-chat-cta")).not.toBeInTheDocument();
    expect(readCloseoutStages("gu")).toEqual({ 1: "beat2" });
  });

  test("a zone already stamped gets the wallet beat, not the capstone again", () => {
    seedCloseoutStages("gu", []);
    renderOverlay([Z({ hasStamp: true })]);
    fireEvent.click(screen.getByTestId("closeout-skip"));
    expect(screen.getByTestId("closeout-beat2")).toBeInTheDocument();
    // A learner who already had the conversation is not asked to have it again.
    expect(screen.queryByTestId("closeout-chat-cta")).not.toBeInTheDocument();
    expect(screen.getByTestId("closeout-wallet-cta")).toBeInTheDocument();
  });

  test("dismissing the wallet beat still closes the zone out", () => {
    // The guarantee the deleted assertions were really about: every path
    // through beat 2 reaches "done" and never blocks the map.
    seedCloseoutStages("gu", []);
    renderOverlay([Z({ hasStamp: true })]);
    fireEvent.click(screen.getByTestId("closeout-skip"));
    fireEvent.click(screen.getByTestId("closeout-later"));
    expect(screen.queryByTestId("zone-closeout-overlay")).not.toBeInTheDocument();
    expect(readCloseoutStages("gu")).toEqual({ 0: "done" });
  });

  test("a persisted beat2 stage resumes at the capstone offer", () => {
    seedCloseoutStages("gu", []);
    writeCloseoutStage("gu", 0, "beat2");
    renderOverlay([Z()]);
    expect(screen.getByTestId("closeout-beat2")).toBeInTheDocument();
  });

  test("a persisted beat2 stage with a stamp resumes at the wallet beat", () => {
    // INVERTED with the two above: this used to close out silently.
    seedCloseoutStages("gu", []);
    writeCloseoutStage("gu", 0, "beat2");
    renderOverlay([Z({ hasStamp: true })]);
    expect(screen.getByTestId("closeout-beat2")).toBeInTheDocument();
    expect(screen.getByTestId("closeout-wallet-cta")).toBeInTheDocument();
  });
});
