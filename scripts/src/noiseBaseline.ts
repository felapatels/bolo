/**
 * Noise production baseline reader.
 *
 * Answers, from real usage: how often learners lose an attempt to a recording
 * the system could not score, why those attempts failed, how noisy learners'
 * recordings actually are, and whether the failures concentrate in noisy rooms,
 * on one platform (iOS especially), or in one language.
 *
 * It reads ONLY the attempts table, and only derived values already stored
 * there, no audio, no recordings, no diagnostic sidecars. The
 * transcript-bearing nocatch diagnostics stay on their pilot allowlist and are
 * not touched by this report.
 *
 * It is useful BEFORE the new columns fill up: band and dual-pass disagreement
 * history already exist, so the failure rate and its platform/language splits
 * answer immediately, while the noise and cause sections report their own
 * coverage and stay empty until instrumented attempts accumulate.
 *
 * Run:
 *   pnpm --filter @workspace/scripts run noise-baseline
 *   pnpm --filter @workspace/scripts run noise-baseline -- --days=7
 *   pnpm --filter @workspace/scripts run noise-baseline -- --days=90 --languages=12
 */

import { pool } from "@workspace/db";

// ── Options ──────────────────────────────────────────────────────────────────

function intArg(name: string, fallback: number): number {
  const raw = process.argv
    .slice(2)
    .find((a) => a.startsWith(`--${name}=`))
    ?.split("=")[1];
  const n = raw != null ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const DAYS = intArg("days", 30);
const LANGUAGE_ROWS = intArg("languages", 10);

// Spoken attempts only. The games routes insert phantom rows (phraseId null,
// empty phrase text, no band) purely to keep the day's streak alive; counting
// them would dilute every rate in this report.
const SPOKEN = `
  WITH spoken AS (
    SELECT *
    FROM attempts
    WHERE native_script <> ''
      AND created_at >= now() - ($1::int * interval '1 day')
  )
`;

// The five-band ladder's system-miss value: the attempt could not be scored.
const FAILED = `band = 'nocatch'`;

// Buckets chosen so the edges are meaningful to a human: below 6 dB speech is
// barely above the room, 6-12 dB is a noticeably noisy room, 18 dB+ is a quiet
// one. Kept in one place so every noise-split reads the same edges.
const SNR_BUCKET = `
  CASE
    WHEN audio_snr_db IS NULL      THEN 'not measured'
    WHEN audio_snr_db <  6         THEN '1. < 6 dB (very noisy)'
    WHEN audio_snr_db < 12         THEN '2. 6-12 dB (noisy)'
    WHEN audio_snr_db < 18         THEN '3. 12-18 dB (moderate)'
    WHEN audio_snr_db < 24         THEN '4. 18-24 dB (quiet)'
    ELSE                                '5. 24 dB+ (very quiet)'
  END
`;

// Platform rides the existing comma-separated flags column as a
// "platform:<label>" tag (see api-server/src/lib/clientPlatform.ts).
const PLATFORM = `
  COALESCE(
    substring(flags from 'platform:([a-z_]+)'),
    'unknown'
  )
`;

// ── Formatting helpers ───────────────────────────────────────────────────────

function pct(part: number, whole: number): string {
  if (!whole) return "   n/a";
  return `${((part / whole) * 100).toFixed(1).padStart(5)}%`;
}

function heading(title: string): void {
  console.log(`\n${title}`);
  console.log("─".repeat(Math.max(title.length, 60)));
}

function table(headers: string[], rows: string[][]): void {
  if (rows.length === 0) {
    console.log("  (no rows)");
    return;
  }
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)),
  );
  const line = (cells: string[]) =>
    "  " +
    cells
      .map((c, i) => (i === 0 ? c.padEnd(widths[i]!) : c.padStart(widths[i]!)))
      .join("  ");
  console.log(line(headers));
  console.log("  " + widths.map((w) => "-".repeat(w)).join("  "));
  for (const r of rows) console.log(line(r));
}

function num(v: unknown): number {
  return v == null ? 0 : Number(v);
}

function dbOrDash(v: unknown): string {
  return v == null ? "-" : `${Number(v).toFixed(1)}`;
}

async function q<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const { rows } = await pool.query(sql, [DAYS]);
  return rows as T[];
}

// ── Report ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\nBolo! noise production baseline, last ${DAYS} days`);
  console.log(
    "Derived measurements only (band, cause label, SNR estimate). No audio, no sidecars.",
  );

  // 1. Volume, window and instrumentation coverage.
  const [overview] = await q(`${SPOKEN}
    SELECT
      count(*)                                            AS attempts,
      count(DISTINCT user_id)                             AS learners,
      min(created_at)                                     AS first_at,
      max(created_at)                                     AS last_at,
      count(*) FILTER (WHERE audio_snr_db IS NOT NULL)    AS with_snr,
      count(*) FILTER (WHERE band IS NOT NULL)            AS with_band,
      count(*) FILTER (WHERE stt_disagreement IS NOT NULL) AS with_disagreement,
      count(*) FILTER (WHERE ${FAILED} AND nocatch_cause IS NOT NULL) AS failed_with_cause
    FROM spoken
  `);
  const attempts = num(overview?.attempts);

  heading("1. Window");
  table(
    ["metric", "value"],
    [
      ["spoken attempts", String(attempts)],
      ["distinct learners", String(num(overview?.learners))],
      ["first attempt", overview?.first_at ? String(overview.first_at) : "-"],
      ["last attempt", overview?.last_at ? String(overview.last_at) : "-"],
      [
        "with a band recorded",
        `${num(overview?.with_band)} (${pct(num(overview?.with_band), attempts)})`,
      ],
      [
        "with a dual-pass verdict",
        `${num(overview?.with_disagreement)} (${pct(num(overview?.with_disagreement), attempts)})`,
      ],
      [
        "with a noise measurement",
        `${num(overview?.with_snr)} (${pct(num(overview?.with_snr), attempts)})`,
      ],
    ],
  );
  if (attempts === 0) {
    console.log("\nNo spoken attempts in this window, nothing to size.\n");
    return;
  }
  if (num(overview?.with_snr) === 0) {
    console.log(
      "\n  Note: no attempt in this window carries a noise measurement yet.",
    );
    console.log(
      "  Sections 2 and 6 still answer from band/disagreement history; the",
    );
    console.log("  noise sections fill in as instrumented attempts accumulate.");
  }

  // 2. The headline: how often an attempt is lost.
  const [failure] = await q(`${SPOKEN}
    SELECT
      count(*) FILTER (WHERE ${FAILED})                     AS failed,
      count(*) FILTER (WHERE stt_disagreement)              AS disagreed,
      count(*) FILTER (WHERE stt_disagreement AND ${FAILED}) AS disagreed_and_failed
    FROM spoken
  `);
  const failed = num(failure?.failed);

  heading("2. Failure rate (attempts that could not be scored)");
  table(
    ["metric", "count", "share"],
    [
      ["failed to score (band = nocatch)", String(failed), pct(failed, attempts)],
      [
        "the two transcription passes disagreed",
        String(num(failure?.disagreed)),
        pct(num(failure?.disagreed), attempts),
      ],
      [
        "…and the attempt was lost as a result",
        String(num(failure?.disagreed_and_failed)),
        pct(num(failure?.disagreed_and_failed), attempts),
      ],
    ],
  );

  // 3. Why they failed.
  const causes = await q(`${SPOKEN}
    SELECT COALESCE(nocatch_cause, '(not recorded, predates instrumentation)') AS cause,
           count(*) AS n
    FROM spoken
    WHERE ${FAILED}
    GROUP BY 1
    ORDER BY n DESC
  `);

  heading("3. Cause breakdown (failed attempts only)");
  table(
    ["cause", "count", "share of failures"],
    causes.map((r) => [
      String(r.cause),
      String(num(r.n)),
      pct(num(r.n), failed),
    ]),
  );

  // 4. How noisy the recordings actually are.
  const [dist] = await q(`${SPOKEN}
    SELECT
      count(audio_snr_db)                                                       AS n,
      min(audio_snr_db)                                                         AS min,
      percentile_cont(0.10) WITHIN GROUP (ORDER BY audio_snr_db)                AS p10,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY audio_snr_db)                AS p25,
      percentile_cont(0.50) WITHIN GROUP (ORDER BY audio_snr_db)                AS p50,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY audio_snr_db)                AS p75,
      percentile_cont(0.90) WITHIN GROUP (ORDER BY audio_snr_db)                AS p90,
      max(audio_snr_db)                                                         AS max
    FROM spoken
  `);

  heading("4. Recording noise distribution (signal-to-noise, dB)");
  table(
    ["measured", "min", "p10", "p25", "median", "p75", "p90", "max"],
    [
      [
        String(num(dist?.n)),
        dbOrDash(dist?.min),
        dbOrDash(dist?.p10),
        dbOrDash(dist?.p25),
        dbOrDash(dist?.p50),
        dbOrDash(dist?.p75),
        dbOrDash(dist?.p90),
        dbOrDash(dist?.max),
      ],
    ],
  );

  // 5. Does noise actually cost attempts?
  const byNoise = await q(`${SPOKEN}
    SELECT ${SNR_BUCKET} AS bucket,
           count(*)                          AS n,
           count(*) FILTER (WHERE ${FAILED}) AS failed
    FROM spoken
    GROUP BY 1
    ORDER BY 1
  `);

  heading("5. Failure rate by noise level");
  table(
    ["noise bucket", "attempts", "failed", "failure rate"],
    byNoise.map((r) => [
      String(r.bucket),
      String(num(r.n)),
      String(num(r.failed)),
      pct(num(r.failed), num(r.n)),
    ]),
  );

  // 6. Platform, the question iOS raises specifically.
  const byPlatform = await q(`${SPOKEN}
    SELECT ${PLATFORM} AS platform,
           count(*)                                                   AS n,
           count(*) FILTER (WHERE ${FAILED})                          AS failed,
           percentile_cont(0.50) WITHIN GROUP (ORDER BY audio_snr_db) AS median_snr,
           count(audio_snr_db)                                        AS measured
    FROM spoken
    GROUP BY 1
    ORDER BY n DESC
  `);

  heading("6. Split by platform");
  table(
    ["platform", "attempts", "failed", "failure rate", "median dB", "measured"],
    byPlatform.map((r) => [
      String(r.platform),
      String(num(r.n)),
      String(num(r.failed)),
      pct(num(r.failed), num(r.n)),
      dbOrDash(r.median_snr),
      String(num(r.measured)),
    ]),
  );
  console.log(
    "  ('unknown' = attempts recorded before the platform tag existed, or an\n" +
      "   unrecognised client.)",
  );

  // 7. Language.
  const byLanguage = await q(`${SPOKEN}
    SELECT language_code,
           count(*)                                                   AS n,
           count(*) FILTER (WHERE ${FAILED})                          AS failed,
           percentile_cont(0.50) WITHIN GROUP (ORDER BY audio_snr_db) AS median_snr,
           count(audio_snr_db)                                        AS measured
    FROM spoken
    GROUP BY 1
    ORDER BY n DESC
    LIMIT ${LANGUAGE_ROWS}
  `);

  heading(`7. Split by language (top ${LANGUAGE_ROWS} by volume)`);
  table(
    ["language", "attempts", "failed", "failure rate", "median dB", "measured"],
    byLanguage.map((r) => [
      String(r.language_code),
      String(num(r.n)),
      String(num(r.failed)),
      pct(num(r.failed), num(r.n)),
      dbOrDash(r.median_snr),
      String(num(r.measured)),
    ]),
  );

  console.log("");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
