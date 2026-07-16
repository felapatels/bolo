import { test } from "node:test";
import assert from "node:assert/strict";
import { runParrotTurn, type ParrotChatDeps, type ChatHistoryTurn } from "./parrotChat";
import { wavDurationSeconds } from "./audioDuration";

// Unit-tests for the conversational turn helper. All OpenAI calls are replaced
// with synchronous stubs so no network access is required and tests run in
// milliseconds. The WAV buffers are real (parseable RIFF headers) so
// wavDurationSeconds exercises the actual parser rather than a mock.

// Produce a minimal but spec-compliant PCM WAV buffer of the given duration.
function makeWavBuffer(durationSeconds: number, sampleRate = 16000): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const numSamples = Math.round(durationSeconds * sampleRate);
  const dataSize = numSamples * (bitsPerSample / 8);
  const buf = Buffer.alloc(44 + dataSize, 0);

  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);         // subchunk1Size
  buf.writeUInt16LE(1, 20);          // audioFormat: PCM
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE((numChannels * bitsPerSample) / 8, 32); // blockAlign
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  // Audio samples left as zeros (silence) — valid PCM.
  return buf;
}

function makeDeps(overrides: Partial<ParrotChatDeps> = {}): ParrotChatDeps {
  return {
    transcribe: async () => "Namaste",
    reply: async () => ({ text: "Squawk! Namaste!", english: "Squawk! Hello!" }),
    synthesize: async () => Buffer.from("fake-audio"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// wavDurationSeconds (used by runParrotTurn internally)
// ---------------------------------------------------------------------------

test("wavDurationSeconds: correctly parses a 3-second WAV header", () => {
  const buf = makeWavBuffer(3, 16000);
  const dur = wavDurationSeconds(buf);
  assert.ok(Math.abs(dur - 3) < 0.01, `Expected ~3s, got ${dur}`);
});

test("wavDurationSeconds: returns 0 for an empty/too-short buffer", () => {
  assert.equal(wavDurationSeconds(Buffer.alloc(0)), 0);
  assert.equal(wavDurationSeconds(Buffer.alloc(10)), 0);
});

test("wavDurationSeconds: returns 0 for a non-RIFF buffer", () => {
  const buf = Buffer.from("NOTARIFF" + "0".repeat(40));
  assert.equal(wavDurationSeconds(buf), 0);
});

// ---------------------------------------------------------------------------
// runParrotTurn: result shape and duration measurement
// ---------------------------------------------------------------------------

test("runParrotTurn: returns transcript, replyText, replyAudio, format, durationSeconds", async () => {
  const wav = makeWavBuffer(5); // 5 second clip
  const result = await runParrotTurn(
    { audioBuffer: wav, languageName: "Gujarati", languageCode: "gu", history: [] },
    makeDeps({ transcribe: async () => "Kem cho?" }),
  );
  assert.equal(result.transcript, "Kem cho?");
  assert.equal(result.replyText, "Squawk! Namaste!");
  assert.ok(result.replyAudio instanceof Buffer);
  assert.equal(result.audioFormat, "mp3");
  assert.ok(result.durationSeconds > 4 && result.durationSeconds < 6,
    `Expected ~5s, got ${result.durationSeconds}`);
});

test("runParrotTurn: durationSeconds is 0 for a zero-length WAV clip", async () => {
  const wav = makeWavBuffer(0);
  const result = await runParrotTurn(
    { audioBuffer: wav, languageName: "Hindi", languageCode: "hi", history: [] },
    makeDeps(),
  );
  assert.equal(result.durationSeconds, 0);
});

test("runParrotTurn: fallback reply when the completeReply stub returns empty string", async () => {
  const wav = makeWavBuffer(1);
  const result = await runParrotTurn(
    { audioBuffer: wav, languageName: "Hindi", languageCode: "hi", history: [] },
    makeDeps({ reply: async () => ({ text: "", english: "" }) }),
  );
  assert.ok(result.replyText.length > 0, "fallback reply should not be empty");
});

// ---------------------------------------------------------------------------
// runParrotTurn: conversation context passed to reply
// ---------------------------------------------------------------------------

test("runParrotTurn: history turns are forwarded to the reply function", async () => {
  const wav = makeWavBuffer(1);
  let capturedUserPrompt = "";
  const history: ChatHistoryTurn[] = [
    { role: "learner", text: "Kem cho?" },
    { role: "parrot", text: "Maja ma!" },
  ];
  await runParrotTurn(
    { audioBuffer: wav, languageName: "Gujarati", languageCode: "gu", history },
    makeDeps({
      transcribe: async () => "Shu naam chhe?",
      reply: async (_sys, userPrompt) => {
        capturedUserPrompt = userPrompt;
        return { text: "Maru naam Bolo chhe!", english: "My name is Bolo!" };
      },
    }),
  );
  assert.ok(capturedUserPrompt.includes("Kem cho?"), "history should appear in prompt");
  assert.ok(capturedUserPrompt.includes("Maja ma!"), "history should appear in prompt");
  assert.ok(capturedUserPrompt.includes("Shu naam chhe?"), "current transcript should appear in prompt");
});

test("runParrotTurn: system prompt contains the language name", async () => {
  const wav = makeWavBuffer(1);
  let capturedSystemPrompt = "";
  await runParrotTurn(
    { audioBuffer: wav, languageName: "Punjabi", languageCode: "pa", history: [] },
    makeDeps({
      reply: async (systemPrompt) => {
        capturedSystemPrompt = systemPrompt;
        return { text: "Sat sri akal!", english: "God is truth!" };
      },
    }),
  );
  assert.ok(capturedSystemPrompt.includes("Punjabi"),
    "system prompt should mention the language");
});

test("runParrotTurn: system prompt allows general everyday conversation topics", async () => {
  const wav = makeWavBuffer(1);
  let capturedSystemPrompt = "";
  await runParrotTurn(
    { audioBuffer: wav, languageName: "Hindi", languageCode: "hi", history: [] },
    makeDeps({
      reply: async (systemPrompt) => {
        capturedSystemPrompt = systemPrompt;
        return { text: "Namaste!", english: "Hello!" };
      },
    }),
  );
  // The prompt should explicitly invite general topics, not restrict to language-only.
  assert.ok(
    capturedSystemPrompt.includes("food") || capturedSystemPrompt.includes("hobbies") || capturedSystemPrompt.includes("everyday"),
    "system prompt should allow general conversation topics",
  );
  // The old rigid off-topic deflection list should be gone.
  assert.ok(
    !capturedSystemPrompt.includes("sports scores") && !capturedSystemPrompt.includes("tech support"),
    "system prompt should not contain the old rigid off-topic deflection list",
  );
});

test("runParrotTurn: system prompt contains youth-safe guardrails", async () => {
  const wav = makeWavBuffer(1);
  let capturedSystemPrompt = "";
  await runParrotTurn(
    { audioBuffer: wav, languageName: "Bengali", languageCode: "bn", history: [] },
    makeDeps({
      reply: async (systemPrompt) => {
        capturedSystemPrompt = systemPrompt;
        return { text: "Namaste!", english: "Hello!" };
      },
    }),
  );
  // The prompt must instruct the model to refuse harmful/inappropriate content.
  assert.ok(
    capturedSystemPrompt.toLowerCase().includes("youth") ||
    capturedSystemPrompt.toLowerCase().includes("children") ||
    capturedSystemPrompt.toLowerCase().includes("inappropriate"),
    "system prompt should contain youth-safe guardrail instructions",
  );
  assert.ok(
    capturedSystemPrompt.toLowerCase().includes("violence") ||
    capturedSystemPrompt.toLowerCase().includes("adult"),
    "system prompt should name categories of content to refuse",
  );
});

// ---------------------------------------------------------------------------
// runParrotTurn: synthesize receives the reply text
// ---------------------------------------------------------------------------

test("runParrotTurn: synthesize is called with the reply text and language name", async () => {
  const wav = makeWavBuffer(1);
  let synthesizedText = "";
  let synthesizedLang = "";
  await runParrotTurn(
    { audioBuffer: wav, languageName: "Bengali", languageCode: "bn", history: [] },
    makeDeps({
      reply: async () => ({ text: "Kemon acho?", english: "How are you?" }),
      synthesize: async (text, lang) => {
        synthesizedText = text;
        synthesizedLang = lang;
        return Buffer.from("audio");
      },
    }),
  );
  assert.equal(synthesizedText, "Kemon acho?");
  assert.equal(synthesizedLang, "Bengali");
});
