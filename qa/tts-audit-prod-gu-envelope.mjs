/**
 * Acoustic structure of the production Gujarati clips pulled by the task-1047
 * dry run: duration, speech-segment count, and speaking rate.
 *
 * WHY: an agent cannot literally hear a clip, and the recognizer transcript on
 * its own cannot separate "the model dropped a word" from "the recognizer
 * dropped a word". Counting the spoken segments in the waveform can: a two-word
 * phrase whose clip contains one spoken burst is truncated audio, whatever the
 * transcript says.
 *
 * READ-ONLY: reads the already-downloaded mp3 files, spawns ffmpeg to decode
 * them to PCM, writes a JSON summary. No network, no database.
 *
 *   node qa/tts-audit-prod-gu-envelope.mjs
 */
import { readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const CLIP_DIR = "qa/tts-audit-prod-gu-clips";
const SR = 8000;
const FRAME = 160; // 20 ms
/** Frames below this fraction of the clip's peak frame RMS count as silence. */
const SILENCE_RATIO = 0.06;
/** A gap must last this long to split one spoken burst from the next. */
const MIN_GAP_MS = 130;
/** Bursts shorter than this are decoder ticks, not speech. */
const MIN_BURST_MS = 80;

/** Expected word count, taken from the romanization (what the clip should say). */
const EXPECTED = {
  69: { roman: "shubhechchha", words: 1 },
  128: { roman: "bagichama chha jhaad chhe.", words: 4 },
  226: { roman: "parikshaa pahela hu gabhraau chhu.", words: 5 },
  3967: { roman: "ghana vakhte malya", words: 3 },
  3975: { roman: "saachvine jajo", words: 2 },
  3981: { roman: "kshama karo", words: 2 },
  5954: { roman: "saachvine jajo, bhai.", words: 3 },
  5971: { roman: "shubh raatri, saachvine jajo.", words: 4 },
  5975: { roman: "kaale malishu, saachvine jajo.", words: 4 },
  5985: { roman: "saachvine jajo, fari malie.", words: 4 },
};

function pcm(file) {
  const raw = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-ac", "1", "-ar", String(SR), "-f", "s16le", "-"],
    { maxBuffer: 1 << 28 },
  );
  const n = Math.floor(raw.length / 2);
  const s = new Int16Array(n);
  for (let i = 0; i < n; i++) s[i] = raw.readInt16LE(i * 2);
  return s;
}

function analyze(file) {
  const s = pcm(file);
  const frames = [];
  for (let i = 0; i + FRAME <= s.length; i += FRAME) {
    let sum = 0;
    for (let k = i; k < i + FRAME; k++) sum += s[k] * s[k];
    frames.push(Math.sqrt(sum / FRAME));
  }
  const peak = Math.max(...frames);
  const loud = frames.map((f) => f >= peak * SILENCE_RATIO);

  const bursts = [];
  let start = null;
  let gap = 0;
  const frameMs = (FRAME / SR) * 1000;
  for (let i = 0; i < loud.length; i++) {
    if (loud[i]) {
      if (start === null) start = i;
      gap = 0;
    } else if (start !== null) {
      gap += frameMs;
      if (gap >= MIN_GAP_MS) {
        bursts.push([start * frameMs, (i * frameMs) - gap]);
        start = null;
        gap = 0;
      }
    }
  }
  if (start !== null) bursts.push([start * frameMs, loud.length * frameMs]);

  const kept = bursts.filter(([a, b]) => b - a >= MIN_BURST_MS);
  const durationMs = (s.length / SR) * 1000;
  const speechMs = kept.reduce((t, [a, b]) => t + (b - a), 0);
  return { durationMs, bursts: kept, speechMs };
}

const rows = [];
for (const file of readdirSync(CLIP_DIR).filter((f) => f.endsWith(".mp3")).sort()) {
  const id = Number(file.split("-")[0]);
  const exp = EXPECTED[id];
  if (!exp) continue;
  const a = analyze(`${CLIP_DIR}/${file}`);
  // Latin letters per second of actual speech: a clip that says less than it
  // should, in the same amount of time, reads as an abnormally slow talker.
  const letters = exp.roman.replace(/[^a-z]/gi, "").length;
  const rate = letters / (a.speechMs / 1000);
  rows.push({
    phraseId: id,
    file,
    durationS: +(a.durationMs / 1000).toFixed(3),
    speechS: +(a.speechMs / 1000).toFixed(3),
    spokenBursts: a.bursts.length,
    expectedWords: exp.words,
    lettersPerSpeechSecond: +rate.toFixed(1),
    burstsMs: a.bursts.map(([x, y]) => [Math.round(x), Math.round(y)]),
  });
  console.log(
    `${String(id).padStart(5)} ${file.padEnd(42)} dur ${(a.durationMs / 1000).toFixed(2)}s · ` +
      `speech ${(a.speechMs / 1000).toFixed(2)}s · bursts ${a.bursts.length}/${exp.words} words · ` +
      `${rate.toFixed(1)} letters per speech-second`,
  );
}
writeFileSync("qa/tts-audit-prod-gu-envelope.json", JSON.stringify(rows, null, 2));
console.log("\nwrote qa/tts-audit-prod-gu-envelope.json");
