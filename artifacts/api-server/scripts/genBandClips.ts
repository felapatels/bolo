/**
 * One-off generator for the six static band-announcement clips (Task 903).
 *
 * Bolo speaks the band name the instant a practice result lands, from
 * pre-bundled audio — no synthesis wait. This script synthesizes the clips
 * with the SAME voice as the spoken-feedback path (nova, gpt-4o-mini-tts) so
 * the band call-out and the feedback sentence sound like one speaker.
 *
 * Tone rules:
 *  - perfect/great/good: celebratory coach energy.
 *  - almost/retry: warm and encouraging — never harsh.
 *  - nocatch: NEUTRAL. A nocatch is a system miss, not a learner error
 *    (Spec 1 rule 16) — the clip must sound matter-of-fact, not disappointed.
 *
 * Usage:
 *   cd artifacts/api-server && node --import tsx scripts/genBandClips.ts /tmp/band-clips
 *
 * Post-process (loudness-normalize, done by the caller):
 *   ffmpeg -i in.mp3 -af loudnorm=I=-16:TP=-1.5:LRA=11 -ar 24000 -ac 1 out.mp3
 *
 * Outputs are committed to:
 *   artifacts/gujarati-coach/public/sounds/bands/<band>.mp3
 *   artifacts/bolo-mobile/assets/sounds/bands/<band>.mp3
 */
import { openai } from "@workspace/integrations-openai-ai-server/audio";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2] ?? "/tmp/band-clips";

const CHEER =
  "Bright, warm, celebratory cheer from a friendly, playful coach. Big smile in the voice, high energy, crisp delivery.";

const CLIPS: Array<{ name: string; text: string; instructions: string }> = [
  { name: "perfect", text: "Perfect!", instructions: CHEER },
  { name: "great", text: "Great!", instructions: CHEER },
  {
    name: "good",
    text: "Good!",
    instructions:
      "Warm, upbeat and encouraging — a friendly coach genuinely happy with solid progress.",
  },
  {
    name: "almost",
    text: "Almost!",
    instructions:
      "Warm and encouraging, upbeat — so close, cheering the learner on for one more push. Never disappointed.",
  },
  {
    name: "retry",
    text: "Try again.",
    instructions:
      "Gentle, warm and kind — inviting one more try. Light and supportive, never harsh, never disappointed.",
  },
  {
    name: "nocatch",
    text: "Didn't catch that.",
    instructions:
      "Calm, neutral, friendly and matter-of-fact. Not disappointed, not apologetic, no negative color at all — a simple neutral note that the system missed it.",
  },
];

mkdirSync(OUT, { recursive: true });

for (const clip of CLIPS) {
  const res = await openai.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: "nova",
    input: clip.text,
    instructions: clip.instructions,
    response_format: "mp3",
  });
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error(`${clip.name}: empty audio`);
  writeFileSync(join(OUT, `${clip.name}.mp3`), buf);
  console.log(`${clip.name}.mp3 ${buf.length} bytes`);
}
