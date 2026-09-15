// THE NEST'S NATIVE VOICES SECTION STAYS WIRED, AND ITS LINKS STAY THE OWNER'S.
//
// Added 2026-09-15 with the contribution page's lesson phrase mode, under the
// CLAUDE.md rule that a feature the owner would watch ships with its number
// and its drill. nest.page.test.ts already holds every section to a page and a
// chip; this names the one section that carries capability links, because two
// of its properties are not structural and nothing else would notice them go:
//
//   - /nest/voices answers the OWNER ONLY. canReadNest also admits a relayed
//     fleet read, and a fleet key must never be a way to mint a link that
//     opens a language's recordings.
//   - "voices" is not a relay resource, for the same reason.
//
// PURE: the document and both route files are read as text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(resolve(here, "../../assets/nest-production.html"), "utf8");
const NEST = readFileSync(resolve(here, "nest.ts"), "utf8");
const FLEET = readFileSync(resolve(here, "../lib/nestFleet.ts"), "utf8");

test("the Voices section is on the Dashboard, jumps from its chip, and reads its route", () => {
  assert.match(HTML, /<section id="voices" data-page="dashboard">/);
  assert.match(HTML, /<a href="#voices">Voices<\/a>/);
  assert.ok(HTML.includes('var VOICES_URL = "/api/nest/voices";'));
  assert.ok(HTML.includes("loadVoices()") && HTML.includes("renderVoices()"), "voices is not in the refresh loop");
  // Its tiles jump to their rows; a data-metric would open the learner drill,
  // which cannot describe a speaker and answers 400 for an unknown metric.
  assert.ok(HTML.includes('tile(fmt(l.recorded) + " / " + fmt(l.phrases), "Recorded"'));
  assert.doesNotMatch(HTML, /data-metric="voices/);
});

test("the route is registered, expected at boot, and answers the owner only", () => {
  const start = NEST.indexOf('router.get("/nest/voices"');
  assert.ok(start >= 0, "/nest/voices is not registered");
  const handler = NEST.slice(start, NEST.indexOf("\n});", start));
  assert.ok(handler.includes("if (!isOwner((req as AuthedRequest).userId)) return notFound(res);"));
  assert.ok(!handler.includes("canReadNest("), "a relayed fleet read must not reach the link minter");

  const expected = /const EXPECTED_ROUTES = \[([\s\S]*?)\];/.exec(NEST);
  assert.ok(expected, "EXPECTED_ROUTES is gone");
  assert.ok(expected[1]!.includes('"/nest/voices"'), "/nest/voices is not in EXPECTED_ROUTES");
});

test("voices is not a fleet relay resource", () => {
  const resources = /const resources = new Set\(\[([^\]]*)\]\)/.exec(FLEET);
  assert.ok(resources, "the relay's resource list moved; re-point this test at it");
  // The reader must be able to see a resource that IS relayed, or the absence
  // below proves nothing.
  assert.ok(resources[1]!.includes('"reports"'));
  assert.ok(!resources[1]!.includes('"voices"'), "the fleet relay would expose recording links");
});
