// Extract font-accurate glyph outline paths for the Script Trace game.
//
// Reads Noto Sans Gujarati / Devanagari Regular fonts committed at
// artifacts/bolo-mobile/assets/store/fonts, extracts the glyph outline for
// each character used by the four Script Trace chapters, normalises the
// outline into a 0-100 viewBox (with a margin), and rewrites both data files:
//   - artifacts/gujarati-coach/src/data/script-trace-chapters.ts
//   - artifacts/bolo-mobile/lib/game-data/script-trace-chapters.ts
//
// The emitted path strings use only absolute M/L/Q/C commands (no Z), because
// the in-game parseSvgPath implementation only understands those. Closed
// contours are closed with an explicit L back to the contour start.
//
// Run: pnpm --filter @workspace/scripts exec tsx src/extractScriptTraceGuides.ts

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import opentype from "opentype.js";

const ROOT = resolve(import.meta.dirname, "../..");
const FONT_DIR = resolve(ROOT, "artifacts/bolo-mobile/assets/store/fonts");

const GUJARATI_FONT = resolve(FONT_DIR, "NotoSansGujarati_400Regular.ttf");
const DEVANAGARI_FONT = resolve(FONT_DIR, "NotoSansDevanagari_400Regular.ttf");

type CharSpec = { id: string; char: string; label: string };

const GUJARATI_VOWELS: CharSpec[] = [
  { id: "gu_a", char: "અ", label: "a" },
  { id: "gu_aa", char: "આ", label: "aa" },
  { id: "gu_i", char: "ઇ", label: "i" },
  { id: "gu_ii", char: "ઈ", label: "ii" },
  { id: "gu_u", char: "ઉ", label: "u" },
  { id: "gu_uu", char: "ઊ", label: "uu" },
  { id: "gu_e", char: "એ", label: "e" },
  { id: "gu_ai", char: "ઐ", label: "ai" },
  { id: "gu_o", char: "ઓ", label: "o" },
  { id: "gu_au", char: "ઔ", label: "au" },
];

const GUJARATI_CONSONANTS: CharSpec[] = [
  { id: "gu_ka", char: "ક", label: "ka" },
  { id: "gu_kha", char: "ખ", label: "kha" },
  { id: "gu_ga", char: "ગ", label: "ga" },
  { id: "gu_gha", char: "ઘ", label: "gha" },
  { id: "gu_cha", char: "ચ", label: "cha" },
  { id: "gu_ja", char: "જ", label: "ja" },
  { id: "gu_ta", char: "ત", label: "ta" },
  { id: "gu_da", char: "દ", label: "da" },
  { id: "gu_na", char: "ન", label: "na" },
  { id: "gu_pa", char: "પ", label: "pa" },
];

const HINDI_VOWELS: CharSpec[] = [
  { id: "hi_a", char: "अ", label: "a" },
  { id: "hi_aa", char: "आ", label: "aa" },
  { id: "hi_i", char: "इ", label: "i" },
  { id: "hi_ii", char: "ई", label: "ii" },
  { id: "hi_u", char: "उ", label: "u" },
  { id: "hi_uu", char: "ऊ", label: "uu" },
  { id: "hi_e", char: "ए", label: "e" },
  { id: "hi_ai", char: "ऐ", label: "ai" },
  { id: "hi_o", char: "ओ", label: "o" },
  { id: "hi_au", char: "औ", label: "au" },
];

const HINDI_CONSONANTS: CharSpec[] = [
  { id: "hi_ka", char: "क", label: "ka" },
  { id: "hi_kha", char: "ख", label: "kha" },
  { id: "hi_ga", char: "ग", label: "ga" },
  { id: "hi_gha", char: "घ", label: "gha" },
  { id: "hi_cha", char: "च", label: "cha" },
  { id: "hi_ja", char: "ज", label: "ja" },
  { id: "hi_ta", char: "त", label: "ta" },
  { id: "hi_da", char: "द", label: "da" },
  { id: "hi_na", char: "न", label: "na" },
  { id: "hi_pa", char: "प", label: "pa" },
];

// Fit glyph into this box within the 0-100 viewBox.
const BOX_MIN = 12;
const BOX_MAX = 88;

type Cmd = opentype.PathCommand;

function extractGuide(font: opentype.Font, char: string): string {
  const glyph = font.charToGlyph(char);
  if (!glyph || glyph.index === 0) {
    throw new Error(`Glyph missing for ${char}`);
  }
  // Large unitsPerEm-scale render, we normalise afterwards.
  const path = glyph.getPath(0, 0, 1000);
  const cmds = path.commands as Cmd[];
  if (cmds.length === 0) throw new Error(`Empty outline for ${char}`);

  // Bounding box over all on-path + control points (control points only
  // loosely affect bbox, so compute bbox by flattening curves).
  const pts: { x: number; y: number }[] = [];
  let cx = 0;
  let cy = 0;
  for (const c of cmds) {
    if (c.type === "M" || c.type === "L") {
      cx = c.x;
      cy = c.y;
      pts.push({ x: cx, y: cy });
    } else if (c.type === "Q") {
      for (let t = 0.1; t <= 1.0001; t += 0.1) {
        pts.push({
          x: (1 - t) ** 2 * cx + 2 * (1 - t) * t * c.x1 + t ** 2 * c.x,
          y: (1 - t) ** 2 * cy + 2 * (1 - t) * t * c.y1 + t ** 2 * c.y,
        });
      }
      cx = c.x;
      cy = c.y;
    } else if (c.type === "C") {
      for (let t = 0.1; t <= 1.0001; t += 0.1) {
        pts.push({
          x:
            (1 - t) ** 3 * cx +
            3 * (1 - t) ** 2 * t * c.x1 +
            3 * (1 - t) * t ** 2 * c.x2 +
            t ** 3 * c.x,
          y:
            (1 - t) ** 3 * cy +
            3 * (1 - t) ** 2 * t * c.y1 +
            3 * (1 - t) * t ** 2 * c.y2 +
            t ** 3 * c.y,
        });
      }
      cx = c.x;
      cy = c.y;
    }
  }
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const range = Math.max(maxX - minX, maxY - minY);
  const scale = (BOX_MAX - BOX_MIN) / range;
  // Centre the glyph in the box on both axes.
  const offX = BOX_MIN + ((BOX_MAX - BOX_MIN) - (maxX - minX) * scale) / 2;
  const offY = BOX_MIN + ((BOX_MAX - BOX_MIN) - (maxY - minY) * scale) / 2;
  const tx = (x: number) => round((x - minX) * scale + offX);
  const ty = (y: number) => round((y - minY) * scale + offY);

  // Emit only M/L/Q/C; close contours with an explicit L to the start.
  const parts: string[] = [];
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  for (const c of cmds) {
    if (c.type === "M") {
      startX = tx(c.x);
      startY = ty(c.y);
      lastX = startX;
      lastY = startY;
      parts.push(`M ${startX},${startY}`);
    } else if (c.type === "L") {
      lastX = tx(c.x);
      lastY = ty(c.y);
      parts.push(`L ${lastX},${lastY}`);
    } else if (c.type === "Q") {
      lastX = tx(c.x);
      lastY = ty(c.y);
      parts.push(`Q ${tx(c.x1)},${ty(c.y1)} ${lastX},${lastY}`);
    } else if (c.type === "C") {
      lastX = tx(c.x);
      lastY = ty(c.y);
      parts.push(
        `C ${tx(c.x1)},${ty(c.y1)} ${tx(c.x2)},${ty(c.y2)} ${lastX},${lastY}`,
      );
    } else if (c.type === "Z") {
      if (lastX !== startX || lastY !== startY) {
        parts.push(`L ${startX},${startY}`);
        lastX = startX;
        lastY = startY;
      }
    }
  }
  return parts.join(" ");
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

function buildChapterData() {
  const gu = opentype.parse(readFileSync(GUJARATI_FONT).buffer.slice(0));
  const hi = opentype.parse(readFileSync(DEVANAGARI_FONT).buffer.slice(0));

  const withGuides = (specs: CharSpec[], font: opentype.Font) =>
    specs.map((s) => ({ ...s, guide: extractGuide(font, s.char) }));

  return {
    GUJARATI_VOWELS: withGuides(GUJARATI_VOWELS, gu),
    GUJARATI_CONSONANTS: withGuides(GUJARATI_CONSONANTS, gu),
    HINDI_VOWELS: withGuides(HINDI_VOWELS, hi),
    HINDI_CONSONANTS: withGuides(HINDI_CONSONANTS, hi),
  };
}

type GuideChar = CharSpec & { guide: string };

function charBlock(chars: GuideChar[]): string {
  return chars
    .map(
      (c) =>
        `  {\n    id: ${JSON.stringify(c.id)},\n    char: ${JSON.stringify(c.char)},\n    label: ${JSON.stringify(c.label)},\n    guide:\n      ${JSON.stringify(c.guide)},\n  },`,
    )
    .join("\n");
}

const HEADER = `// Stroke guide data for the Script Trace game.
// GENERATED by scripts/src/extractScriptTraceGuides.ts — do not edit guides by hand.
// Guides are exact glyph outlines extracted from Noto Sans Gujarati /
// Noto Sans Devanagari Regular (OFL), normalised to a 0 0 100 100 viewBox,
// emitted with absolute M/L/Q/C commands only (Z closes become explicit L).
//
// Each character entry has:
//   id        — stable identifier (used as the characterId in the API)
//   char      — the Unicode character(s) to display
//   label     — romanised pronunciation label shown beneath the character
//   guide     — SVG path data (viewBox 0 0 100 100) used as the faint trace guide
`;

function renderFile(data: ReturnType<typeof buildChapterData>, mobile: boolean): string {
  const note = mobile
    ? "// Mobile copy — kept in sync with artifacts/gujarati-coach/src/data/script-trace-chapters.ts.\n"
    : "";
  return `${HEADER}${note}
export type TraceCharacter = {
  id: string;
  char: string;
  label: string;
  guide: string; // SVG path, viewBox 0 0 100 100
};

export type TraceChapter = {
  id: string;
  title: string;
  scriptName: string;
  characters: TraceCharacter[];
};

const GUJARATI_VOWELS: TraceCharacter[] = [
${charBlock(data.GUJARATI_VOWELS)}
];

const HINDI_VOWELS: TraceCharacter[] = [
${charBlock(data.HINDI_VOWELS)}
];

const GUJARATI_CONSONANTS: TraceCharacter[] = [
${charBlock(data.GUJARATI_CONSONANTS)}
];

const HINDI_CONSONANTS: TraceCharacter[] = [
${charBlock(data.HINDI_CONSONANTS)}
];

export const SCRIPT_TRACE_CHAPTERS: TraceChapter[] = [
  {
    id: "gujarati-vowels",
    title: "Gujarati Vowels",
    scriptName: "Gujarati",
    characters: GUJARATI_VOWELS,
  },
  {
    id: "gujarati-consonants",
    title: "Gujarati Consonants",
    scriptName: "Gujarati",
    characters: GUJARATI_CONSONANTS,
  },
  {
    id: "hindi-vowels",
    title: "Hindi Vowels",
    scriptName: "Devanagari",
    characters: HINDI_VOWELS,
  },
  {
    id: "hindi-consonants",
    title: "Hindi Consonants",
    scriptName: "Devanagari",
    characters: HINDI_CONSONANTS,
  },
];
`;
}

const data = buildChapterData();
const webPath = resolve(ROOT, "artifacts/gujarati-coach/src/data/script-trace-chapters.ts");
const mobilePath = resolve(
  ROOT,
  "artifacts/bolo-mobile/lib/game-data/script-trace-chapters.ts",
);
writeFileSync(webPath, renderFile(data, false));
writeFileSync(mobilePath, renderFile(data, true));
console.log(`Wrote ${webPath}`);
console.log(`Wrote ${mobilePath}`);
for (const [name, chars] of Object.entries(data)) {
  console.log(
    name,
    chars.map((c) => `${c.id}:${c.guide.length}ch`).join(" "),
  );
}
