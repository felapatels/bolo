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
    completeWithAudio: async () => ({
      text: "Squawk! Namaste!",
      english: "Squawk! Hello!",
      transcriptEnglish: "Hello",
      audio: Buffer.from("fake-audio"),
    }),
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
  assert.equal(result.replyText, "Namaste!"); // cleaned text — squawk tokens stripped
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

test("runParrotTurn: fallback reply when the completeWithAudio stub returns empty string", async () => {
  const wav = makeWavBuffer(1);
  const result = await runParrotTurn(
    { audioBuffer: wav, languageName: "Hindi", languageCode: "hi", history: [] },
    makeDeps({ completeWithAudio: async () => ({ text: "", english: "", transcriptEnglish: "", audio: Buffer.from("") }) }),
  );
  assert.ok(result.replyText.length > 0, "fallback reply should not be empty");
});

// ---------------------------------------------------------------------------
// runParrotTurn: onTranscript callback fires before completeWithAudio
// ---------------------------------------------------------------------------

test("runParrotTurn: onTranscript fires before completeWithAudio completes", async () => {
  const wav = makeWavBuffer(2);
  const events: string[] = [];

  await runParrotTurn(
    {
      audioBuffer: wav,
      languageName: "Gujarati",
      languageCode: "gu",
      history: [],
      onTranscript: (t, dur) => {
        events.push(`transcript:${t}:${dur > 0 ? "nonzero" : "zero"}`);
      },
    },
    makeDeps({
      transcribe: async () => "Kem cho?",
      completeWithAudio: async () => {
        events.push("completeWithAudio");
        return { text: "Namaste!", english: "Hello!", transcriptEnglish: "How are you?", audio: Buffer.from("audio") };
      },
    }),
  );

  assert.ok(events.length >= 2, "should have at least two events");
  // transcript callback must fire before completeWithAudio returns
  const transcriptIdx = events.findIndex((e) => e.startsWith("transcript:"));
  const completeIdx = events.indexOf("completeWithAudio");
  assert.ok(transcriptIdx !== -1, "onTranscript should be called");
  assert.ok(completeIdx !== -1, "completeWithAudio should be called");
  assert.ok(transcriptIdx < completeIdx, "onTranscript must fire before completeWithAudio");
});

test("runParrotTurn: onTranscript receives correct transcript text", async () => {
  const wav = makeWavBuffer(1);
  let receivedTranscript = "";
  let receivedDuration = -1;

  await runParrotTurn(
    {
      audioBuffer: wav,
      languageName: "Hindi",
      languageCode: "hi",
      history: [],
      onTranscript: (t, dur) => {
        receivedTranscript = t;
        receivedDuration = dur;
      },
    },
    makeDeps({ transcribe: async () => "Namaste" }),
  );

  assert.equal(receivedTranscript, "Namaste");
  assert.ok(receivedDuration >= 0, "durationSeconds should be non-negative");
});

test("runParrotTurn: works without onTranscript (optional)", async () => {
  const wav = makeWavBuffer(1);
  // Should not throw when onTranscript is omitted.
  const result = await runParrotTurn(
    { audioBuffer: wav, languageName: "Hindi", languageCode: "hi", history: [] },
    makeDeps(),
  );
  assert.ok(result.transcript.length >= 0);
});

// ---------------------------------------------------------------------------
// runParrotTurn: conversation context passed to completeWithAudio
// ---------------------------------------------------------------------------

test("runParrotTurn: history turns are forwarded to completeWithAudio", async () => {
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
      completeWithAudio: async (_sys, userPrompt) => {
        capturedUserPrompt = userPrompt;
        return { text: "Maru naam Bolo chhe!", english: "My name is Bolo!", transcriptEnglish: "What is your name?", audio: Buffer.from("") };
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
      completeWithAudio: async (systemPrompt) => {
        capturedSystemPrompt = systemPrompt;
        return { text: "Sat sri akal!", english: "God is truth!", transcriptEnglish: "", audio: Buffer.from("") };
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
      completeWithAudio: async (systemPrompt) => {
        capturedSystemPrompt = systemPrompt;
        return { text: "Namaste!", english: "Hello!", transcriptEnglish: "", audio: Buffer.from("") };
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
      completeWithAudio: async (systemPrompt) => {
        capturedSystemPrompt = systemPrompt;
        return { text: "Namaste!", english: "Hello!", transcriptEnglish: "", audio: Buffer.from("") };
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
// runParrotTurn: completeWithAudio receives the language name
// ---------------------------------------------------------------------------

test("runParrotTurn: completeWithAudio is called with the language name", async () => {
  const wav = makeWavBuffer(1);
  let receivedLang = "";
  await runParrotTurn(
    { audioBuffer: wav, languageName: "Bengali", languageCode: "bn", history: [] },
    makeDeps({
      completeWithAudio: async (_sys, _user, languageName) => {
        receivedLang = languageName;
        return { text: "Kemon acho?", english: "How are you?", transcriptEnglish: "", audio: Buffer.from("audio") };
      },
    }),
  );
  assert.equal(receivedLang, "Bengali");
});

test("runParrotTurn: replyAudio comes from completeWithAudio", async () => {
  const wav = makeWavBuffer(1);
  const fakeAudio = Buffer.from("test-audio-bytes");
  const result = await runParrotTurn(
    { audioBuffer: wav, languageName: "Tamil", languageCode: "ta", history: [] },
    makeDeps({
      completeWithAudio: async () => ({
        text: "Vanakkam!",
        english: "Hello!",
        transcriptEnglish: "",
        audio: fakeAudio,
      }),
    }),
  );
  assert.deepEqual(result.replyAudio, fakeAudio);
});

// ---------------------------------------------------------------------------
// runParrotTurn: Whisper bilingual prompt — no language lock, prompt biases
// ---------------------------------------------------------------------------

test("runParrotTurn: transcribe receives a prompt containing both the target language name and 'English'", async () => {
  const wav = makeWavBuffer(1);
  let capturedOptions: Record<string, unknown> = {};
  await runParrotTurn(
    { audioBuffer: wav, languageName: "Gujarati", languageCode: "gu", history: [] },
    makeDeps({
      transcribe: async (_buf, _fmt, options) => {
        capturedOptions = options as Record<string, unknown>;
        return "kemcho";
      },
    }),
  );
  const prompt = capturedOptions["prompt"];
  assert.ok(typeof prompt === "string" && prompt.length > 0,
    "transcribe options should include a non-empty prompt");
  assert.ok((prompt as string).includes("Gujarati"),
    "prompt should contain the target language name");
  assert.ok((prompt as string).toLowerCase().includes("english"),
    "prompt should mention 'English' so Whisper allows code-switching");
});

test("runParrotTurn: transcribe does NOT receive a hard language lock", async () => {
  const wav = makeWavBuffer(1);
  let capturedOptions: Record<string, unknown> = {};
  await runParrotTurn(
    { audioBuffer: wav, languageName: "Hindi", languageCode: "hi", history: [] },
    makeDeps({
      transcribe: async (_buf, _fmt, options) => {
        capturedOptions = options as Record<string, unknown>;
        return "namaste";
      },
    }),
  );
  assert.ok(!("language" in capturedOptions),
    "transcribe options must NOT include a 'language' lock — that would block English");
});

test("runParrotTurn: prompt changes with the active language (Tamil vs Gujarati)", async () => {
  const wav = makeWavBuffer(1);
  const prompts: string[] = [];

  for (const lang of [
    { languageName: "Tamil", languageCode: "ta" },
    { languageName: "Gujarati", languageCode: "gu" },
  ]) {
    await runParrotTurn(
      { audioBuffer: wav, ...lang, history: [] },
      makeDeps({
        transcribe: async (_buf, _fmt, options) => {
          prompts.push((options as { prompt?: string }).prompt ?? "");
          return "hello";
        },
      }),
    );
  }

  assert.ok(prompts[0].includes("Tamil"), "Tamil turn prompt should mention Tamil");
  assert.ok(prompts[1].includes("Gujarati"), "Gujarati turn prompt should mention Gujarati");
  assert.notEqual(prompts[0], prompts[1], "prompts should differ between languages");
});

test("runParrotTurn: transcriptEnglish is returned from completeWithAudio", async () => {
  const wav = makeWavBuffer(1);
  const result = await runParrotTurn(
    { audioBuffer: wav, languageName: "Gujarati", languageCode: "gu", history: [] },
    makeDeps({
      completeWithAudio: async () => ({
        text: "Maja ma!",
        english: "Great!",
        transcriptEnglish: "How are you?",
        audio: Buffer.from("audio"),
      }),
    }),
  );
  assert.equal(result.transcriptEnglish, "How are you?");
});
