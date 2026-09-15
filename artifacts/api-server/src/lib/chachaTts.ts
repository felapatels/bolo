import { Buffer } from "node:buffer";
import { openai } from "@workspace/integrations-openai-ai-server/audio";
import {
  CHACHA_TTS_INSTRUCTIONS,
  uncleSynthesisIdentity,
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
 *
 * THE LANGUAGE ARGUMENT, 2026-09-15 (Answer Back's elder voice, owner ruling
 * option A). The identity now comes from uncleSynthesisIdentity, the forks'
 * resolver, so the elder phrase route calls this with the same signature in all
 * six repos. In India every language resolves to the same OpenAI identity as
 * before, so the stall, the call and the prewarm, which pass no language, make
 * the byte-identical request they always made.
 */
export async function synthesizeChachaLine(text: string, languageCode = "hi"): Promise<Buffer> {
  const identity = uncleSynthesisIdentity(languageCode);
  const response = await openai.audio.speech.create({
    model: identity.model,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    voice: identity.voice as any,
    input: text,
    instructions: CHACHA_TTS_INSTRUCTIONS,
    response_format: "mp3",
  });
  return Buffer.from(await response.arrayBuffer());
}
