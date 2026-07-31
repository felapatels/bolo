#!/usr/bin/env node
/**
 * qa/pilot-pronunciation-v2.mjs
 * Pronunciation scoring v2 real-voice pilot harness.
 *
 * Usage:
 *   node qa/pilot-pronunciation-v2.mjs \
 *     --video attached_assets/Gujurati_First_Clip_1785505946489.mp4 \
 *     --lang gu \
 *     --phrases "kem chho?,namaste,majaa-maan,aabhaar,ha,na,maaf karjo"
 *
 * Flags:
 *   --dry-run   Stop after segment table + phrase grouping; no ensemble scoring.
 *
 * Recording protocol (REQUIRED for valid results):
 *   - PHONE MIC ONLY — iOS routes to the headset mic when earphones are plugged
 *     in; verify that the captured audio is phone-mic, not headset mic.
 *   - APP AUDIO MUTED — use the in-app or system volume control so the phone
 *     speaker is silent.  This prevents app feedback ("Perfect!", TTS replay)
 *     from being captured by the mic and contaminating user-attempt clips.
 *   - Alternative: record in a quiet room with app media volume at zero; the
 *     speaker-then-mic contamination is the primary cause of scoring failures.
 *   - SINGLE-SYLLABLE PHRASES (ha, na): speaker should say the word deliberately
 *     and unhurried, aiming for > 1 second.  Clips < 0.8 s are flagged as
 *     too_short and excluded from ensemble scoring and criterion evaluation.
 *   - Fixed four-attempt order per phrase: native → mild_accent → heavy_accent
 *     → wrong_attempt, with a Retry tap between each.
 */

import { spawnSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";
import { parseArgs } from "util";

// ── CLI ──────────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    video:     { type: "string" },
    lang:      { type: "string" },
    phrases:   { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
  allowPositionals: false,
});

if (!args.video || !args.lang || !args.phrases) {
  console.error(
    "Usage: node qa/pilot-pronunciation-v2.mjs --video <mp4> --lang <code> --phrases <csv>",
  );
  process.exit(1);
}

const LANG             = args.lang;
const VIDEO_PATH       = join(ROOT, args.video);
const PHRASE_ROMANIZED = args.phrases.split(",").map((s) => s.trim());
const DRY_RUN          = args["dry-run"];
const N_PHRASES        = PHRASE_ROMANIZED.length;

if (!existsSync(VIDEO_PATH)) {
  console.error(`Video not found: ${VIDEO_PATH}`);
  process.exit(1);
}

// ── Phrase catalog ────────────────────────────────────────────────────────────

const PHRASE_NATIVE_GU = {
  "kem chho?":  "કેમ છો?",
  "namaste":    "નમસ્તે",
  "majaa-maan": "મજામાં",
  "aabhaar":    "આભાર",
  "ha":         "હા",
  "na":         "ના",
  "maaf karjo": "માફ કરજો",
};
const NATIVE_BY_LANG = { gu: PHRASE_NATIVE_GU };
function getNativeScript(rom) { return (NATIVE_BY_LANG[LANG] ?? {})[rom] ?? rom; }
function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }

// ── Env vars ──────────────────────────────────────────────────────────────────

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const AI_BASE_URL    = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const AI_API_KEY     = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
if (!OPENAI_API_KEY) { console.error("OPENAI_API_KEY not set"); process.exit(1); }
if (!AI_BASE_URL)    { console.error("AI_INTEGRATIONS_OPENAI_BASE_URL not set"); process.exit(1); }
if (!AI_API_KEY)     { console.error("AI_INTEGRATIONS_OPENAI_API_KEY not set"); process.exit(1); }

// ── Scoring helpers (inlined from scoreBands.ts + pronunciationGuards.ts) ────

function bandFromScore(score) {
  if (score >= 93) return "perfect";
  if (score >= 80) return "great";
  if (score >= 68) return "good";
  if (score >= 55) return "almost";
  return "retry";
}
function simToScore(sim, lo) {
  const c = Math.max(lo, Math.min(1.0, sim));
  return Math.round(Math.max(80, Math.min(100, 80 + ((c - lo) / (1.0 - lo)) * 20)));
}
function normalizeLatin(text) {
  let s = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
  for (const [re, to] of [[/chh/g,"ch"],[/w/g,"v"],[/ee/g,"i"],[/oo/g,"u"]]) s = s.replace(re, to);
  return s.replace(/(.)\1+/g, "$1");
}
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]+1, cur[j-1]+1, prev[j-1]+(a[i-1]===b[j-1]?0:1));
    }
    prev = cur;
  }
  return prev[b.length];
}
function latinSim(a, b) {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max;
}
function isLatin(t) {
  const l = t.match(/\p{L}/gu) ?? [];
  return l.length > 0 && l.filter(c => /[a-z]/i.test(c)).length / l.length >= 0.7;
}
function compareToTarget(transcript, _native, romanized) {
  if (!isLatin(transcript)) return { sim: 0, comparable: false };
  const t = normalizeLatin(transcript), r = normalizeLatin(romanized);
  if (!t.length || !r.length) return { sim: 0, comparable: false };
  return { sim: latinSim(t, r), comparable: true };
}
function currentPipelineScore(transcript, nat, rom) {
  if (!transcript?.trim()) return { score: 0, sim: 0, band: "retry" };
  const c = compareToTarget(transcript, nat, rom);
  if (!c.comparable) return { score: 0, sim: 0, band: "retry" };
  const score = c.sim >= 0.90 ? simToScore(c.sim, 0.90) : Math.round(c.sim * 100);
  return { score, sim: c.sim, band: bandFromScore(score) };
}

// ── Audio rubric prompt (verbatim from spec §2) ───────────────────────────────

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

For very short targets (1-2 syllables), apply the same bands per sound. Within each band, pick a specific score that reflects exactly how close the attempt was -- avoid rounding to 5 or 10 unless the attempt truly sits at that boundary. For example, within 80-89 prefer 83 or 87 over always writing 85.

Always be kind and motivating. This feedback will be READ ALOUD to the learner, so write it like you are talking to them face to face: friendly, playful, conversational. React to how they did first, name one specific thing they did well, and if it was not perfect, gently name the one sound to work on. Reply ONLY as JSON with keys: score (integer 0-100), passed (boolean, true if score>=80), feedback (three to four warm chatty sentences spoken directly), tip (one short friendly concrete pronunciation tip). Address them as "you". No emojis or special symbols.`;

// ── FFmpeg helpers ────────────────────────────────────────────────────────────

function ffmpeg(...ffArgs) {
  const r = spawnSync("ffmpeg", ["-y", ...ffArgs], { encoding: "buffer", maxBuffer: 300 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg failed:\n${r.stderr.toString("utf8").slice(-800)}`);
  return r.stdout;
}
function ffprobeStr(...a) {
  const r = spawnSync("ffprobe", a, { encoding: "buffer", maxBuffer: 5 * 1024 * 1024 });
  return r.stdout.toString("utf8") + r.stderr.toString("utf8");
}
function computeRms(wavPath, start, dur) {
  try {
    const r = spawnSync("ffmpeg", [
      "-ss", start.toFixed(3), "-t", dur.toFixed(3), "-i", wavPath,
      "-af", "volumedetect", "-f", "null", "-",
    ], { encoding: "utf8", maxBuffer: 512 * 1024 });
    const m = (r.stderr + r.stdout).match(/mean_volume:\s*([-\d.]+)\s*dB/);
    return m ? parseFloat(m[1]) : -60;
  } catch { return -60; }
}

// ── Step 1: Extract WAV ───────────────────────────────────────────────────────

const WAV_PATH = `/tmp/pilot-${LANG}.wav`;
console.log(`\n═══════════════════════════════════════════════════════`);
console.log(`  Pronunciation v2 Pilot — ${LANG.toUpperCase()} — ${N_PHRASES} phrases`);
console.log(`═══════════════════════════════════════════════════════\n`);
console.log(`[1] Extracting 16kHz mono WAV …`);
ffmpeg("-i", VIDEO_PATH, "-vn", "-ar", "16000", "-ac", "1", "-acodec", "pcm_s16le", WAV_PATH);
const AUDIO_DURATION = parseFloat(ffprobeStr(
  "-v","quiet","-show_entries","format=duration",
  "-of","default=noprint_wrappers=1:nokey=1", WAV_PATH,
).trim());
console.log(`   → ${WAV_PATH}  (${AUDIO_DURATION.toFixed(1)}s)`);

// ── Step 2: Silence detection → speech segments ───────────────────────────────

console.log(`\n[2] silencedetect noise=-25dB d=0.5s …`);
const sdResult = spawnSync("ffmpeg", [
  "-i", WAV_PATH, "-af", "silencedetect=noise=-25dB:d=0.5", "-f", "null", "-",
], { encoding: "utf8", maxBuffer: 5 * 1024 * 1024 });
const sdLog = sdResult.stderr + sdResult.stdout;

const silenceEvents = [];
for (const line of sdLog.split("\n")) {
  const sm = line.match(/silence_start:\s*([\d.]+)/);
  const em = line.match(/silence_end:\s*([\d.]+)/);
  if (sm) silenceEvents.push({ type: "start", t: parseFloat(sm[1]) });
  if (em) silenceEvents.push({ type: "end",   t: parseFloat(em[1]) });
}

// Collect raw speech windows
const rawSegs = [];
let spStart = 0;
for (const ev of silenceEvents) {
  if (ev.type === "start") {
    if (ev.t - spStart > 0.01) rawSegs.push({ start: spStart, end: ev.t });
    spStart = null;
  } else { spStart = ev.t; }
}
if (spStart != null && AUDIO_DURATION - spStart > 0.1) rawSegs.push({ start: spStart, end: AUDIO_DURATION });

// Merge gaps < 1.2 s; discard segments < 0.4 s
const MERGE_GAP = 1.2, DISCARD_MIN = 0.4;
const merged = [];
for (const s of rawSegs) {
  if (s.end - s.start < 0.05) continue;
  if (!merged.length) { merged.push({ ...s }); continue; }
  const last = merged[merged.length - 1];
  if (s.start - last.end < MERGE_GAP) last.end = Math.max(last.end, s.end);
  else merged.push({ ...s });
}
const segments = merged.filter(s => s.end - s.start >= DISCARD_MIN);
segments.forEach(s => { s.duration = +(s.end - s.start).toFixed(3); });
console.log(`   → ${rawSegs.length} raw → ${merged.length} merged → ${segments.length} after ${DISCARD_MIN}s discard`);

// Compute RMS for each segment
console.log(`   Computing RMS …`);
for (const s of segments) s.rms = computeRms(WAV_PATH, s.start, s.duration);

// ── Step 3: Extract per-segment WAV clips for STT ─────────────────────────────

console.log(`\n[3] Extracting ${segments.length} segment clips …`);
const SEG_CLIPS_DIR = `/tmp/pilot-segs-${LANG}`;
mkdirSync(SEG_CLIPS_DIR, { recursive: true });
for (let i = 0; i < segments.length; i++) {
  const s = segments[i];
  const p = join(SEG_CLIPS_DIR, `seg${String(i).padStart(3, "0")}.wav`);
  ffmpeg(
    "-ss", Math.max(0, s.start - 0.05).toFixed(3),
    "-t",  (s.duration + 0.1).toFixed(3),
    "-i",  WAV_PATH,
    "-ar", "16000", "-ac", "1", "-acodec", "pcm_s16le", p,
  );
  s.clipPath = p;
}

// ── Step 4: STT all segments ──────────────────────────────────────────────────
// Run STT on every segment (including TTS/feedback clips) to identify which
// phrase each segment belongs to.  Results are also reused for baseline scoring.

console.log(`\n[4] STT all ${segments.length} segments (lang=${LANG}, concurrency=5) …`);

async function transcribeAudio(wavPath) {
  const audio = readFileSync(wavPath);
  const form  = new FormData();
  form.append("file", new Blob([audio], { type: "audio/wav" }), "clip.wav");
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("response_format", "json");
  // Pass language hint; for Gujarati the model often returns romanization or non-Latin scripts
  form.append("language", LANG);
  const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) throw new Error(`STT ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  return ((await resp.json()).text ?? "").trim();
}

async function batchRun(items, fn, concurrency) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

// Match a transcript against all phrases; return best {phraseIdx, sim}
function bestPhraseMatch(transcript) {
  if (!transcript.trim()) return { phraseIdx: -1, sim: 0 };
  let best = { phraseIdx: -1, sim: 0 };
  for (let pi = 0; pi < N_PHRASES; pi++) {
    const { sim, comparable } = compareToTarget(transcript, "", PHRASE_ROMANIZED[pi]);
    if (comparable && sim > best.sim) best = { phraseIdx: pi, sim };
  }
  return best;
}

const allSttResults = await batchRun(segments, async (seg, i) => {
  try {
    const transcript = await transcribeAudio(seg.clipPath);
    const { phraseIdx, sim } = bestPhraseMatch(transcript);
    process.stdout.write(
      `   seg${String(i).padStart(3,"0")} [${seg.start.toFixed(1)}-${seg.end.toFixed(1)}s]` +
      ` "${transcript.slice(0,30)}" → P${phraseIdx+1} sim=${sim.toFixed(2)}\n`,
    );
    return { transcript, phraseIdx, sim };
  } catch (err) {
    console.warn(`   seg${i} STT error: ${err.message}`);
    return { transcript: "", phraseIdx: -1, sim: 0 };
  }
}, 5);

// ── Step 5: STT-based phrase-group assignment ─────────────────────────────────
//
// Two-signal algorithm (robust to non-deterministic STT failures):
//
// Primary — STT evidence:
//   If STT sim >= 0.40 AND phraseIdx > currentPhrase → advance to phraseIdx.
//   Allows forward jumps of more than 1 phrase when STT is confident and the
//   intervening phrase(s) had STT failures (e.g., "ha" returned Thai script).
//   The 0.40 threshold blocks low-quality false-advances like "Try again." (0.38).
//
// Secondary — time-based fallback:
//   Expected phrase at time T = floor(T / duration * N_PHRASES).
//   If the time estimate is ≥ 2 phrases ahead of currentPhrase AND there was
//   no STT advance this segment, step forward by at most 2 phrases.
//   This catches up when an entire phrase's STT returns non-Latin script (sim=0).

console.log(`\n[5] Building phrase groups (threshold=0.40, forward STT + time fallback) …`);
const ADVANCE_THRESHOLD = 0.40;
// Max segments a phrase group accumulates before a time-based forced advance
// prevents one missed STT advance from absorbing the whole remainder of the recording.
const MAX_GROUP_SEGS = 12;
const phraseAssignment  = new Int32Array(segments.length);
const groupAccumulation = new Array(N_PHRASES).fill(0);
let currentPhrase = 0;
for (let i = 0; i < segments.length; i++) {
  const { phraseIdx, sim } = allSttResults[i];
  // Expected end of the current phrase in seconds (uniform partitioning)
  const expectedEnd = (currentPhrase + 1) / N_PHRASES * AUDIO_DURATION;

  // Primary: STT-based advance to any later phrase (any forward jump, threshold 0.40)
  if (sim >= ADVANCE_THRESHOLD && phraseIdx > currentPhrase) {
    if (phraseIdx > currentPhrase + 1) {
      console.warn(`   ⚠ Jumping P${currentPhrase+1}→P${phraseIdx+1} at ${segments[i].start.toFixed(1)}s (STT skipped ${phraseIdx-currentPhrase-1} phrase)`);
    }
    currentPhrase = phraseIdx;
  }
  // Secondary A: time-based advance — we've passed the expected phrase boundary by > 5s
  // Advances by 1 so ha gets a chance before na
  else if (segments[i].start > expectedEnd + 5 && currentPhrase < N_PHRASES - 1) {
    const was = currentPhrase;
    currentPhrase++;
    console.log(`   [time-fallback] ${segments[i].start.toFixed(1)}s: P${was+1}→P${currentPhrase+1} (expectedEnd=${expectedEnd.toFixed(1)}s)`);
  }
  // Secondary B: accumulation guard — phrase group is bloated (> MAX_GROUP_SEGS),
  // advance to the phrase suggested by the time position
  else if (groupAccumulation[currentPhrase] >= MAX_GROUP_SEGS && currentPhrase < N_PHRASES - 1) {
    const timePh = Math.min(N_PHRASES - 1, Math.floor(segments[i].start / AUDIO_DURATION * N_PHRASES));
    if (timePh > currentPhrase) {
      const was = currentPhrase;
      currentPhrase = Math.min(timePh, currentPhrase + 1);
      console.log(`   [accum-guard] seg${i} P${was+1}→P${currentPhrase+1} (group had ${groupAccumulation[was]} segs)`);
    }
  }

  phraseAssignment[i] = currentPhrase;
  groupAccumulation[currentPhrase]++;
}

// Build ordered phrase groups
const phraseGroups = Array.from({ length: N_PHRASES }, (_, pi) => ({
  phraseIdx: pi,
  segs: segments.filter((_, i) => phraseAssignment[i] === pi),
}));

console.log(`   Groups: ${phraseGroups.map(g => `P${g.phraseIdx+1}(${g.segs.length})`).join(" | ")}`);

// ── Step 6: Identify user-attempt clips within each phrase group ───────────────
//
// Two patterns observed in this recording:
//
// PATTERN A — Short-phrase alternating (≥7 segments):
//   For phrases where user utterance + app feedback do NOT merge into one blob,
//   segments alternate: user (pos 0,2,4,6) ↔ TTS/feedback (pos 1,3,5,7).
//   Signature: many short segments (< 2 s).
//   Applies to: aabhaar, ha, na.
//
// PATTERN B — Long-phrase merged (< 7 segments in group):
//   For phrases where user speech + English feedback + Gujarati TTS merge into
//   a single 3–7 s blob per attempt.  Blobs are separated by >1.2 s gaps.
//   The first N large segments (> 1.3 s) are the N attempt types in order.
//   Applies to: kem chho?, namaste, majaa-maan, maaf karjo.
//
// Clip trim: extract first min(TRIM_S, duration) seconds to capture user voice
// BEFORE the app response (which starts ~0.5–1.5 s after user finishes).

const ATTEMPT_TYPES      = ["native", "mild_accent", "heavy_accent", "wrong_attempt"];
const TRIM_S             = 1.5;  // seconds to trim merged clips to
const MIN_CLIP_DURATION  = 0.8;  // clips shorter than this are flagged too_short;
                                  // they are NOT sent to the ensemble and are excluded
                                  // from all four acceptance-criterion counts.
                                  // Speaker tip: say single-syllable words deliberately,
                                  // aiming > 1 s, so they clear this floor.

function isAlternatingGroup(segs) {
  // Alternating if group has ≥ 7 segments OR most segments are < 2 s
  if (segs.length >= 7) return true;
  const shortCount = segs.filter(s => s.duration < 2.0).length;
  return shortCount >= Math.ceil(segs.length / 2);
}

const userAttempts = [];

for (const pg of phraseGroups) {
  const { phraseIdx, segs } = pg;
  const phrase = PHRASE_ROMANIZED[phraseIdx];
  const phraseNative = getNativeScript(phrase);
  if (segs.length === 0) {
    console.warn(`   ⚠ P${phraseIdx+1} "${phrase}": no segments — skipping`);
    continue;
  }

  let attemptSegs;
  if (isAlternatingGroup(segs)) {
    // Pattern A: user attempts at even positions 0, 2, 4, 6
    // For groups > 8: last phrase (maaf karjo) had a confirmed redo — use LAST 8.
    // All other over-accumulated groups absorbed extra segs from the NEXT phrase
    // boundary; the real content is in the FIRST 8.
    const isConfirmedRedo = phraseIdx === N_PHRASES - 1;
    const useSegs = segs.length > 8
      ? (isConfirmedRedo ? segs.slice(segs.length - 8) : segs.slice(0, 8))
      : segs;
    attemptSegs = [0, 2, 4, 6]
      .filter(pos => pos < useSegs.length)
      .map(pos => useSegs[pos]);
  } else {
    // Pattern B: take first 4 segments with duration > 0.5 s
    attemptSegs = segs.filter(s => s.duration > 0.5).slice(0, 4);
  }

  for (let ti = 0; ti < attemptSegs.length && ti < ATTEMPT_TYPES.length; ti++) {
    const seg = attemptSegs[ti];
    const origIdx = segments.indexOf(seg);
    const stt = allSttResults[origIdx] ?? { transcript: "", phraseIdx: -1, sim: 0 };
    // For the current-pipeline baseline we use the FULL segment STT (already run)
    const pip = currentPipelineScore(stt.transcript, phraseNative, phrase);
    const trimDuration = Math.min(TRIM_S, seg.duration);
    const tooShort     = trimDuration < MIN_CLIP_DURATION;
    userAttempts.push({
      phraseIdx,
      phrase,
      phraseNative,
      attemptType:  ATTEMPT_TYPES[ti],
      seg,
      origIdx,
      // Trim length: for blobs > TRIM_S use TRIM_S; for short clean clips use full
      trimDuration,
      tooShort,       // true → excluded from ensemble + all criteria
      sttTranscript: stt.transcript,
      currentPipelineScore: pip.score,
      currentPipelineSim:   pip.sim,
      currentPipelineBand:  pip.band,
    });
  }
}

// ── Print segment table ───────────────────────────────────────────────────────

console.log(`\n   Segment table:\n`);
console.log(`   ${"#".padStart(3)} ${"Ph".padStart(3)} ${"Start".padStart(7)} ${"End".padStart(7)} ${"Dur".padStart(5)} ${"RMS".padStart(6)} ${"Pattern".padStart(8)} ${"STT (truncated)".padEnd(28)}`);
console.log(`   ${"─".repeat(78)}`);
for (let i = 0; i < segments.length; i++) {
  const s    = segments[i];
  const ph   = phraseAssignment[i] + 1;
  const stt  = allSttResults[i];
  const ua   = userAttempts.find(a => a.origIdx === i);
  const role = ua ? `user_${ua.attemptType}` : "tts/feedback";
  const tx   = (stt.transcript || "—").slice(0, 26).replace(/\r?\n/g, " ");
  console.log(
    `   ${String(i+1).padStart(3)} ${String(ph).padStart(3)}` +
    ` ${s.start.toFixed(2).padStart(7)} ${s.end.toFixed(2).padStart(7)}` +
    ` ${s.duration.toFixed(2).padStart(5)} ${s.rms.toFixed(1).padStart(6)}` +
    ` ${role.slice(0,8).padStart(8)} ${tx}`,
  );
}
console.log(`   ${"─".repeat(78)}\n`);

// Group summary
console.log(`   Group validation:`);
for (const pg of phraseGroups) {
  const ph = pg.phraseIdx + 1;
  const n  = pg.segs.length;
  const found = userAttempts.filter(a => a.phraseIdx === pg.phraseIdx).length;
  const note  = n === 0 ? "EMPTY" : found < 4 ? `PARTIAL (${found}/4 attempts)` : "ok";
  const pat   = n > 0 ? (isAlternatingGroup(pg.segs) ? "alternating" : "merged-blobs") : "";
  console.log(`   P${ph} "${PHRASE_ROMANIZED[pg.phraseIdx]}": ${n} segs, ${pat} → ${note}`);
}

const foundAttempts = userAttempts.length;
const missing       = N_PHRASES * 4 - foundAttempts;
console.log(`\n   Total: ${foundAttempts}/${N_PHRASES * 4} user-attempt clips identified (${missing} missing)\n`);
const tooShortList = userAttempts.filter(a => a.tooShort);
const scoreableList = userAttempts.filter(a => !a.tooShort);
if (tooShortList.length) {
  console.warn(`\n   ⚠ ${tooShortList.length} clip(s) < ${MIN_CLIP_DURATION}s — flagged too_short, will NOT be scored or counted in criteria:`);
  for (const a of tooShortList) {
    console.warn(`     P${a.phraseIdx+1} "${a.phrase}" ${a.attemptType}: ${a.trimDuration.toFixed(2)}s — speaker should aim > 1s`);
  }
}
console.log(`\n   User-attempt clips (scoreable: ${scoreableList.length}, too_short: ${tooShortList.length}):`);
for (const a of userAttempts) {
  const pip   = a.currentPipelineScore;
  const flag  = a.tooShort ? " ⚠ TOO_SHORT" : "";
  console.log(
    `     P${a.phraseIdx+1} ${a.phrase.padEnd(13)} ${a.attemptType.padEnd(14)}` +
    ` ${a.seg.duration.toFixed(2)}s → trim ${a.trimDuration.toFixed(2)}s` +
    `  stt="${a.sttTranscript.slice(0,20)}"  baseline=${pip}/${a.currentPipelineBand}${flag}`,
  );
}

if (DRY_RUN) {
  console.log(`\n[DRY RUN] Stopping before ensemble. WAV clips NOT extracted.\n`);
  process.exit(0);
}

// ── Step 7: Extract trimmed clips (WAV for STT baseline, MP3 for ensemble) ────
//
// gpt-audio requires MP3 format — WAV inputs yield only ~5 audio tokens
// (the model barely hears the audio).  MP3 at 128k works correctly.

console.log(`\n[7] Extracting trimmed user-attempt clips …`);
const CLIPS_DIR = `/tmp/pilot-clips/${LANG}`;
for (const a of userAttempts) {
  const dir     = join(CLIPS_DIR, slugify(a.phrase));
  mkdirSync(dir, { recursive: true });

  // WAV for STT baseline (gpt-4o-mini-transcribe accepts WAV fine)
  const wavPath = join(dir, `${a.attemptType}.wav`);
  ffmpeg(
    "-ss", Math.max(0, a.seg.start - 0.05).toFixed(3),
    "-t",  (a.trimDuration + 0.05).toFixed(3),
    "-i",  WAV_PATH,
    "-ar", "16000", "-ac", "1", "-acodec", "pcm_s16le", wavPath,
  );
  a.wavPath = wavPath;

  // MP3 for ensemble (gpt-audio hears MP3 reliably; WAV token count is ~5)
  const mp3Path = join(dir, `${a.attemptType}.mp3`);
  ffmpeg(
    "-ss", Math.max(0, a.seg.start - 0.05).toFixed(3),
    "-t",  (a.trimDuration + 0.05).toFixed(3),
    "-i",  WAV_PATH,
    "-ar", "24000", "-ac", "1", "-b:a", "128k", mp3Path,
  );
  a.mp3Path = mp3Path;
}
console.log(`   → Clips in ${CLIPS_DIR}`);

// ── Step 8: Re-run STT on trimmed clips (cleaner transcripts for baseline) ────

console.log(`\n[8] Re-running STT on trimmed clips for baseline scoring …`);
const trimmedSttResults = await batchRun(userAttempts, async (a, i) => {
  try {
    const t = await transcribeAudio(a.wavPath);
    const pip = currentPipelineScore(t, a.phraseNative, a.phrase);
    console.log(`   [${i+1}] "${a.phrase}" ${a.attemptType}: "${t}" → ${pip.score}/${pip.band}`);
    return { transcript: t, ...pip };
  } catch (err) {
    console.warn(`   [${i+1}] STT error: ${err.message}`);
    return { transcript: "", score: 0, sim: 0, band: "retry" };
  }
}, 5);

userAttempts.forEach((a, i) => {
  const r = trimmedSttResults[i];
  a.sttTranscriptTrimmed = r.transcript;
  a.currentPipelineScore = r.score;
  a.currentPipelineSim   = r.sim;
  a.currentPipelineBand  = r.band;
});

// ── Step 9: gpt-audio ensemble ────────────────────────────────────────────────

console.log(`\n[9] gpt-audio ensemble (3 parallel calls × ${userAttempts.length} clips, 30s timeout) …`);

const LANG_NAMES = { gu: "Gujarati", hi: "Hindi", ta: "Tamil", te: "Telugu" };
const langName   = LANG_NAMES[LANG] ?? LANG;

async function audioGradeOnce(b64, phraseNat, phraseRom) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const resp = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${AI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-audio",
        modalities: ["text"],   // audio modality not needed; text-only response
        messages: [
          { role: "system", content: AUDIO_RUBRIC_PROMPT },
          { role: "user", content: [
            { type: "text", text: `Language: ${langName}\nTarget: ${phraseNat}\nRomanized: ${phraseRom}\n\nGrade this attempt.` },
            { type: "input_audio", input_audio: { data: b64, format: "mp3" } },
          ]},
        ],
        max_tokens: 200,
      }),
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error(`gpt-audio ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    const data    = await resp.json();
    const content = data.choices?.[0]?.message?.content ?? "{}";
    let j = {};
    try {
      j = JSON.parse(content.replace(/^```json?\n?/m,"").replace(/\n?```$/m,"").trim());
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) try { j = JSON.parse(m[0]); } catch {}
    }
    const score = Math.max(0, Math.min(100, Math.round(Number(j.score ?? 0))));
    return { score, feedback: j.feedback ?? "", tip: j.tip ?? "" };
  } finally {
    clearTimeout(timer);
  }
}

async function audioEnsemble(b64, phraseNat, phraseRom) {
  const settled = await Promise.allSettled([
    audioGradeOnce(b64, phraseNat, phraseRom),
    audioGradeOnce(b64, phraseNat, phraseRom),
    audioGradeOnce(b64, phraseNat, phraseRom),
  ]);
  const ok = settled.flatMap(s => s.status === "fulfilled" ? [s.value] : []);
  if (ok.length < 2) return null;
  const raw    = ok.map(s => s.score).sort((a, b) => a - b);
  const median = raw.length === 3 ? raw[1] : Math.round((raw[0] + raw[1]) / 2);
  const anchor = ok.reduce((best, s) => Math.abs(s.score - median) < Math.abs(best.score - median) ? s : best);
  return { median, raw: ok.map(s => s.score), feedback: anchor.feedback, tip: anchor.tip };
}

const ensembleResults = await batchRun(userAttempts, async (attempt, i) => {
  // too_short clips are excluded from ensemble scoring
  if (attempt.tooShort) {
    console.warn(
      `   [${i+1}/${userAttempts.length}] ⚠ SKIP "${attempt.phrase}" ${attempt.attemptType}` +
      ` — clip ${attempt.trimDuration.toFixed(2)}s < ${MIN_CLIP_DURATION}s minimum` +
      ` (speaker should say word deliberately, aiming > 1s)`,
    );
    return null;
  }
  // Stagger starts slightly to avoid bursting
  if (i > 0) await new Promise(r => setTimeout(r, 400));
  const audio = readFileSync(attempt.mp3Path);  // MP3 for gpt-audio (WAV gives ~5 tokens)
  const b64   = audio.toString("base64");
  try {
    const result = await audioEnsemble(b64, attempt.phraseNative, attempt.phrase);
    if (!result) {
      console.warn(`   [${i+1}/${userAttempts.length}] ⚠ ensemble null (< 2 calls succeeded)`);
      return null;
    }
    process.stdout.write(
      `   [${i+1}/${userAttempts.length}] "${attempt.phrase}" ${attempt.attemptType}: ` +
      `raw=[${result.raw.join(",")}] median=${result.median} band=${bandFromScore(result.median)}\n`,
    );
    return result;
  } catch (err) {
    console.warn(`   [${i+1}/${userAttempts.length}] ⚠ error: ${err.message}`);
    return null;
  }
}, 2);

// ── Step 10: Persist per-clip JSON ────────────────────────────────────────────

console.log(`\n[10] Writing results …`);
const RESULTS_DIR = join(ROOT, "qa/pilot-results", LANG);
mkdirSync(RESULTS_DIR, { recursive: true });

const clipResults = userAttempts.map((a, i) => {
  const ens = ensembleResults[i];
  return {
    phrase:       a.phrase,
    phraseNative: a.phraseNative,
    phraseIdx:    a.phraseIdx + 1,
    attemptType:  a.attemptType,
    clipDuration: parseFloat(a.trimDuration.toFixed(2)),
    clipRms:      parseFloat(a.seg.rms.toFixed(1)),
    tooShort:     a.tooShort,   // true → excluded from ensemble + all criteria counts
    transcript:   a.sttTranscriptTrimmed,
    currentPipelineScore: a.currentPipelineScore,
    currentPipelineSim:   parseFloat(a.currentPipelineSim.toFixed(3)),
    currentPipelineBand:  a.currentPipelineBand,
    ensembleRaw:    ens?.raw    ?? null,
    ensembleMedian: ens?.median ?? null,
    // proposedBand: "too_short" when flagged; else ensemble band; else pipeline band
    proposedBand: a.tooShort ? "too_short"
                : ens        ? bandFromScore(ens.median)
                :              a.currentPipelineBand,
    feedback: ens?.feedback ?? null,
    tip:      ens?.tip      ?? null,
  };
});

for (const r of clipResults) {
  writeFileSync(
    join(RESULTS_DIR, `${slugify(r.phrase)}_${r.attemptType}.json`),
    JSON.stringify(r, null, 2) + "\n",
  );
}
console.log(`   → ${clipResults.length} JSON files in ${RESULTS_DIR}`);

// ── Step 11: Acceptance criteria ──────────────────────────────────────────────

// too_short clips are excluded from all criteria: they have no ensemble score and
// the speaker did not meet the minimum-duration protocol requirement.
function getClip(phraseIdx0, type) {
  return clipResults.find(r => r.phraseIdx === phraseIdx0 + 1 && r.attemptType === type && !r.tooShort);
}
// getScore returns null for tooShort clips (excluded) and clips with no ensemble result
function getScore(r) {
  if (!r || r.tooShort) return null;
  return r.ensembleMedian ?? null;
}

// Criterion 1: Separation — native − heavy_accent ≥ 20 per phrase
// A phrase is SKIP if either clip is missing OR too_short.
const sepRows = [];
let crit1Pass = true, crit1Tested = 0;
for (let gi = 0; gi < N_PHRASES; gi++) {
  const nat   = getClip(gi, "native");
  const heavy = getClip(gi, "heavy_accent");
  const natS  = getScore(nat);
  const hevS  = getScore(heavy);
  if (natS == null || hevS == null) {
    const reason = (!nat || !heavy) ? "incomplete" : "too_short";
    sepRows.push({ phrase: PHRASE_ROMANIZED[gi], native: "—", heavy: "—", gap: "—", result: `SKIP (${reason})` });
    continue;
  }
  const gap  = natS - hevS;
  const pass = gap >= 20;
  if (!pass) crit1Pass = false;
  crit1Tested++;
  sepRows.push({ phrase: PHRASE_ROMANIZED[gi], native: natS, heavy: hevS, gap, result: pass ? "✅ PASS" : "❌ FAIL" });
}
if (crit1Tested === 0) crit1Pass = false;

// Criterion 2: Stability — max−min ≤ 30 per clip (only scoreable clips)
const stabFails = [];
let crit2Pass = true;
for (const r of clipResults) {
  if (r.tooShort) continue;   // excluded
  if (r.ensembleRaw && r.ensembleRaw.length >= 2) {
    const spread = Math.max(...r.ensembleRaw) - Math.min(...r.ensembleRaw);
    if (spread > 30) {
      crit2Pass = false;
      stabFails.push({ phrase: r.phrase, type: r.attemptType, raw: r.ensembleRaw, spread });
    }
  }
}

// Criterion 3: Wrong-phrase cap — wrong_attempt median < 55 (only scoreable clips)
const wrongFails = [];
let crit3Pass = true;
const wrongClips = clipResults.filter(r => r.attemptType === "wrong_attempt" && !r.tooShort);
for (const r of wrongClips) {
  const s = getScore(r);
  if (s != null && s >= 55) { crit3Pass = false; wrongFails.push({ phrase: r.phrase, score: s }); }
}

// Criterion 4: False-negative rate — ≤ 1 mild_accent clip with scoreable median < 55
// too_short clips are excluded (not counted as false-negatives or as tested)
const mildClips    = clipResults.filter(r => r.attemptType === "mild_accent" && !r.tooShort);
const mildFalseNeg = mildClips.filter(r => (getScore(r) ?? 100) < 55);
const crit4Pass    = mildFalseNeg.length <= 1;

const overallPass = crit1Pass && crit2Pass && crit3Pass && crit4Pass;

// ── Step 12: Write summary markdown ──────────────────────────────────────────

const lines = [];
function emit(s = "") { lines.push(s); console.log(s); }

emit(`\n# Pronunciation v2 Pilot Report — ${langName}`);
emit(`**PRELIMINARY — one speaker, ${langName} only. Hindi video to follow separately.**`);
emit(`**Overall verdict: ${overallPass ? "✅ PASS" : "❌ FAIL"}**`);
emit();
emit(`Generated: ${new Date().toISOString()}`);
emit(`Video: ${basename(VIDEO_PATH)} (${AUDIO_DURATION.toFixed(1)}s)`);
emit(`Segments: ${segments.length} (after 0.4 s discard + 1.2 s merge)`);
const tooShortCount = clipResults.filter(r => r.tooShort).length;
const scoreableCount = clipResults.filter(r => !r.tooShort).length;
const missingCount   = N_PHRASES * 4 - clipResults.length;
emit(`User-attempt clips: ${clipResults.length} / ${N_PHRASES * 4} detected` +
  (missingCount   ? ` (${missingCount} missing — segment too short for silence-detector)` : "") +
  (tooShortCount  ? ` · ${tooShortCount} flagged too_short (< ${MIN_CLIP_DURATION}s, excluded from scoring)` : "")
);
emit(`Scoreable clips: ${scoreableCount}`);
emit(`Clip trimmed to first: ${TRIM_S}s per clip`);
emit();
emit(`> **Recording protocol:**`);
emit(`> • Phone mic only — plug earphones for playback if needed, but verify iOS routes to phone mic, not headset mic.`);
emit(`> • App audio muted — use in-app or system volume to silence the speaker so feedback audio is not captured.`);
emit(`> • Single-syllable phrases (ha, na): say the word deliberately, aiming > 1 s. Clips < ${MIN_CLIP_DURATION}s are`);
emit(`>   flagged \`too_short\` in the table below and excluded from ensemble scoring and all criterion counts.`);
emit();

emit(`## Full Results Table\n`);
emit(`> ⚠ = too_short clip (< ${MIN_CLIP_DURATION}s): excluded from ensemble and all criteria. Speaker must aim > 1s for single-syllable phrases.\n`);
emit(`| # | Phrase | Type | Dur | Transcript | Baseline Score | Band | Ens Raw | Median | Prop Band |`);
emit(`|---|--------|------|-----|------------|---------------|------|---------|--------|-----------|`);
for (const [i, r] of clipResults.entries()) {
  const raw    = r.ensembleRaw ? `[${r.ensembleRaw.join(",")}]` : "—";
  const med    = r.ensembleMedian != null ? String(r.ensembleMedian) : "—";
  const tx     = (r.transcript || "—").slice(0, 24).replace(/\|/g, "\\|");
  const phrase = r.tooShort ? `⚠ ${r.phrase}` : r.phrase;
  emit(`| ${i+1} | ${phrase} | ${r.attemptType} | ${r.clipDuration}s | ${tx} | ${r.currentPipelineScore} | ${r.currentPipelineBand} | ${raw} | ${med} | ${r.proposedBand} |`);
}
emit();

emit(`## Criterion 1: Separation (native − heavy_accent ≥ 20)\n`);
emit(`| Phrase | Native | Heavy | Gap | Result |`);
emit(`|--------|--------|-------|-----|--------|`);
for (const row of sepRows) {
  emit(`| ${row.phrase} | ${row.native} | ${row.heavy} | ${row.gap} | ${row.result} |`);
}
emit(`\n**Criterion 1: ${crit1Pass ? "✅ PASS" : "❌ FAIL"}** — ${crit1Tested}/${N_PHRASES} phrases tested (${N_PHRASES-crit1Tested} incomplete)\n`);

emit(`## Criterion 2: Stability (max−min ≤ 30 per clip)\n`);
if (!stabFails.length) {
  emit(`All ${clipResults.length} clips within stability threshold (spread ≤ 30).`);
} else {
  emit(`| Phrase | Type | Raw | Spread |`);
  emit(`|--------|------|-----|--------|`);
  for (const f of stabFails) emit(`| ${f.phrase} | ${f.type} | [${f.raw.join(",")}] | ${f.spread} |`);
}
emit(`\n**Criterion 2: ${crit2Pass ? "✅ PASS" : "❌ FAIL"}**\n`);

emit(`## Criterion 3: Wrong-phrase cap (wrong_attempt median < 55)\n`);
const wrongTooShort = clipResults.filter(r => r.attemptType === "wrong_attempt" && r.tooShort).length;
emit(`Scoreable wrong_attempt clips: ${wrongClips.length} / ${N_PHRASES}` +
  (wrongTooShort ? ` (${wrongTooShort} excluded — too_short)` : "") + ".");
if (!wrongFails.length) {
  emit(`All scoreable wrong_attempt clips scored < 55.`);
} else {
  emit(`| Phrase | Score |`);
  emit(`|--------|-------|`);
  for (const f of wrongFails) emit(`| ${f.phrase} | ${f.score} |`);
}
emit(`\n**Criterion 3: ${crit3Pass ? "✅ PASS" : "❌ FAIL"}**\n`);

emit(`## Criterion 4: False-negative rate (mild_accent < 55 ≤ 1)\n`);
const mildTooShort = clipResults.filter(r => r.attemptType === "mild_accent" && r.tooShort).length;
emit(`Scoreable mild_accent clips: ${mildClips.length} / ${N_PHRASES}` +
  (mildTooShort ? ` (${mildTooShort} excluded — too_short)` : "") + ".");
emit(`Clips with median < 55: ${mildFalseNeg.length}`);
if (mildFalseNeg.length) {
  emit(`| Phrase | Score |`);
  emit(`|--------|-------|`);
  for (const r of mildFalseNeg) emit(`| ${r.phrase} | ${getScore(r)} |`);
}
emit(`\n**Criterion 4: ${crit4Pass ? "✅ PASS" : "❌ FAIL"}**\n`);

emit(`---`);
emit(`## Overall Verdict\n`);
emit(`| Criterion | Result |`);
emit(`|-----------|--------|`);
emit(`| 1. Separation (gap ≥ 20)           | ${crit1Pass?"✅ PASS":"❌ FAIL"} — ${crit1Tested}/${N_PHRASES} phrases tested |`);
emit(`| 2. Stability (spread ≤ 30)          | ${crit2Pass?"✅ PASS":"❌ FAIL"} |`);
emit(`| 3. Wrong-phrase cap (< 55)          | ${crit3Pass?"✅ PASS":"❌ FAIL"} — ${wrongClips.length}/${N_PHRASES} clips tested |`);
emit(`| 4. False-negative rate (≤ 1 of all) | ${crit4Pass?"✅ PASS":"❌ FAIL"} — ${mildClips.length}/${N_PHRASES} clips tested |`);
emit();
emit(`### ${overallPass ? "✅ PILOT PASSES" : "❌ PILOT FAILS"}`);
emit(`**PRELIMINARY — one speaker, ${langName} only.**`);
if (!overallPass) {
  const failing = [
    !crit1Pass && "Separation",
    !crit2Pass && "Stability",
    !crit3Pass && "Wrong-phrase cap",
    !crit4Pass && "False-negative rate",
  ].filter(Boolean);
  emit(`Failing criteria: ${failing.join(", ")}`);
}

const SUMMARY_PATH = join(ROOT, "qa/pilot-results", `summary_${LANG}.md`);
mkdirSync(dirname(SUMMARY_PATH), { recursive: true });
writeFileSync(SUMMARY_PATH, lines.join("\n") + "\n");
console.log(`\n   → Summary: ${SUMMARY_PATH}`);
console.log(`═══════════════════════════════════════════════════════\n`);
