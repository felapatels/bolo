import { describe, test, expect } from "vitest";
import {
  outcomeStillId,
  storyBookFor,
  storyEnding,
  storyShareDomain,
  storyShareFileName,
  storySharePlan,
  storyShareStillIds,
  withoutMissingStills,
  STORY_SHARE_BRAND,
  type LedgerEntry,
  type StoryBook,
} from "@workspace/story";

// THE SHARE PICTURE'S CONTENTS (owner, 2026-09-16: "add a share button to
// share the story once its done as an image file"). The phone and the web draw
// it with two unrelated renderers, so what goes in and in what order is pinned
// here, once, rather than in two screen suites that could each drift.

const BOOK = storyBookFor(1, 1)!;

/** A read of book 1 taking the line at `pick(i)` on every scene. */
function readWith(pick: (scene: StoryBook["scenes"][number]) => string): LedgerEntry[] {
  return BOOK.scenes.map((scene) => {
    const concept = pick(scene);
    const choice = scene.choices.find((c) => c.concept === concept)!;
    return { sceneId: scene.id, concept, fitted: choice.fits };
  });
}

const phraseFor = (concept: string) => ({
  nativeScript: `native:${concept}`,
  english: `english:${concept}`,
});

describe("storySharePlan", () => {
  test("title, the earned ending, then every outcome in the order it was caused, each with its line", () => {
    const entries = readWith((sc) => sc.choices.find((c) => !c.fits)!.concept);
    const plan = storySharePlan(BOOK, entries, phraseFor, "bolo.example");

    expect(plan.title).toBe(BOOK.title);
    const ending = storyEnding(BOOK, entries)!;
    expect(plan.ending).toEqual({ stillId: ending.stillId, situation: ending.situation });
    expect(plan.panels).toHaveLength(entries.length);
    plan.panels.forEach((panel, i) => {
      const e = entries[i]!;
      expect(panel.still?.stillId).toBe(outcomeStillId(e.sceneId, e.concept));
      expect(panel.line).toEqual({
        nativeScript: `native:${e.concept}`,
        english: `english:${e.concept}`,
      });
    });
    expect(storyShareStillIds(plan)).toEqual([
      ending.stillId,
      ...entries.map((e) => outcomeStillId(e.sceneId, e.concept)),
    ]);
  });

  test("a book with no ending art has no ending, and never asks for one", () => {
    const noEndings: StoryBook = { ...BOOK, endings: undefined };
    const entries = readWith((sc) => sc.choices[0]!.concept);
    const plan = storySharePlan(noEndings, entries, phraseFor, "bolo.example");
    expect(plan.ending).toBeNull();
    expect(storyShareStillIds(plan)).toHaveLength(entries.length);
  });

  test("a line the corpus did not return prints nothing, never the concept key", () => {
    const entries = readWith((sc) => sc.choices[0]!.concept);
    const gone = entries[1]!.concept;
    const plan = storySharePlan(
      BOOK,
      entries,
      (c) => (c === gone ? undefined : phraseFor(c)),
      "bolo.example",
    );
    expect(plan.panels[1]!.line).toBeNull();
    expect(plan.panels[1]!.still).not.toBeNull();
    expect(JSON.stringify(plan)).not.toContain(`"${gone}"`);
  });

  test("a beat with no picture and no line is left out entirely", () => {
    const entries: LedgerEntry[] = [
      { sceneId: "no-such-scene", concept: "nothing", fitted: false },
      ...readWith((sc) => sc.choices[0]!.concept).slice(0, 1),
    ];
    const plan = storySharePlan(BOOK, entries, (c) => (c === "nothing" ? null : phraseFor(c)), null);
    expect(plan.panels).toHaveLength(1);
    expect(plan.panels[0]!.key).toBe(`${entries[1]!.sceneId}-1`);
  });

  test("carries no personal data: only the book, the lines, the brand and the domain", () => {
    const entries = readWith((sc) => sc.choices[0]!.concept);
    const plan = storySharePlan(BOOK, entries, phraseFor, "https://bolo.example/");
    expect(Object.keys(plan).sort()).toEqual(["bookId", "ending", "footer", "panels", "title"]);
    expect(plan.footer).toEqual({ brand: STORY_SHARE_BRAND, domain: "bolo.example" });
  });
});

describe("withoutMissingStills", () => {
  const entries = readWith((sc) => sc.choices[0]!.concept);
  const plan = storySharePlan(BOOK, entries, phraseFor, "bolo.example");

  test("a still that failed is left out, never a box, and its line stays", () => {
    const lost = plan.panels[2]!.still!.stillId;
    const out = withoutMissingStills(plan, new Set([lost, plan.ending!.stillId]));
    expect(out.ending).toBeNull();
    expect(out.panels).toHaveLength(plan.panels.length);
    expect(out.panels[2]!.still).toBeNull();
    expect(out.panels[2]!.line).toEqual(plan.panels[2]!.line);
    expect(storyShareStillIds(out)).not.toContain(lost);
    // The input is not edited in place.
    expect(plan.panels[2]!.still).not.toBeNull();
  });

  test("a panel left with nothing at all is dropped, and the order holds", () => {
    const bare = storySharePlan(BOOK, entries, () => undefined, "bolo.example");
    const lost = bare.panels[0]!.still!.stillId;
    const out = withoutMissingStills(bare, new Set([lost]));
    expect(out.panels.map((p) => p.key)).toEqual(bare.panels.slice(1).map((p) => p.key));
  });
});

describe("the footer and the file", () => {
  test("the domain is whatever the app is served from, reduced to a host", () => {
    expect(storyShareDomain("bolo-europe.app")).toBe("bolo-europe.app");
    expect(storyShareDomain("https://example.org/path?q=1")).toBe("example.org");
    expect(storyShareDomain("localhost:5173")).toBe("localhost:5173");
    expect(storyShareDomain("  ")).toBeNull();
    expect(storyShareDomain(undefined)).toBeNull();
  });

  test("the file is a png named for the book", () => {
    expect(storyShareFileName(plan())).toBe(`bolo-story-${BOOK.id}.png`);
    function plan() {
      return storySharePlan(BOOK, [], phraseFor, null);
    }
  });
});
