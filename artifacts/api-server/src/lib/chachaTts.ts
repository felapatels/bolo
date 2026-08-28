import { Buffer } from "node:buffer";
import { openai } from "@workspace/integrations-openai-ai-server/audio";
import {
  CHACHA_TTS_INSTRUCTIONS,
  CHACHA_TTS_MODEL,
  CHACHA_TTS_VOICE,
} from "./chachaStrings";

/**
 * Chacha-ji's voice, and nothing else.
 *
 * LIFTED OUT OF ttsPrewarm ON 2026-08-28 to break an import cycle rather than
 * to tidy up. chachaCallLines has to synthesize, and ttsPrewarm has to warm
 * the call lines, so with this function still living in ttsPrewarm the two
 * modules imported each other. One leaf module both can reach ends it.
 *
 * It stays a single function in a single place because the alternative already
 * cost this repo: the route and the prewarm each synthesizing with their own
 * idea of the model, voice or instructions is exactly how a cache key and the
 * clip behind it drift apart.
 */
export async function synthesizeChachaLine(text: string): Promise<Buffer> {
  const response = await openai.audio.speech.create({
    model: CHACHA_TTS_MODEL,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    voice: CHACHA_TTS_VOICE as any,
    input: text,
    instructions: CHACHA_TTS_INSTRUCTIONS,
    response_format: "mp3",
  });
  return Buffer.from(await response.arrayBuffer());
}
