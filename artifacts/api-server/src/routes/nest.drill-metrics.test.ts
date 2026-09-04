// THE COCKPIT AND THE SERVER MUST AGREE ABOUT METRIC NAMES.
//
// Every Numbers tile on the Nest carries a `data-metric`, and clicking it opens
// the drill panel for that name. A tile whose name the server does not know
// answers 400, which reads as a broken page rather than a missing case, and
// nothing else in the app would ever notice: the Nest has no user to complain.
//
// This is the same shape as nest.page.test.ts, which holds the sections and the
// chip nav to each other in both directions, and it exists for the same reason.
// PURE: it reads the shipped document off disk and the exported map, so it runs
// on a Mac without a database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DRILL_METRICS } from "../lib/nestDrillMetrics";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(
  resolve(here, "../../assets/nest-production.html"),
  "utf8",
);

/** Every metric name the document asks the drill panel for. */
function metricsInDocument(): string[] {
  const out = new Set<string>();
  // The tiles built by the helper: data-metric="' + esc(metric) + '"
  for (const m of html.matchAll(/data-metric="([a-zA-Z]+)"/g)) out.add(m[1]!);
  return [...out];
}

test("every metric the cockpit asks for is one the server answers", () => {
  const unknown = metricsInDocument().filter((m) => !DRILL_METRICS[m]);
  assert.deepEqual(
    unknown,
    [],
    "These tiles would answer 400 on click. Add them to DRILL_METRICS in routes/nest.ts.",
  );
});

test("the letter drill and both gift metrics are on the page", () => {
  // Named one by one rather than counted, because a count passes when a metric
  // is swapped for another. These three are the ones the letter stop and the
  // daily gift owe the Nest, and the rule is that shipping a feature the owner
  // would want to watch includes its number and its drill.
  for (const metric of ["letterDrills", "giftsToday", "giftRuns"]) {
    assert.ok(DRILL_METRICS[metric], `${metric} missing from DRILL_METRICS`);
    assert.ok(
      html.includes(`"${metric}"`),
      `${metric} has a drill but no tile on the cockpit`,
    );
  }
});

test("every metric the server answers has a note that says what it counts", () => {
  // The drill panel prints this note. An empty one is a number with no
  // definition, which on a page whose whole job is telling the truth is worse
  // than no number.
  for (const [name, def] of Object.entries(DRILL_METRICS)) {
    assert.ok(def.label.length > 0, `${name} has no label`);
    assert.ok(def.note.length > 20, `${name} has no useful note`);
  }
});
