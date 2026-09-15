/**
 * phraseVoices.test.ts
 *
 * The contribution page's lesson phrase modes: a native speaker records each
 * phrase of a zone as its own clip, and a second speaker approves or rejects
 * each clip. Driven through the real router against the suite's live
 * database, because the properties worth pinning live in the SEAM between the
 * key, the zone query, the upsert and the verdict table, not in any one part:
 *
 *   - no key, the wrong mode's key, another language's key: nothing is served
 *     and nothing is stored
 *   - the phrases served are the app's own rows, in the learner's order, and
 *     a clip can only be stored against one of them
 *   - saying a phrase again replaces the take AND clears the verdicts on the
 *     old one
 *   - no contributor name ever leaves the server, and nobody reviews their own
 *   - the Nest's summary counts with the same rule
 *
 * Names are placeholders. No real contributor is named in code or fixtures.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express } from "express";
import {
  db,
  pool,
  categoriesTable,
  languagesTable,
  lessonGroupsTable,
  lessonsTable,
  phrasesTable,
  voiceContributionsTable,
  voiceContributionReviewsTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import scriptTraceRouter from "../routes/scriptTrace";
import { mintContributionKey } from "../lib/contributionLinks";
import { summarizeZoneClips } from "../lib/phraseVoices";

// __test_lang_ rows are hidden from /languages if a crashed run leaves one.
const LANG = "__test_lang_phrase_voice";
const OTHER_LANG = "__test_lang_phrase_voice_b";
const EMPTY_LANG = "__test_lang_phrase_voice_none";
const OTHER_CATEGORY_SLUG = "__test_cat_phrase_voice";
const SPEAKER = "SpeakerOne";
const REVIEWER = "ReviewerTwo";
const AUDIO = Buffer.from("not really audio, the route never decodes a take").toString("base64");
const DAY = 86_400_000;

let app: Express;
let server: Server;
let base: string;
let savedSecret: string | undefined;

/** Zone 1 phrase ids in the order a learner meets them. */
let zoneIds: number[] = [];
let otherCategoryPhraseId: number;
let unassignedPhraseId: number;
let otherLangPhraseId: number;

let seq = 0;
const session = (tag: string) => `tst${tag}${Date.now().toString(36)}${seq++}`;

function key(mode: "record" | "review", language = LANG, now = Date.now()): string {
  const minted = mintContributionKey(mode, language, now);
  assert.ok(minted, "SESSION_SECRET is set in before()");
  return minted.key;
}

async function call(
  method: "GET" | "POST",
  path: string,
  opts: { key?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.key !== undefined) headers["X-Contribution-Key"] = opts.key;
  const res = await fetch(base + path, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // A non-JSON body is itself a finding; the assertion reports it.
  }
  return { status: res.status, json, text, headers: res.headers };
}

function clipBody(over: Record<string, unknown> = {}) {
  return {
    sessionId: session("rec"),
    contributor: SPEAKER,
    language: LANG,
    phraseId: zoneIds[0],
    audioBase64: AUDIO,
    mimeType: "audio/webm;codecs=opus",
    durationMs: 1800,
    ...over,
  };
}

async function clipRows(language = LANG) {
  return db
    .select()
    .from(voiceContributionsTable)
    .where(eq(voiceContributionsTable.languageCode, language));
}

async function cleanup() {
  // Verdicts go with their clips (ON DELETE CASCADE), which is itself asserted
  // below rather than trusted here.
  await db
    .delete(voiceContributionsTable)
    .where(inArray(voiceContributionsTable.languageCode, [LANG, OTHER_LANG, EMPTY_LANG]));
  for (const code of [LANG, OTHER_LANG]) {
    await db.delete(phrasesTable).where(eq(phrasesTable.languageCode, code));
    await db.delete(lessonGroupsTable).where(eq(lessonGroupsTable.languageCode, code));
    await db.delete(lessonsTable).where(eq(lessonsTable.languageCode, code));
  }
  await db.delete(categoriesTable).where(eq(categoriesTable.slug, OTHER_CATEGORY_SLUG));
  await db.delete(languagesTable).where(inArray(languagesTable.code, [LANG, OTHER_LANG]));
}

before(async () => {
  savedSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "phrase-voices-test-secret-long-enough";

  app = express();
  app.use(express.json({ limit: "25mb" }));
  // NO auth in front, exactly how routes/index.ts mounts it.
  app.use("/api", scriptTraceRouter);
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  await cleanup();

  for (const code of [LANG, OTHER_LANG]) {
    await db
      .insert(languagesTable)
      .values({ code, name: "Phrase Voice Test", nativeName: "T", script: "Devanagari", fontFamily: "Noto Sans Devanagari" })
      .onConflictDoNothing();
  }

  // Zone 1 is keyed off the real "greetings" slug, as lib/teaser.ts is. Reused
  // when present and never deleted, the same as teaserGating.test.ts.
  let greetings = await db.query.categoriesTable.findFirst({
    where: eq(categoriesTable.slug, "greetings"),
  });
  if (!greetings) {
    [greetings] = await db
      .insert(categoriesTable)
      .values({ slug: "greetings", title: "Greetings & Manners", description: "x", iconName: "HandHeart", accent: "#fff" })
      .returning();
  }
  const [other] = await db
    .insert(categoriesTable)
    .values({ slug: OTHER_CATEGORY_SLUG, title: "Other", description: "x", iconName: "BookOpen", accent: "#333", sortOrder: 9401 })
    .returning();

  const [lesson] = await db
    .insert(lessonsTable)
    .values({ languageCode: LANG, categoryId: greetings!.id, titleNative: "x" })
    .returning();
  const [otherLesson] = await db
    .insert(lessonsTable)
    .values({ languageCode: LANG, categoryId: other!.id, titleNative: "x" })
    .returning();
  const [otherLangLesson] = await db
    .insert(lessonsTable)
    .values({ languageCode: OTHER_LANG, categoryId: greetings!.id, titleNative: "x" })
    .returning();

  // Inserted out of order on purpose, so the route's ordering is what puts
  // them right: stop 2 is created before stop 1.
  const [stop2] = await db
    .insert(lessonGroupsTable)
    .values({ languageCode: LANG, categoryId: greetings!.id, position: 2 })
    .returning();
  const [stop1] = await db
    .insert(lessonGroupsTable)
    .values({ languageCode: LANG, categoryId: greetings!.id, position: 1 })
    .returning();
  const [otherStop] = await db
    .insert(lessonGroupsTable)
    .values({ languageCode: LANG, categoryId: other!.id, position: 1 })
    .returning();
  const [otherLangStop] = await db
    .insert(lessonGroupsTable)
    .values({ languageCode: OTHER_LANG, categoryId: greetings!.id, position: 1 })
    .returning();

  const phrase = (
    lessonId: number,
    languageCode: string,
    categoryId: number,
    text: string,
    groupId: number | null,
    position: number | null,
    stage = "phrase",
  ) => ({
    lessonId,
    languageCode,
    categoryId,
    nativeScript: text,
    romanized: `${text}-rom`,
    english: `${text}-en`,
    stage,
    lessonGroupId: groupId,
    lessonGroupPosition: position,
  });

  const [s2a] = await db.insert(phrasesTable).values(phrase(lesson!.id, LANG, greetings!.id, "stop2 first", stop2!.id, 1, "sentence")).returning();
  const [s1b] = await db.insert(phrasesTable).values(phrase(lesson!.id, LANG, greetings!.id, "stop1 second", stop1!.id, 2)).returning();
  const [s1a] = await db.insert(phrasesTable).values(phrase(lesson!.id, LANG, greetings!.id, "stop1 first", stop1!.id, 1)).returning();
  zoneIds = [s1a!.id, s1b!.id, s2a!.id];

  const [unassigned] = await db.insert(phrasesTable).values(phrase(lesson!.id, LANG, greetings!.id, "no stop yet", null, null)).returning();
  unassignedPhraseId = unassigned!.id;
  const [elsewhere] = await db.insert(phrasesTable).values(phrase(otherLesson!.id, LANG, other!.id, "other topic", otherStop!.id, 1)).returning();
  otherCategoryPhraseId = elsewhere!.id;
  const [foreign] = await db.insert(phrasesTable).values(phrase(otherLangLesson!.id, OTHER_LANG, greetings!.id, "other language", otherLangStop!.id, 1)).returning();
  otherLangPhraseId = foreign!.id;
});

after(async () => {
  await cleanup();
  await new Promise((r) => server.close(r));
  await pool.end();
  if (savedSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = savedSecret;
});

describe("GET /script-trace/lesson-phrases", () => {
  const path = `/api/script-trace/lesson-phrases?language=${LANG}&zone=1`;

  it("serves nothing without the record key for this language", async () => {
    assert.equal((await call("GET", path)).status, 403);
    assert.equal((await call("GET", path, { key: "garbage" })).status, 403);
    assert.equal((await call("GET", path, { key: key("review") })).status, 403, "a review key is not a record key");
    assert.equal((await call("GET", path, { key: key("record", OTHER_LANG) })).status, 403, "another language's key");
    const res = await call("GET", path, { key: "garbage" });
    assert.equal(res.json?.code, "link_invalid");
    assert.doesNotMatch(res.text, /stop1/, "no phrase text in a refusal");
  });

  it("says a genuine but lapsed key has run out", async () => {
    const res = await call("GET", path, { key: key("record", LANG, Date.now() - 60 * DAY) });
    assert.equal(res.status, 410);
    assert.equal(res.json?.code, "link_expired");
  });

  it("serves the zone's phrases in the order a learner meets them, and only those", async () => {
    const res = await call("GET", path, { key: key("record") });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(res.json.language.code, LANG);
    assert.equal(res.json.language.script, "Devanagari");
    assert.equal(res.json.zone, 1);
    assert.deepEqual(
      res.json.phrases.map((p: { id: number }) => p.id),
      zoneIds,
      "stop by position, then lesson_group_position",
    );
    const first = res.json.phrases[0];
    assert.equal(first.nativeScript, "stop1 first");
    assert.equal(first.romanized, "stop1 first-rom");
    assert.equal(first.english, "stop1 first-en");
    assert.equal(first.stop, 1);
    assert.equal(res.json.phrases[2].stage, "sentence");
    const ids = res.json.phrases.map((p: { id: number }) => p.id);
    assert.ok(!ids.includes(unassignedPhraseId), "a phrase no stop serves is not asked for");
    assert.ok(!ids.includes(otherCategoryPhraseId), "another zone's phrase is not asked for");
    assert.ok(!ids.includes(otherLangPhraseId), "another language's phrase is not asked for");
  });

  it("answers 404 for a language with no zone content, only once the key is good", async () => {
    const res = await call("GET", `/api/script-trace/lesson-phrases?language=${EMPTY_LANG}`, { key: key("record", EMPTY_LANG) });
    assert.equal(res.status, 404);
    assert.equal(res.json?.code, "no_phrases");
    const zone2 = await call("GET", `/api/script-trace/lesson-phrases?language=${LANG}&zone=2`, { key: key("record") });
    assert.equal(zone2.status, 404, "only zone 1 is open");
  });

  it("refuses a malformed query", async () => {
    assert.equal((await call("GET", "/api/script-trace/lesson-phrases", { key: key("record") })).status, 400);
    assert.equal((await call("GET", "/api/script-trace/lesson-phrases?language=BRX!", { key: key("record") })).status, 400);
    assert.equal((await call("GET", `/api/script-trace/lesson-phrases?language=${LANG}&zone=abc`, { key: key("record") })).status, 400);
  });
});

describe("POST /script-trace/phrase-voice", () => {
  const path = "/api/script-trace/phrase-voice";

  it("stores a take against the phrase, with the words from the database", async () => {
    const body = clipBody({ phraseId: zoneIds[1], promptText: "a body cannot choose the words" });
    const res = await call("POST", path, { key: key("record"), body });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.json.stored, true);
    const rows = (await clipRows()).filter((r) => r.sessionId === body.sessionId);
    assert.equal(rows.length, 1);
    const row = rows[0]!;
    assert.equal(row.phraseId, zoneIds[1]);
    assert.equal(row.languageCode, LANG);
    assert.equal(row.promptId, `phrase:${zoneIds[1]}`);
    assert.equal(row.promptText, "stop1 second");
    assert.equal(row.promptLabel, "stop1 second-en");
    assert.equal(row.script, "Devanagari");
    assert.equal(row.contributor, SPEAKER);
    assert.equal(row.isPractice, false);
    assert.equal(row.audioBase64, AUDIO);
  });

  it("stores nothing without the record key", async () => {
    const before = (await clipRows()).length;
    const body = clipBody();
    assert.equal((await call("POST", path, { body })).status, 403);
    assert.equal((await call("POST", path, { key: key("review"), body })).status, 403);
    assert.equal((await call("POST", path, { key: key("record", OTHER_LANG), body })).status, 403);
    assert.equal((await clipRows()).length, before);
  });

  it("stores only against a phrase this page could have shown", async () => {
    const k = key("record");
    for (const phraseId of [unassignedPhraseId, otherCategoryPhraseId, otherLangPhraseId, 2147483000]) {
      const res = await call("POST", path, { key: k, body: clipBody({ phraseId }) });
      assert.equal(res.status, 404, `phrase ${phraseId}: ${res.text}`);
      assert.equal(res.json?.code, "unknown_phrase");
    }
    // The other language's own key does not reach this language's phrase either.
    const cross = await call("POST", path, {
      key: key("record", OTHER_LANG),
      body: clipBody({ language: OTHER_LANG, phraseId: zoneIds[0] }),
    });
    assert.equal(cross.status, 404);
    assert.equal((await clipRows(OTHER_LANG)).length, 0);
  });

  it("refuses what is not a short audio take", async () => {
    const k = key("record");
    assert.equal((await call("POST", path, { key: k, body: clipBody({ mimeType: "text/plain" }) })).status, 400);
    assert.equal((await call("POST", path, { key: k, body: clipBody({ audioBase64: "" }) })).status, 400);
    assert.equal((await call("POST", path, { key: k, body: clipBody({ audioBase64: "A".repeat(1024 * 1024 + 1) }) })).status, 400);
    assert.equal((await call("POST", path, { key: k, body: clipBody({ durationMs: 61_000 }) })).status, 400);
    assert.equal((await call("POST", path, { key: k, body: clipBody({ sessionId: "!!" }) })).status, 400);
  });
});

describe("saying it again", () => {
  it("replaces the take in place and clears every verdict on the old one", async () => {
    const sitting = session("again");
    const k = key("record");
    const first = await call("POST", "/api/script-trace/phrase-voice", { key: k, body: clipBody({ sessionId: sitting }) });
    assert.equal(first.status, 200, first.text);
    const [row] = (await clipRows()).filter((r) => r.sessionId === sitting);

    const verdict = await call("POST", "/api/script-trace/phrase-verdict", {
      key: key("review"),
      body: { sessionId: session("rev"), reviewer: REVIEWER, language: LANG, clipId: row!.id, verdict: "approved" },
    });
    assert.equal(verdict.status, 200, verdict.text);

    const newAudio = Buffer.from("the second take").toString("base64");
    const second = await call("POST", "/api/script-trace/phrase-voice", {
      key: k,
      body: clipBody({ sessionId: sitting, audioBase64: newAudio }),
    });
    assert.equal(second.status, 200, second.text);

    const rows = (await clipRows()).filter((r) => r.sessionId === sitting);
    assert.equal(rows.length, 1, "one sitting, one phrase, one row");
    assert.equal(rows[0]!.id, row!.id, "updated in place");
    assert.equal(rows[0]!.audioBase64, newAudio);
    const verdicts = await db
      .select()
      .from(voiceContributionReviewsTable)
      .where(eq(voiceContributionReviewsTable.contributionId, row!.id));
    assert.equal(verdicts.length, 0, "an approval of the first take must not carry over to the second");
  });

  it("the unkeyed passage route cannot rewrite a phrase take behind its verdicts", async () => {
    // Added after this file's one recorded run, with the guard it pins: the
    // passage route upserts on the same (sitting, prompt) key and clears no
    // verdicts, so it must refuse the phrase prefix outright.
    const sitting = session("door");
    const first = await call("POST", "/api/script-trace/phrase-voice", {
      key: key("record"),
      body: clipBody({ sessionId: sitting }),
    });
    assert.equal(first.status, 200, first.text);
    const [row] = (await clipRows()).filter((r) => r.sessionId === sitting);
    const approve = await call("POST", "/api/script-trace/phrase-verdict", {
      key: key("review"),
      body: { sessionId: session("rev"), reviewer: REVIEWER, language: LANG, clipId: row!.id, verdict: "approved" },
    });
    assert.equal(approve.status, 200, approve.text);

    const sideDoor = await call("POST", "/api/script-trace/voice", {
      body: {
        sessionId: sitting,
        script: "Devanagari",
        contributor: SPEAKER,
        promptId: row!.promptId,
        promptText: "anything at all",
        audioBase64: Buffer.from("different bytes").toString("base64"),
        mimeType: "audio/webm",
      },
    });
    assert.equal(sideDoor.status, 400, sideDoor.text);
    // Refused BY THE GUARD, not by a body that happened to fail validation,
    // which would pass the status check above and prove nothing.
    assert.match(String(sideDoor.json?.error ?? ""), /lesson phrase recorder/);
    const [after] = (await clipRows()).filter((r) => r.sessionId === sitting);
    assert.equal(after!.audioBase64, AUDIO, "the approved bytes are untouched");
    const verdicts = await db
      .select()
      .from(voiceContributionReviewsTable)
      .where(eq(voiceContributionReviewsTable.contributionId, row!.id));
    assert.equal(verdicts.length, 1, "and so is the approval of them");

    // Removed here so the summary counts later in this file stay as asserted.
    await db.delete(voiceContributionsTable).where(eq(voiceContributionsTable.id, row!.id));
  });
});

describe("the review half", () => {
  let clipId: number;
  let testClipId: number;
  const reviewSession = session("queue");

  before(async () => {
    const k = key("record");
    const real = clipBody({ sessionId: session("real"), phraseId: zoneIds[2] });
    assert.equal((await call("POST", "/api/script-trace/phrase-voice", { key: k, body: real })).status, 200);
    const testTake = clipBody({ sessionId: session("demo"), contributor: "Test_Owner", phraseId: zoneIds[2] });
    assert.equal((await call("POST", "/api/script-trace/phrase-voice", { key: k, body: testTake })).status, 200);
    const rows = await clipRows();
    clipId = rows.find((r) => r.sessionId === real.sessionId)!.id;
    testClipId = rows.find((r) => r.sessionId === testTake.sessionId)!.id;
  });

  const queue = (reviewer: string, sessionId = reviewSession) =>
    `/api/script-trace/phrase-clips?language=${LANG}&zone=1&sessionId=${sessionId}&reviewer=${encodeURIComponent(reviewer)}`;

  it("serves the queue only to the review key for this language", async () => {
    assert.equal((await call("GET", queue(REVIEWER))).status, 403);
    assert.equal((await call("GET", queue(REVIEWER), { key: key("record") })).status, 403);
    assert.equal((await call("GET", queue(REVIEWER), { key: key("review", OTHER_LANG) })).status, 403);
  });

  it("lists clips by phrase without a single name, and hides test takes from a real reviewer", async () => {
    const res = await call("GET", queue(REVIEWER), { key: key("review") });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(res.json.phrasesTotal, 3);
    assert.doesNotMatch(res.text, new RegExp(SPEAKER, "i"), "no contributor name leaves the server");
    assert.doesNotMatch(res.text, /Test_Owner/i);
    assert.doesNotMatch(res.text, /audioBase64/, "the list never carries audio");
    const item = res.json.items.find((i: { phraseId: number }) => i.phraseId === zoneIds[2]);
    assert.ok(item, "the phrase with a take is in the queue");
    assert.equal(item.nativeScript, "stop2 first");
    const ids = item.clips.map((c: { clipId: number }) => c.clipId);
    assert.ok(ids.includes(clipId));
    assert.ok(!ids.includes(testClipId), "a test take stays out of a real speaker's queue");
    assert.equal(item.clips.find((c: { clipId: number }) => c.clipId === clipId).myVerdict, null);

    const tester = await call("GET", queue("Test_Reviewer"), { key: key("review") });
    const testerIds = tester.json.items
      .find((i: { phraseId: number }) => i.phraseId === zoneIds[2])
      .clips.map((c: { clipId: number }) => c.clipId);
    assert.ok(testerIds.includes(testClipId), "a tester can walk through a test take");
  });

  it("never offers a reviewer their own recording", async () => {
    const res = await call("GET", queue(SPEAKER), { key: key("review") });
    assert.equal(res.status, 200, res.text);
    const all = res.json.items.flatMap((i: { clips: { clipId: number }[] }) => i.clips.map((c) => c.clipId));
    assert.ok(!all.includes(clipId));
    assert.ok(res.json.ownClipsHidden > 0, "and says how many it left out");
  });

  it("plays a clip's audio to the review key, for this language only", async () => {
    const path = `/api/script-trace/phrase-clips/${clipId}/audio?language=${LANG}`;
    assert.equal((await call("GET", path)).status, 403);
    assert.equal((await call("GET", path, { key: key("record") })).status, 403);
    const res = await call("GET", path, { key: key("review") });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.json.mimeType, "audio/webm;codecs=opus");
    assert.equal(res.json.audioBase64, AUDIO);
    const wrongLang = await call("GET", `/api/script-trace/phrase-clips/${clipId}/audio?language=${OTHER_LANG}`, {
      key: key("review", OTHER_LANG),
    });
    assert.equal(wrongLang.status, 404, "a key for another language reaches none of this one's clips");
  });

  it("stores a verdict, shows it back to that sitting only, and replaces it on a change of mind", async () => {
    const body = { sessionId: reviewSession, reviewer: REVIEWER, language: LANG, clipId, verdict: "approved" };
    assert.equal((await call("POST", "/api/script-trace/phrase-verdict", { body })).status, 403);
    assert.equal((await call("POST", "/api/script-trace/phrase-verdict", { key: key("record"), body })).status, 403);

    const ok = await call("POST", "/api/script-trace/phrase-verdict", { key: key("review"), body });
    assert.equal(ok.status, 200, ok.text);
    const mine = await call("GET", queue(REVIEWER), { key: key("review") });
    const clip = mine.json.items
      .flatMap((i: { clips: { clipId: number; myVerdict: string | null }[] }) => i.clips)
      .find((c: { clipId: number }) => c.clipId === clipId);
    assert.equal(clip.myVerdict, "approved");
    const someoneElse = await call("GET", queue(REVIEWER, session("other")), { key: key("review") });
    const theirs = someoneElse.json.items
      .flatMap((i: { clips: { clipId: number; myVerdict: string | null }[] }) => i.clips)
      .find((c: { clipId: number }) => c.clipId === clipId);
    assert.equal(theirs.myVerdict, null, "a verdict belongs to the sitting that gave it");

    const changed = await call("POST", "/api/script-trace/phrase-verdict", {
      key: key("review"),
      body: { ...body, verdict: "rejected", note: "  the last word is cut off  " },
    });
    assert.equal(changed.status, 200, changed.text);
    const rows = await db
      .select()
      .from(voiceContributionReviewsTable)
      .where(eq(voiceContributionReviewsTable.contributionId, clipId));
    const forSitting = rows.filter((r) => r.sessionId === reviewSession);
    assert.equal(forSitting.length, 1, "a change of mind replaces, never adds");
    assert.equal(forSitting[0]!.verdict, "rejected");
    assert.equal(forSitting[0]!.note, "the last word is cut off");
    assert.equal(forSitting[0]!.reviewer, REVIEWER);
  });

  it("refuses a speaker reviewing their own take, and stores nothing", async () => {
    const before = await db
      .select()
      .from(voiceContributionReviewsTable)
      .where(eq(voiceContributionReviewsTable.contributionId, clipId));
    const res = await call("POST", "/api/script-trace/phrase-verdict", {
      key: key("review"),
      body: { sessionId: session("self"), reviewer: " speakerone ", language: LANG, clipId, verdict: "approved" },
    });
    assert.equal(res.status, 409, res.text);
    assert.equal(res.json?.code, "own_recording");
    const afterRows = await db
      .select()
      .from(voiceContributionReviewsTable)
      .where(eq(voiceContributionReviewsTable.contributionId, clipId));
    assert.equal(afterRows.length, before.length);
  });

  it("refuses a verdict on a clip of another language or a bad word", async () => {
    const res = await call("POST", "/api/script-trace/phrase-verdict", {
      key: key("review", OTHER_LANG),
      body: { sessionId: session("x"), reviewer: REVIEWER, language: OTHER_LANG, clipId, verdict: "approved" },
    });
    assert.equal(res.status, 404);
    const bad = await call("POST", "/api/script-trace/phrase-verdict", {
      key: key("review"),
      body: { sessionId: session("x"), reviewer: REVIEWER, language: LANG, clipId, verdict: "maybe" },
    });
    assert.equal(bad.status, 400);
  });

  it("counts for the Nest with the same rule", async () => {
    // One real take of stop 2's phrase, rejected above by a real reviewer; a
    // test take beside it that counts for nothing; and whatever the other
    // cases left on stop 1.
    const summary = await summarizeZoneClips(LANG, 1);
    assert.ok(summary);
    assert.equal(summary.phrases, 3);
    const row = summary.rows.find((r) => r.phraseId === zoneIds[2])!;
    assert.equal(row.takes, 1, "the test take is not a take");
    assert.equal(row.notRightTakes, 1);
    assert.equal(row.progress, "not_right");

    await call("POST", "/api/script-trace/phrase-verdict", {
      key: key("review"),
      body: { sessionId: session("second"), reviewer: "ReviewerThree", language: LANG, clipId, verdict: "approved" },
    });
    const still = await summarizeZoneClips(LANG, 1);
    assert.equal(
      still!.rows.find((r) => r.phraseId === zoneIds[2])!.progress,
      "not_right",
      "a later approval does not overrule an objection",
    );
    assert.equal(still!.approved, 0);
  });

  it("takes the verdicts with a deleted clip", async () => {
    await db.delete(voiceContributionsTable).where(eq(voiceContributionsTable.id, clipId));
    const rows = await db
      .select()
      .from(voiceContributionReviewsTable)
      .where(eq(voiceContributionReviewsTable.contributionId, clipId));
    assert.equal(rows.length, 0, "ON DELETE CASCADE, so a deletion request is one statement");
  });
});
