// Builds the public tracing page from the alphabet data in @workspace/script-trace.
//
// WHY A BUILD STEP AND NOT A COMMITTED BLOB. The page carries every alphabet
// inline so it works on a phone with no API behind it, which makes it ~570KB of
// data extracted from chapters.ts. Committed on its own it would silently go
// stale the first time a chapter changes, and nobody would notice because the
// page keeps working, just with the old letters. This makes it regenerable, so
// a stale page is a diff rather than a mystery.
//
//   pnpm --filter @workspace/scripts build-aksharmala
//
// Output: artifacts/gujarati-coach/public/aksharmala.html, served as a real
// file at bolo-india.app/aksharmala.html. Static files in public/ bypass the
// SPA fallback: /robots.txt returns the file while an unknown path returns the
// homepage, which is how that was confirmed rather than assumed.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SCRIPT_NAMES,
  alphabetForScript,
  passageFor,
  type ScriptId,
} from "@workspace/script-trace";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = resolve(HERE, "aksharmala.template.html");
const OUT = resolve(HERE, "../../artifacts/gujarati-coach/public/aksharmala.html");

/** The head a standalone page needs and the artifact runtime would supply. */
const HEAD = [
  "<!doctype html>",
  '<html lang="en">',
  "<head>",
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
  // Unlisted, not secret. noindex keeps it out of search WITHOUT naming the
  // path in a public robots.txt, which would do the opposite of hiding it.
  '<meta name="robots" content="noindex, nofollow">',
  '<meta name="description" content="Trace your alphabet so Bolo can teach the stroke order.">',
  '<meta name="theme-color" content="#FBF1DF" media="(prefers-color-scheme: light)">',
  '<meta name="theme-color" content="#171008" media="(prefers-color-scheme: dark)">',
  '<link rel="icon" href="/favicon-32.png" sizes="32x32">',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
].join("\n");

const alphabets: Record<string, { id: string; char: string; label: string; guide: string }[]> = {};
for (const script of Object.keys(SCRIPT_NAMES) as ScriptId[]) {
  const letters = alphabetForScript(script);
  if (letters.length === 0) {
    // Loudly, not silently. An empty alphabet here is the Meetei Mayek bug
    // coming back: a display-name join that finds nothing and reports success.
    throw new Error(`No alphabet letters for ${script}. Check the chapter ids.`);
  }
  alphabets[SCRIPT_NAMES[script]] = letters.map((c) => ({
    id: c.id,
    char: c.char,
    label: c.label,
    guide: c.guide,
  }));
}

// The reading passages, keyed the same way so the page can look one up by the
// script name it already has.
const passages: Record<string, { id: string; language: string; text: string; gloss: string }> = {};
for (const script of Object.keys(SCRIPT_NAMES) as ScriptId[]) {
  const p = passageFor(script);
  if (!p) throw new Error(`No reading passage for ${script}.`);
  passages[SCRIPT_NAMES[script]] = {
    id: p.id,
    language: p.language,
    text: p.text,
    gloss: p.gloss,
  };
}

const template = readFileSync(TEMPLATE, "utf8");
for (const token of ["/*__ALPHABETS__*/{}", "/*__PASSAGES__*/{}"]) {
  if (!template.includes(token)) throw new Error(`Template is missing ${token}.`);
}

const body = template
  .replace("/*__ALPHABETS__*/{}", JSON.stringify(alphabets))
  .replace("/*__PASSAGES__*/{}", JSON.stringify(passages));
const split = body.indexOf("<style>");
const page =
  HEAD +
  "\n" +
  body.slice(0, split) +
  body
    .slice(split)
    .replace("<style>", "<style>\n  html { -webkit-text-size-adjust: 100%; }\n")
    .replace("</style>", "</style>\n</head>\n<body>") +
  "\n</body>\n</html>\n";

writeFileSync(OUT, page);

const letters = Object.values(alphabets).reduce((n, a) => n + a.length, 0);
const unverified = (Object.keys(SCRIPT_NAMES) as ScriptId[]).filter(
  (s) => !passageFor(s).verified,
);
console.log(
  `aksharmala: ${Object.keys(alphabets).length} scripts, ${letters} letters, ` +
    `${Object.keys(passages).length} passages, ${Math.round(page.length / 1024)}KB -> ${OUT}`,
);
if (unverified.length > 0) {
  // Loud, every build, until a speaker has signed each one off. These go in
  // front of relatives; a silent "probably fine" is not good enough.
  console.warn(
    `WARNING: ${unverified.length} reading passage(s) NOT yet checked by a speaker: ` +
      unverified.map((s) => SCRIPT_NAMES[s]).join(", "),
  );
}
