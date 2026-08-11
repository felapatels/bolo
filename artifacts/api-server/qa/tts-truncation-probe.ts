/**
 * Probe: does phrase audio for "સાચવીને જજો" (saachvine jajo) carry the whole
 * phrase, or only the first word?
 *
 * Checks the cached row the learner would actually have heard, then
 * synthesizes fresh takes through the exact same call the /openai/tts route
 * makes, measuring duration (ffprobe) and transcribing each one back.
 *
 * Temporary QA probe — delete once the truncation question is settled.
 */
import { writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { db, ttsCacheTable, phrasesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { openai, speechToText } from "@workspace/integrations-openai-ai-server/audio";
import { phraseTtsCacheKey } from "../src/lib/ttsCache";
import { phraseAudioIdentity } from "../src/lib/ttsConfig";

const TEXT = process.env.PROBE_TEXT ?? "સાચવીને જજો";
const LANGUAGE_NAME = process.env.PROBE_LANG_NAME ?? "Gujarati";
const LANGUAGE_CODE = process.env.PROBE_LANG_CODE ?? "gu";
const TAKES = Number(process.env.PROBE_TAKES ?? 3);

function ffprobeSeconds(path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const p = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      path,
    ]);
    let out = "";
    p.stdout.on("data", (c) => (out += c.toString()));
    p.on("close", (code) =>
      code === 0 ? resolve(Number(out.trim())) : reject(new Error(`ffprobe ${code}`)),
    );
    p.on("error", reject);
  });
}

async function describe(label: string, buf: Buffer): Promise<void> {
  const path = `/tmp/tts-probe-${label.replace(/[^a-z0-9]+/gi, "-")}.mp3`;
  await writeFile(path, buf);
  const seconds = await ffprobeSeconds(path);
  let heard = "";
  try {
    heard = await speechToText(buf, "mp3", { language: LANGUAGE_CODE });
  } catch (err) {
    heard = `<stt failed: ${(err as Error).message}>`;
  }
  console.log(
    `${label.padEnd(18)} bytes=${String(buf.length).padStart(7)} ` +
      `dur=${seconds.toFixed(2)}s heard="${heard.trim()}" file=${path}`,
  );
}

async function main(): Promise<void> {
  const identity = phraseAudioIdentity(LANGUAGE_CODE);
  console.log(`text="${TEXT}" chars=${[...TEXT].length} provider=${identity.provider} voice=${identity.voice}`);

  const phrase = await db.query.phrasesTable.findFirst({
    where: and(eq(phrasesTable.nativeScript, TEXT), eq(phrasesTable.languageCode, LANGUAGE_CODE)),
    columns: { id: true, nativeScript: true, romanized: true },
  });
  console.log("phrase row:", phrase ?? "<not found>");

  const cacheKey = phraseTtsCacheKey(
    TEXT,
    identity.provider,
    identity.model,
    identity.voice,
    LANGUAGE_NAME,
  );
  const cached = await db.query.ttsCacheTable.findFirst({
    where: eq(ttsCacheTable.cacheKey, cacheKey),
  });
  if (cached) {
    await describe("cached", Buffer.from(cached.audioBase64, "base64"));
  } else {
    console.log("cached           <no row for current key namespace>");
  }

  for (let i = 1; i <= TAKES; i++) {
    const response = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      voice: identity.voice as any,
      input: TEXT,
      response_format: "mp3",
    });
    await describe(`fresh-take-${i}`, Buffer.from(await response.arrayBuffer()));
  }

  process.exit(0);
}

void main();
