import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MANUAL_APPENDS_PER_HOUR,
  PHRASE_CEILINGS,
  countVisiblePhrases,
  phraseCeilingForPlan,
  remainingHeadroom,
} from "./phraseCeilings";

// The ceiling resolver is the single source of truth shared by the manual
// append endpoint and the background replenisher. These are pure units: no DB,
// no Express. The counting BASIS is what regressed before, so it is pinned
// here rather than inferred from route behaviour.

const row = (premium: boolean, stage: "phrase" | "sentence" = "phrase") => ({
  premium,
  stage,
});

test("ceilings by plan: 20 starter, 60 on the extended library", () => {
  assert.equal(phraseCeilingForPlan("free"), 20);
  // One Language buys more languages, not a bigger library, so the same 20.
  assert.equal(phraseCeilingForPlan("one_language"), 20);
  assert.equal(phraseCeilingForPlan("plus"), 60);
  // Family membership resolves to the `plus` plan per request, so Family
  // inherits 60 without a separate entry.
  assert.deepEqual(Object.keys(PHRASE_CEILINGS).sort(), [
    "free",
    "one_language",
    "plus",
  ]);
});

test("the ceiling counts only rows the caller can see", () => {
  const rows = [
    row(false),
    row(false),
    row(true),
    row(true),
    row(true),
  ];
  // A Free learner sees 2 of these 5. Counting all 5 is the units defect that
  // made every Free top-up bail on live topics.
  assert.equal(countVisiblePhrases(rows, "free"), 2);
  assert.equal(countVisiblePhrases(rows, "one_language"), 2);
  assert.equal(countVisiblePhrases(rows, "plus"), 5);
});

test("sentence-stage rows never count toward the phrase ceiling", () => {
  const rows = [row(false), row(false), row(false, "sentence"), row(true, "sentence")];
  assert.equal(countVisiblePhrases(rows, "plus"), 2);
  assert.equal(countVisiblePhrases(rows, "free"), 2);
});

test("headroom clamps instead of refusing near the boundary", () => {
  // 18 of 20 used: a batch of 3 is trimmed to 2 rather than refused.
  assert.equal(remainingHeadroom(18, "free"), 2);
  assert.equal(Math.min(3, remainingHeadroom(18, "free")), 2);
  // Exactly at the ceiling is the only refusal.
  assert.equal(remainingHeadroom(20, "free"), 0);
  assert.equal(remainingHeadroom(20, "plus"), 40);
  // Over the ceiling (legacy rows, or a ceiling lowered later) never goes
  // negative: it must read as full, not as negative headroom.
  assert.equal(remainingHeadroom(75, "plus"), 0);
});

test("manual appends are bounded at ten per rolling hour", () => {
  assert.equal(MANUAL_APPENDS_PER_HOUR, 10);
});
