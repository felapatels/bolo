// Chunk 2 Stage A (A1): cross-script transcript normalization test pins.
//
// Pins from the pre-built module's own TEST PINS block, plus the integration
// rules locked by the Chunk 2A rulings:
//  - bridge trigger: raw incomparable, or comparable with sim < 0.93;
//  - rescue-only: max(raw, bridged), the bridge never lowers an outcome;
//  - raw-incomparable pairs become comparable only at bridgedSim >= 0.45
//    (guard 1b's evidential bar); below that they stay nocatch so the A2
//    sidecar can record cause no_match_after_bridge;
//  - sibling (wrong-phrase) comparisons never bridge ({ noBridge: true });
//  - Perso-Arabic pairs are never faked: bridged=false, raw path kept.
//
// All similarity expectations here were measured empirically against the
// integrated module before being pinned (kema cho vs kaima cho = 0.778 etc.).

import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeForComparison, detectScheme } from "./crossScript";
import { applyScoreGuards, compareToTarget } from "./pronunciationGuards";

// ─── Module-level pins ────────────────────────────────────────────────────────

test("xscript: detectScheme identifies indic blocks, latin, perso-arabic, unknown", () => {
  assert.equal(detectScheme("કેમ છો"), "gujarati");
  assert.equal(detectScheme("कैसे हैं"), "devanagari");
  assert.equal(detectScheme("kem chho"), "latin");
  assert.equal(detectScheme("کیسے ہیں"), "perso-arabic");
  assert.equal(detectScheme("123 !!"), "unknown");
});

test("xscript: diacritic pin, namastē and नमस्ते meet as identical roman comparables", () => {
  const norm = normalizeForComparison("namastē", "नमस्ते");
  assert.equal(norm.bridged, true, "latin vs devanagari must bridge");
  assert.equal(norm.crossScript, true);
  assert.equal(
    norm.transcriptComparable,
    norm.targetComparable,
    `comparables must be equal, got "${norm.transcriptComparable}" vs "${norm.targetComparable}"`,
  );
  assert.equal(norm.transcriptComparable, "namaste");
});

test("xscript: same-script inputs, crossScript=false, raw strings returned untouched", () => {
  const norm = normalizeForComparison("નમસ્તે", "પાણી");
  assert.equal(norm.crossScript, false);
  assert.equal(norm.bridged, false);
  assert.equal(norm.transcriptComparable, "નમસ્તે");
  assert.equal(norm.targetComparable, "પાણી");
});

test("xscript: perso-arabic vs indic, bridged=false, no fake bridge", () => {
  const norm = normalizeForComparison("کیسے ہیں", "कैसे हैं");
  assert.equal(norm.crossScript, true);
  assert.equal(norm.bridged, false, "sanscript cannot bridge perso-arabic; must not pretend");
});

// ─── compareToTarget integration pins ────────────────────────────────────────

test("xscript: Gujarati transcript vs Devanagari target bridges and scores as a near-match", () => {
  // The module's own MUST-bridge pin: transcript "કેમ છો" vs target "कैम छो".
  const r = compareToTarget("કેમ છો", "कैम छो", "kem chho");
  assert.equal(r.comparable, true, "bridged cross-script pair must become comparable");
  assert.ok(r.sim >= 0.7, `expected near-match sim >= 0.7, got ${r.sim}`);
  assert.ok(r.bridge, "bridge metadata must be present");
  assert.equal(r.bridge!.bridged, true);
  assert.equal(r.bridge!.rawComparable, false, "raw path cannot compare gu-script vs dev-script");
  assert.equal(r.sim, r.bridge!.bridgedSim, "final sim must be the bridged sim");
});

test("xscript: raw-incomparable pair with low bridged sim stays incomparable (nocatch)", () => {
  // Unrelated content across scripts: bridged=true but bridgedSim ~0.2, well
  // below the 0.45 evidence floor. Must stay comparable=false so the guard
  // resolves nocatch; A2 records this as cause no_match_after_bridge.
  const r = compareToTarget("પાણી", "धन्यवाद", "dhanyavaad");
  assert.equal(r.comparable, false);
  assert.equal(r.sim, 0);
  assert.ok(r.bridge, "bridge metadata must be present for the A2 sidecar");
  assert.equal(r.bridge!.bridged, true);
  assert.ok(
    r.bridge!.bridgedSim !== null && r.bridge!.bridgedSim < 0.45,
    `bridgedSim must be below the 0.45 evidence floor, got ${r.bridge!.bridgedSim}`,
  );
});

test("xscript: same-script raw path untouched, strong match skips the bridge entirely", () => {
  const r = compareToTarget("નમસ્તે", "નમસ્તે", "namaste");
  assert.equal(r.comparable, true);
  assert.equal(r.sim, 1);
  assert.equal(r.bridge, undefined, "sim >= 0.93 must skip the bridge (Ruling 2)");
});

test("xscript: latin transcript already 1.0 on the raw path skips the bridge", () => {
  // normalizeLatin strips diacritics, so the raw path scores this 1.0 and the
  // bridge is never attempted (pure-waste avoidance).
  const r = compareToTarget("namastē", "नमस्ते", "namaste");
  assert.equal(r.comparable, true);
  assert.equal(r.sim, 1);
  assert.equal(r.bridge, undefined);
});

test("xscript: rescue-only, bridged sim lower than raw never lowers the outcome", () => {
  // Latin gibberish vs a native target: raw is comparable (sim 0 against the
  // romanized target) and the bridge also fails to help. Result must equal the
  // raw result, never below it.
  const withBridge = compareToTarget("hello world", "નમસ્તે", "namaste");
  const rawOnly = compareToTarget("hello world", "નમસ્તે", "namaste", { noBridge: true });
  assert.equal(withBridge.comparable, rawOnly.comparable);
  assert.ok(withBridge.sim >= rawOnly.sim, "bridge must never lower sim");
  assert.equal(withBridge.sim, rawOnly.sim);

  // Property across a spread of cases: bridged result >= raw-only result.
  const cases: Array<[string, string, string]> = [
    ["કેમ છો", "कैम छो", "kem chho"],
    ["પાણી", "धन्यवाद", "dhanyavaad"],
    ["kem cho", "કેમ છો", "kem chho"],
    ["નમસ્તે", "નમસ્તે", "namaste"],
    ["کیسے ہیں", "कैसे हैं", "kaise hain"],
  ];
  for (const [t, n, rz] of cases) {
    const bridged = compareToTarget(t, n, rz);
    const raw = compareToTarget(t, n, rz, { noBridge: true });
    assert.ok(
      bridged.sim >= raw.sim,
      `rescue-only violated for "${t}" vs "${n}": bridged ${bridged.sim} < raw ${raw.sim}`,
    );
    if (raw.comparable) {
      assert.equal(bridged.comparable, true, "bridge must never revoke comparability");
    }
  }
});

test("xscript: noBridge opt-out returns the pure raw result (sibling checks)", () => {
  const r = compareToTarget("કેમ છો", "कैम छो", "kem chho", { noBridge: true });
  assert.equal(r.comparable, false, "sibling comparisons must not bridge");
  assert.equal(r.sim, 0);
  assert.equal(r.bridge, undefined);
});

// ─── Guard-level pins ─────────────────────────────────────────────────────────

test("xscript: bridged near-match no longer resolves script-mismatch nocatch", () => {
  const guarded = applyScoreGuards({
    score: 85,
    passed: true,
    transcript: "કેમ છો",
    targetNative: "कैम छो",
    targetRomanized: "kem chho",
  });
  assert.notEqual(guarded.guard, "script-mismatch-nocatch");
  assert.ok(!guarded.nocatch, "a bridged near-match must be scoreable, not nocatch");
  assert.equal(guarded.passed, true);
});

test("xscript: unrelated cross-script content still resolves nocatch", () => {
  const guarded = applyScoreGuards({
    score: 85,
    passed: true,
    transcript: "પાણી",
    targetNative: "धन्यवाद",
    targetRomanized: "dhanyavaad",
  });
  assert.equal(guarded.guard, "script-mismatch-nocatch");
  assert.equal(guarded.nocatch, true);
  assert.equal(guarded.score, 0);
});
