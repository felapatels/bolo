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
  // take: since the 2026-09-15 review (finding 1), a verdict names the recording it judges.
  for (const field of ["sessionId:", "reviewer:", "language:", "clipId:", "take:", "verdict:", "note:"]) {
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

test("a verdict carries the take the page was handed with the audio, and a replaced take is handled", () => {
  // THE REVIEW'S FINDING 1 (2026-09-15): a re-record keeps the clip id and the
  // page caches audio for the visit, so a verdict tied only to the id could
  // land on a recording the reviewer never heard. phraseVoices.test.ts proves
  // the server refuses a stale take under a lock; this proves the page is
  // holding up its end of the same four strings.
  const VOICES = readFileSync(resolve(import.meta.dirname, "../lib/phraseVoices.ts"), "utf8");

  // The server hands the take out with BOTH audio formats, so a phone on the
  // WAV fallback judges with the same take as one playing the original.
  const audioRoute = ROUTER.slice(
    ROUTER.indexOf('"/script-trace/phrase-clips/:id/audio"'),
    ROUTER.indexOf('"/script-trace/phrase-verdict"'),
  );
  assert.ok(audioRoute.length > 0, "could not find the audio route");
  assert.equal(audioRoute.split("take: clip.take").length - 1, 2, "both audio answers must carry take");

  // One SQL definition of the take, used by the read that serves it and the
  // read that checks it, so they cannot hash different things.
  assert.equal(VOICES.split("encode(sha256(convert_to(").length - 1, 1, "the take must be defined once");
  assert.equal(VOICES.split("take: takeHashSql()").length - 1, 2, "serve and check must share the definition");
  // The check reads under a lock the re-record's upsert conflicts with.
  const store = VOICES.slice(VOICES.indexOf("export async function storeVerdict("));
  assert.ok(store.includes('.for("share")'), "storeVerdict no longer locks the clip row");
  assert.ok(store.indexOf('.for("share")') < store.indexOf(".insert(voiceContributionReviewsTable)"), "lock before the write");

  // sha256 hex is 64 characters; the route refuses anything else.
  assert.match(schemaText("phraseVerdictBodySchema"), /\n {2}take: z\.string\(\)\.regex\(\/\^\[0-9a-f\]\{64\}\$\//);

  // The page keeps the take beside the audio, and sends the take of what is on the player.
  assert.ok(PAGE.includes('rvCache[k]={url:url,take:res.json.take||""};'), "the page no longer keeps the take with the audio");
  assert.ok(PAGE.includes("a.src=got.url;rvTake=got.take;"), "the player's take is not the one its audio came with");
  assert.ok(callSite("POST", '"/api/script-trace/phrase-verdict"').includes("take:rvTake"));

  // A replaced take answers take_changed, and the page tells it apart from a
  // self-review, which is the other 409 and would otherwise swallow it.
  assert.ok(ROUTER.includes('code: "take_changed"'));
  const handled = PAGE.indexOf('if(res.status===409&&res.json.code==="take_changed"){rvRetake(q);return false;}');
  const ownRecording = PAGE.indexOf('if(res.status===409){note("rvsavenote","This is your own recording');
  assert.ok(handled >= 0, "the page does not handle take_changed");
  assert.ok(ownRecording >= 0, "could not find the self-review branch");
  assert.ok(handled < ownRecording, "take_changed must be checked before the generic 409");
  // And it forgets both cached copies before loading the new recording.
  const retake = PAGE.slice(PAGE.indexOf("function rvRetake(q){"), PAGE.indexOf("function rvNext(){"));
  assert.ok(retake.includes('delete rvCache[id];delete rvCache[id+":wav"];') && retake.includes("rvAudio(id);"));
});

test("the answer buttons stay disabled until the recording has actually played", () => {
  // THE REVIEW'S FINDING 2 (2026-09-15): Sounds right worked while the take
  // was still loading and after the page said this phone could not play it,
  // because rvDraw never disabled it and rvBusy(false) enabled it outright. One
  // approval approves. Text pins, like the rest of this file: they cannot play
  // audio, but they fail on the shape of that bug coming back.
  const script = PAGE.slice(PAGE.indexOf("var PH=(function(){"));
  const ANSWERS = ["rvyes", "rvno", "rvwhysend"];
  /** One function's text, from its name to the next top-level function of the page script. */
  const fn = (name: string) => {
    const start = script.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `the page has no ${name}`);
    const end = script.indexOf("\n  function ", start + 1);
    assert.ok(end > start, `could not find the end of ${name}`);
    return script.slice(start, end);
  };

  // Disabled in the markup, so nothing is live before the first draw.
  for (const id of ANSWERS) {
    assert.match(PAGE, new RegExp(`<button [^>]*id="${id}"[^>]*\\bdisabled>`), `#${id} does not start disabled`);
  }
  assert.ok(PAGE.includes("Play the recording, then answer:"), "the page no longer says why the answers wait");

  // One function sets their disabled state, from whether the take was heard.
  const arm = fn("rvArm");
  assert.ok(arm.includes("var shut=rvSending||!rvHeard;"));
  assert.ok(arm.includes('["rvyes","rvno","rvwhysend"].forEach(function(id){$(id).disabled=shut;});'));
  assert.equal(fn("rvBusy").trim(), "function rvBusy(b){rvSending=b;rvArm();}", "rvBusy must not set the answer buttons itself");

  // THE CENSUS. Outside rvArm, every mention of an answer button is a listener
  // or its aria-pressed, never a disabled write. rvBusy's old
  // ["rvyes","rvno",...].forEach(...disabled=b) fails here.
  const armStart = script.indexOf("function rvArm(");
  const armEnd = armStart + arm.length;
  for (const id of ANSWERS) {
    const mentions = [...script.matchAll(new RegExp(`"${id}"`, "g"))].map((m) => m.index!);
    assert.ok(mentions.length >= 2, `found ${mentions.length} mentions of ${id}; the census broke`);
    for (const at of mentions) {
      if (at > armStart && at < armEnd) continue;
      const tail = script.slice(at, at + 48);
      assert.match(tail, new RegExp(`^"${id}"\\)\\.(addEventListener|setAttribute)\\(`), `${id} is touched outside rvArm: ${tail}`);
    }
  }

  // Heard is set in ONE place, only when the player's clock moved while it was
  // playing, and never by a mere play request.
  assert.equal(script.split("rvHeard=true").length - 1, 1, "rvHeard is set in more than one place");
  const heardAt = script.indexOf("rvHeard=true");
  const listenerAt = script.lastIndexOf('["timeupdate","ended"].forEach(', heardAt);
  assert.ok(listenerAt >= 0 && heardAt - listenerAt < 300, "rvHeard=true is not inside the playback progress listener");
  const listener = script.slice(listenerAt, heardAt);
  assert.ok(listener.includes("a.currentTime>0") && listener.includes('(ev==="ended"||!a.paused)'));
  assert.doesNotMatch(script, /addEventListener\("play",[^\n]*rvHeard/, "a play request is not a playback");

  // And every way a take stops being the heard one puts the answers back to waiting.
  for (const name of ["rvAudio", "rvSetAudio", "rvCannotPlay"]) {
    assert.ok(fn(name).includes("rvHeard=false;rvArm();"), `${name} leaves the answers live`);
  }
  assert.ok(
    fn("rvSetAudio").includes("a.onerror=function(){if(rvAudioFor!==id)return;rvReady=false;rvHeard=false;rvArm();"),
    "a player error leaves the answers live",
  );
  assert.ok(fn("rvDraw").includes("rvAudio(q.clip.clipId);"), "a drawn clip no longer starts from unheard");
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
