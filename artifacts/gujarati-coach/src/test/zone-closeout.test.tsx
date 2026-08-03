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
    expect(screen.getByText("Before you roll on")).toBeInTheDocument();
    expect(screen.getByTestId("closeout-chat-cta")).toHaveAttribute(
      "href",
      "/chat?scenario=greetings-manners",
    );
    fireEvent.click(screen.getByTestId("closeout-later"));
    expect(screen.queryByTestId("zone-closeout-overlay")).not.toBeInTheDocument();
    expect(readCloseoutStages("gu")).toEqual({ 0: "done" });
  });

  test("no capstone scenario: skip finishes the closeout with no beat 2", () => {
    seedCloseoutStages("gu", []);
    renderOverlay([Z({ zoneIndex: 1, zoneId: 2, scenarioId: undefined })]);
    fireEvent.click(screen.getByTestId("closeout-skip"));
    expect(screen.queryByTestId("zone-closeout-overlay")).not.toBeInTheDocument();
    expect(readCloseoutStages("gu")).toEqual({ 1: "done" });
  });

  test("a zone already stamped skips beat 2 too", () => {
    seedCloseoutStages("gu", []);
    renderOverlay([Z({ hasStamp: true })]);
    fireEvent.click(screen.getByTestId("closeout-skip"));
    expect(screen.queryByTestId("zone-closeout-overlay")).not.toBeInTheDocument();
    expect(readCloseoutStages("gu")).toEqual({ 0: "done" });
  });

  test("a persisted beat2 stage resumes at the capstone offer", () => {
    seedCloseoutStages("gu", []);
    writeCloseoutStage("gu", 0, "beat2");
    renderOverlay([Z()]);
    expect(screen.getByTestId("closeout-beat2")).toBeInTheDocument();
  });

  test("a persisted beat2 stage with a stamp closes out silently", () => {
    seedCloseoutStages("gu", []);
    writeCloseoutStage("gu", 0, "beat2");
    renderOverlay([Z({ hasStamp: true })]);
    expect(screen.queryByTestId("zone-closeout-overlay")).not.toBeInTheDocument();
    expect(readCloseoutStages("gu")).toEqual({ 0: "done" });
  });
});
