/**
 * Audit: find phrase-audio cache entries that are suspiciously SHORT for the
 * text they are supposed to speak — the fingerprint of a synthesis take that
 * dropped a word (e.g. "સાચવીને જજો" cached as just "saachvine").
 *
 * mp3 output from the phrase providers is constant-bitrate, so stored bytes are
 * a faithful proxy for duration; no audio needs to be decoded. For every phrase
 * we compute the same cache key the /openai/tts route uses, look the row up
 * (dev DB by default), and compare bytes-per-character against the median for
 * that language.
 *
 * Usage:
 *   node <tsx> qa/tts-cache-audit.ts             # audit the dev cache
 *   node <tsx> qa/tts-cache-audit.ts --keys      # emit key,text,lang CSV only,
 *                                                # for auditing prod via executeSql
 * Temporary QA probe.
 */
import { db, phrasesTable, languagesTable, ttsCacheTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { phraseTtsCacheKey } from "../src/lib/ttsCache";
import { phraseAudioIdentity } from "../src/lib/ttsConfig";

const KEYS_ONLY = process.argv.includes("--keys");
/** Flag anything below this fraction of its language's median bytes/char. */
const SUSPICION_RATIO = 0.6;

type Row = {
  id: number;
  text: string;
  romanized: string;
  languageCode: string;
  languageName: string;
  key: string;
};

async function main(): Promise<void> {
  const [phrases, languages] = await Promise.all([
    db.query.phrasesTable.findMany({
      columns: { id: true, nativeScript: true, romanized: true, languageCode: true },
    }),
    db.query.languagesTable.findMany({ columns: { code: true, name: true } }),
  ]);
  const nameByCode = new Map(languages.map((l) => [l.code, l.name]));

  const rows: Row[] = phrases.map((p) => {
    const languageName = nameByCode.get(p.languageCode) ?? "";
    const identity = phraseAudioIdentity(p.languageCode);
    return {
      id: p.id,
      text: p.nativeScript,
      romanized: p.romanized,
      languageCode: p.languageCode,
      languageName,
      key: phraseTtsCacheKey(
        p.nativeScript,
        identity.provider,
        identity.model,
        identity.voice,
        languageName,
      ),
    };
  });

  if (KEYS_ONLY) {
    console.log("key,phraseId,languageCode,chars,text");
    for (const r of rows) {
      console.log(`${r.key},${r.id},${r.languageCode},${[...r.text].length},"${r.text}"`);
    }
    process.exit(0);
  }

  // Load cache sizes in chunks (the key list is large).
  const sizeByKey = new Map<string, number>();
  const keys = rows.map((r) => r.key);
  for (let i = 0; i < keys.length; i += 200) {
    const chunk = keys.slice(i, i + 200);
    const found = await db
      .select({ cacheKey: ttsCacheTable.cacheKey, audioBase64: ttsCacheTable.audioBase64 })
      .from(ttsCacheTable)
      .where(inArray(ttsCacheTable.cacheKey, chunk));
    for (const f of found) sizeByKey.set(f.cacheKey, f.audioBase64.length);
  }

  const cached = rows.filter((r) => sizeByKey.has(r.key));
  console.log(`phrases=${rows.length} cachedUnderCurrentKeyScheme=${cached.length}`);

  const byLanguage = new Map<string, Row[]>();
  for (const r of cached) {
    const list = byLanguage.get(r.languageCode) ?? [];
    list.push(r);
    byLanguage.set(r.languageCode, list);
  }

  let flagged = 0;
  for (const [code, list] of [...byLanguage.entries()].sort()) {
    const ratios = list
      .map((r) => sizeByKey.get(r.key)! / Math.max(1, [...r.text].length))
      .sort((a, b) => a - b);
    const median = ratios[Math.floor(ratios.length / 2)] ?? 0;
    const suspects = list
      .map((r) => ({ r, ratio: sizeByKey.get(r.key)! / Math.max(1, [...r.text].length) }))
      .filter((x) => x.ratio < median * SUSPICION_RATIO)
      .sort((a, b) => a.ratio - b.ratio);
    console.log(
      `\n[${code}] cached=${list.length} medianBytesPerChar=${median.toFixed(0)} suspects=${suspects.length}`,
    );
    for (const s of suspects.slice(0, 15)) {
      flagged++;
      console.log(
        `  ratio=${s.ratio.toFixed(0)} chars=${[...s.r.text].length} id=${s.r.id} "${s.r.text}" (${s.r.romanized})`,
      );
    }
  }
  console.log(`\nflaggedShown=${flagged}`);
  process.exit(0);
}

void main();
