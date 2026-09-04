/**
 * scriptTracePayload.test.ts
 *
 * The trace wire format, pinned WITHOUT a database.
 *
 * Its sibling, scriptTraceContributions.test.ts, exercises the same parser
 * through the HTTP endpoint and therefore needs the dev database, which means
 * it can only run in the Repl Shell. That is fine for the route's behaviour and
 * useless for iterating on the FORMAT, which is pure string work. So the format
 * lives here, where it runs on a laptop:
 *
 *   node --import tsx --test --experimental-test-module-mocks \
 *     src/test/scriptTracePayload.test.ts
 *
 * WHAT THESE PROTECT. bolo2 (2026-09-04) added a meta field and two optional
 * numbers per point so a stylus trace could be told from a fingertip. Every
 * contribution collected before that is bolo1 and must keep reading forever:
 * there is no migration and there should not be one, since re-encoding somebody
 * else's handwriting to a newer format only risks it.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  TracePayloadError,
  mergeTracePayloads,
  parseTracePayload,
} from "@workspace/script-trace";

describe("bolo1 still reads, and reads exactly as it did", () => {
  it("has no meta and bare points", () => {
    const p = parseTracePayload("bolo1|Gujarati|Nani|gu_a:20,30;20,70");
    assert.equal(p.meta, null);
    assert.deepEqual(p.glyphs[0]!.strokes[0]![0], { x: 20, y: 30 });
  });

  it("carries decimals, which is why raising the capture's precision needed no version bump", () => {
    const p = parseTracePayload("bolo1|Gujarati|Nani|gu_a:20.4,30.1;20.4,70.9");
    assert.deepEqual(p.glyphs[0]!.strokes[0]![0], { x: 20.4, y: 30.1 });
  });

  it("still merges two bolo1 payloads with a three-field header", () => {
    const merged = mergeTracePayloads(
      "bolo1|Gujarati|Nani|gu_a:1,1;2,2",
      "bolo1|Gujarati|Nani|gu_b:3,3;4,4",
    );
    assert.equal(merged.split("|").slice(0, 3).join("|"), "bolo1|Gujarati|Nani");
    assert.deepEqual(
      parseTracePayload(merged).glyphs.map((g) => g.id),
      ["gu_a", "gu_b"],
    );
  });
});

describe("bolo2 carries how the strokes were drawn", () => {
  it("reads the meta field", () => {
    const p = parseTracePayload("bolo2|Gujarati|Nani|pen,320,320,3|gu_a:1,1;2,2");
    assert.deepEqual(p.meta, { pointerType: "pen", padW: 320, padH: 320, dpr: 3 });
  });

  it("reads time and pressure off a point", () => {
    const p = parseTracePayload("bolo2|Gujarati|Nani|pen,320,320,3|gu_a:20.4,30.1,0,0.42;20.4,70.9,118,0.55");
    assert.deepEqual(p.glyphs[0]!.strokes[0], [
      { x: 20.4, y: 30.1, t: 0, pressure: 0.42 },
      { x: 20.4, y: 70.9, t: 118, pressure: 0.55 },
    ]);
  });

  it("takes time WITHOUT pressure, which is every finger and every mouse", () => {
    const p = parseTracePayload("bolo2|Gujarati|Nani|touch,300,300,2|gu_a:5,5,0;9,9,40");
    assert.deepEqual(p.glyphs[0]!.strokes[0], [
      { x: 5, y: 5, t: 0 },
      { x: 9, y: 9, t: 40 },
    ]);
  });

  it("takes pressure WITHOUT time, written as an empty third field", () => {
    const p = parseTracePayload("bolo2|Gujarati|Nani|pen,300,300,2|gu_a:1,1,,0.9;2,2,,0.8");
    assert.deepEqual(p.glyphs[0]!.strokes[0], [
      { x: 1, y: 1, pressure: 0.9 },
      { x: 2, y: 2, pressure: 0.8 },
    ]);
  });

  it("refuses a time that runs backwards, and a pressure outside 0..1", () => {
    assert.throws(
      () => parseTracePayload("bolo2|Gujarati|Nani|pen,300,300,2|gu_a:1,1,-5;2,2,10"),
      TracePayloadError,
    );
    assert.throws(
      () => parseTracePayload("bolo2|Gujarati|Nani|pen,300,300,2|gu_a:1,1,0,4;2,2,9,0.5"),
      TracePayloadError,
    );
  });

  it("treats unreadable meta as absent rather than fatal, because the strokes are the contribution", () => {
    const p = parseTracePayload("bolo2|Gujarati|Nani|nonsense|gu_a:1,1;2,2");
    assert.equal(p.meta, null);
    assert.equal(p.glyphs.length, 1);
  });

  it("normalises a pointer type it does not recognise instead of trusting it", () => {
    const p = parseTracePayload("bolo2|Gujarati|Nani|<script>,300,300,2|gu_a:1,1;2,2");
    assert.equal(p.meta!.pointerType, "unknown");
  });
});

describe("the mixed merge, which is what a returning contributor actually produces", () => {
  it("keeps the old bolo1 letters, takes the new bolo2 header, and loses nothing", () => {
    const merged = mergeTracePayloads(
      "bolo1|Gujarati|Nani|gu_a:20,30;20,70|gu_b:1,1;2,2",
      "bolo2|Gujarati|Nani|pen,320,320,3|gu_a:21.5,31.2,0,0.4;21.5,71.1,90,0.5",
    );
    const p = parseTracePayload(merged);

    assert.equal(merged.split("|").slice(0, 4).join("|"), "bolo2|Gujarati|Nani|pen,320,320,3");
    assert.deepEqual(p.meta, { pointerType: "pen", padW: 320, padH: 320, dpr: 3 });
    assert.deepEqual(
      p.glyphs.map((g) => g.id).sort(),
      ["gu_a", "gu_b"],
    );

    // The letter they redid takes the new capture, with its time and pressure.
    assert.deepEqual(p.glyphs.find((g) => g.id === "gu_a")!.strokes[0]![0], {
      x: 21.5,
      y: 31.2,
      t: 0,
      pressure: 0.4,
    });
    // The letter they did months ago survives untouched, still bare.
    assert.deepEqual(p.glyphs.find((g) => g.id === "gu_b")!.strokes[0], [
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]);
  });
});

describe("neither version accepts a payload it cannot read", () => {
  it("names both versions when the marker is something else", () => {
    assert.throws(() => parseTracePayload("bolo3|Gujarati|Nani|gu_a:1,1;2,2"), /bolo1.*bolo2|bolo2/);
  });

  it("refuses a bolo2 with a header and no letters", () => {
    assert.throws(() => parseTracePayload("bolo2|Gujarati|Nani|pen,300,300,2"), TracePayloadError);
  });
});
