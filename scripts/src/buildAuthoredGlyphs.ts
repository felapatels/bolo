// Turn what people traced on the contribution page into authored stroke data.
//
// WHY THIS EXISTS. The contribution page has been collecting real handwriting
// since 2026-08-23, and none of it could reach the game: the pieces to convert
// it all lived in lib/script-trace/src/authoring.ts, but nothing joined them
// up. Until something did, a speaker's forty-five traced letters sat in a
// database column while AUTHORED_GLYPHS held three prototype squiggles and
// traceReadyFor() was false everywhere.
//
// READ-ONLY. It issues one SELECT and never writes to the database. The only
// thing it writes is lib/script-trace/src/contributed-strokes.ts, and only
// with --write.
//
// WHICH DATABASE. Read the two-databases section of CLAUDE.md before running
// this. The Repl's Shell is DEVELOPMENT and the contributions are in
// PRODUCTION, so a run against the wrong one reports zero contributors and
// looks like nobody has traced anything. It prints the host it connected to
// for exactly that reason.
//
// Usage, from the repo root:
//
//   set -a; . ./.env.production; set +a
//   DATABASE_URL="$DATABASE_URL_PROD" \
//     pnpm --filter @workspace/scripts exec tsx src/buildAuthoredGlyphs.ts
//
// Add --write to update contributed-strokes.ts. Add --include-practice to see
// practice and team rows too, which is for debugging and never for shipping.

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pool } from "@workspace/db";
import {
  AUTHORED_GLYPHS,
  CONTRIBUTED_GLYPHS,
  PLAYABLE_GLYPH_FLOOR,
  SCRIPT_NAMES,
  alphabetForScript,
  compareContributions,
  isTestContributor,
  parseTracePayload,
  resolveTracePayload,
  serializeAuthoredGlyph,
  type AuthoredGlyph,
  type GlyphIdentity,
  type ParsedTracePayload,
  type ScriptId,
} from "@workspace/script-trace";

const OUT = resolve(
  import.meta.dirname,
  "../../lib/script-trace/src/contributed-strokes.ts",
);
const WRITE = process.argv.includes("--write");
const INCLUDE_PRACTICE = process.argv.includes("--include-practice");

/** Display name back to ScriptId. The payload carries the name, not the id. */
const SCRIPT_BY_NAME = new Map<string, ScriptId>(
  (Object.entries(SCRIPT_NAMES) as [ScriptId, string][]).map(([id, name]) => [
    name,
    id,
  ]),
);

type Row = {
  contributor: string;
  script: string;
  is_practice: boolean;
  payload: string;
  created_at: Date;
};

/**
 * Pick one contributor's version of a glyph when several traced it.
 *
 * The majority stroke count wins, and the earliest contributor within that
 * majority breaks the tie. Stroke COUNT is the right thing to vote on because
 * it is the one property a font cannot supply and the one people genuinely
 * disagree about; the coordinates are then taken whole from a single hand
 * rather than averaged, because an average of two handwritings is a third
 * handwriting nobody wrote.
 */
function pickGlyph(
  candidates: { glyph: AuthoredGlyph; contributor: string; at: Date }[],
  majorityStrokeCount: number,
): AuthoredGlyph {
  const inMajority = candidates.filter(
    (c) => c.glyph.strokes.length === majorityStrokeCount,
  );
  const pool_ = inMajority.length ? inMajority : candidates;
  return [...pool_].sort((a, b) => a.at.getTime() - b.at.getTime())[0].glyph;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. See the usage note at the top.");
    process.exit(1);
  }
  console.log(`Connected to ${new URL(url).hostname}\n`);

  const { rows } = await pool.query<Row>(
    `SELECT contributor, script, is_practice, payload, created_at
       FROM script_trace_contributions
      ORDER BY created_at`,
  );
  console.log(`${rows.length} contribution row(s) in this database.`);

  // Parse first, and report anything unreadable rather than dropping it. A
  // contributor whose paste did not parse has to be findable by name.
  const parsed: { p: ParsedTracePayload; at: Date }[] = [];
  for (const r of rows) {
    try {
      parsed.push({ p: parseTracePayload(r.payload), at: r.created_at });
    } catch (e) {
      console.error(
        `  UNPARSEABLE from ${r.contributor}: ${(e as Error).message}`,
      );
    }
  }

  // Same rule as compareContributions' defaults, applied here so the counts
  // printed below describe the set that actually gets written.
  const usable = parsed.filter(
    ({ p }) =>
      INCLUDE_PRACTICE || (!p.isPractice && !isTestContributor(p.contributor)),
  );
  const dropped = parsed.length - usable.length;
  console.log(
    `${usable.length} usable, ${dropped} dropped as practice or team testing.\n`,
  );

  const byScript = new Map<ScriptId, { p: ParsedTracePayload; at: Date }[]>();
  for (const u of usable) {
    const id = SCRIPT_BY_NAME.get(u.p.script);
    if (!id) {
      console.error(`  UNKNOWN SCRIPT "${u.p.script}" from ${u.p.contributor}`);
      continue;
    }
    byScript.set(id, [...(byScript.get(id) ?? []), u]);
  }

  const out: Partial<Record<ScriptId, AuthoredGlyph[]>> = {};

  for (const [script, entries] of [...byScript].sort()) {
    const alphabet = alphabetForScript(script);
    const identities = new Map<string, GlyphIdentity>(
      alphabet.map((c) => [c.id, { id: c.id, char: c.char, label: c.label }]),
    );

    const candidates = new Map<
      string,
      { glyph: AuthoredGlyph; contributor: string; at: Date }[]
    >();
    const unknown = new Set<string>();

    for (const { p, at } of entries) {
      const { glyphs, unknownIds } = resolveTracePayload(p, (id) =>
        identities.get(id),
      );
      unknownIds.forEach((id) => unknown.add(id));
      for (const g of glyphs) {
        candidates.set(g.id, [
          ...(candidates.get(g.id) ?? []),
          { glyph: g, contributor: p.contributor, at },
        ]);
      }
    }

    // Agreement is computed by the shared helper so this script and anyone
    // reading the data by hand reach the same verdict.
    const agreement = compareContributions(
      entries.map((e) => e.p),
      { includePractice: INCLUDE_PRACTICE },
    );
    const majority = new Map(
      agreement.map((a) => [a.id, a.byStrokeCount[0].strokeCount]),
    );
    const split = agreement.filter((a) => !a.agreed);

    // Emit in ALPHABET order, not contribution order, so the generated file
    // reads like the alphabet and a missing letter is visible as a gap.
    const glyphs: AuthoredGlyph[] = [];
    for (const c of alphabet) {
      const got = candidates.get(c.id);
      if (got) glyphs.push(pickGlyph(got, majority.get(c.id) ?? got[0].glyph.strokes.length));
    }

    const contributors = [...new Set(entries.map((e) => e.p.contributor))];
    const ready = glyphs.length >= PLAYABLE_GLYPH_FLOOR;
    console.log(
      `${SCRIPT_NAMES[script]}: ${glyphs.length}/${alphabet.length} letters ` +
        `from ${contributors.length} contributor(s) [${contributors.join(", ")}]`,
    );
    console.log(
      `  ${ready ? "PLAYABLE" : "NOT playable"}: floor is ${PLAYABLE_GLYPH_FLOOR}` +
        (ready ? "" : `, needs ${PLAYABLE_GLYPH_FLOOR - glyphs.length} more`),
    );
    if (glyphs.length < alphabet.length) {
      const have = new Set(glyphs.map((g) => g.id));
      const missing = alphabet.filter((c) => !have.has(c.id));
      console.log(
        `  untraced: ${missing.map((m) => m.char).join(" ")} (${missing.length})`,
      );
    }
    if (split.length) {
      console.log(`  STROKE-COUNT DISAGREEMENTS, worth a look:`);
      for (const s of split) {
        console.log(
          `    ${s.id}: ` +
            s.byStrokeCount
              .map((b) => `${b.strokeCount} strokes (${b.contributors.join(", ")})`)
              .join(" vs "),
        );
      }
    }
    if (unknown.size) {
      // Never silent: a contributor on a stale copy of the page would
      // otherwise look like they contributed nothing.
      console.log(`  UNKNOWN IDS (stale page?): ${[...unknown].join(", ")}`);
    }
    console.log();

    if (glyphs.length) out[script] = glyphs;
  }

  // ── CARRY FORWARD WHAT THIS DATABASE CANNOT SUPPLY ────────────────────────
  //
  // This script REPLACES contributed-strokes.ts wholesale, and that came within
  // one flag of destroying real work on 2026-08-23. Bharti's 45 Gujarati
  // letters are committed in that file, but the rows they were built from are
  // NOT in production: every Gujarati row there is a probe or a "test_" name,
  // all dropped by isTestContributor. So a regeneration aimed at adding her
  // Devanagari letters would have emitted Devanagari alone and deleted the
  // Gujarati, whose only surviving copy is the generated file itself.
  //
  // Hand-tracing an alphabet is hours of a person's time and cannot be
  // recovered from anywhere else, so the rule is: a script the database has
  // nothing usable for keeps whatever is already committed, loudly. Where the
  // database DOES have rows for a script, they win outright, which is what
  // makes a correction or a re-trace take effect.
  for (const [script, existing] of Object.entries(CONTRIBUTED_GLYPHS) as [
    ScriptId,
    AuthoredGlyph[],
  ][]) {
    if (!existing?.length || out[script]) continue;
    out[script] = existing;
    console.log(
      `KEPT ${SCRIPT_NAMES[script]}: ${existing.length} glyph(s) already committed, ` +
        `and this database has no usable rows for it.`,
    );
    console.log(
      `  Those contributions exist ONLY in contributed-strokes.ts. ` +
        `Do not delete them without a copy.\n`,
    );
  }

  const body = (Object.entries(out) as [ScriptId, AuthoredGlyph[]][])
    .map(
      ([script, glyphs]) =>
        `  // ${SCRIPT_NAMES[script]}: ${glyphs.length} letters\n` +
        `  ${JSON.stringify(script)}: [\n` +
        glyphs.map((g) => serializeAuthoredGlyph(g, "    ")).join("\n") +
        `\n  ],`,
    )
    .join("\n");

  const header = HEADER.trimStart();
  const file =
    header +
    `export const CONTRIBUTED_GLYPHS: Partial<Record<ScriptId, AuthoredGlyph[]>> = {\n` +
    (body ? body + "\n" : "") +
    `};\n`;

  if (!WRITE) {
    console.log("--write not given, so nothing was written. Would emit:");
    console.log(
      `  ${Object.keys(out).length} script(s), ` +
        `${Object.values(out).reduce((n, g) => n + g.length, 0)} glyph(s), ` +
        `${(file.length / 1024).toFixed(1)} KB`,
    );
    return;
  }

  writeFileSync(OUT, file);
  console.log(`Wrote ${OUT}`);
  for (const [script, glyphs] of Object.entries(out)) {
    const before = AUTHORED_GLYPHS[script as ScriptId]?.length ?? 0;
    console.log(
      `  ${script}: ${before} -> ${glyphs.length} authored glyph(s)` +
        (glyphs.length >= PLAYABLE_GLYPH_FLOOR ? "  PLAYABLE" : ""),
    );
  }
}

const HEADER = `
/**
 * Stroke data authored by real contributors, GENERATED. Do not hand-edit.
 *
 * Regenerate with, from the repo root:
 *
 *   set -a; . ./.env.production; set +a
 *   DATABASE_URL="$DATABASE_URL_PROD" \\
 *     pnpm --filter @workspace/scripts exec tsx src/buildAuthoredGlyphs.ts --write
 *
 * WHY THIS FILE IS SEPARATE from devanagari-strokes.ts. That one holds three
 * prototype glyphs somebody drew to exercise the format. This one holds what
 * people actually wrote, arrives by regeneration rather than by hand, and is
 * the only stroke data that should ever teach a child. Keeping them apart means
 * a regeneration can never quietly clobber the prototypes, and a reviewer can
 * see at a glance which kind of data a diff touches.
 *
 * EMPTY IS THE CORRECT STATE until contributions exist for a script. scripts.ts
 * merges this over the prototypes, and traceReadyFor() gates on the merged
 * count, so a script absent here simply stays unplayable.
 */
import type { AuthoredGlyph } from "./stroke-scoring";
import type { ScriptId } from "./scripts";

`;

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error(e);
    pool.end();
    process.exit(1);
  });
