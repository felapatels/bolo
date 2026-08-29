import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CALL_BEATS, CALL_NOTHING_HEARD, JOURNEY_BEATS } from "../lib/chachaCallScript";
import { CHACHA_CALL_CHAI_MAX } from "../lib/tokenEconomy";

// startCall() below opens a JOURNEY call, so every walk-the-whole-call loop
// counts the journey's beats.
//
// THEY COUNTED CALL_BEATS UNTIL 2026-08-28, and four tests in this file had
// been red since e9889464. CALL_BEATS is every beat that EXISTS, and that
// commit grew it from six to twelve by writing six more questions; the journey
// still asks five. The loops kept driving turns past the end of the call and
// reading a 409 as a regression.
const JOURNEY_TURNS = JOURNEY_BEATS.length - 1;
import type { ChachaCallDeps } from "./chachaCall";
import type { LiveTurnResult } from "../lib/chachaCallTurn";

// Route-level tests for Chacha-ji's phone call.
//
// @workspace/db and the audio client both THROW AT IMPORT when their env vars
// are missing, and ESM hoists static imports above any assignment here, so the
// router is pulled in dynamically after the dummies are set. Nothing in this
// file opens a socket to either: every dep is injected, and the pool is never
// asked for a connection. That is what lets these run on a laptop.

const USER = "test_chacha_call";
const OTHER = "test_chacha_call_other";
const CLIP = Buffer.from("a pretend wav").toString("base64");

let app: Express;
let server: Server;
let baseUrl: string;
let currentUser: string | null = USER;

let liveResult: LiveTurnResult | null;
let liveError: Error | null;
let warmed = 0;
let logged: Array<{ level: string; obj: unknown; msg: string }> = [];
let cannedCalls: string[] = [];
let chaiGrants: Array<{ callId: string; turnIndex: number }> = [];
let xpGrants: Array<{ languageCode: string; turnIndex: number }> = [];
/** Set to make the ledger report "already credited", as a retry would. */
let rewardAlreadyGranted = false;
/** What STT hears on a CANNED beat, where no live turn runs. */
let lateTranscript = "chalo chacha-ji";
let getChatAudioStream: (id: string) => { chunks: Buffer[]; done: boolean; failed: boolean } | undefined;

function makeLive(over: Partial<LiveTurnResult> = {}): LiveTurnResult {
  return {
    chachaText: "Waah beta, bahut accha!",
    learnerText: "roti aur dal",
    mp3: Buffer.from("fake-mp3-bytes"),
    spokenSeconds: 4.5,
    ...over,
  };
}

before(async () => {
  process.env.DATABASE_URL ??= "postgres://unused:unused@127.0.0.1:1/unused";
  process.env.OPENAI_API_KEY ??= "test-key-not-used";

  const { createChachaCallRouter } = await import("./chachaCall");
  ({ getChatAudioStream } = (await import("../lib/chatAudioStreams")) as never);

  const deps: ChachaCallDeps = {
    resolveLanguage: async () => ({ code: "gu", name: "Gujarati" }),
    cannedLine: async (lineKey, languageCode) => {
      cannedCalls.push(lineKey);
      return {
        // His words in the learner's language, which is what the route must
        // send on rather than the script's Hindi.
        text: `${languageCode}:${lineKey}`,
        romanized: `roman:${lineKey}`,
        audioBase64: Buffer.from(`clip:${lineKey}`).toString("base64"),
        format: "mp3",
      };
    },
    liveTurn: async (req) => {
      if (liveError) throw liveError;
      req.onAudioChunk?.(liveResult?.mp3 ?? Buffer.alloc(0));
      return liveResult ?? makeLive();
    },
    transcribeLearner: async () => lateTranscript,
    grantChai: async (_userId, callId, turnIndex) => {
      chaiGrants.push({ callId, turnIndex });
      return rewardAlreadyGranted ? 0 : 1;
    },
    grantXp: async (_userId, languageCode, _callId, turnIndex) => {
      xpGrants.push({ languageCode, turnIndex });
      return rewardAlreadyGranted ? 0 : 5;
    },
    warmConnection: () => { warmed += 1; },
    // Short, so the 204 case does not sit out a real twelve second wait.
    turnWaitMs: 120,
  };

  app = express();
  app.use(express.json({ limit: "25mb" }));
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (currentUser) (req as Request & { userId: string }).userId = currentUser;
    // Stands in for the pino logger the real middleware attaches, and records
    // what the routes log so the fallback warning can be asserted on.
    const record = (level: string) => (obj: unknown, msg: string) =>
      logged.push({ level, obj, msg });
    (req as Request & { log: unknown }).log = {
      warn: record("warn"),
      info: record("info"),
      error: record("error"),
      debug: record("debug"),
    } as never;
    next();
  });
  app.use(createChachaCallRouter(deps));
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => { server.close(); });

beforeEach(() => {
  currentUser = USER;
  liveResult = makeLive();
  liveError = null;
  warmed = 0;
  logged = [];
  cannedCalls = [];
  chaiGrants = [];
  xpGrants = [];
  rewardAlreadyGranted = false;
  lateTranscript = "chalo chacha-ji";
});

async function post(path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, json: (await res.json()) as Record<string, never> };
}

async function startCall(): Promise<string> {
  const { json } = await post("/openai/chacha-call/start");
  return json.callId as unknown as string;
}

test("an unauthenticated caller cannot take a call", async () => {
  currentUser = null;
  assert.equal((await post("/openai/chacha-call/start")).status, 401);
});

test("start serves his hello from a fixed clip and asks no model for it", async () => {
  const { status, json } = await post("/openai/chacha-call/start");
  assert.equal(status, 200);
  assert.equal((json.beat as never as { id: string }).id, "hello");
  assert.equal((json.beat as never as { canned: boolean }).canned, true);
  assert.equal(json.text as never, undefined, "the line lives on beat, not the root");
  assert.ok(json.audioBase64, "the learner must hear him immediately");
  assert.deepEqual(cannedCalls, ["hello"]);
  assert.equal(json.learnerTurns as never as number, JOURNEY_TURNS);
});

test("start warms the connection so the first live turn is not the cold one", async () => {
  // Measured 2026-08-28: the first request a process makes costs about 1.9 s to
  // first audio against about 1.0 s warm, and it is all connection setup.
  await post("/openai/chacha-call/start");
  assert.equal(warmed, 1);
});

test("a live turn answers in his generated voice and moves the call on", async () => {
  const callId = await startCall();
  const { status, json } = await post(`/openai/chacha-call/${callId}/turn`, { audioBase64: CLIP });
  assert.equal(status, 200);
  const beat = json.beat as never as { id: string; text: string; canned: boolean };
  assert.equal(beat.id, "khaana");
  assert.equal(beat.canned, false);
  assert.equal(beat.text, "Waah beta, bahut accha!");
  assert.equal(json.heard as never, "roti aur dal");
  assert.equal((json.next as never as { id: string }).id, "ghar");
  assert.equal(json.over as never, false);
  assert.equal(json.format as never, "mp3");
});

// INVERTED 2026-08-28. These asserted that his line was FORCED into Latin
// letters, because there was one caption and a learner cannot read Devanagari
// yet. There are two caption lines now, the script and a romanization under it,
// and he is prompted to write the real script. So the native form must SURVIVE
// rather than be converted, and the romanization rides alongside it.
test("a reply in the language's own script is served in that script, not flattened", async () => {
  const callId = await startCall();
  const native = "\u0906\u091c \u0915\u094d\u092f\u093e \u0916\u093e\u092f\u093e?";
  liveResult = makeLive({ chachaText: native });
  const { json } = await post(`/openai/chacha-call/${callId}/turn`, { audioBase64: CLIP });
  const beat = json.beat as never as { text: string; romanized: string | null };
  assert.equal(beat.text, native, "the script the learner is here to read must survive");
  assert.ok(beat.romanized, "the second caption line is missing");
  assert.doesNotMatch(beat.romanized!, /[\u0900-\u097F]/, "the romanization is not romanized");
});

test("a reply already in Latin letters gets no pointless second caption", async () => {
  // Romanizing Latin would just repeat the line underneath itself.
  const callId = await startCall();
  liveResult = makeLive({ chachaText: "Arre wah beta, bahut badhiya!" });
  const { json } = await post(`/openai/chacha-call/${callId}/turn`, { audioBase64: CLIP });
  const beat = json.beat as never as { text: string; romanized: string | null };
  assert.equal(beat.text, "Arre wah beta, bahut badhiya!");
  assert.equal(beat.romanized, "Arre wah beta, bahut badhiya!");
});

test("a script the romanizer cannot handle still shows his words", async () => {
  // Perso-Arabic is not reliably transliterable and the romanizer says so by
  // returning empty. One caption line is right; a wrong second line is not.
  const callId = await startCall();
  const urdu = "\u0645\u06CC\u06BA \u0679\u06BE\u06CC\u06A9 \u06C1\u0648\u06BA";
  liveResult = makeLive({ chachaText: urdu });
  const { json } = await post(`/openai/chacha-call/${callId}/turn`, { audioBase64: CLIP });
  const beat = json.beat as never as { text: string; romanized: string | null };
  assert.equal(beat.text, urdu);
  assert.equal(beat.romanized, null, "better no second line than a wrong one");
});

test("a model that fails falls back to the beat's own scripted line", async () => {
  // A call that degrades to its script is still a call. A call that errors is
  // a hang-up, and the learner is left holding a dead phone.
  const callId = await startCall();
  liveError = new Error("gpt-audio is down");
  const { status, json } = await post(`/openai/chacha-call/${callId}/turn`, { audioBase64: CLIP });
  assert.equal(status, 200);
  // INVERTED 2026-08-28: this asserted the beat's own HINDI string. The
  // fallback is that beat's line IN THE LEARNER'S LANGUAGE now, which is what
  // the dep returns, so asserting the script's text would re-assert the defect.
  assert.equal((json.beat as never as { text: string }).text, "gu:khaana");
  assert.equal((json.beat as never as { canned: boolean }).canned, true);
  assert.ok(json.audioBase64, "he still has to say something out loud");
  assert.ok(cannedCalls.includes("khaana"));
});

test("a live turn that fails is logged loudly, never silently", async () => {
  // A gpt-audio outage would otherwise degrade every call in the world to its
  // script with nobody the wiser, and this app has already had a total outage
  // produce no alert at all. warn and above reaches Sentry.
  const callId = await startCall();
  liveError = new Error("gpt-audio is down");
  await post(`/openai/chacha-call/${callId}/turn`, { audioBase64: CLIP });
  const warning = logged.find((l) => l.level === "warn");
  assert.ok(warning, "a failed live turn must not be swallowed silently");
  assert.match(warning.msg, /falling back/i);
  assert.equal((warning.obj as { beat: string }).beat, "khaana");
});

test("every turn logs the latency this whole feature rests on", async () => {
  // Never measured from the Repl, where it actually runs. Logging it per turn
  // is how a regression becomes visible instead of being felt by a learner
  // sitting in silence.
  const callId = await startCall();
  await post(`/openai/chacha-call/${callId}/turn`, { audioBase64: CLIP });
  const turn = logged.find((l) => l.msg === "[chacha-call] turn");
  assert.ok(turn, "no turn log");
  const o = turn.obj as { firstAudioMs: number | null; canned: boolean; beat: string };
  assert.equal(o.canned, false);
  assert.equal(o.beat, "khaana");
  assert.equal(typeof o.firstAudioMs, "number");
});

test("a learner who says nothing gets the gentle line, not a retry", async () => {
  // He is delighted by anything they say, and that has to include nothing.
  const callId = await startCall();
  liveResult = makeLive({ chachaText: "", learnerText: "", mp3: Buffer.alloc(0), spokenSeconds: 0 });
  const { json } = await post(`/openai/chacha-call/${callId}/turn`, { audioBase64: CLIP });
  assert.equal((json.beat as never as { text: string }).text, "gu:nothingHeard");
  assert.ok(cannedCalls.includes("nothingHeard"));
  assert.equal(json.heard as never, "");
  // The call still advances. Nobody is asked to try again.
  assert.equal((json.next as never as { id: string }).id, "ghar");
});

test("no response anywhere carries a score", async () => {
  // A call is an event, not a lesson. The guarantee is structural: there is no
  // field for a score to travel in.
  const callId = await startCall();
  const turn = await post(`/openai/chacha-call/${callId}/turn`, { audioBase64: CLIP });
  const end = await post(`/openai/chacha-call/${callId}/end`);
  for (const body of [turn.json, end.json]) {
    const keys = JSON.stringify(body);
    assert.doesNotMatch(keys, /"score"|"band"|"rating"|"grade"|"correct"/i);
  }
});

test("the call runs out of beats and says so", async () => {
  const callId = await startCall();
  let last: Record<string, never> | null = null;
  for (let i = 1; i <= JOURNEY_TURNS; i++) {
    last = (await post(`/openai/chacha-call/${callId}/turn`, { audioBase64: CLIP })).json;
  }
  assert.equal(last!.over as never, true);
  assert.equal(last!.next as never, null);
  // Speaking into a finished call is a conflict, not a new turn.
  const after = await post(`/openai/chacha-call/${callId}/turn`, { audioBase64: CLIP });
  assert.equal(after.status, 409);
});

// ── What a turn pays, and the fact that it reaches the phone ───────────────
//
// Owner ruling, 2026-08-28: a turn earns when he HEARD them and earns nothing
// when it heard silence. Chai on the journey, XP on the game, never both.

async function startGame(): Promise<string> {
  const { json } = await post("/openai/chacha-call/start", { mode: "game" });
  return json.callId as unknown as string;
}

test("a journey turn he heard pays one chai and no XP", async () => {
  const callId = await startCall();
  const { json } = await post(`/openai/chacha-call/${callId}/turn`, { audioBase64: CLIP });
  assert.equal(json.chaiEarned as never as number, 1);
  assert.equal(json.xpEarned as never as number, 0);
  assert.deepEqual(chaiGrants, [{ callId, turnIndex: 1 }]);
  assert.deepEqual(xpGrants, []);
});

test("a game turn he heard pays XP and no chai", async () => {
  const callId = await startGame();
  const { json } = await post(`/openai/chacha-call/${callId}/turn`, { audioBase64: CLIP });
  assert.equal(json.xpEarned as never as number, 5);
  assert.equal(json.chaiEarned as never as number, 0);
  assert.deepEqual(xpGrants, [{ languageCode: "gu", turnIndex: 1 }]);
  assert.deepEqual(chaiGrants, []);
});

test("a turn he heard nothing in pays nothing, in either call", async () => {
  // Not a judgement of the answer. Nothing here reads WHAT they said, only
  // whether they said anything, which is the only rule available in a feature
  // that has no score by design.
  for (const start of [startCall, startGame]) {
    chaiGrants = [];
    xpGrants = [];
    const callId = await start();
    liveResult = makeLive({ chachaText: "", learnerText: "", mp3: Buffer.alloc(0), spokenSeconds: 0 });
    const { json } = await post(`/openai/chacha-call/${callId}/turn`, { audioBase64: CLIP });
    assert.equal(json.chaiEarned as never as number, 0);
    assert.equal(json.xpEarned as never as number, 0);
    assert.deepEqual(chaiGrants, []);
    assert.deepEqual(xpGrants, []);
    liveResult = makeLive();
  }
});

test("the reward reaches the phone, which only ever reads the caption request", async () => {
  // THE BUG THIS COVERS: the grant sat below `if (stream) return`, and the app
  // always sends X-Audio-Stream, so no learner was ever credited a chai for a
  // call and the "+1" the caption draws could not fire. The streaming turn
  // answers 202 with a URL and nothing else, so the reward has to travel on the
  // long-poll that follows it.
  const callId = await startCall();
  const started = await post(
    `/openai/chacha-call/${callId}/turn`,
    { audioBase64: CLIP },
    { "X-Audio-Stream": "url" },
  );
  assert.equal(started.status, 202);
  assert.equal(started.json.chaiEarned as never, undefined, "202 carries the URL, not the reward");
  assert.deepEqual(chaiGrants, [{ callId, turnIndex: 1 }], "the grant must run on this path");

  const res = await fetch(`${baseUrl}/openai/chacha-call/${callId}/turn/0`);
  const turn = (await res.json()) as Record<string, never>;
  assert.equal(turn.chaiEarned as never as number, 1);
  assert.equal(turn.xpEarned as never as number, 0);
  assert.equal(turn.heardSomething as never, true);
});

test("a retried turn never reports a reward twice", async () => {
  // The refId is the idempotency and the ledger is the judge. What must not
  // happen is a second "+1" floating up for chai nobody received.
  rewardAlreadyGranted = true;
  const callId = await startCall();
  const { json } = await post(`/openai/chacha-call/${callId}/turn`, { audioBase64: CLIP });
  assert.equal(json.chaiEarned as never as number, 0);
});

test("the journey stops paying chai after the cap, and the call carries on", async () => {
  const callId = await startCall();
  const paid: number[] = [];
  for (let i = 1; i <= JOURNEY_TURNS; i++) {
    const { status, json } = await post(`/openai/chacha-call/${callId}/turn`, { audioBase64: CLIP });
    assert.equal(status, 200);
    paid.push(json.chaiEarned as never as number);
  }
  assert.ok(paid.every((n) => n === 1), `the journey agenda is inside the cap: ${paid}`);
});

test("the last answer of a journey earns, even though the goodbye is canned", async () => {
  // The farewell beat runs no live turn, so nothing used to transcribe the
  // answer it consumes and the fifth turn of a five-turn call could never earn.
  // The cap is five; five must be reachable.
  const callId = await startCall();
  const paid: number[] = [];
  for (let i = 1; i <= JOURNEY_TURNS; i++) {
    const { json } = await post(`/openai/chacha-call/${callId}/turn`, { audioBase64: CLIP });
    paid.push(json.chaiEarned as never as number);
  }
  assert.equal(paid.reduce((a, b) => a + b, 0), CHACHA_CALL_CHAI_MAX);
});

test("silence into the canned goodbye earns nothing, same as any other turn", async () => {
  lateTranscript = "";
  const callId = await startCall();
  let last = 0;
  for (let i = 1; i <= JOURNEY_TURNS; i++) {
    const { json } = await post(`/openai/chacha-call/${callId}/turn`, { audioBase64: CLIP });
    last = json.chaiEarned as never as number;
  }
  assert.equal(last, 0);
});

test("what a turn paid is logged, so a silent reward failure is visible", async () => {
  const callId = await startCall();
  await post(`/openai/chacha-call/${callId}/turn`, { audioBase64: CLIP });
  const turn = logged.find((l) => l.msg === "[chacha-call] turn");
  const o = turn!.obj as { chaiEarned: number; xpEarned: number; heardSomething: boolean };
  assert.equal(o.chaiEarned, 1);
  assert.equal(o.xpEarned, 0);
  assert.equal(o.heardSomething, true);
});

test("a turn with no audio is rejected before any model is called", async () => {
  const callId = await startCall();
  const { status, json } = await post(`/openai/chacha-call/${callId}/turn`, {});
  assert.equal(status, 400);
  assert.match(json.error as never, /audioBase64/);
});

test("an unknown call is a 404", async () => {
  assert.equal((await post("/openai/chacha-call/nope/turn", { audioBase64: CLIP })).status, 404);
  assert.equal((await post("/openai/chacha-call/nope/end")).status, 404);
});

test("one learner cannot speak into another learner's call", async () => {
  const callId = await startCall();
  currentUser = OTHER;
  assert.equal((await post(`/openai/chacha-call/${callId}/turn`, { audioBase64: CLIP })).status, 404);
  assert.equal((await post(`/openai/chacha-call/${callId}/end`)).status, 404);
});

// INVERTED 2026-08-28 on the owner's ruling. These three tests previously
// asserted that the call was gated by the weekly chat cap and booked against
// it. It is neither. The game is gated by All-Access at the feature level, and
// HE rings the learner: a journey-stop interruption must not spend practice
// minutes the learner did not choose to spend.
test("the weekly chat cap does NOT gate the call", async () => {
  // Nothing in this router can answer 402: there is no meter left to trip.
  assert.equal((await post("/openai/chacha-call/start")).status, 200);
  const callId = await startCall();
  for (let i = 1; i <= JOURNEY_TURNS; i++) {
    const { status } = await post(`/openai/chacha-call/${callId}/turn`, { audioBase64: CLIP });
    assert.equal(status, 200, "a call must never be refused for chat time");
  }
});

test("a call never spends the weekly chat allowance", async () => {
  // Asserted structurally rather than by watching a spy: the router does not
  // import the allowance at all, so no future edit can quietly start charging
  // for an incoming call without this failing. Same shape as the expo-image
  // census in the mobile splash tests.
  const source = await readFile(
    join(import.meta.dirname, "chachaCall.ts"),
    "utf8",
  );
  assert.doesNotMatch(source, /chatLimits/, "the call must not reach the chat meter");
  assert.doesNotMatch(source, /recordChatTurn|chatTimeCapDenial/);
  assert.doesNotMatch(source, /sendUpgradeRequired/, "a call is never an upsell");
});

test("the bound on a call is its agenda, not a meter", async () => {
  // What replaces the meter. A call is a fixed number of beats decided before
  // it starts, which is the bound the open-ended chat route does not have and
  // the reason that one needs charging and this one does not.
  const callId = await startCall();
  for (let i = 1; i <= JOURNEY_TURNS; i++) {
    await post(`/openai/chacha-call/${callId}/turn`, { audioBase64: CLIP });
  }
  const { status } = await post(`/openai/chacha-call/${callId}/turn`, { audioBase64: CLIP });
  assert.equal(status, 409, "the agenda has to run out on its own");
});

test("X-Audio-Stream: url answers immediately and tees into the chat registry", async () => {
  // Reuses GET /openai/chat/audio/:streamId rather than minting a second
  // progressive-audio endpoint. The native players already speak that one.
  const callId = await startCall();
  const { status, json } = await post(
    `/openai/chacha-call/${callId}/turn`,
    { audioBase64: CLIP },
    { "X-Audio-Stream": "url" },
  );
  assert.equal(status, 202, "the player must get a URL before the model answers");
  const url = json.audioUrl as never as string;
  assert.match(url, /^\/openai\/chat\/audio\/[0-9a-f]{32}$/);

  const streamId = url.split("/").pop()!;
  for (let i = 0; i < 50; i++) {
    const s = getChatAudioStream(streamId);
    if (s?.done) break;
    await new Promise((r) => setTimeout(r, 10));
  }
  const stream = getChatAudioStream(streamId);
  assert.ok(stream, "the stream must still be registered for the player to fetch");
  assert.equal(stream.done, true);
  assert.equal(Buffer.concat(stream.chunks).toString(), "fake-mp3-bytes");
});

test("a streamed turn that falls back still delivers his canned clip", async () => {
  const callId = await startCall();
  liveError = new Error("gpt-audio is down");
  const { json } = await post(
    `/openai/chacha-call/${callId}/turn`,
    { audioBase64: CLIP },
    { "X-Audio-Stream": "url" },
  );
  const streamId = (json.audioUrl as never as string).split("/").pop()!;
  for (let i = 0; i < 50; i++) {
    if (getChatAudioStream(streamId)?.done) break;
    await new Promise((r) => setTimeout(r, 10));
  }
  const stream = getChatAudioStream(streamId)!;
  assert.equal(stream.done, true, "a fallback must not leave the player hanging");
  assert.equal(Buffer.concat(stream.chunks).toString(), "clip:khaana");
});

test("hanging up returns his farewell and the outcome the ring-back will read", async () => {
  const callId = await startCall();
  await post(`/openai/chacha-call/${callId}/turn`, { audioBase64: CLIP });
  const { status, json } = await post(`/openai/chacha-call/${callId}/end`);
  assert.equal(status, 200);
  assert.equal(json.outcome as never, "answered");
  assert.equal(json.turns as never as number, 1);
  // His farewell in the learner's language, not the script's Hindi.
  assert.equal(json.text as never, "gu:bye");
  assert.ok(json.audioBase64);
});

test("every canned line the learner hears is in their own language", async () => {
  // The defect this covers, found by the owner 2026-08-28: "chachaji is talking
  // in hindi on gujurati game as well." The route must never send the script's
  // Hindi string on; it asks chachaCallLines for that line in the session's
  // language and passes back exactly what comes out, clip and caption together.
  const start = await post("/openai/chacha-call/start");
  assert.equal((start.json.beat as never as { text: string }).text, "gu:hello");
  assert.equal((start.json.beat as never as { romanized: string }).romanized, "roman:hello");

  const callId = start.json.callId as unknown as string;
  liveError = new Error("gpt-audio is down");
  const turn = await post(`/openai/chacha-call/${callId}/turn`, { audioBase64: CLIP });
  assert.equal((turn.json.beat as never as { text: string }).text, "gu:khaana");
  assert.equal((turn.json.beat as never as { romanized: string }).romanized, "roman:khaana");

  const end = await post(`/openai/chacha-call/${callId}/end`);
  assert.equal(end.json.text as never, "gu:bye");

  const hindi = [CALL_BEATS[0].text, CALL_BEATS[CALL_BEATS.length - 1].text];
  const wire = JSON.stringify([start.json, turn.json, end.json]);
  for (const line of hindi) {
    assert.ok(!wire.includes(line), `his Hindi reached a Gujarati learner: ${line}`);
  }
});

test("a call nobody spoke in ends abandoned", async () => {
  const callId = await startCall();
  liveResult = makeLive({ chachaText: "", learnerText: "", mp3: Buffer.alloc(0), spokenSeconds: 0 });
  await post(`/openai/chacha-call/${callId}/turn`, { audioBase64: CLIP });
  const { json } = await post(`/openai/chacha-call/${callId}/end`);
  assert.equal(json.outcome as never, "abandoned");
});

test("start hands the client one backdrop to loop", async () => {
  const { json } = await post("/openai/chacha-call/start");
  const backdrop = json.backdrop as never as { id: string; video: string; poster: string };
  assert.ok(["driving", "backseat"].includes(backdrop.id));
  assert.match(backdrop.video, /\.mp4$/);
  assert.match(backdrop.poster, /\.jpg$/);
});

test("every turn returns the SAME backdrop, so a call never changes cars", async () => {
  // The client can lose its state and recover the right clip off any turn
  // rather than picking again and teleporting him mid-sentence.
  const { json: started } = await post("/openai/chacha-call/start");
  const callId = started.callId as unknown as string;
  const chosen = (started.backdrop as never as { id: string }).id;
  for (let i = 1; i <= JOURNEY_TURNS; i++) {
    const { json } = await post(`/openai/chacha-call/${callId}/turn`, { audioBase64: CLIP });
    assert.equal((json.backdrop as never as { id: string }).id, chosen);
  }
});

test("two calls can differ, so the scenery is not always the same one", async () => {
  // Not a guarantee for any single pair, so this asks whether both are
  // REACHABLE across a run rather than whether consecutive calls differ.
  const seen = new Set<string>();
  for (let i = 0; i < 40; i++) {
    const { json } = await post("/openai/chacha-call/start");
    seen.add((json.backdrop as never as { id: string }).id);
  }
  assert.deepEqual([...seen].sort(), ["backseat", "driving"]);
});

// GET /openai/chacha-call/:callId/turn/:index — the caption long-poll.
// A streaming turn answers 202 with an audio URL before his words exist, and
// React Native cannot stream a response body, so the captions come from here.

async function get(path: string) {
  const res = await fetch(`${baseUrl}${path}`);
  const body = res.status === 204 ? null : await res.json();
  return { status: res.status, json: body as Record<string, never> | null };
}

test("a turn already taken is returned without waiting", async () => {
  const callId = await startCall();
  await post(`/openai/chacha-call/${callId}/turn`, { audioBase64: CLIP });
  const t0 = Date.now();
  const { status, json } = await get(`/openai/chacha-call/${callId}/turn/0`);
  assert.equal(status, 200);
  assert.ok(Date.now() - t0 < 500, "it waited for something already there");
  assert.equal(json!.text as never, "Waah beta, bahut accha!");
  assert.equal(json!.heard as never, "roti aur dal");
  assert.equal((json!.next as never as { id: string }).id, "ghar");
});

test("the caption carries both lines", async () => {
  const callId = await startCall();
  const native = "आज क्या खाया?";
  liveResult = makeLive({ chachaText: native });
  await post(`/openai/chacha-call/${callId}/turn`, { audioBase64: CLIP });
  const { json } = await get(`/openai/chacha-call/${callId}/turn/0`);
  assert.equal(json!.text as never, native);
  assert.ok(json!.romanized, "the second caption line is missing");
});

test("a turn that has not happened answers 204 rather than an error", async () => {
  // The client shows no caption over a call the learner can still hear, which
  // is better than showing a failure.
  const callId = await startCall();
  const { status } = await get(`/openai/chacha-call/${callId}/turn/5`);
  assert.equal(status, 204);
});

test("another learner cannot read the captions of a call", async () => {
  const callId = await startCall();
  await post(`/openai/chacha-call/${callId}/turn`, { audioBase64: CLIP });
  currentUser = OTHER;
  assert.equal((await get(`/openai/chacha-call/${callId}/turn/0`)).status, 404);
});

test("a nonsense turn index is refused rather than waited on", async () => {
  const callId = await startCall();
  assert.equal((await get(`/openai/chacha-call/${callId}/turn/-1`)).status, 400);
  assert.equal((await get(`/openai/chacha-call/${callId}/turn/abc`)).status, 400);
});
