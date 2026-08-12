/**
 * Speech-envelope measurement for cached TTS takes.
 *
 * The #1047 field report caught a truncated clip that every cheap heuristic
 * called healthy: the model said one word slowly, so duration and byte size
 * looked normal. What separates it from a good take is the SHAPE of the
 * energy over time: a two-word phrase should show two spoken bursts, and a
 * dropped word leaves a long trailing silence where it should have been.
 *
 * So this measures the envelope rather than the file:
 *   - burst count      : contiguous runs of speech energy (the decisive signal)
 *   - trailing silence : dead air after the last burst
 *   - letters/second   : romanized letters ÷ speech seconds; a clip that says
 *                        half the phrase reads implausibly slow against it
 *
 * Deliberately NOT a coverage check, because that needs a recognizer and lives in
 * the api-server's phraseAudioVerify. This is the cheap, local, deterministic
 * half, and it is what tells a truncated take from a merely slow one.
 *
 * Usage: node qa/tts-envelope.mjs <file.mp3> [--letters saachvinejajo] [--label "before"]
 */
import { spawnSync } from "node:child_process";

const SAMPLE_RATE = 16000;
const FRAME_MS = 20;
/** Absolute floor. TTS output is loud and normalized; room tone sits far below. */
const SPEECH_DBFS = -40;
/** Gaps shorter than this are within-word, not between-word. */
const MERGE_GAP_MS = 200;
/** Shorter than this is a click or a breath, not a spoken burst. */
const MIN_BURST_MS = 60;

function decodePcm(path) {
  const out = spawnSync(
    "ffmpeg",
    ["-v", "error", "-i", path, "-ac", "1", "-ar", String(SAMPLE_RATE), "-f", "s16le", "-"],
    { maxBuffer: 1 << 28 },
  );
  if (out.status !== 0) throw new Error(`ffmpeg failed for ${path}: ${out.stderr}`);
  const raw = out.stdout;
  const samples = new Int16Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 2));
  return samples;
}

function frameDbfs(samples) {
  const per = (SAMPLE_RATE * FRAME_MS) / 1000;
  const frames = [];
  for (let i = 0; i + per <= samples.length; i += per) {
    let sum = 0;
    for (let j = i; j < i + per; j++) {
      const v = samples[j] / 32768;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / per);
    frames.push(rms > 0 ? 20 * Math.log10(rms) : -Infinity);
  }
  return frames;
}

function bursts(frames) {
  const runs = [];
  let start = null;
  frames.forEach((db, i) => {
    const loud = db >= SPEECH_DBFS;
    if (loud && start === null) start = i;
    if (!loud && start !== null) {
      runs.push([start, i]);
      start = null;
    }
  });
  if (start !== null) runs.push([start, frames.length]);

  // Merge across short gaps, then drop anything too brief to be a word.
  const merged = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && (run[0] - last[1]) * FRAME_MS < MERGE_GAP_MS) last[1] = run[1];
    else merged.push([...run]);
  }
  return merged.filter(([a, b]) => (b - a) * FRAME_MS >= MIN_BURST_MS);
}

const [, , file, ...rest] = process.argv;
if (!file) {
  console.error("usage: node qa/tts-envelope.mjs <file.mp3> [--letters abc] [--label name]");
  process.exit(1);
}
const arg = (flag) => {
  const i = rest.indexOf(flag);
  return i >= 0 ? rest[i + 1] : undefined;
};
const letters = (arg("--letters") ?? "").replace(/[^a-z]/gi, "");
const label = arg("--label") ?? file;
/**
 * Burst count is only meaningful relative to the gap that separates bursts:
 * two words run together at 120ms apart are one burst at the default and two
 * at a tighter setting. Sweep it rather than trusting a single threshold.
 */
const gapMs = Number(arg("--gap") ?? MERGE_GAP_MS);

const samples = decodePcm(file);
const frames = frameDbfs(samples);
const runs = bursts(frames);
const totalS = samples.length / SAMPLE_RATE;
const toS = (f) => (f * FRAME_MS) / 1000;
const speechS = runs.reduce((acc, [a, b]) => acc + toS(b - a), 0);
const lead = runs.length ? toS(runs[0][0]) : totalS;
const trail = runs.length ? totalS - toS(runs[runs.length - 1][1]) : totalS;

console.log(`\n── ${label}`);
console.log(`   file            ${file}`);
console.log(`   duration        ${totalS.toFixed(3)}s`);
console.log(`   bursts          ${runs.length}`);
runs.forEach(([a, b], i) => {
  console.log(
    `     burst ${i + 1}       ${toS(a).toFixed(3)}s → ${toS(b).toFixed(3)}s  (${toS(b - a).toFixed(3)}s)`,
  );
});
console.log(`   speech total    ${speechS.toFixed(3)}s`);
console.log(`   leading silence ${lead.toFixed(3)}s`);
console.log(`   trailing silence ${trail.toFixed(3)}s`);
if (letters) {
  console.log(
    `   letters/speech-s ${(letters.length / speechS).toFixed(1)}  (${letters.length} letters ÷ ${speechS.toFixed(3)}s)`,
  );
}
