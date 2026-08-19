#!/usr/bin/env node
// qa/noise-robustness-bench.mjs, Noise Robustness Bench (Task #1028).
//
// Measures what background noise costs a learner, and whether any cleanup
// chain buys it back, by re-scoring the FROZEN labelled pilot corpus at a
// controlled signal-to-noise ladder through several pre-transcription
// treatments. Measurement only: nothing here touches the live route.
//
// It reuses the REAL scoring logic (imported from the api-server sources, not
// copied): dual-pass STT -> chooseConservativeTranscript -> compareToTarget ->
// applyScoreGuards -> HONESTY cap -> bandFromScore. The one substitution is
// the stochastic gpt-5.4-mini judge, replaced by a deterministic monotone
// transcript proxy (round(sim*100)) so a score delta measures the NOISE, not
// judge variance; see the findings doc for why and what it costs.
//
// Usage (single command, self-reexecs under the tsx loader):
//   node qa/noise-robustness-bench.mjs --select              # pick the sample
//   node qa/noise-robustness-bench.mjs --run --limit 10      # cost slice
//   node qa/noise-robustness-bench.mjs --run --max-minutes 60
//   node qa/noise-robustness-bench.mjs --run --bitrate-lever
//   node qa/noise-robustness-bench.mjs --report
//
// The run is RESUMABLE: every completed run appends one JSONL record keyed by
// runId, and a re-invocation skips finished runIds. Long background jobs die
// in this environment, so drive it in foreground chunks with --max-minutes.
//
// NEVER run qa/harvest-pilot-corpus.mjs: it overwrites the frozen manifest.
// Recordings stay in R2; only /tmp caches hold audio (storage rule).

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");

// ── Self-reexec under tsx so we can import the real .ts scoring modules ──────
// tsx is a transitive dep and is not exposed on the workspace .bin (see agent
// memory "Running one-off tsx scripts"), so resolve its ESM cli directly.
if (!process.env.__NOISE_BENCH_TSX) {
  const glob = spawnSync("bash", ["-lc", `ls ${ROOT}/node_modules/.pnpm/tsx@*/node_modules/tsx/dist/cli.mjs | head -1`], { encoding: "utf8" });
  const cli = glob.stdout.trim();
  if (!cli) {
    console.error("tsx cli not found under node_modules/.pnpm, cannot load the real scoring modules");
    process.exit(1);
  }
  const r = spawnSync(process.execPath, [cli, fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, __NOISE_BENCH_TSX: "1" },
  });
  process.exit(r.status ?? 1);
}

// Real scoring logic, imported, never reimplemented.
const {
  compareToTarget,
  chooseConservativeTranscript,
  applyScoreGuards,
  isEffectivelyEmpty,
  simToScore,
  normalizeLatin,
} = await import(path.join(ROOT, "artifacts/api-server/src/lib/pronunciationGuards.ts"));
const { bandFromScore } = await import(path.join(ROOT, "artifacts/api-server/src/lib/scoreBands.ts"));
const { HONESTY_SCORE_CAP } = await import(path.join(ROOT, "artifacts/api-server/src/lib/evaluationToken.ts"));
// Real dual-pass transcription (same helper the route calls).
const { speechToText } = await import(path.join(ROOT, "lib/integrations-openai-ai-server/src/audio/client.ts"));

const require_ = createRequire(path.join(ROOT, "artifacts/api-server/package.json"));
const { S3Client, GetObjectCommand } = require_("@aws-sdk/client-s3");

// ── CLI ──────────────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    select: { type: "boolean", default: false },
    run: { type: "boolean", default: false },
    report: { type: "boolean", default: false },
    "rig-check": { type: "boolean", default: false },
    "bitrate-lever": { type: "boolean", default: false },
    control: { type: "boolean", default: false }, // repeat the clean baseline to measure run-to-run STT variance
    replicate: { type: "string" }, // e.g. "babble:snr20,broadband:snr12", re-run whole cells to test a standout result
    limit: { type: "string" },
    clips: { type: "string" }, // run the FULL matrix for the first N sampled clips (cost slice)
    "max-minutes": { type: "string" },
    concurrency: { type: "string", default: "3" },
    levels: { type: "string" }, // e.g. "clean,snr12,snr0" to cut the ladder
  },
});

const SEED = 1028; // fixed: repeat runs stay comparable
const SAMPLE_SIZE = 80;
const LEAD_SECONDS = 0.6; // noise-only opening the profile pipeline reads
const MANIFEST_PATH = path.join(HERE, "pilot-results/manifest.json");
const OUT_DIR = path.join(HERE, "pilot-results/noise-bench");
const SAMPLE_PATH = path.join(OUT_DIR, "sample.json");
const RESULTS_PATH = path.join(OUT_DIR, "results.jsonl");
const SUMMARY_PATH = path.join(OUT_DIR, "summary.md");
const CACHE_DIR = "/tmp/noise-bench-cache"; // audio never enters the repo
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(CACHE_DIR, { recursive: true });

const LANG_NAMES = { gu: "Gujarati", hi: "Hindi", mr: "Marathi" };
const LEVELS = ["clean", "snr20", "snr12", "snr6", "snr0"];
const SNR_DB = { snr20: 20, snr12: 12, snr6: 6, snr0: 0 };
const PIPELINES = ["passthrough", "generic", "profiled", "profiled_trim"];
// Labels whose scores are EXPECTED to be low: a wrong_attempt scoring badly is
// the protocol working, not a noise regression (pilot corpus label protocol).
const QUALITY_LABELS = ["native", "american_accent", "subtle_error"];

// ── deterministic helpers ────────────────────────────────────────────────────

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
const clipHash = (key) => fnv1a(`${SEED}:${key}`);

function sh(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, { encoding: "buffer", maxBuffer: 256 * 1024 * 1024, ...opts });
  const err = (r.stderr ?? Buffer.alloc(0)).toString("utf8");
  if (r.status !== 0) throw new Error(`${cmd} failed (${r.status}): ${err.slice(-500)}`);
  return { stdout: r.stdout, stderr: err };
}
function ff(...argv) {
  return sh("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...argv]);
}
function probeDuration(file) {
  const r = sh("ffprobe", ["-v", "quiet", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file]);
  return parseFloat(r.stdout.toString("utf8").trim());
}
/** mean_volume (dBFS) of a file, optionally over a window. */
function meanVolume(file, start, dur) {
  const argv = ["-hide_banner"];
  if (start != null) argv.push("-ss", String(start));
  if (dur != null) argv.push("-t", String(dur));
  argv.push("-i", file, "-af", "volumedetect", "-f", "null", "-");
  const r = spawnSync("ffmpeg", argv, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  const m = (r.stderr + r.stdout).match(/mean_volume:\s*([-\d.]+)\s*dB/);
  return m ? parseFloat(m[1]) : -91;
}

// ── R2 ───────────────────────────────────────────────────────────────────────

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;
let r2 = null;
function r2Client() {
  if (r2) return r2;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    throw new Error("Missing R2 env vars (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME)");
  }
  r2 = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  return r2;
}

/** Download a corpus clip and decode it to the canonical 16 kHz mono WAV. */
async function sourceWav(clip) {
  const base = path.basename(clip.clipKey).replace(/\.[a-z0-9]+$/i, "");
  const wav = path.join(CACHE_DIR, `src-${base}.wav`);
  if (existsSync(wav)) return wav;
  const raw = path.join(CACHE_DIR, `src-${base}.${clip.sniff === "webm" ? "webm" : "m4a"}`);
  if (!existsSync(raw)) {
    const res = await r2Client().send(new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: clip.clipKey }));
    writeFileSync(raw, Buffer.from(await res.Body.transformToByteArray()));
  }
  ff("-i", raw, "-ar", "16000", "-ac", "1", "-acodec", "pcm_s16le", wav);
  return wav;
}

// ── Step 1: stratified sample ────────────────────────────────────────────────

function readManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    console.error(`Missing ${MANIFEST_PATH}. It is the frozen round-2 corpus record and is NOT regenerable here.`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}

function selectSample() {
  const manifest = readManifest();
  const clips = manifest.clips;
  // Strata = tester x language x label. Largest-remainder allocation keeps all
  // three marginals proportional; ties break on the seeded clip hash so the
  // selection is reproducible.
  const strata = new Map();
  for (const c of clips) {
    const key = `${c.tester}|${c.languageCode}|${c.label}`;
    if (!strata.has(key)) strata.set(key, []);
    strata.get(key).push(c);
  }
  const keys = [...strata.keys()].sort();
  const exact = keys.map((k) => (strata.get(k).length * SAMPLE_SIZE) / clips.length);
  const alloc = exact.map((e) => Math.floor(e));
  let remaining = SAMPLE_SIZE - alloc.reduce((a, b) => a + b, 0);
  const order = keys
    .map((k, i) => ({ i, k, frac: exact[i] - alloc[i] }))
    .sort((a, b) => b.frac - a.frac || fnv1a(`${SEED}:${a.k}`) - fnv1a(`${SEED}:${b.k}`));
  for (const o of order) {
    if (remaining <= 0) break;
    if (alloc[o.i] < strata.get(o.k).length) {
      alloc[o.i]++;
      remaining--;
    }
  }

  const selected = [];
  keys.forEach((k, i) => {
    const pool = [...strata.get(k)].sort((a, b) => clipHash(a.clipKey) - clipHash(b.clipKey));
    for (const c of pool.slice(0, alloc[i])) selected.push({ ...c, stratum: k });
  });
  selected.sort((a, b) => a.stratum.localeCompare(b.stratum) || clipHash(a.clipKey) - clipHash(b.clipKey));

  // Noise type is assigned per clip (not crossed with the ladder) so both noise
  // characters are covered inside the 1,600-run budget: alternating within each
  // stratum keeps tester/language/label balance on both halves.
  // A single counter walking the stratum-ordered list alternates the two noise
  // characters, so the halves split 40/40 AND stay balanced inside each
  // stratum (a per-stratum counter would hand every singleton stratum to the
  // first noise type).
  selected.forEach((c, i) => {
    c.noiseType = i % 2 === 0 ? "broadband" : "babble";
  });

  // Babble bed sources: clips NOT in the sample, spread across testers/langs.
  const chosen = new Set(selected.map((c) => c.clipKey));
  const babbleSources = clips
    .filter((c) => !chosen.has(c.clipKey))
    .sort((a, b) => clipHash(a.clipKey) - clipHash(b.clipKey))
    .slice(0, 8)
    .map((c) => ({ clipKey: c.clipKey, sniff: c.sniff, tester: c.tester, languageCode: c.languageCode }));

  const out = {
    generatedAt: null, // deterministic file: no timestamp so re-selection is a no-op diff
    seed: SEED,
    sampleSize: selected.length,
    corpusSize: clips.length,
    manifestGeneratedAt: manifest.generatedAt,
    noiseLadder: LEVELS,
    pipelines: PIPELINES,
    leadSeconds: LEAD_SECONDS,
    // Clip identity only, user ids stay out of the repo.
    clips: selected.map((c) => ({
      clipKey: c.clipKey,
      tester: c.tester,
      languageCode: c.languageCode,
      label: c.label,
      phraseId: c.phraseId,
      targetNative: c.targetNative,
      targetRomanized: c.targetRomanized,
      sniff: c.sniff,
      stratum: c.stratum,
      noiseType: c.noiseType,
      corpusScore: c.score,
    })),
    babbleSources,
  };
  writeFileSync(SAMPLE_PATH, JSON.stringify(out, null, 2) + "\n");

  const tally = (arr, k) => arr.reduce((o, c) => ((o[c[k]] = (o[c[k]] ?? 0) + 1), o), {});
  console.log(`Sample: ${selected.length}/${clips.length} clips (seed ${SEED}) -> ${path.relative(ROOT, SAMPLE_PATH)}`);
  console.log("  tester  ", tally(selected, "tester"), "\n  language", tally(selected, "languageCode"));
  console.log("  label   ", tally(selected, "label"), "\n  noise   ", tally(selected, "noiseType"));
  const corpus = clips;
  for (const k of ["tester", "languageCode", "label"]) {
    const c = tally(corpus, k), s = tally(selected, k);
    const drift = Object.keys(c).map((v) => `${v} ${(100 * (s[v] ?? 0) / selected.length).toFixed(0)}% vs ${(100 * c[v] / corpus.length).toFixed(0)}%`);
    console.log(`  share ${k}: ${drift.join(", ")}`);
  }
  return out;
}

function readSample() {
  if (!existsSync(SAMPLE_PATH)) {
    console.error("No sample yet, run with --select first.");
    process.exit(1);
  }
  return JSON.parse(readFileSync(SAMPLE_PATH, "utf8"));
}

// ── Step 2: noise mixing rig ─────────────────────────────────────────────────

/** Steady broadband room tone (pink noise), rendered once and reused. */
function broadbandBed(seconds) {
  const bed = path.join(CACHE_DIR, `bed-broadband-${seconds}.wav`);
  if (!existsSync(bed)) {
    ff("-f", "lavfi", "-i", `anoisesrc=color=pink:sample_rate=16000:amplitude=0.35:duration=${seconds}:seed=${SEED}`,
      "-ac", "1", "-acodec", "pcm_s16le", bed);
  }
  return bed;
}

/** Speech babble: four staggered streams of other pilot clips, overlapped. */
async function babbleBed(sample, seconds) {
  const bed = path.join(CACHE_DIR, `bed-babble-${seconds}.wav`);
  if (existsSync(bed)) return bed;
  const wavs = [];
  for (const src of sample.babbleSources) wavs.push(await sourceWav(src));
  // Four voices, each a different rotation of the concatenated pool, so no two
  // layers are phase-aligned and the bed reads as a room full of talkers.
  const layers = [];
  for (let v = 0; v < 4; v++) {
    const rotated = wavs.slice(v * 2).concat(wavs.slice(0, v * 2));
    const listFile = path.join(CACHE_DIR, `babble-list-${v}.txt`);
    writeFileSync(listFile, rotated.map((w) => `file '${w}'`).join("\n") + "\n");
    const layer = path.join(CACHE_DIR, `babble-layer-${v}.wav`);
    ff("-f", "concat", "-safe", "0", "-i", listFile,
      "-af", `aloop=loop=-1:size=2e9,atrim=start=${v * 1.7}:duration=${seconds}`,
      "-ar", "16000", "-ac", "1", "-acodec", "pcm_s16le", layer);
    layers.push(layer);
  }
  const inputs = layers.flatMap((l) => ["-i", l]);
  ff(...inputs, "-filter_complex", `amix=inputs=4:duration=shortest:normalize=0,alimiter=limit=0.9,volume=1.0`,
    "-ar", "16000", "-ac", "1", "-acodec", "pcm_s16le", bed);
  return bed;
}

/**
 * Mixed clip = LEAD_SECONDS of noise alone, then the clip with noise over it,
 * at a measured signal-to-noise ratio. The lead is what the profile pipeline
 * reads, and it exists on the clean condition too (as digital silence) so the
 * only thing that changes across the ladder is the noise.
 */
async function mixedClip(clip, level, sample) {
  const base = path.basename(clip.clipKey).replace(/\.[a-z0-9]+$/i, "");
  const out = path.join(CACHE_DIR, `mix-${base}-${clip.noiseType}-${level}.wav`);
  if (existsSync(out)) return out;
  const src = await sourceWav(clip);
  const dur = probeDuration(src);
  const total = dur + LEAD_SECONDS + 0.2;

  const leadPadded = path.join(CACHE_DIR, `lead-${base}.wav`);
  if (!existsSync(leadPadded)) {
    ff("-i", src, "-af", `adelay=${Math.round(LEAD_SECONDS * 1000)},apad=whole_dur=${total.toFixed(3)}`,
      "-ar", "16000", "-ac", "1", "-acodec", "pcm_s16le", leadPadded);
  }
  if (level === "clean") {
    ff("-i", leadPadded, "-ar", "16000", "-ac", "1", "-acodec", "pcm_s16le", out);
    return out;
  }

  const speechDb = meanVolume(src); // level of the learner's own recording
  const bedPath = clip.noiseType === "babble" ? await babbleBed(sample, 90) : broadbandBed(90);
  const bedDb = meanVolume(bedPath);
  const gainDb = speechDb - SNR_DB[level] - bedDb;
  // Deterministic per-clip offset into the bed so every clip hears a different
  // stretch of noise while the run stays reproducible.
  const offset = (clipHash(clip.clipKey) % 60000) / 1000;
  ff("-i", leadPadded, "-ss", offset.toFixed(3), "-t", total.toFixed(3), "-i", bedPath,
    "-filter_complex", `[1:a]volume=${gainDb.toFixed(2)}dB,apad=whole_dur=${total.toFixed(3)}[n];[0:a][n]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.97`,
    "-ar", "16000", "-ac", "1", "-acodec", "pcm_s16le", out);
  return out;
}

// ── Step 3: cleanup pipelines under test ─────────────────────────────────────
//
// Ordering is fixed: PROFILE (read the noise-only opening) -> CLEAN -> TRIM.
// Trimming first would delete the opening the profile comes from.

function pipelineFilter(name, mixedPath) {
  const lead = LEAD_SECONDS;
  switch (name) {
    case "passthrough":
      return null; // today's behaviour: the bytes go straight to STT
    case "generic":
      // A general speech cleanup chain with a FIXED noise floor assumption.
      return "highpass=f=80,lowpass=f=7500,afftdn=nr=12:nf=-25,dynaudnorm=f=200:g=5:p=0.9";
    case "profiled": {
      // afftdn samples the clip's own opening (sn start/stop) instead of
      // assuming a noise floor: the learner's actual background.
      return `highpass=f=80,asendcmd=0.0 afftdn sn start,asendcmd=${(lead - 0.1).toFixed(2)} afftdn sn stop,afftdn=nr=12:nf=-40`;
    }
    case "profiled_trim": {
      // ...then trim to the dominant speech segment. The gate threshold is
      // derived from the measured lead noise level, not a fixed constant, so
      // the trim adapts to how loud the room actually is.
      const leadDb = meanVolume(mixedPath, 0, lead - 0.05);
      const gate = Math.min(-18, leadDb + 8);
      return `highpass=f=80,asendcmd=0.0 afftdn sn start,asendcmd=${(lead - 0.1).toFixed(2)} afftdn sn stop,afftdn=nr=12:nf=-40,` +
        `silenceremove=start_periods=1:start_duration=0.05:start_threshold=${gate.toFixed(1)}dB:detection=rms:` +
        `stop_periods=-1:stop_duration=0.35:stop_threshold=${gate.toFixed(1)}dB`;
    }
    default:
      throw new Error(`unknown pipeline ${name}`);
  }
}

/** Applies a pipeline, returning the processed file and the added wall time. */
function applyPipeline(name, mixedPath, tag) {
  const out = path.join(CACHE_DIR, `proc-${tag}.wav`);
  const t0 = process.hrtime.bigint();
  const filter = pipelineFilter(name, mixedPath);
  if (filter == null) {
    // Time the no-op copy anyway: it is the ffmpeg-invocation floor every other
    // pipeline also pays, so the added-latency table can be read net of it.
    ff("-i", mixedPath, "-c", "copy", out);
    return { file: mixedPath, procMs: Number(process.hrtime.bigint() - t0) / 1e6 };
  }
  ff("-i", mixedPath, "-af", filter, "-ar", "16000", "-ac", "1", "-acodec", "pcm_s16le", out);
  const procMs = Number(process.hrtime.bigint() - t0) / 1e6;
  return { file: out, procMs };
}

// ── Step 4: bitrate lever ────────────────────────────────────────────────────
//
// The mobile recorder writes 16 kHz mono AAC at 32 kbps. A lossy encoder
// spends its bit budget on whatever is loudest, including the background, so
// the encode happens BEFORE the noise mix is scored: re-encode the clip at the
// mobile bitrate vs a higher one, then run the identical ladder.

async function bitrateVariantWav(clip, kbps) {
  const base = path.basename(clip.clipKey).replace(/\.[a-z0-9]+$/i, "");
  const out = path.join(CACHE_DIR, `br${kbps}-${base}.wav`);
  if (existsSync(out)) return out;
  const src = await sourceWav(clip);
  const m4a = path.join(CACHE_DIR, `br${kbps}-${base}.m4a`);
  ff("-i", src, "-c:a", "aac", "-b:a", `${kbps}k`, "-ar", "16000", "-ac", "1", m4a);
  ff("-i", m4a, "-ar", "16000", "-ac", "1", "-acodec", "pcm_s16le", out);
  return out;
}

// ── Step 5: scoring harness (real dual-pass + real guards) ───────────────────

const siblingsByLang = new Map();
function siblingPhrases(sample, languageCode) {
  if (siblingsByLang.has(languageCode)) return siblingsByLang.get(languageCode);
  const manifest = readManifest();
  const seen = new Map();
  for (const c of manifest.clips) {
    if (c.languageCode !== languageCode) continue;
    seen.set(`${c.phraseId}`, { nativeScript: c.targetNative, romanized: c.targetRomanized });
  }
  const list = [...seen.values()];
  siblingsByLang.set(languageCode, list);
  return list;
}

/**
 * The route's scoring, minus the stochastic judge. Everything below the judge
 * (conservative dual-pass choice, similarity, guards, honesty cap, band) is
 * the production code path, imported.
 */
function scoreFromTranscripts({ mini, hq, targetNative, targetRomanized, siblings }) {
  const choice = chooseConservativeTranscript({ mini, hq, targetNative, targetRomanized });
  const transcript = choice.transcript;
  if (isEffectivelyEmpty(transcript)) {
    return {
      transcript, sim: null, score: 0, band: "nocatch",
      nocatchCause: choice.chosenEmptyWithEvidence ? "dual_pass_uncorroborated" : "empty_audio_or_silence",
      disagreement: choice.disagreement, guard: null,
    };
  }
  const target = compareToTarget(transcript, targetNative, targetRomanized);
  const isShortTarget = normalizeLatin(targetRomanized).length <= 4;
  if (target.comparable && target.sim >= 0.93 && !isShortTarget) {
    const score = Math.min(simToScore(target.sim, 0.9), HONESTY_SCORE_CAP);
    return {
      transcript, sim: target.sim, score, band: bandFromScore(score),
      nocatchCause: null, disagreement: choice.disagreement, guard: "fast-path",
    };
  }
  // Judge substitute: monotone in similarity, deterministic.
  const proxy = target.comparable ? Math.max(0, Math.min(100, Math.round(target.sim * 100))) : 0;
  const guarded = applyScoreGuards({
    score: proxy, passed: proxy >= 80, transcript, targetNative, targetRomanized, otherPhrases: siblings,
  });
  if (guarded.nocatch) {
    return {
      transcript, sim: target.comparable ? target.sim : null, score: 0, band: "nocatch",
      nocatchCause: "script_mismatch", disagreement: choice.disagreement, guard: guarded.guard ?? null,
    };
  }
  const score = Math.min(guarded.score, HONESTY_SCORE_CAP);
  return {
    transcript, sim: target.comparable ? target.sim : null, score, band: bandFromScore(score),
    nocatchCause: null, disagreement: choice.disagreement, guard: guarded.guard ?? null,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** STT with backoff: the transcription API rate-limits under burst. */
async function sttWithBackoff(buffer, opts) {
  const waits = [3000, 8000, 15000, 30000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await speechToText(buffer, "wav", opts);
    } catch (err) {
      const msg = String(err?.message ?? err);
      const retryable = /429|rate limit|timeout|ETIMEDOUT|ECONNRESET|5\d\d/i.test(msg);
      if (attempt < waits.length && retryable) {
        await sleep(waits[attempt]);
        continue;
      }
      throw err;
    }
  }
}

async function dualPass(file, clip) {
  const buffer = readFileSync(file);
  const language = LANG_NAMES[clip.languageCode] ?? clip.languageCode;
  const sttOptions = {
    language: clip.languageCode,
    prompt: `A language learner is speaking ${language}. Transcribe exactly what they say.`,
  };
  const t0 = Date.now();
  const [miniRaw, hqRaw] = await Promise.all([
    sttWithBackoff(buffer, sttOptions),
    sttWithBackoff(buffer, { ...sttOptions, highQuality: true }),
  ]);
  return { mini: miniRaw.trim(), hq: hqRaw.trim(), sttMs: Date.now() - t0 };
}

// ── run loop ─────────────────────────────────────────────────────────────────

function readResults() {
  if (!existsSync(RESULTS_PATH)) return new Map();
  const byId = new Map();
  for (const line of readFileSync(RESULTS_PATH, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line);
      if (rec.error) byId.delete(rec.runId); // failures stay retryable
      else byId.set(rec.runId, rec);
    } catch { /* torn line: ignore */ }
  }
  return byId;
}

function plannedRuns(sample, opts) {
  const levels = opts.levels ?? LEVELS;
  const runs = [];
  if (opts.replicate) {
    // Replication: a standout cell re-run end to end. With ~20 cell
    // comparisons at a 2-SE bar, roughly one false positive is expected, so a
    // result only counts once it survives an independent repeat.
    for (const spec of opts.replicate) {
      const [noiseType, level] = spec.split(":");
      for (const clip of sample.clips.filter((c) => c.noiseType === noiseType)) {
        for (const pipeline of PIPELINES) {
          runs.push({ clip, level, pipeline, bitrate: null, experiment: "replicate" });
        }
      }
    }
    return runs;
  }
  if (opts.control) {
    // Variance control: the SAME clean+passthrough condition, transcribed a
    // second time. Transcription is stochastic, so this measures the noise
    // FLOOR of every delta in the report, a treatment that moves a cell by
    // less than this floor has not been shown to do anything.
    for (const clip of sample.clips) {
      runs.push({ clip, level: "clean", pipeline: "passthrough", bitrate: null, experiment: "control" });
    }
    return runs;
  }
  if (opts.bitrateLever) {
    // Separate lever: bitrate x a three-rung ladder subset, passthrough only.
    // Runs the whole sample, a 20-clip slice left the paired SE near ±8, wide
    // enough to hide any effect worth acting on.
    for (const clip of sample.clips) {
      for (const kbps of [32, 96]) {
        for (const level of ["clean", "snr12", "snr6"]) {
          runs.push({ clip, level, pipeline: "passthrough", bitrate: kbps, experiment: "bitrate" });
        }
        // Independent repeat of the standout rung, same bar as every other
        // standout cell: it only counts if it reproduces.
        runs.push({ clip, level: "snr12", pipeline: "passthrough", bitrate: kbps, experiment: "bitrate2" });
      }
    }
    return runs;
  }
  const clips = opts.clipCount
    ? [...sample.clips].sort((a, b) => clipHash(a.clipKey) - clipHash(b.clipKey)).slice(0, opts.clipCount)
    : sample.clips;
  for (const clip of clips) {
    for (const level of levels) {
      for (const pipeline of PIPELINES) {
        runs.push({ clip, level, pipeline, bitrate: null, experiment: "main" });
      }
    }
  }
  return runs;
}

const runIdOf = (r) => `${r.experiment}|${r.clip.clipKey}|${r.clip.noiseType}|${r.level}|${r.pipeline}|${r.bitrate ?? "src"}`;

async function executeRun(r, sample) {
  const runId = runIdOf(r);
  const tag = `${fnv1a(runId)}`;
  let mixed;
  const tPrep = process.hrtime.bigint();
  if (r.experiment === "bitrate") {
    // Re-encode FIRST (the encoder must see the clean speech), then mix noise.
    const encoded = await bitrateVariantWav(r.clip, r.bitrate);
    const shim = { ...r.clip, clipKey: `${r.clip.clipKey}#br${r.bitrate}` };
    // mixedClip caches on clipKey; point it at the re-encoded wav via a copy.
    const base = path.basename(shim.clipKey).replace(/[^\w.-]/g, "_");
    const srcCopy = path.join(CACHE_DIR, `src-${base}.wav`);
    if (!existsSync(srcCopy)) ff("-i", encoded, "-ar", "16000", "-ac", "1", "-acodec", "pcm_s16le", srcCopy);
    mixed = await mixedClip({ ...shim, clipKey: `${base}.wav` }, r.level, sample);
  } else {
    mixed = await mixedClip(r.clip, r.level, sample);
  }
  const mixMs = Number(process.hrtime.bigint() - tPrep) / 1e6;
  const { file, procMs } = applyPipeline(r.pipeline, mixed, tag);
  const durationSec = probeDuration(file);
  const { mini, hq, sttMs } = await dualPass(file, r.clip);
  const scored = scoreFromTranscripts({
    mini, hq,
    targetNative: r.clip.targetNative,
    targetRomanized: r.clip.targetRomanized,
    siblings: siblingPhrases(sample, r.clip.languageCode),
  });
  return {
    runId,
    experiment: r.experiment,
    clipKey: r.clip.clipKey,
    tester: r.clip.tester,
    languageCode: r.clip.languageCode,
    label: r.clip.label,
    targetRomanized: r.clip.targetRomanized,
    noiseType: r.clip.noiseType,
    level: r.level,
    pipeline: r.pipeline,
    bitrate: r.bitrate,
    mini, hq,
    transcript: scored.transcript,
    sim: scored.sim,
    score: scored.score,
    band: scored.band,
    nocatchCause: scored.nocatchCause,
    disagreement: scored.disagreement,
    guard: scored.guard,
    procMs: Math.round(procMs * 10) / 10,
    mixMs: Math.round(mixMs),
    sttMs,
    durationSec: Math.round(durationSec * 100) / 100,
  };
}

async function runBench() {
  const sample = readSample();
  const done = readResults();
  const opts = {
    bitrateLever: args["bitrate-lever"],
    levels: args.levels ? args.levels.split(",").map((s) => s.trim()) : null,
    clipCount: args.clips ? Number(args.clips) : null,
    control: args.control,
    replicate: args.replicate ? args.replicate.split(",").map((s) => s.trim()) : null,
  };
  const all = plannedRuns(sample, opts);
  let todo = all.filter((r) => !done.has(runIdOf(r)));
  if (args.limit) todo = todo.slice(0, Number(args.limit));
  const deadline = args["max-minutes"] ? Date.now() + Number(args["max-minutes"]) * 60_000 : Infinity;
  const concurrency = Math.max(1, Number(args.concurrency));

  console.log(`Planned ${all.length} runs; ${all.length - todo.length - (args.limit ? all.length - done.size - todo.length : 0)} already done; executing ${todo.length} now (concurrency ${concurrency}).`);
  const t0 = Date.now();
  let ok = 0, failed = 0, i = 0, stopped = false;
  async function worker() {
    while (true) {
      if (Date.now() > deadline) { stopped = true; return; }
      const idx = i++;
      if (idx >= todo.length) return;
      const r = todo[idx];
      try {
        const rec = await executeRun(r, sample);
        appendFileSync(RESULTS_PATH, JSON.stringify(rec) + "\n");
        ok++;
        if (ok % 10 === 0 || ok <= 3) {
          const rate = (Date.now() - t0) / 1000 / ok;
          console.log(`  ${ok}/${todo.length} ok (${rate.toFixed(1)}s/run) last: ${r.clip.label} ${r.level}/${r.pipeline} -> ${rec.band} ${rec.score}`);
        }
      } catch (err) {
        failed++;
        appendFileSync(RESULTS_PATH, JSON.stringify({ runId: runIdOf(r), error: String(err?.message ?? err).slice(0, 300) }) + "\n");
        console.warn(`  FAIL ${runIdOf(r)}: ${String(err?.message ?? err).slice(0, 200)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  const elapsed = (Date.now() - t0) / 1000;
  console.log(`\nDone: ${ok} ok, ${failed} failed in ${(elapsed / 60).toFixed(1)} min (${ok ? (elapsed / ok).toFixed(1) : "-"} s/run wall, concurrency ${concurrency}).`);
  if (stopped) console.log("Stopped on --max-minutes; re-invoke to resume (finished runs are skipped).");
  const remaining = all.length - readResults().size;
  if (remaining > 0) console.log(`Remaining runs: ${remaining}. Estimated wall time at this rate: ${((remaining * elapsed) / Math.max(ok, 1) / 60).toFixed(0)} min.`);
}

// ── Step 6: results table and thresholds ─────────────────────────────────────

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
function sd(xs) {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}
/** Standard error of a paired mean difference, how much of a cell is real. */
const se = (xs) => (xs.length > 1 ? sd(xs) / Math.sqrt(xs.length) : NaN);
const signed = (x) => `${x >= 0 ? "+" : ""}${f1(x)}`;
const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(0)}%` : "-");
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : "-");

function report() {
  const sample = existsSync(SAMPLE_PATH) ? readSample() : null;
  const recs = [...readResults().values()];
  if (!recs.length) {
    console.log("No results yet.");
    return;
  }
  const main = recs.filter((r) => r.experiment === "main");
  const lever = recs.filter((r) => r.experiment === "bitrate");
  const control = recs.filter((r) => r.experiment === "control");
  const lines = [];
  const say = (s = "") => { lines.push(s); console.log(s); };

  // Baseline per clip = clean + passthrough (today's behaviour on clean audio).
  const baseline = new Map();
  for (const r of main) if (r.level === "clean" && r.pipeline === "passthrough") baseline.set(r.clipKey, r);

  const cell = (rows) => {
    const quality = rows.filter((r) => QUALITY_LABELS.includes(r.label));
    const deltas = quality.flatMap((r) => {
      const b = baseline.get(r.clipKey);
      return b ? [r.score - b.score] : [];
    });
    const nocatch = rows.filter((r) => r.band === "nocatch").length;
    const dis = rows.filter((r) => r.disagreement).length;
    const wrong = rows.filter((r) => r.label === "wrong_attempt");
    return {
      n: rows.length,
      nQuality: quality.length,
      dScore: mean(deltas),
      dSe: se(deltas),
      nocatchPct: rows.length ? (100 * nocatch) / rows.length : NaN,
      disPct: rows.length ? (100 * dis) / rows.length : NaN,
      meanScore: mean(quality.map((r) => r.score)),
      wrongMean: mean(wrong.map((r) => r.score)),
      procMs: mean(rows.map((r) => r.procMs)),
    };
  };

  say(`# Noise robustness bench, results\n`);
  say(`Runs recorded: ${recs.length} (main ${main.length}, bitrate lever ${lever.length}).`);
  if (sample) say(`Sample: ${sample.sampleSize} clips, seed ${sample.seed}, ladder ${sample.noiseLadder.join(" / ")}.`);
  say(`Score deltas are vs each clip's own clean+passthrough score and are computed over ${QUALITY_LABELS.join("/")} clips only, a wrong_attempt scoring low is the protocol working, not a regression (reported separately).\n`);

  for (const noiseType of ["broadband", "babble"]) {
    const rows = main.filter((r) => r.noiseType === noiseType);
    if (!rows.length) continue;
    say(`## ${noiseType === "broadband" ? "Steady broadband room noise" : "Speech babble"}\n`);
    say(`| Level | Pipeline | n | Δscore vs clean (±SE) | mean score | nocatch | STT passes disagree | wrong_attempt mean | +proc ms |`);
    say(`|---|---|---|---|---|---|---|---|---|`);
    for (const level of LEVELS) {
      for (const pipeline of PIPELINES) {
        const c = cell(rows.filter((r) => r.level === level && r.pipeline === pipeline));
        if (!c.n) continue;
        say(`| ${level} | ${pipeline} | ${c.n} | ${signed(c.dScore)} ± ${f1(c.dSe)} | ${f1(c.meanScore)} | ${c.nocatchPct.toFixed(0)}% | ${c.disPct.toFixed(0)}% | ${f1(c.wrongMean)} | ${f1(c.procMs)} |`);
      }
    }
    say("");
  }

  // Measurement noise floor: the same condition, transcribed twice.
  let floorSe = NaN;
  if (control.length) {
    const pairs = control.flatMap((r) => {
      const b = baseline.get(r.clipKey);
      return b ? [{ r, b, d: r.score - b.score }] : [];
    });
    const q = pairs.filter((p) => QUALITY_LABELS.includes(p.r.label));
    const ds = q.map((p) => p.d);
    floorSe = se(ds);
    say(`## Measurement noise floor (same clip, same condition, transcribed twice)\n`);
    say(`Transcription is stochastic, so identical inputs do not score identically. Re-running clean+passthrough on all ${control.length} clips gives the floor every delta below must clear:\n`);
    say(`- Mean repeat−baseline delta: ${signed(mean(ds))} (should be ~0; n=${ds.length} quality clips)`);
    say(`- Mean ABSOLUTE per-clip swing: ${f1(mean(ds.map(Math.abs)))} points, sd ${f1(sd(ds))}`);
    say(`- Standard error of a ${ds.length}-clip cell mean: ±${f1(floorSe)} points`);
    say(`- Band changed on repeat: ${pct(pairs.filter((p) => p.r.band !== p.b.band).length, pairs.length)}; nocatch flipped: ${pct(pairs.filter((p) => (p.r.band === "nocatch") !== (p.b.band === "nocatch")).length, pairs.length)}`);
    say(`\n**Read every cell delta against ±${f1(2 * floorSe)} (2 SE). Smaller movements are transcription jitter, not an effect.**\n`);
  }

  // Go/no-go: does cleanup HURT clean audio?
  say(`## Go/no-go: does cleanup hurt CLEAN audio?\n`);
  say(`| Pipeline | n | Δscore vs passthrough (clean, ±SE) | nocatch | disagree | clips harmed | clips helped |`);
  say(`|---|---|---|---|---|---|---|`);
  const cleanPass = new Map(main.filter((r) => r.level === "clean" && r.pipeline === "passthrough").map((r) => [r.clipKey, r]));
  for (const pipeline of PIPELINES) {
    const rows = main.filter((r) => r.level === "clean" && r.pipeline === pipeline && QUALITY_LABELS.includes(r.label));
    if (!rows.length) continue;
    const deltas = rows.flatMap((r) => {
      const b = cleanPass.get(r.clipKey);
      return b ? [r.score - b.score] : [];
    });
    const all = main.filter((r) => r.level === "clean" && r.pipeline === pipeline);
    const nocatch = all.filter((r) => r.band === "nocatch").length;
    const dis = all.filter((r) => r.disagreement).length;
    say(`| ${pipeline} | ${rows.length} | ${signed(mean(deltas))} ± ${f1(se(deltas))} | ${pct(nocatch, all.length)} | ${pct(dis, all.length)} | ${deltas.filter((d) => d < 0).length} | ${deltas.filter((d) => d > 0).length} |`);
  }
  say("");

  // Head to head: profile-from-the-clip vs generic filter, per level and per
  // noise character (pooling the two hides the one place profiling wins).
  // Deltas here are PAIRED against passthrough at the SAME level, so they
  // isolate the treatment rather than the noise.
  const dAt = (rows, level, pipeline) => {
    const pass = new Map(rows.filter((r) => r.level === level && r.pipeline === "passthrough").map((r) => [r.clipKey, r]));
    const q = rows.filter((r) => r.level === level && r.pipeline === pipeline && QUALITY_LABELS.includes(r.label));
    const ds = q.flatMap((r) => (pass.has(r.clipKey) ? [r.score - pass.get(r.clipKey).score] : []));
    return { d: mean(ds), se: se(ds), n: ds.length };
  };
  say(`## Profiled (clip's own opening) vs generic filter, per noise character\n`);
  say(`Each cell is paired against passthrough AT THE SAME LEVEL. "significant" = |Δ| > 2 SE.\n`);
  say(`| Noise | Level | Δ profiled | Δ generic | Δ profiled_trim | best (significant only) |`);
  say(`|---|---|---|---|---|---|`);
  for (const noiseType of ["broadband", "babble"]) {
    const rows = main.filter((r) => r.noiseType === noiseType);
    for (const level of LEVELS) {
      const dp = dAt(rows, level, "profiled"), dg = dAt(rows, level, "generic"), dt = dAt(rows, level, "profiled_trim");
      if (![dp.d, dg.d, dt.d].some(Number.isFinite)) continue;
      const sig = [["profiled", dp], ["generic", dg], ["profiled_trim", dt]]
        .filter(([, v]) => Number.isFinite(v.d) && v.d > 2 * v.se)
        .sort((a, b) => b[1].d - a[1].d);
      const fmt = (v) => `${signed(v.d)} ± ${f1(v.se)}${v.d > 2 * v.se ? " *" : ""}`;
      say(`| ${noiseType} | ${level} | ${fmt(dp)} | ${fmt(dg)} | ${fmt(dt)} | ${sig.length ? sig[0][0] : "none (keep passthrough)"} |`);
    }
  }
  say("");

  // Replication of standout cells.
  const replicate = recs.filter((r) => r.experiment === "replicate");
  if (replicate.length) {
    say(`## Replication of standout cells (independent re-run)\n`);
    say(`With ~20 cell comparisons at a 2-SE bar, about one false positive is expected. A cell only counts if it survives a repeat.\n`);
    say(`| Noise | Level | Pipeline | Δ vs passthrough, first run | Δ vs passthrough, replication | holds? |`);
    say(`|---|---|---|---|---|---|`);
    const cells = [...new Set(replicate.map((r) => `${r.noiseType}:${r.level}`))];
    for (const c of cells) {
      const [noiseType, level] = c.split(":");
      for (const pipeline of PIPELINES.filter((p) => p !== "passthrough")) {
        const a = dAt(main.filter((r) => r.noiseType === noiseType), level, pipeline);
        const b = dAt(replicate.filter((r) => r.noiseType === noiseType), level, pipeline);
        if (!Number.isFinite(a.d) || !Number.isFinite(b.d)) continue;
        const sigA = Math.abs(a.d) > 2 * a.se, sigB = Math.abs(b.d) > 2 * b.se;
        const holds = sigA && sigB && Math.sign(a.d) === Math.sign(b.d) ? "yes" : sigA || sigB ? "no, did not reproduce" : "n/a (neither significant)";
        say(`| ${noiseType} | ${level} | ${pipeline} | ${signed(a.d)} ± ${f1(a.se)}${sigA ? " *" : ""} | ${signed(b.d)} ± ${f1(b.se)}${sigB ? " *" : ""} | ${holds} |`);
      }
    }
    say("");
  }

  // Bitrate lever.
  if (lever.length) {
    say(`## Bitrate lever (re-encode before the noise mix, passthrough scoring)\n`);
    say(`| Level | n | 32 kbps (mobile) | 96 kbps | Δ (96 − 32, paired ±SE) | 32k nocatch | 96k nocatch |`);
    say(`|---|---|---|---|---|---|---|`);
    for (const level of ["clean", "snr12", "snr6"]) {
      const at = (kbps) => lever.filter((r) => r.level === level && r.bitrate === kbps);
      const q = (rows) => mean(rows.filter((r) => QUALITY_LABELS.includes(r.label)).map((r) => r.score));
      const a = at(32), b = at(96);
      if (!a.length || !b.length) continue;
      const lo = new Map(a.map((r) => [r.clipKey, r]));
      const paired = b.filter((r) => QUALITY_LABELS.includes(r.label) && lo.has(r.clipKey)).map((r) => r.score - lo.get(r.clipKey).score);
      say(`| ${level} | ${paired.length} | ${f1(q(a))} | ${f1(q(b))} | ${signed(mean(paired))} ± ${f1(se(paired))} | ${pct(a.filter((r) => r.band === "nocatch").length, a.length)} | ${pct(b.filter((r) => r.band === "nocatch").length, b.length)} |`);
    }
    const rep = recs.filter((r) => r.experiment === "bitrate2");
    if (rep.length) {
      const lo = new Map(rep.filter((r) => r.bitrate === 32).map((r) => [r.clipKey, r]));
      const hi = rep.filter((r) => r.bitrate === 96 && QUALITY_LABELS.includes(r.label) && lo.has(r.clipKey));
      const paired = hi.map((r) => r.score - lo.get(r.clipKey).score);
      const nocatchAt = (kbps) => pct(rep.filter((r) => r.bitrate === kbps && r.band === "nocatch").length, rep.filter((r) => r.bitrate === kbps).length);
      say(`| snr12 (replication) | ${paired.length} |, |, | ${signed(mean(paired))} ± ${f1(se(paired))} | ${nocatchAt(32)} | ${nocatchAt(96)} |`);
    }
    say("");
  }

  // Latency + measured cost.
  say(`## Added processing time per clip (this sits on a latency-sensitive path)\n`);
  say(`| Pipeline | mean ms | p90 ms | max ms |`);
  say(`|---|---|---|---|`);
  for (const pipeline of PIPELINES) {
    const ms = main.filter((r) => r.pipeline === pipeline).map((r) => r.procMs).sort((a, b) => a - b);
    if (!ms.length) continue;
    say(`| ${pipeline} | ${f1(mean(ms))} | ${f1(ms[Math.floor(ms.length * 0.9)])} | ${f1(ms[ms.length - 1])} |`);
  }
  say("");

  const audioSec = recs.reduce((a, r) => a + (r.durationSec ?? 0), 0);
  // gpt-4o-mini-transcribe + gpt-4o-transcribe, ~10 audio tokens/s (measured in
  // the v2 signal audit), $3/1M and $6/1M audio input tokens respectively.
  const estCost = (audioSec * 10 * 3) / 1e6 + (audioSec * 10 * 6) / 1e6;
  const sttMsAll = recs.filter((r) => r.sttMs).map((r) => r.sttMs).sort((a, b) => a - b);
  say(`## Measured cost of the bench itself\n`);
  say(`- Scoring runs: ${recs.length} (2 transcription calls each = ${recs.length * 2} calls).`);
  say(`- Audio transcribed: ${(audioSec / 60).toFixed(1)} min across both passes.`);
  say(`- Estimated transcription spend: $${estCost.toFixed(2)} (partially inferred: ~10 audio tokens/s at published mini/hq rates).`);
  if (sttMsAll.length) say(`- Dual-pass STT latency: median ${(sttMsAll[Math.floor(sttMsAll.length / 2)] / 1000).toFixed(1)}s, p90 ${(sttMsAll[Math.floor(sttMsAll.length * 0.9)] / 1000).toFixed(1)}s.`);
  say("");

  // Threshold derivation: only movements that clear 2 SE count as effects.
  say(`## Derived thresholds\n`);
  const helpsAt = [];
  const hurtsAt = [];
  for (const noiseType of ["broadband", "babble"]) {
    const rows = main.filter((r) => r.noiseType === noiseType);
    for (const level of LEVELS) {
      for (const pipeline of PIPELINES.filter((p) => p !== "passthrough")) {
        const v = dAt(rows, level, pipeline);
        if (!Number.isFinite(v.d)) continue;
        const rep = recs.filter((r) => r.experiment === "replicate" && r.noiseType === noiseType);
        let note = "";
        if (rep.length) {
          const b = dAt(rep, level, pipeline);
          if (Number.isFinite(b.d)) {
            const held = Math.abs(b.d) > 2 * b.se && Math.sign(b.d) === Math.sign(v.d);
            note = `, replication ${signed(b.d)} ± ${f1(b.se)}: ${held ? "HOLDS" : "did NOT reproduce"}`;
          }
        }
        const line = `${noiseType} ${level} ${pipeline}: ${signed(v.d)} ± ${f1(v.se)}${note}`;
        if (v.d > 2 * v.se) helpsAt.push(line);
        if (-v.d > 2 * v.se) hurtsAt.push(line);
      }
    }
  }
  say(`Significant HELP (Δ > 2 SE over passthrough at the same level):`);
  say(helpsAt.length ? helpsAt.map((l) => `- ${l}`).join("\n") : "- none");
  say(`\nSignificant HARM (Δ < −2 SE):`);
  say(hurtsAt.length ? hurtsAt.map((l) => `- ${l}`).join("\n") : "- none");
  say(`\nMeasurement floor for reference: ±${f1(2 * floorSe)} points on an ${control.length ? "80" : "n"}-clip cell.`);
  // Where noise itself starts to bite, regardless of treatment: the level at
  // which passthrough drops more than 2 SE below its own clean score.
  say(`\nNoise cost with today's behaviour (passthrough vs its own clean score):`);
  for (const noiseType of ["broadband", "babble"]) {
    const rows = main.filter((r) => r.noiseType === noiseType && r.pipeline === "passthrough" && QUALITY_LABELS.includes(r.label));
    const parts = LEVELS.filter((l) => l !== "clean").map((level) => {
      const ds = rows.filter((r) => r.level === level).flatMap((r) => (baseline.has(r.clipKey) ? [r.score - baseline.get(r.clipKey).score] : []));
      return `${level} ${signed(mean(ds))} ± ${f1(se(ds))}`;
    });
    say(`- ${noiseType}: ${parts.join(", ")}`);
  }

  writeFileSync(SUMMARY_PATH, lines.join("\n") + "\n");
  console.log(`\nWrote ${path.relative(ROOT, SUMMARY_PATH)}`);
}

// ── entry ────────────────────────────────────────────────────────────────────

/**
 * Rig check: mix and process a few clips WITHOUT spending transcription calls,
 * and verify the delivered signal-to-noise ratio matches the requested rung.
 */
async function rigCheck() {
  const sample = readSample();
  const n = Number(args.limit ?? 2);
  for (const clip of sample.clips.slice(0, n)) {
    const src = await sourceWav(clip);
    console.log(`\n${clip.tester} ${clip.languageCode} ${clip.label} "${clip.targetRomanized}" (${clip.noiseType})`);
    console.log(`  source ${probeDuration(src).toFixed(2)}s, mean ${meanVolume(src).toFixed(1)} dBFS`);
    for (const level of LEVELS) {
      const mixed = await mixedClip(clip, level, sample);
      const dur = probeDuration(mixed);
      const leadDb = meanVolume(mixed, 0, LEAD_SECONDS - 0.05);
      const bodyDb = meanVolume(mixed, LEAD_SECONDS, dur - LEAD_SECONDS);
      const procs = PIPELINES.map((p) => {
        const t0 = Date.now();
        const { file } = applyPipeline(p, mixed, `rig-${fnv1a(clip.clipKey + p + level)}`);
        return `${p} ${probeDuration(file).toFixed(2)}s/${Date.now() - t0}ms`;
      });
      console.log(`  ${level.padEnd(5)} dur ${dur.toFixed(2)}s lead ${leadDb.toFixed(1)} dB body ${bodyDb.toFixed(1)} dB (delivered ~${(bodyDb - leadDb).toFixed(1)} dB over the floor) | ${procs.join("  ")}`);
    }
  }
}

if (args.select) selectSample();
else if (args["rig-check"]) await rigCheck();
else if (args.run) await runBench();
else if (args.report) report();
else {
  console.log("Nothing to do. Pass --select, --run, or --report (see the header for usage).");
}
