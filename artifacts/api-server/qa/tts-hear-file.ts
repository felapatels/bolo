/**
 * Transcribe a local audio file so a clip can be "listened to" in CI/agent runs.
 * Usage: node <tsx> qa/tts-hear-file.ts <file.mp3> [languageCode]
 * Temporary QA probe.
 */
import { readFileSync } from "node:fs";
import { speechToText } from "@workspace/integrations-openai-ai-server/audio";

async function main(): Promise<void> {
  const [file, lang = "gu"] = process.argv.slice(2);
  if (!file) throw new Error("usage: tts-hear-file.ts <file> [lang]");
  const buf = readFileSync(file);
  const heard = await speechToText(buf, "mp3", { language: lang });
  console.log(`HEARD (${lang}) ${file}: ${JSON.stringify(heard)}`);
  const heardEn = await speechToText(buf, "mp3", { language: "en" });
  console.log(`HEARD (en) ${file}: ${JSON.stringify(heardEn)}`);
  process.exit(0);
}

void main();
