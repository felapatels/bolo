// Fills in the letters missing from the alphabet chapters in chapters.ts.
//
// WHY THIS EXISTS. A native Gujarati speaker traced the whole alphabet on the
// contribution page and said the letters were out of order. They were not out of
// order, they were MISSING: twenty letters where Gujarati teaches about
// forty-five. It ran ક ખ ગ ઘ and then jumped to ચ, skipping ઙ, then skipped
// છ ઝ ઞ, the entire retroflex ટ ઠ ડ ઢ ણ row, થ, ધ, and everything after પ. To
// somebody who knows the alphabet that reads as scrambled, and she was right
// that something was wrong.
//
// WHAT COUNTS AS THE ALPHABET, and why it is not "everything the font can draw".
// Noto Sans Devanagari renders 89 independent letters. A child is taught about
// 48 of them. The rest are Vedic extensions, archaic Sindhi forms, nukta
// composites and signs like ॐ. Padding the roster with those would make the
// sequence look wrong for a second time, in the other direction.
//
// The Indic blocks are all laid out on the Devanagari pattern, so the taught set
// falls out of the code points rather than out of anyone's memory:
//
//   +0x05..0x14   independent vowels
//   +0x15..0x39   consonants ka..ha, which IS the varga series, already in order
//
// Deliberately excluded: the vocalic L at +0x0C (archaic) and the four loan
// vowels at +0x0D, +0x0E, +0x11, +0x12 that exist for English sounds.
//
// SECOND ROUND, 2026-08-23. The same speaker traced the completed alphabet and
// said the last two Gujarati letters were still missing. She was right twice.
// The range walk above has a blind spot at the TAIL of the varnamala:
//
//   1. It cannot produce ક્ષ or જ્ઞ AT ALL. Those are conjuncts, ક + ્ + ષ and
//      જ + ્ + ઞ, with no code point of their own. Devanagari loses three the
//      same way: क्ष, त्र, ज्ञ. HarfBuzz shapes them fine, so only the roster
//      was ever the problem.
//   2. It puts ળ in the wrong PLACE. U+0AB3 sits between લ and વ, so code point
//      order lands it at 40. The alphabet teaches it last, after હ.
//
// Both are the same mistake: code point order is not teaching order, and at the
// tail they stop agreeing. That is what TAIL_OFFSETS and TAIL_CONJUNCTS below
// are for, and both are per script because the tail is a teaching convention,
// not a property of the block.
//
// SCOPE. The four Brahmic scripts whose varga structure makes the answer
// unambiguous. Bengali, Odia and Ol Chiki were already complete; Telugu, Kannada
// and Malayalam are each missing one archaic letter and are left alone.
// Nastaliq and Meetei Mayek are NOT touched: their alphabets are not derivable
// this way and deserve a speaker rather than a code point range.
//
// Run it, then regenerate the guides:
//   pnpm --filter @workspace/scripts exec tsx src/completeAlphabets.ts
//   pnpm --filter @workspace/scripts exec tsx src/extractScriptTraceGuides.ts

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const CHAPTERS = resolve(ROOT, "lib/script-trace/src/chapters.ts");

/** chapter-id prefix -> [unicode block start, script property] */
const TARGETS: [prefix: string, base: number, prop: string][] = [
  ["hindi", 0x0900, "Devanagari"],
  ["gujarati", 0x0a80, "Gujarati"],
  ["gurmukhi", 0x0a00, "Gurmukhi"],
  ["tamil", 0x0b80, "Tamil"],
];

/** id prefix used inside character ids, e.g. gu_ka. Taken from what is there. */
const ID_PREFIX: Record<string, string> = {
  hindi: "hi",
  gujarati: "gu",
  gurmukhi: "pa",
  tamil: "ta",
};

const SKIP_VOWEL_OFFSETS = new Set([0x0c, 0x0d, 0x0e, 0x11, 0x12]);

/**
 * Consonants a given script has a code point for but does not teach.
 *
 * Devanagari carries ऩ, ऱ and ऴ so that Dravidian languages can be
 * transliterated into it. They are core letters in Tamil, at the very same
 * offsets, and no Hindi child is ever taught them. The exclusion has to be per
 * script for exactly that reason.
 */
const SKIP_CONSONANT_OFFSETS: Record<string, Set<number>> = {
  hindi: new Set([0x29, 0x31, 0x34]),
};

/**
 * Offset to [id suffix, learner-facing label].
 *
 * Retroflex consonants take a capital in the label (ITRANS convention) and a
 * doubled letter in the id, because "ta" is already the dental at +0x24 and two
 * letters cannot share an id.
 */
const NAMES: Record<number, [string, string]> = {
  0x05: ["a", "a"], 0x06: ["aa", "aa"], 0x07: ["i", "i"], 0x08: ["ii", "ii"],
  0x09: ["u", "u"], 0x0a: ["uu", "uu"], 0x0b: ["ri", "ri"],
  0x0f: ["e", "e"], 0x10: ["ai", "ai"], 0x13: ["o", "o"], 0x14: ["au", "au"],
  0x15: ["ka", "ka"], 0x16: ["kha", "kha"], 0x17: ["ga", "ga"], 0x18: ["gha", "gha"], 0x19: ["nga", "nga"],
  0x1a: ["cha", "cha"], 0x1b: ["chha", "chha"], 0x1c: ["ja", "ja"], 0x1d: ["jha", "jha"], 0x1e: ["nya", "nya"],
  0x1f: ["tta", "Ta"], 0x20: ["ttha", "Tha"], 0x21: ["dda", "Da"], 0x22: ["ddha", "Dha"], 0x23: ["nna", "Na"],
  0x24: ["ta", "ta"], 0x25: ["tha", "tha"], 0x26: ["da", "da"], 0x27: ["dha", "dha"], 0x28: ["na", "na"],
  0x29: ["nnna", "nna"],
  0x2a: ["pa", "pa"], 0x2b: ["pha", "pha"], 0x2c: ["ba", "ba"], 0x2d: ["bha", "bha"], 0x2e: ["ma", "ma"],
  0x2f: ["ya", "ya"], 0x30: ["ra", "ra"], 0x31: ["rra", "rra"], 0x32: ["la", "la"], 0x33: ["lla", "La"],
  0x34: ["llla", "zha"],
  0x35: ["va", "va"], 0x36: ["sha", "sha"], 0x37: ["ssa", "Sha"], 0x38: ["sa", "sa"], 0x39: ["ha", "ha"],
};

/**
 * Offsets the alphabet teaches LAST, out of code point order.
 *
 * Per script on purpose. Tamil's ள and Gurmukhi's ਲ਼ share offset 0x33 and both
 * belong where the code points put them, so moving 0x33 globally would break
 * two alphabets to fix two others.
 */
const TAIL_OFFSETS: Record<string, number[]> = {
  hindi: [0x33], // ळ
  gujarati: [0x33], // ળ
};

/**
 * Conjuncts taught as the final letters of the alphabet.
 *
 * These have no code point, so they are the one part of the roster that cannot
 * fall out of the block and has to be written down.
 */
const TAIL_CONJUNCTS: Record<string, [char: string, id: string, label: string][]> = {
  hindi: [
    ["\u0915\u094d\u0937", "ksha", "ksha"],
    ["\u0924\u094d\u0930", "tra", "tra"],
    ["\u091c\u094d\u091e", "gnya", "gnya"],
  ],
  gujarati: [
    ["\u0a95\u0acd\u0ab7", "ksha", "ksha"],
    ["\u0a9c\u0acd\u0a9e", "gnya", "gnya"],
  ],
};

type Char = { id: string; char: string; label: string; guide: string };

function taught(
  prefix: string,
  base: number,
  prop: string,
  vowels: boolean,
  skip?: Set<number>,
): Char[] {
  const re = new RegExp(`^[\\p{Script=${prop}}]$`, "u");
  const isLetter = /^\p{Lo}$/u;
  const [lo, hi] = vowels ? [0x05, 0x14] : [0x15, 0x39];
  const tail = vowels ? [] : (TAIL_OFFSETS[prefix] ?? []);
  const out: Char[] = [];

  const emit = (off: number) => {
    const name = NAMES[off];
    if (!name) return;
    const char = String.fromCodePoint(base + off);
    if (!re.test(char) || !isLetter.test(char)) return;
    out.push({ id: "", char, label: name[1], guide: "" });
  };

  for (let off = lo; off <= hi; off++) {
    if (vowels && SKIP_VOWEL_OFFSETS.has(off)) continue;
    if (!vowels && skip?.has(off)) continue;
    if (tail.includes(off)) continue; // held back, emitted after the range
    emit(off);
  }
  for (const off of tail) emit(off);
  if (!vowels) {
    for (const [char, id, label] of TAIL_CONJUNCTS[prefix] ?? []) {
      out.push({ id: `${ID_PREFIX[prefix]}_${id}`, char, label, guide: "" });
    }
  }
  return out;
}

let src = readFileSync(CHAPTERS, "utf8");
let added = 0;

for (const [prefix, base, prop] of TARGETS) {
  for (const kind of ["vowels", "consonants"] as const) {
    const chapterId = `${prefix}-${kind}`;
    // Grab the chapter's characters array verbatim.
    const re = new RegExp(
      `(id: "${chapterId}",[\\s\\S]*?characters: \\[\\n)([\\s\\S]*?)(\\n    \\],)`,
    );
    const m = src.match(re);
    if (!m) throw new Error(`chapter ${chapterId} not found`);

    // What is already there, keyed by character, so existing guides survive.
    const existing = new Map<string, string>();
    for (const c of m[2].matchAll(
      /\{\s*id: "([^"]+)",\s*char: "((?:[^"\\]|\\.)*)",\s*label: "((?:[^"\\]|\\.)*)",\s*guide:\s*((?:"(?:[^"\\]|\\.)*"\s*\+?\s*)+),?\s*\}/g,
    )) {
      existing.set(JSON.parse(`"${c[2]}"`), c[0]);
    }

    const wanted = taught(prefix, base, prop, kind === "vowels", SKIP_CONSONANT_OFFSETS[prefix]);
    const blocks: string[] = [];
    for (const w of wanted) {
      const have = existing.get(w.char);
      if (have) {
        blocks.push("      " + have.trim().replace(/,$/, "") + ",");
        continue;
      }
      const id =
        w.id || `${ID_PREFIX[prefix]}_${NAMES[w.char.codePointAt(0)! - base][0]}`;
      // guide "" means the generator has not shaped it yet; it fills these in.
      blocks.push(
        `      {\n        id: ${JSON.stringify(id)},\n        char: ${JSON.stringify(w.char)},\n        label: ${JSON.stringify(w.label)},\n        guide: "",\n      },`,
      );
      added += 1;
    }
    src = src.replace(re, (_all, head, _body, tail) => head + blocks.join("\n") + tail);
    console.log(`  ${chapterId.padEnd(22)} ${wanted.length} letters (${wanted.length - existing.size >= 0 ? wanted.length - [...existing.keys()].filter((c) => wanted.some((w) => w.char === c)).length : 0} new)`);
  }
}

writeFileSync(CHAPTERS, src);
console.log(`\nAdded ${added} letters. Now run extractScriptTraceGuides.ts to shape them.`);
