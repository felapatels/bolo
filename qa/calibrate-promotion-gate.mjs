#!/usr/bin/env node
// Scoring v2 promotion-gate calibration harness (STEP 5, post-session queue).
//
// Consumes qa/pilot-results/manifest.json (from qa/harvest-pilot-corpus.mjs).
// Per labeled clip: 3 parallel gpt-audio calls via the AI-integrations proxy
// base URL (NEVER the direct OpenAI key), 5s timeout each, median-of-3, using
// the audio rubric from the v2 spec section 2 verbatim (prompt-enforced JSON;
// gpt-audio rejects response_format). input_audio format comes from the
// manifest's sniff field (webm vs m4a).
//
// Raw results: qa/pilot-results/calibration/results.jsonl (gitignored; clips
// referenced by R2 key, no audio ever enters the repo). The run is
// RESUME-SAFE: already-scored clip keys are skipped, so the harness can be
// re-invoked until the corpus is complete (long shells die; see memory).
//
// Usage:
//   node qa/calibrate-promotion-gate.mjs             # score remaining clips
//   node qa/calibrate-promotion-gate.mjs --limit 2   # smoke test
//   node qa/calibrate-promotion-gate.mjs --report    # analysis only, no calls
//
// Acceptance criteria (CALIBRATION RULING, August 2, 2026, supersedes the
// round-1 set; per language, monosyllabic targets excluded from all criteria):
//   BINDING:
//   - no wrong_attempt median >= 68 (good band), and none promotes (>= 93)
//   - no subtle_error clip promotes (median < 93)
//   - no american_accent clip promotes (all medians < 93)
//   - native clips promote (median >= 93) at >= 80%
//   - per-clip ensemble spread (max-min of raw scores) <= 30
//   ADVISORY (reported, non-gating):
//   - wrong_attempt medians >= 55 (count)
//   - subtle_error below 55 (proportion, 25% target)
// Monosyllables (ha/na/any single-syllable target) are excluded from gate
// criteria AND (binding v2 design ruling) from production judge promotion.
// Unscoreable (ensembleFailed) clips are excluded from all denominators.

import { createRequire } from "node:module";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(path.join(HERE, "../artifacts/api-server/package.json"));
const { S3Client, GetObjectCommand } = require_("@aws-sdk/client-s3");

const { values: args } = parseArgs({
  options: {
    limit: { type: "string" },
    report: { type: "boolean", default: false },
  },
});

const AI_BASE_URL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const AI_API_KEY = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;
if (!args.report && (!AI_BASE_URL || !AI_API_KEY)) {
  console.error("AI_INTEGRATIONS_OPENAI_BASE_URL / _API_KEY not set");
  process.exit(1);
}

const MANIFEST_PATH = path.join(HERE, "pilot-results/manifest.json");
const OUT_DIR = path.join(HERE, "pilot-results/calibration");
const RESULTS_PATH = path.join(OUT_DIR, "results.jsonl");
mkdirSync(OUT_DIR, { recursive: true });

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
const LANG_NAMES = { gu: "Gujarati", hi: "Hindi", mr: "Marathi" };

// ── Audio rubric prompt (verbatim from spec §2) ──────────────────────────────
const AUDIO_RUBRIC_PROMPT = `You are a warm, encouraging pronunciation coach for a learner. You will hear their attempt and the target phrase. Judge the AUDIO directly -- how it sounds -- not any spelling or script.

Score with this rubric:
1. Phoneme accuracy (most important): how many of the target consonant and vowel sounds are present, in order. Aspiration, vowel length, and retroflex vs dental distinctions all count.
2. Accent and delivery: does it sound like the target language, or like the learner's L1 is bleeding through heavily?
3. Syllable count and stress: right number of syllables in the right order, correct emphasis.

Score bands:
- 90-100: all sounds present and in order; native-like delivery; at most one tiny vowel-quality slip.
- 80-89: recognizably the target phrase; one small sound off, or mild accent that does not distort the phonemes.
- 60-79: clearly attempting the target; one syllable or a couple of sounds wrong or missing; noticeable but not overwhelming accent.
- 40-59: some overlap with the target; multiple sounds or syllables wrong, or very heavy accent.
- 10-39: mostly a different word or phrase.
- 0-9: unrelated speech or noise.

If the speaker sounds like a fluent native, score 95-100; do not reserve scores above 92 for flawlessness.

For very short targets (1-2 syllables), apply the same bands per sound. Within each band, pick a specific score that reflects exactly how close the attempt was -- avoid rounding to 5 or 10 unless the attempt truly sits at that boundary. For example, within 80-89 prefer 83 or 87 over always writing 85.

Always be kind and motivating. This feedback will be READ ALOUD to the learner, so write it like you are talking to them face to face: friendly, playful, conversational. React to how they did first, name one specific thing they did well, and if it was not perfect, gently name the one sound to work on. Reply ONLY as JSON with keys: score (integer 0-100), passed (boolean, true if score>=80), feedback (three to four warm chatty sentences spoken directly), tip (one short friendly concrete pronunciation tip). Address them as "you". No emojis or special symbols.`;

// ── R2 clip download (cache in /tmp; recordings never enter the repo) ────────
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  requestChecksumCalculation: "WHEN_REQUIRED",
});

// gpt-audio input_audio accepts ONLY wav and mp3 (confirmed empirically via a
// 400 on 'webm'; the spec's webm/m4a passthrough does not survive the real
// API). Convert every clip to 16kHz mono MP3 with ffmpeg; the manifest sniff
// field names the temp input extension so ffmpeg demuxes correctly.
// 0.4s of silence is padded on BOTH ends of every clip uniformly: in round 1
// gpt-audio intermittently refused short clips as "no audio" and padding
// rescued 10 of 14 (round 1 did this ad hoc in the tmp cache; it is now baked
// in, with a fresh cache dir so no unpadded round-1 file is ever reused).
const CLIP_TMP_DIR = "/tmp/pilot-corpus-mp3-padded";
mkdirSync(CLIP_TMP_DIR, { recursive: true });

async function fetchClipMp3B64(clipKey, sniff) {
  const base = path.basename(clipKey).replace(/\.m4a$/, "");
  const inPath = path.join(CLIP_TMP_DIR, `${base}.${sniff === "webm" ? "webm" : "m4a"}`);
  const outPath = path.join(CLIP_TMP_DIR, `${base}.mp3`);
  if (!existsSync(outPath)) {
    const res = await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: clipKey }));
    writeFileSync(inPath, Buffer.from(await res.Body.transformToByteArray()));
    const r = spawnSync("ffmpeg", ["-y", "-i", inPath, "-ar", "16000", "-ac", "1", "-af", "adelay=400|400,apad=pad_dur=0.4", outPath], {
      encoding: "buffer",
      maxBuffer: 64 * 1024 * 1024,
    });
    if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr.toString("utf8").slice(-300)}`);
  }
  return readFileSync(outPath).toString("base64");
}

// ── gpt-audio ensemble (spec §2: 3 parallel, 5s timeout, median) ─────────────
const CALL_TIMEOUT_MS = 5000;

async function gradeOnce(b64, format, langName, targetNative, targetRomanized) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS);
  try {
    const resp = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${AI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-audio",
        modalities: ["text"],
        messages: [
          { role: "system", content: AUDIO_RUBRIC_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: `Language: ${langName}\nTarget: ${targetNative}\nRomanized: ${targetRomanized}\n\nGrade this attempt.` },
              { type: "input_audio", input_audio: { data: b64, format } },
            ],
          },
        ],
        max_tokens: 200,
      }),
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error(`gpt-audio ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content ?? "{}";
    let j = {};
    try {
      j = JSON.parse(content.replace(/^```json?\n?/m, "").replace(/\n?```$/m, "").trim());
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) try { j = JSON.parse(m[0]); } catch {}
    }
    if (typeof j.score !== "number" && typeof j.score !== "string") throw new Error(`no score in: ${String(content).slice(0, 120)}`);
    return {
      score: Math.max(0, Math.min(100, Math.round(Number(j.score)))),
      feedback: j.feedback ?? "",
      tip: j.tip ?? "",
    };
  } finally {
    clearTimeout(timer);
  }
}

// The AI-integrations proxy rate-limits hard bursts (429 RATELIMIT_EXCEEDED).
// Back off and retry on 429 only; other failures surface to the ensemble.
async function gradeOnceRetrying(b64, format, langName, nat, rom) {
  const waits = [3000, 8000, 15000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await gradeOnce(b64, format, langName, nat, rom);
    } catch (err) {
      if (attempt < waits.length && /429/.test(String(err.message))) {
        await new Promise((res) => setTimeout(res, waits[attempt]));
        continue;
      }
      throw err;
    }
  }
}

async function ensemble(b64, format, langName, nat, rom) {
  const round = async () =>
    Promise.allSettled([
      gradeOnceRetrying(b64, format, langName, nat, rom),
      gradeOnceRetrying(b64, format, langName, nat, rom),
      gradeOnceRetrying(b64, format, langName, nat, rom),
    ]);
  let settled = await round();
  let ok = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
  let errors = settled.flatMap((s) => (s.status === "rejected" ? [String(s.reason?.message ?? s.reason).slice(0, 160)] : []));
  // One retry round if the ensemble failed (<2 successes), harness
  // robustness against transient timeouts, not a re-run of the calibration.
  if (ok.length < 2) {
    settled = await round();
    ok = ok.concat(settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : [])));
    errors = errors.concat(settled.flatMap((s) => (s.status === "rejected" ? [String(s.reason?.message ?? s.reason).slice(0, 160)] : [])));
    ok = ok.slice(0, 3);
  }
  if (ok.length < 2) return { failed: true, errors };
  const raw = ok.map((s) => s.score);
  const sorted = [...raw].sort((a, b) => a - b);
  const median = sorted.length === 3 ? sorted[1] : Math.round((sorted[0] + sorted[1]) / 2);
  const spread = sorted[sorted.length - 1] - sorted[0];
  const anchor = ok.reduce((best, s) => (Math.abs(s.score - median) < Math.abs(best.score - median) ? s : best));
  return { failed: false, median, raw, spread, feedback: anchor.feedback, tip: anchor.tip, errors };
}

// ── Scoring pass (resume-safe) ───────────────────────────────────────────────
function loadResults() {
  const byKey = new Map();
  if (existsSync(RESULTS_PATH)) {
    for (const line of readFileSync(RESULTS_PATH, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const r = JSON.parse(line);
      byKey.set(r.clipKey, r);
    }
  }
  return byKey;
}

async function mapLimit(items, limit, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        await fn(items[idx]);
      }
    }),
  );
}

if (!args.report) {
  const done = loadResults();
  // Failed records are retryable on resume; loadResults keeps the LAST record
  // per clipKey, so a later success supersedes an earlier failure.
  let pending = manifest.clips.filter((c) => !done.has(c.clipKey) || done.get(c.clipKey).failed);
  if (args.limit) pending = pending.slice(0, Number(args.limit));
  const okCount = [...done.values()].filter((r) => !r.failed).length;
  console.log(`clips total ${manifest.clips.length}, scored ok ${okCount}, scoring now: ${pending.length}`);
  let n = 0;
  await mapLimit(pending, 2, async (c) => {
    const langName = LANG_NAMES[c.languageCode] ?? c.languageCode;
    try {
      const b64 = await fetchClipMp3B64(c.clipKey, c.sniff);
      const r = await ensemble(b64, "mp3", langName, c.targetNative, c.targetRomanized);
      const record = {
        clipKey: c.clipKey,
        tester: c.tester,
        languageCode: c.languageCode,
        label: c.label,
        source: c.source,
        sniff: c.sniff,
        targetRomanized: c.targetRomanized,
        ...r,
        gradedAt: new Date().toISOString(),
      };
      appendFileSync(RESULTS_PATH, JSON.stringify(record) + "\n");
      n++;
      console.log(
        `[${n}/${pending.length}] ${c.tester} ${c.languageCode} "${c.targetRomanized}" ${c.label}: ` +
          (r.failed ? `ENSEMBLE FAILED (${r.errors.join(" | ")})` : `median ${r.median} raw [${r.raw.join(",")}] spread ${r.spread}`),
      );
    } catch (err) {
      console.error(`  ${c.clipKey}: hard error ${err.message}`);
    }
  });
}

// ── Analysis vs ratified acceptance criteria ─────────────────────────────────
const results = [...loadResults().values()];
const scored = results.filter((r) => !r.failed);
const failedClips = results.filter((r) => r.failed);
const remaining = manifest.clips.length - results.length;
console.log(`\n══ ANALYSIS ══ scored ${scored.length}/${manifest.clips.length} (ensembleFailed ${failedClips.length}, unscored ${remaining})`);
if (remaining > 0) console.log("RE-RUN the harness to score remaining clips before treating this as final.");

const PROMOTE = 93;
const GOOD_BAND = 68;

// Monosyllable exclusion (calibration ruling Aug 2, 2026): single-word target
// with at most one vowel group, e.g. "ha", "na". Excluded from all gate
// criteria; ALSO a binding v2 design ruling, monosyllables are never
// judge-promoted in production (text-path result stands).
function isMonosyllabic(rom) {
  const w = String(rom).toLowerCase().replace(/[^a-z\s]/g, "").trim();
  if (!w || /\s/.test(w)) return false;
  return (w.match(/[aeiou]+/g)?.length ?? 0) <= 1;
}

const langs = [...new Set(scored.map((r) => r.languageCode))].sort();
for (const lang of langs) {
  const all = scored.filter((r) => r.languageCode === lang);
  const mono = all.filter((r) => isMonosyllabic(r.targetRomanized));
  const L = all.filter((r) => !isMonosyllabic(r.targetRomanized));
  const by = (label) => L.filter((r) => r.label === label);
  const wrong = by("wrong_attempt");
  const american = by("american_accent");
  const native = by("native");
  const subtle = by("subtle_error");

  // BINDING
  const wrongGood = wrong.filter((r) => r.median >= GOOD_BAND);
  const subtlePromoted = subtle.filter((r) => r.median >= PROMOTE);
  const americanBad = american.filter((r) => r.median >= PROMOTE);
  const nativePromoted = native.filter((r) => r.median >= PROMOTE);
  const nativeRate = native.length ? nativePromoted.length / native.length : 0;
  const spreadBad = L.filter((r) => r.spread > 30);
  // ADVISORY (non-gating)
  const wrong55 = wrong.filter((r) => r.median >= 55);
  const subtleLow = subtle.filter((r) => r.median < 55);
  const subtleLowPct = subtle.length ? (subtleLow.length / subtle.length) * 100 : 0;

  console.log(`\n── ${LANG_NAMES[lang] ?? lang} (${lang}), gated clips: native ${native.length}, american ${american.length}, subtle ${subtle.length}, wrong ${wrong.length} (monosyllables excluded: ${mono.length})`);
  const line = (okFlag, txt) => console.log(`  ${okFlag ? "PASS" : "FAIL"}  ${txt}`);
  line(wrongGood.length === 0, `BINDING no wrong_attempt >= ${GOOD_BAND} (good band) nor promoting (violations: ${wrongGood.length})`);
  line(subtlePromoted.length === 0, `BINDING no subtle_error promotes, medians < ${PROMOTE} (violations: ${subtlePromoted.length})`);
  line(americanBad.length === 0, `BINDING no american_accent promotes, medians < ${PROMOTE} (violations: ${americanBad.length})`);
  line(nativeRate >= 0.8, `BINDING native promotes >= 80% (actual ${(nativeRate * 100).toFixed(0)}%: ${nativePromoted.length}/${native.length})`);
  line(spreadBad.length === 0, `BINDING per-clip 3-run spread <= 30 (violations: ${spreadBad.length})`);
  console.log(`  ADVISORY wrong_attempt >= 55 (target 0): ${wrong55.length}`);
  console.log(`  ADVISORY subtle_error < 55 (target <= 25%): ${subtleLow.length}/${subtle.length} (${subtleLowPct.toFixed(0)}%)`);
  for (const [name, list] of [["wrong_attempt >= 68", wrongGood], ["subtle_error >= 93", subtlePromoted], ["american_accent >= 93", americanBad], ["spread > 30", spreadBad], ["advisory wrong >= 55", wrong55.filter((r) => r.median < GOOD_BAND)], ["advisory subtle < 55", subtleLow]]) {
    for (const r of list) console.log(`     ${name}: ${r.clipKey} (${r.tester} "${r.targetRomanized}") median ${r.median} raw [${r.raw.join(",")}] spread ${r.spread}`);
  }
  const nativeMisses = native.filter((r) => r.median < PROMOTE);
  if (nativeRate < 0.8) for (const r of nativeMisses) console.log(`     native not promoted: ${r.clipKey} (${r.tester} "${r.targetRomanized}") median ${r.median} raw [${r.raw.join(",")}]`);
  for (const r of mono) console.log(`     [mono, excluded] ${r.label}: ${r.clipKey} (${r.tester} "${r.targetRomanized}") median ${r.median}`);
}
for (const r of failedClips) console.log(`ensembleFailed: ${r.clipKey} (${r.tester} ${r.languageCode} "${r.targetRomanized}" ${r.label}) errors: ${(r.errors ?? []).join(" | ")}`);
