/**
 * Empirical probe (#784 re-scope): does speaking practice actually work in
 * languages Whisper doesn't support?
 *
 * For each probed language, this script:
 *   1. Picks a real seeded starter phrase.
 *   2. Synthesizes "correct" speech for it through the app's own TTS route
 *      (POST /openai/tts, same audio a learner hears and imitates).
 *   3. Feeds that audio through the REAL pronunciation pipeline
 *      (POST /openai/pronunciation with phraseId), exactly as the apps do.
 *   4. Reports the raw transcript, phonetic similarity, score, and band.
 *
 * Read-only with cleanup: uses a throwaway probe user and deletes its
 * attempts/xp rows afterwards. Run from artifacts/api-server:
 *   node <tsx-cli> scripts/probeSttLanguages.ts
 */
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { db, pool, phrasesTable, languagesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import openaiRouter from "../src/routes/openai";

const PROBE_LANGS = process.env.PROBE_LANGS
  ? process.env.PROBE_LANGS.split(",")
  : ["hi","gu","bn","ta","te","kn","ml","mr","pa","ur","or","as","ne","sa","sd","ks","kok","mai","mni","brx","doi","sat"];
const PROBE_USER = `__probe_stt_user_${process.pid}`;

// Collect pipeline log lines so we can recover the internal similarity value,
// which is logged but not part of the API response.
const logLines: Array<{ obj: unknown; msg: string }> = [];
const collector = {
  info: (obj: unknown, msg?: string) =>
    logLines.push({ obj, msg: typeof obj === "string" ? obj : (msg ?? "") }),
  warn: (obj: unknown, msg?: string) =>
    logLines.push({ obj, msg: typeof obj === "string" ? obj : (msg ?? "") }),
  error: (obj: unknown, msg?: string) =>
    logLines.push({ obj, msg: typeof obj === "string" ? obj : (msg ?? "") }),
};

async function main() {
  await pool.query(
    `INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
    [PROBE_USER],
  );

  const app = express();
  app.use(express.json({ limit: "25mb" }));
  app.use((req, _res, next) => {
    (req as any).log = collector;
    (req as any).userId = PROBE_USER;
    next();
  });
  app.use(openaiRouter);
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  for (const code of PROBE_LANGS) {
    const lang = await db.query.languagesTable.findFirst({
      where: eq(languagesTable.code, code),
    });
    const phrase = await db.query.phrasesTable.findFirst({
      where: and(eq(phrasesTable.languageCode, code), eq(phrasesTable.stage, "phrase")),
    });
    if (!lang || !phrase) {
      console.log(`${code}: MISSING language or phrase row, skipping`);
      continue;
    }
    console.log(`\n=== ${code} (${lang.name}), phrase #${phrase.id}`);
    console.log(`target: ${phrase.nativeScript} | ${phrase.romanized} | "${phrase.english}"`);

    // 1) Synthesize "correct" speech via the app's own TTS path.
    const ttsRes = await fetch(`${base}/openai/tts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: phrase.nativeScript,
        languageCode: code,
        languageName: lang.name,
      }),
    });
    const tts = (await ttsRes.json()) as { audioBase64?: string; format?: string };
    if (ttsRes.status !== 200 || !tts.audioBase64) {
      console.log(`TTS FAILED: status=${ttsRes.status}`);
      continue;
    }
    console.log(`tts: ok (${tts.format ?? "mp3"}, ${Math.round(tts.audioBase64.length / 1024)}KB b64)`);

    // 2) Run it through the real pronunciation pipeline.
    logLines.length = 0;
    const pronRes = await fetch(`${base}/openai/pronunciation`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        phraseId: phrase.id,
        targetNative: phrase.nativeScript,
        targetRomanized: phrase.romanized,
        targetEnglish: phrase.english,
        audioBase64: tts.audioBase64,
        mimeType: "audio/mpeg",
        languageName: lang.name,
      }),
    });
    const pron = (await pronRes.json()) as Record<string, unknown>;
    const sims = logLines
      .map((l) => (l.obj && typeof l.obj === "object" ? (l.obj as any) : null))
      .filter((o) => o && (o.sim !== undefined || o.transcript !== undefined));
    console.log(`status=${pronRes.status}`);
    if (pronRes.status !== 200) console.log(`error body: ${JSON.stringify(pron)}`);
    console.log(`transcript: ${JSON.stringify(pron.transcript ?? sims.find((s) => s.transcript)?.transcript ?? "(not in response/logs)")}`);
    console.log(`score=${pron.score} band=${pron.band} passed=${pron.passed}`);
    console.log(`sim(logged): ${JSON.stringify(sims.map((s) => ({ sim: s.sim, transcript: s.transcript })))}`);
    console.log(`feedback: ${String(pron.feedback ?? "").slice(0, 200)}`);
  }

  // Cleanup: remove everything the probe user created.
  await pool.query(`DELETE FROM xp_ledger WHERE user_id = $1`, [PROBE_USER]);
  await pool.query(`DELETE FROM attempts WHERE user_id = $1`, [PROBE_USER]);
  await pool.query(`DELETE FROM user_item_memory WHERE user_id = $1`, [PROBE_USER]);
  await pool.query(`DELETE FROM user_ability WHERE user_id = $1`, [PROBE_USER]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [PROBE_USER]);
  server.close();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
