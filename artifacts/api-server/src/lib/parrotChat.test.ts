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
    reply: async () => ({
      text: "Squawk! Namaste!",
      english: "Squawk! Hello!",
      transcriptEnglish: "Hello",
    }),
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
  assert.equal(result.replyText, "Squawk! Namaste!"); // raw text with squawk tokens (shown in UI transcript)
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

test("runParrotTurn: fallback reply when reply stub returns empty string", async () => {
  const wav = makeWavBuffer(1);
  const result = await runParrotTurn(
    { audioBuffer: wav, languageName: "Hindi", languageCode: "hi", history: [] },
    makeDeps({ reply: async () => ({ text: "", english: "", transcriptEnglish: "" }) }),
  );
  assert.ok(result.replyText.length > 0, "fallback reply should not be empty");
});

// ---------------------------------------------------------------------------
// runParrotTurn: onTranscript callback fires before reply+synthesize
// ---------------------------------------------------------------------------

test("runParrotTurn: onTranscript fires before reply completes", async () => {
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
      reply: async () => {
        events.push("reply");
        return { text: "Namaste!", english: "Hello!", transcriptEnglish: "How are you?" };
      },
    }),
  );

  assert.ok(events.length >= 2, "should have at least two events");
  // transcript callback must fire before reply returns
  const transcriptIdx = events.findIndex((e) => e.startsWith("transcript:"));
  const replyIdx = events.indexOf("reply");
  assert.ok(transcriptIdx !== -1, "onTranscript should be called");
  assert.ok(replyIdx !== -1, "reply should be called");
  assert.ok(transcriptIdx < replyIdx, "onTranscript must fire before reply");
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
// runParrotTurn: conversation context passed to reply
// ---------------------------------------------------------------------------

test("runParrotTurn: history turns are forwarded to reply", async () => {
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
        return { text: "Maru naam Bolo chhe!", english: "My name is Bolo!", transcriptEnglish: "What is your name?" };
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
        return { text: "Sat sri akal!", english: "God is truth!", transcriptEnglish: "" };
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
        return { text: "Namaste!", english: "Hello!", transcriptEnglish: "" };
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
        return { text: "Namaste!", english: "Hello!", transcriptEnglish: "" };
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
// runParrotTurn: synthesize receives the language name
// ---------------------------------------------------------------------------

test("runParrotTurn: synthesize is called with the language name", async () => {
  const wav = makeWavBuffer(1);
  let receivedLang = "";
  await runParrotTurn(
    { audioBuffer: wav, languageName: "Bengali", languageCode: "bn", history: [] },
    makeDeps({
      synthesize: async (_text, languageName) => {
        receivedLang = languageName;
        return Buffer.from("audio");
      },
    }),
  );
  assert.equal(receivedLang, "Bengali");
});

test("runParrotTurn: replyAudio comes from synthesize", async () => {
  const wav = makeWavBuffer(1);
  const fakeAudio = Buffer.from("test-audio-bytes");
  const result = await runParrotTurn(
    { audioBuffer: wav, languageName: "Tamil", languageCode: "ta", history: [] },
    makeDeps({
      reply: async () => ({ text: "Vanakkam!", english: "Hello!", transcriptEnglish: "" }),
      synthesize: async () => fakeAudio,
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

// ---------------------------------------------------------------------------
// runParrotTurn: seed words in the Whisper transcription prompt
// ---------------------------------------------------------------------------

test("runParrotTurn: seed words are appended to the transcription prompt", async () => {
  const wav = makeWavBuffer(1);
  let capturedOptions: Record<string, unknown> = {};
  await runParrotTurn(
    {
      audioBuffer: wav,
      languageName: "Gujarati",
      languageCode: "gu",
      history: [],
      seedWords: ["kemcho", "kem cho", "shu chhe"],
    },
    makeDeps({
      transcribe: async (_buf, _fmt, options) => {
        capturedOptions = options as Record<string, unknown>;
        return "kemcho";
      },
    }),
  );
  const prompt = capturedOptions["prompt"] as string;
  assert.ok(prompt.includes("Gujarati"), "prompt should still contain the language name");
  assert.ok(prompt.toLowerCase().includes("english"), "prompt should still contain 'English'");
  assert.ok(prompt.includes("kemcho"), "prompt should contain the first seed word");
  assert.ok(prompt.includes("kem cho"), "prompt should contain the second seed word");
  assert.ok(prompt.includes("shu chhe"), "prompt should contain the third seed word");
});

test("runParrotTurn: seed words are comma-separated after the language declaration", async () => {
  const wav = makeWavBuffer(1);
  let capturedPrompt = "";
  await runParrotTurn(
    {
      audioBuffer: wav,
      languageName: "Kashmiri",
      languageCode: "ks",
      history: [],
      seedWords: ["kyah chhu", "kus", "chu"],
    },
    makeDeps({
      transcribe: async (_buf, _fmt, options) => {
        capturedPrompt = (options as { prompt?: string }).prompt ?? "";
        return "kyah chhu";
      },
    }),
  );
  // Expected format: "Kashmiri or English. kyah chhu, kus, chu"
  assert.ok(capturedPrompt.startsWith("Kashmiri or English."),
    "prompt should start with the base language declaration");
  assert.ok(capturedPrompt.includes("kyah chhu, kus, chu"),
    "seed words should be comma-separated after the base prompt");
});

test("runParrotTurn: omitting seedWords keeps the existing prompt unchanged", async () => {
  const wav = makeWavBuffer(1);
  let capturedPrompt = "";
  await runParrotTurn(
    { audioBuffer: wav, languageName: "Hindi", languageCode: "hi", history: [] },
    makeDeps({
      transcribe: async (_buf, _fmt, options) => {
        capturedPrompt = (options as { prompt?: string }).prompt ?? "";
        return "namaste";
      },
    }),
  );
  // Without seedWords, the prompt should be exactly the bare two-language hint.
  assert.equal(capturedPrompt, "Hindi or English.",
    "prompt without seed words should be exactly the bare two-language hint");
});

test("runParrotTurn: empty seedWords array keeps the existing prompt unchanged", async () => {
  const wav = makeWavBuffer(1);
  let capturedPrompt = "";
  await runParrotTurn(
    {
      audioBuffer: wav,
      languageName: "Tamil",
      languageCode: "ta",
      history: [],
      seedWords: [],
    },
    makeDeps({
      transcribe: async (_buf, _fmt, options) => {
        capturedPrompt = (options as { prompt?: string }).prompt ?? "";
        return "vanakkam";
      },
    }),
  );
  assert.equal(capturedPrompt, "Tamil or English.",
    "prompt with empty seedWords should be exactly the bare two-language hint");
});

test("runParrotTurn: seed words differ between languages", async () => {
  const wav = makeWavBuffer(1);
  const prompts: string[] = [];

  for (const { languageName, languageCode, seedWords } of [
    { languageName: "Manipuri", languageCode: "mni", seedWords: ["namaskar", "haiba"] },
    { languageName: "Santali", languageCode: "sat", seedWords: ["johar", "hola"] },
  ]) {
    await runParrotTurn(
      { audioBuffer: wav, languageName, languageCode, history: [], seedWords },
      makeDeps({
        transcribe: async (_buf, _fmt, options) => {
          prompts.push((options as { prompt?: string }).prompt ?? "");
          return "hello";
        },
      }),
    );
  }

  assert.ok(prompts[0].includes("Manipuri") && prompts[0].includes("namaskar"),
    "Manipuri prompt should contain its seed words");
  assert.ok(prompts[1].includes("Santali") && prompts[1].includes("johar"),
    "Santali prompt should contain its seed words");
  assert.notEqual(prompts[0], prompts[1], "prompts should differ between languages");
});

// ---------------------------------------------------------------------------
// runParrotTurn: seedNativeWords in the Whisper transcription prompt
// ---------------------------------------------------------------------------

test("runParrotTurn: seedNativeWords are appended after romanized seed words", async () => {
  const wav = makeWavBuffer(1);
  let capturedPrompt = "";
  await runParrotTurn(
    {
      audioBuffer: wav,
      languageName: "Gujarati",
      languageCode: "gu",
      history: [],
      seedWords: ["kemcho", "shu chhe"],
      seedNativeWords: ["ગુજરાત", "નમસ્તે"],
    },
    makeDeps({
      transcribe: async (_buf, _fmt, options) => {
        capturedPrompt = (options as { prompt?: string }).prompt ?? "";
        return "kemcho";
      },
    }),
  );
  // Romanized words must appear before native-script words.
  const romanizedIdx = capturedPrompt.indexOf("kemcho");
  const nativeIdx = capturedPrompt.indexOf("ગુજરાત");
  assert.ok(capturedPrompt.includes("kemcho"), "prompt should contain romanized seed word");
  assert.ok(capturedPrompt.includes("shu chhe"), "prompt should contain second romanized seed word");
  assert.ok(capturedPrompt.includes("ગુજરાત"), "prompt should contain native-script seed word");
  assert.ok(capturedPrompt.includes("નમસ્તે"), "prompt should contain second native-script seed word");
  assert.ok(romanizedIdx < nativeIdx, "romanized words should appear before native-script words");
});

test("runParrotTurn: seedNativeWords alone (no romanized) are appended to the prompt", async () => {
  const wav = makeWavBuffer(1);
  let capturedPrompt = "";
  await runParrotTurn(
    {
      audioBuffer: wav,
      languageName: "Bengali",
      languageCode: "bn",
      history: [],
      seedNativeWords: ["বাংলা", "নমস্তে"],
    },
    makeDeps({
      transcribe: async (_buf, _fmt, options) => {
        capturedPrompt = (options as { prompt?: string }).prompt ?? "";
        return "namaste";
      },
    }),
  );
  assert.ok(capturedPrompt.startsWith("Bengali or English."),
    "prompt should start with the base language declaration");
  assert.ok(capturedPrompt.includes("বাংলা"), "prompt should contain first native-script word");
  assert.ok(capturedPrompt.includes("নমস্তে"), "prompt should contain second native-script word");
});

test("runParrotTurn: empty seedNativeWords with romanized seedWords behaves like romanized only", async () => {
  const wav = makeWavBuffer(1);
  let capturedPrompt = "";
  await runParrotTurn(
    {
      audioBuffer: wav,
      languageName: "Tamil",
      languageCode: "ta",
      history: [],
      seedWords: ["vanakkam", "nandri"],
      seedNativeWords: [],
    },
    makeDeps({
      transcribe: async (_buf, _fmt, options) => {
        capturedPrompt = (options as { prompt?: string }).prompt ?? "";
        return "vanakkam";
      },
    }),
  );
  assert.equal(capturedPrompt, "Tamil or English. vanakkam, nandri",
    "empty native words should not affect the romanized-only prompt");
});

test("runParrotTurn: omitting seedNativeWords entirely leaves prompt unchanged", async () => {
  const wav = makeWavBuffer(1);
  let capturedPrompt = "";
  await runParrotTurn(
    {
      audioBuffer: wav,
      languageName: "Punjabi",
      languageCode: "pa",
      history: [],
      seedWords: ["sat sri akal"],
    },
    makeDeps({
      transcribe: async (_buf, _fmt, options) => {
        capturedPrompt = (options as { prompt?: string }).prompt ?? "";
        return "sat sri akal";
      },
    }),
  );
  assert.equal(capturedPrompt, "Punjabi or English. sat sri akal",
    "omitting seedNativeWords should not change the romanized-only prompt");
});

test("runParrotTurn: transcriptEnglish is returned from reply", async () => {
  const wav = makeWavBuffer(1);
  const result = await runParrotTurn(
    { audioBuffer: wav, languageName: "Gujarati", languageCode: "gu", history: [] },
    makeDeps({
      reply: async () => ({
        text: "Maja ma!",
        english: "Great!",
        transcriptEnglish: "How are you?",
      }),
    }),
  );
  assert.equal(result.transcriptEnglish, "How are you?");
});
