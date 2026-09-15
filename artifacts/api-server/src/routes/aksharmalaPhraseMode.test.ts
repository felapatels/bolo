// THE CONTRIBUTION PAGE AND ITS ROUTER NEVER IMPORT EACH OTHER.
//
// aksharmala.html is a static file built from scripts/src/aksharmala.template.html,
// and the lesson phrase modes it gained on 2026-09-15 talk to routes/scriptTrace.ts
// across four strings nothing else checks: a path, a method, a header name, and
// the field names in a JSON body. Get one wrong and the page ships, typechecks,
// and every save answers 400 or 404 to a volunteer on a phone, who cannot tell a
// broken page from a bad connection. phraseVoices.test.ts proves the router; this
// proves the page speaks to the router it proves.
//
// PURE. Both files are read as text; no server, no database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mintContributionKey } from "../lib/contributionLinks";

const PAGE = readFileSync(
  resolve(import.meta.dirname, "../../../gujarati-coach/public/aksharmala.html"),
  "utf8",
);
const TEMPLATE = readFileSync(
  resolve(import.meta.dirname, "../../../../scripts/src/aksharmala.template.html"),
  "utf8",
);
const ROUTER = readFileSync(resolve(import.meta.dirname, "scriptTrace.ts"), "utf8");

/** "GET /script-trace/lesson-phrases" for every registration in the router. */
function registered(): Set<string> {
  const out = new Set<string>();
  for (const m of ROUTER.matchAll(/router\.(get|post)\(\s*["']([^"']+)["']/g)) {
    out.add(`${m[1]!.toUpperCase()} ${m[2]!}`);
  }
  return out;
}

/**
 * One zod schema's text in the router, from its name to the end of its object
 * literal, so a field is looked for in THAT schema and not in a later one.
 */
function schemaText(name: string): string {
  const start = ROUTER.indexOf(`const ${name} = z.object({`);
  assert.ok(start >= 0, `the router has no ${name}`);
  return ROUTER.slice(start, ROUTER.indexOf("\n});", start));
}

/** The text of the page's call for one path, from phApi( to the end of its body. */
function callSite(method: string, pathLiteral: string): string {
  const start = PAGE.indexOf(`phApi("${method}",${pathLiteral}`);
  assert.ok(start >= 0, `the page makes no ${method} call starting ${pathLiteral}`);
  return PAGE.slice(start, PAGE.indexOf(").then(", start));
}

test("every call the phrase modes make is a route the router registers", () => {
  const routes = registered();
  // Non-trivial first: an empty scan would make every check below vacuous.
  assert.ok(routes.size >= 8, `found only ${routes.size} routes; the scanner broke`);

  const calls: [method: string, pathLiteral: string, route: string][] = [
    ["GET", '"/api/script-trace/lesson-phrases?language="', "GET /script-trace/lesson-phrases"],
    ["POST", '"/api/script-trace/phrase-voice"', "POST /script-trace/phrase-voice"],
    ["GET", '"/api/script-trace/phrase-clips?language="', "GET /script-trace/phrase-clips"],
    ["GET", '"/api/script-trace/phrase-clips/"+id+"/audio?language="', "GET /script-trace/phrase-clips/:id/audio"],
    ["POST", '"/api/script-trace/phrase-verdict"', "POST /script-trace/phrase-verdict"],
  ];
  for (const [method, pathLiteral, route] of calls) {
    callSite(method, pathLiteral);
    assert.ok(routes.has(route), `the page calls ${route}, which the router does not register`);
  }
  // The negative control: the scanner must be able to say no.
  assert.ok(!routes.has("GET /script-trace/not-a-route"));
  assert.ok(!routes.has("GET /script-trace/phrase-voice"), "the scanner must tell methods apart");
});

test("the page sends the key in the header the router reads, and never in a URL it builds", () => {
  assert.match(ROUTER, /const CONTRIBUTION_KEY_HEADER = "X-Contribution-Key";/);
  assert.ok(PAGE.includes('headers:{"X-Contribution-Key":PH.key}'), "phApi no longer sends the key header");
  // The page reads key= from its own address; it must never write one.
  const script = PAGE.slice(PAGE.indexOf("var PH=(function(){"));
  assert.doesNotMatch(script, /["'&?]key=/, "a fetch path carries the key in its query string");
});

test("the body and query fields the page sends are the ones the routes parse", () => {
  const clip = callSite("POST", '"/api/script-trace/phrase-voice"');
  const clipSchema = schemaText("phraseVoiceBodySchema");
  for (const field of ["sessionId:", "contributor:", "language:", "zone:", "phraseId:", "audioBase64:", "mimeType:", "durationMs:"]) {
    assert.ok(clip.includes(field), `phrase-voice body lost ${field}`);
    assert.match(clipSchema, new RegExp(`\\n  ${field}`), `the phrase-voice route does not parse ${field}`);
  }
  const verdict = callSite("POST", '"/api/script-trace/phrase-verdict"');
  const verdictSchema = schemaText("phraseVerdictBodySchema");
  for (const field of ["sessionId:", "reviewer:", "language:", "clipId:", "verdict:", "note:"]) {
    assert.ok(verdict.includes(field), `phrase-verdict body lost ${field}`);
    assert.match(verdictSchema, new RegExp(`\\n  ${field}`), `the phrase-verdict route does not parse ${field}`);
  }
  // The bounded reader has to be able to say no, or every lookup above is vacuous.
  assert.doesNotMatch(clipSchema, /\n {2}clipId:/);
  assert.doesNotMatch(verdictSchema, /\n {2}audioBase64:/);
  // The two verdict words the buttons send are the two the route accepts.
  assert.ok(PAGE.includes('rvSend("approved"') && PAGE.includes('rvSend("rejected"'));
  assert.match(ROUTER, /verdict: z\.enum\(\["approved", "rejected"\]\)/);
  const queue = callSite("GET", '"/api/script-trace/phrase-clips?language="');
  for (const param of ['"&zone="', '"&sessionId="', '"&reviewer="']) {
    assert.ok(queue.includes(param), `the review queue call lost ${param}`);
  }
});

test("the page accepts every key the Nest can mint, and the language codes the router does", () => {
  const saved = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "seam-test-secret";
  try {
    const minted = mintContributionKey("review", "brx", Date.UTC(2026, 8, 15));
    assert.ok(minted);
    assert.ok(PAGE.includes("/^[\\x21-\\x7e]{1,64}$/.test(key)"), "the page's key guard changed; re-check it against minted keys");
    assert.match(minted.key, /^[\x21-\x7e]{1,64}$/);
  } finally {
    if (saved === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = saved;
  }
  assert.ok(PAGE.includes("/^[a-z_][a-z0-9_]{1,39}$/.test(lang)"));
  assert.ok(ROUTER.includes("z.string().regex(/^[a-z_][a-z0-9_]{1,39}$/"), "page and router disagree about a language code");
});

test("a visit without the phrase parameters sees none of it", () => {
  // The letters wizard is what every existing contributor opens. The phrase
  // sections must start hidden, and the script must leave before wiring
  // anything when the parameters are absent.
  for (const id of ["phintro", "phrec", "rvcheck", "phdone", "pherror"]) {
    assert.ok(PAGE.includes(`<section id="${id}" hidden>`), `#${id} is not hidden by default`);
  }
  assert.ok(PAGE.includes("if(!rec&&!rev)return null;"));
  assert.ok(PAGE.includes("if(PH){phBoot();return;}"));
  // And the early return sits before the welcome-back block, so that block
  // cannot press a script button behind a phrase screen.
  assert.ok(PAGE.indexOf("if(PH){phBoot();return;}") < PAGE.indexOf("* WELCOME BACK."));
});

test("the key never leaves the origin in a Referer", () => {
  assert.ok(PAGE.includes('<meta name="referrer" content="same-origin">'));
});

test("the committed page was rebuilt after the template's phrase modes", () => {
  // Not a byte comparison, which needs the alphabet build: the markers that
  // only the phrase modes contain must be in both files.
  for (const marker of ["var PH=(function(){", "function phBoot(){", 'id="rvcheck"', "function sittingId(key,prefix)"]) {
    assert.ok(TEMPLATE.includes(marker), `template lost ${marker}`);
    assert.ok(PAGE.includes(marker), `aksharmala.html is stale: rebuild with pnpm --filter @workspace/scripts build-aksharmala (${marker})`);
  }
});
