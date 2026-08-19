/**
 * Spot-listen probe for the production Gujarati clips pulled by the
 * task-1047 dry run.
 *
 * READ-ONLY. It reads the mp3 files already downloaded to
 * qa/tts-audit-prod-gu-clips/ and runs the SAME verifier the sweep uses
 * (src/lib/phraseAudioVerify.ts) against them, three independent listens each,
 * so a clip the sweep did NOT flag can still be given a coverage number.
 *
 * It never touches production: no database connection, no cache write, no
 * synthesis. The only outbound call is the recognizer.
 *
 * Run from the repo root:
 *   node "$(ls node_modules/.pnpm/tsx@*\/node_modules/tsx/dist/cli.mjs | head -1)" \
 *     qa/tts-audit-prod-gu-listen.ts
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { verifyPhraseAudio } from "../artifacts/api-server/src/lib/phraseAudioVerify";

/** phraseId → { native script, romanization } for the clips under test. */
const PHRASES: Record<number, { native: string; romanized: string }> = {
  69: { native: "શુભેચ્છા", romanized: "shubhechchha" },
  128: { native: "બગીચામાં છ ઝાડ છે.", romanized: "bagichama chha jhaad chhe." },
  226: { native: "પરીક્ષા પહેલા હું ગભરાઉં છું.", romanized: "parikshaa pahela hu gabhraau chhu." },
  3967: { native: "ઘણા વખતે મળ્યા", romanized: "ghana vakhte malya" },
  3975: { native: "સાચવીને જજો", romanized: "saachvine jajo" },
  3981: { native: "ક્ષમા કરો", romanized: "kshama karo" },
  5954: { native: "સાચવીને જજો, ભાઈ.", romanized: "saachvine jajo, bhai." },
  5971: { native: "શુભ રાત્રી, સાચવીને જજો.", romanized: "shubh raatri, saachvine jajo." },
  5975: { native: "કાલે મળીશું, સાચવીને જજો.", romanized: "kaale malishu, saachvine jajo." },
  5985: { native: "સાચવીને જજો, ફરી મળીએ.", romanized: "saachvine jajo, fari malie." },
};

const CLIP_DIR = "qa/tts-audit-prod-gu-clips";
const LISTENS = 3;

async function main(): Promise<void> {
  const files = readdirSync(CLIP_DIR).filter((f) => f.endsWith(".mp3")).sort();
  const out: Record<string, unknown>[] = [];

  for (const file of files) {
    const id = Number(file.split("-")[0]);
    const phrase = PHRASES[id];
    if (!phrase) continue;
    const audio = readFileSync(`${CLIP_DIR}/${file}`);

    const listens: { status: string; coverage: number | null; heard: string }[] = [];
    for (let i = 0; i < LISTENS; i++) {
      const v = await verifyPhraseAudio({
        audio,
        format: "mp3",
        nativeScript: phrase.native,
        romanized: phrase.romanized,
        languageCode: "gu",
        speechCapability: "supported",
      });
      listens.push({ status: v.status, coverage: v.coverage, heard: v.heard });
      await new Promise((r) => setTimeout(r, 400));
    }

    console.log(`\n${id} ${phrase.native} [${phrase.romanized}] — ${file}`);
    for (const [i, l] of listens.entries()) {
      console.log(
        `   listen ${i + 1}: ${l.status} (${l.coverage?.toFixed(2) ?? "n/a"}) heard "${l.heard.slice(0, 120)}"`,
      );
    }
    out.push({ phraseId: id, ...phrase, file, listens });
  }

  writeFileSync("qa/tts-audit-prod-gu-listens.json", JSON.stringify(out, null, 2));
  console.log("\nwrote qa/tts-audit-prod-gu-listens.json");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
