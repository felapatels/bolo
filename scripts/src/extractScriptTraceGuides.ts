// Generate font-accurate glyph outline guides for the Script Trace game.
//
// Reads the current chapter data (ids, chars, labels, titles, stages) from
// lib/script-trace/src/chapters.ts, then fills in a
// `guide` outline for every character that doesn't have one yet:
//
//   - Existing non-empty guides are kept verbatim (byte-for-byte).
//   - Missing guides are generated from the committed Noto fonts at
//     artifacts/bolo-mobile/assets/store/fonts, shaped with HarfBuzz so that
//     Indic matras/conjuncts and Arabic-script joining (Nastaliq) come out as
//     real rendered letterforms — not per-code-point approximations.
//   - Words shape as one run; sentences are wrapped into up to 3 lines so the
//     outline block stays traceable inside the square 0-100 canvas.
//   - Glyph subpaths are emitted in logical writing order (cluster order), so
//     the in-game pen demo draws characters the way a hand would write them —
//     including right-to-left for Urdu/Sindhi/Kashmiri.
//
// The emitted path strings use only absolute M/L/Q/C commands (no Z), because
// the in-game parseSvgPath implementation only understands those. Closed
// contours are closed with an explicit L back to the contour start. All paths
// are normalised into a 0-100 viewBox with a margin (BOX_MIN..BOX_MAX).
//
// Run: pnpm --filter @workspace/scripts exec tsx src/extractScriptTraceGuides.ts

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Blob, Face, Font, Buffer as HbBuffer, shape } from "harfbuzzjs";
import {
  SCRIPT_TRACE_CHAPTERS,
  type TraceChapter,
  type TraceCharacter,
} from "@workspace/script-trace";

const ROOT = resolve(import.meta.dirname, "../..");
const FONT_DIR = resolve(ROOT, "artifacts/bolo-mobile/assets/store/fonts");

// Fit outlines into this box within the 0-100 viewBox (same margins as the
// original single-letter guides).
const BOX_MIN = 12;
const BOX_MAX = 88;

// ── Fonts ─────────────────────────────────────────────────────────────────────

/** Chapter-id prefix → ordered font fallback chain. The first font that can
 *  shape an item without .notdef is used, so e.g. Sindhi's swash kaf (ڪ)
 *  falls back from Nastaliq to Naskh, and the Meitei sentence items (authored
 *  in Bengali script — Manipuri's other common script) use the Bengali font. */
const FONT_BY_PREFIX: [prefix: string, files: string[]][] = [
  ["gujarati", ["NotoSansGujarati_400Regular.ttf"]],
  ["hindi", ["NotoSansDevanagari_400Regular.ttf"]],
  ["bengali", ["NotoSansBengali_400Regular.ttf"]],
  ["gurmukhi", ["NotoSansGurmukhi_400Regular.ttf"]],
  ["odia", ["NotoSansOriya_400Regular.ttf"]],
  ["tamil", ["NotoSansTamil_400Regular.ttf"]],
  ["telugu", ["NotoSansTelugu_400Regular.ttf"]],
  ["kannada", ["NotoSansKannada_400Regular.ttf"]],
  ["malayalam", ["NotoSansMalayalam_400Regular.ttf"]],
  // The app presents Urdu/Sindhi/Kashmiri chapters as Nastaliq (scriptName).
  ["urdu", ["NotoNastaliqUrdu_400Regular.ttf", "NotoNaskhArabic_400Regular.ttf"]],
  ["sindhi", ["NotoNastaliqUrdu_400Regular.ttf", "NotoNaskhArabic_400Regular.ttf"]],
  ["kashmiri", ["NotoNastaliqUrdu_400Regular.ttf", "NotoNaskhArabic_400Regular.ttf"]],
  ["olchiki", ["NotoSansOlChiki_400Regular.ttf"]],
  ["meitei", ["NotoSansMeeteiMayek_400Regular.ttf", "NotoSansBengali_400Regular.ttf"]],
];

/** Chapters written right-to-left (affects multi-line alignment only —
 *  HarfBuzz itself infers direction from the text). */
const RTL_PREFIXES = ["urdu", "sindhi", "kashmiri"];

type LoadedFont = {
  font: Font;
  upem: number;
  lineStep: number; // estimated line height in font units
  glyphCache: Map<number, Cmd[]>;
};

const fontCache = new Map<string, LoadedFont>();

function loadFont(file: string): LoadedFont {
  const cached = fontCache.get(file);
  if (cached) return cached;
  const bytes = readFileSync(resolve(FONT_DIR, file));
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const face = new Face(new Blob(ab));
  const font = new Font(face);
  const ext = font.hExtents();
  const lineStep = ext
    ? (ext.ascender - ext.descender) * 1.05
    : face.upem * 1.25;
  const loaded: LoadedFont = { font, upem: face.upem, lineStep, glyphCache: new Map() };
  fontCache.set(file, loaded);
  return loaded;
}

function fontsForChapter(chapterId: string): LoadedFont[] {
  const hit = FONT_BY_PREFIX.find(([p]) => chapterId.startsWith(p));
  if (!hit) throw new Error(`No font mapping for chapter "${chapterId}"`);
  return hit[1].map(loadFont);
}

/** True if the font can shape every character of the text (no .notdef). */
function canShape(lf: LoadedFont, text: string): boolean {
  const buf = new HbBuffer();
  buf.addText(text);
  buf.guessSegmentProperties();
  shape(lf.font, buf);
  return buf.getGlyphInfosAndPositions().every((g) => g.codepoint !== 0);
}

// ── Path parsing / composition ────────────────────────────────────────────────

/** Absolute path command; pts holds [control...,] endpoint pairs. */
type Cmd = { type: "M" | "L" | "Q" | "C"; pts: number[] };

/**
 * Parse a HarfBuzz glyphToPath string (absolute M/L/Q/C/Z, y-up font units)
 * into M/L/Q/C commands with Z resolved to an explicit closing L.
 */
function parseGlyphPath(d: string): Cmd[] {
  const out: Cmd[] = [];
  let startX = 0, startY = 0, lastX = 0, lastY = 0;
  const re = /([MLQCZmlqcz])([^MLQCZmlqcz]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    const type = m[1].toUpperCase();
    const nums = (m[2].match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g) ?? []).map(Number);
    if (type === "M") {
      for (let i = 0; i + 1 < nums.length; i += 2) {
        if (i === 0) {
          out.push({ type: "M", pts: [nums[0], nums[1]] });
          startX = nums[0]; startY = nums[1];
        } else {
          // Implicit lineto after moveto per SVG spec.
          out.push({ type: "L", pts: [nums[i], nums[i + 1]] });
        }
        lastX = nums[i]; lastY = nums[i + 1];
      }
    } else if (type === "L") {
      for (let i = 0; i + 1 < nums.length; i += 2) {
        out.push({ type: "L", pts: [nums[i], nums[i + 1]] });
        lastX = nums[i]; lastY = nums[i + 1];
      }
    } else if (type === "Q") {
      for (let i = 0; i + 3 < nums.length; i += 4) {
        out.push({ type: "Q", pts: nums.slice(i, i + 4) });
        lastX = nums[i + 2]; lastY = nums[i + 3];
      }
    } else if (type === "C") {
      for (let i = 0; i + 5 < nums.length; i += 6) {
        out.push({ type: "C", pts: nums.slice(i, i + 6) });
        lastX = nums[i + 4]; lastY = nums[i + 5];
      }
    } else if (type === "Z") {
      // ALWAYS emit the closing L — even when the contour already ends on its
      // start point. The app parsers sample curve commands, and a contour
      // whose final command is a curve relies on the sampler hitting t=1
      // exactly to close; an explicit trailing L makes closure unconditional
      // (the winding-number inside test requires closed polylines).
      out.push({ type: "L", pts: [startX, startY] });
      lastX = startX; lastY = startY;
    }
  }
  return out;
}

function glyphCommands(lf: LoadedFont, glyphId: number): Cmd[] {
  const cached = lf.glyphCache.get(glyphId);
  if (cached) return cached;
  const cmds = parseGlyphPath(lf.font.glyphToPath(glyphId));
  lf.glyphCache.set(glyphId, cmds);
  return cmds;
}

/** One positioned glyph's commands plus ordering metadata. */
type PlacedGlyph = { cluster: number; order: number; cmds: Cmd[] };

function translateCmds(cmds: Cmd[], dx: number, dy: number): Cmd[] {
  return cmds.map((c) => ({
    type: c.type,
    pts: c.pts.map((v, i) => (i % 2 === 0 ? v + dx : v + dy)),
  }));
}

/**
 * Shape one line of text and return its glyphs positioned in font units
 * (y-up), each tagged with its cluster for logical-order emission.
 * Throws if the font has no glyph for part of the text (.notdef).
 */
function shapeLine(lf: LoadedFont, text: string): PlacedGlyph[] {
  const buf = new HbBuffer();
  buf.addText(text);
  buf.guessSegmentProperties();
  shape(lf.font, buf);
  const glyphs = buf.getGlyphInfosAndPositions();
  const placed: PlacedGlyph[] = [];
  let cx = 0, cy = 0;
  glyphs.forEach((g, order) => {
    if (g.codepoint === 0) {
      throw new Error(`.notdef glyph while shaping ${JSON.stringify(text)}`);
    }
    const cmds = glyphCommands(lf, g.codepoint);
    if (cmds.length > 0) {
      placed.push({
        cluster: g.cluster,
        order,
        cmds: translateCmds(cmds, cx + (g.xOffset ?? 0), cy + (g.yOffset ?? 0)),
      });
    }
    cx += g.xAdvance ?? 0;
    cy += g.yAdvance ?? 0;
  });
  return placed;
}

/** Ink bounding box over commands, flattening curves by sampling. */
function inkBBox(cmds: Cmd[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let cx = 0, cy = 0;
  const see = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const c of cmds) {
    if (c.type === "M" || c.type === "L") {
      cx = c.pts[0]; cy = c.pts[1];
      see(cx, cy);
    } else if (c.type === "Q") {
      const [x1, y1, x, y] = c.pts;
      for (let t = 0.1; t <= 1.0001; t += 0.1) {
        see((1 - t) ** 2 * cx + 2 * (1 - t) * t * x1 + t ** 2 * x,
            (1 - t) ** 2 * cy + 2 * (1 - t) * t * y1 + t ** 2 * y);
      }
      cx = x; cy = y;
    } else {
      const [x1, y1, x2, y2, x, y] = c.pts;
      for (let t = 0.1; t <= 1.0001; t += 0.1) {
        see((1 - t) ** 3 * cx + 3 * (1 - t) ** 2 * t * x1 + 3 * (1 - t) * t ** 2 * x2 + t ** 3 * x,
            (1 - t) ** 3 * cy + 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t ** 2 * y2 + t ** 3 * y);
      }
      cx = x; cy = y;
    }
  }
  if (minX === Infinity) throw new Error("inkBBox on empty command list");
  return { minX, maxX, minY, maxY };
}

// ── Line wrapping ─────────────────────────────────────────────────────────────

function lineAdvance(lf: LoadedFont, text: string): number {
  const buf = new HbBuffer();
  buf.addText(text);
  buf.guessSegmentProperties();
  shape(lf.font, buf);
  return buf.getGlyphInfosAndPositions().reduce((s, g) => s + (g.xAdvance ?? 0), 0);
}

/**
 * Split multi-word text into 1-3 lines of whole tokens (logical order),
 * choosing the line count whose resulting block is closest to a comfortably
 * traceable aspect ratio in the square canvas.
 */
function wrapTokens(lf: LoadedFont, text: string): string[] {
  const tokens = text.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length <= 1) return [text.trim()];

  const widths = tokens.map((t) => lineAdvance(lf, t));
  const spaceW = lineAdvance(lf, "\u0020a") - lineAdvance(lf, "a") || lf.upem * 0.25;
  const TARGET_ASPECT = 1.15;

  let best: { lines: string[]; score: number } | null = null;
  for (let n = 1; n <= Math.min(3, tokens.length); n++) {
    const totalW = widths.reduce((a, b) => a + b, 0) + spaceW * (tokens.length - n);
    const target = totalW / n;
    const lines: string[][] = [[]];
    const lineW: number[] = [0];
    for (let i = 0; i < tokens.length; i++) {
      const li = lines.length - 1;
      const addW = widths[i] + (lines[li].length > 0 ? spaceW : 0);
      const remainingTokens = tokens.length - i;
      const remainingLines = n - lines.length;
      const mustBreak =
        lines[li].length > 0 &&
        lineW[li] + addW > target * 1.2 &&
        remainingLines >= 1 &&
        remainingTokens >= 1;
      if (mustBreak) {
        lines.push([tokens[i]]);
        lineW.push(widths[i]);
      } else {
        lines[li].push(tokens[i]);
        lineW[li] += addW;
      }
    }
    const blockW = Math.max(...lineW);
    const blockH = lines.length * lf.lineStep;
    const aspect = blockW / blockH;
    const score = Math.abs(Math.log(aspect / TARGET_ASPECT));
    if (best === null || score < best.score) {
      best = { lines: lines.map((l) => l.join(" ")), score };
    }
  }
  return best!.lines;
}

// ── Guide generation ──────────────────────────────────────────────────────────

function round1(n: number): number {
  const r = Math.round(n * 10) / 10;
  return r === 0 ? 0 : r;
}

/**
 * Generate the normalised 0-100 guide path for a text item.
 * Multi-word text wraps into lines; glyphs emit in logical writing order.
 */
function generateGuide(lf: LoadedFont, text: string, rtl: boolean): string {
  const lines = wrapTokens(lf, text);

  // Shape each line, stack line ink-boxes vertically (y-up: downward = -y).
  type PlacedLine = { glyphs: PlacedGlyph[]; bbox: ReturnType<typeof inkBBox> };
  const shaped: PlacedLine[] = lines.map((line) => {
    const glyphs = shapeLine(lf, line);
    if (glyphs.length === 0) throw new Error(`No ink for ${JSON.stringify(line)}`);
    return { glyphs, bbox: inkBBox(glyphs.flatMap((g) => g.cmds)) };
  });

  const gap = lf.upem * 0.18;
  const blockW = Math.max(...shaped.map((l) => l.bbox.maxX - l.bbox.minX));
  const all: PlacedGlyph[] = [];
  let curBottom = 0;
  shaped.forEach((line, i) => {
    const w = line.bbox.maxX - line.bbox.minX;
    // Align to the writing edge: left for LTR, right for RTL.
    const dx = -line.bbox.minX + (rtl ? blockW - w : 0);
    const dy = i === 0 ? 0 : curBottom - gap - line.bbox.maxY;
    for (const g of line.glyphs) {
      all.push({
        cluster: g.cluster,
        order: g.order,
        cmds: translateCmds(g.cmds, dx, dy),
      });
    }
    curBottom = line.bbox.minY + dy;
    // Tag glyphs with line index via order offset so sort keeps lines apart.
    const lineBase = i * 1_000_000;
    for (const g of all.slice(all.length - line.glyphs.length)) {
      g.cluster += lineBase;
      g.order += lineBase;
    }
  });

  // Logical writing order: by cluster (per line), stable by shaped order.
  all.sort((a, b) => a.cluster - b.cluster || a.order - b.order);
  const composed = all.flatMap((g) => g.cmds);

  // Normalise into the BOX, preserving aspect, flipping y (font y-up → SVG y-down).
  const bb = inkBBox(composed);
  const w = bb.maxX - bb.minX;
  const h = bb.maxY - bb.minY;
  const scale = (BOX_MAX - BOX_MIN) / Math.max(w, h);
  const offX = BOX_MIN + ((BOX_MAX - BOX_MIN) - w * scale) / 2;
  const offY = BOX_MIN + ((BOX_MAX - BOX_MIN) - h * scale) / 2;
  const tx = (x: number) => round1((x - bb.minX) * scale + offX);
  const ty = (y: number) => round1((bb.maxY - y) * scale + offY);

  const parts: string[] = [];
  for (const c of composed) {
    const p = c.pts;
    if (c.type === "M") parts.push(`M ${tx(p[0])},${ty(p[1])}`);
    else if (c.type === "L") parts.push(`L ${tx(p[0])},${ty(p[1])}`);
    else if (c.type === "Q") parts.push(`Q ${tx(p[0])},${ty(p[1])} ${tx(p[2])},${ty(p[3])}`);
    else parts.push(`C ${tx(p[0])},${ty(p[1])} ${tx(p[2])},${ty(p[3])} ${tx(p[4])},${ty(p[5])}`);
  }
  return parts.join(" ");
}

// ── Build + emit ──────────────────────────────────────────────────────────────

type GuideStats = { chapter: string; id: string; bytes: number };

function buildChapters(): { chapters: TraceChapter[]; generated: number; kept: number; stats: GuideStats[] } {
  let generated = 0;
  let kept = 0;
  const stats: GuideStats[] = [];
  const failures: string[] = [];

  const chapters = SCRIPT_TRACE_CHAPTERS.map((ch) => {
    const lfs = fontsForChapter(ch.id);
    const rtl = RTL_PREFIXES.some((p) => ch.id.startsWith(p));
    const characters: TraceCharacter[] = ch.characters.map((c) => {
      if (c.guide) {
        kept++;
        return c;
      }
      try {
        const lf = lfs.find((f) => canShape(f, c.char));
        if (!lf) throw new Error("no font in fallback chain covers this text");
        const guide = generateGuide(lf, c.char, rtl);
        generated++;
        stats.push({ chapter: ch.id, id: c.id, bytes: guide.length });
        return { ...c, guide };
      } catch (err) {
        failures.push(`${ch.id}/${c.id} (${c.char}): ${(err as Error).message}`);
        return c;
      }
    });
    return { ...ch, characters };
  });

  if (failures.length > 0) {
    throw new Error(`Guide generation failed for ${failures.length} item(s):\n  ${failures.join("\n  ")}`);
  }
  return { chapters, generated, kept, stats };
}

const HEADER = `// Stroke guide data for the Script Trace game.
// GENERATED by scripts/src/extractScriptTraceGuides.ts — do not edit guides by hand.
// Guides are exact glyph outlines extracted from the committed Noto fonts
// (OFL) at artifacts/bolo-mobile/assets/store/fonts, shaped with HarfBuzz so
// matras, conjuncts, and Arabic-script joining render as real letterforms.
// Every path is normalised to a 0 0 100 100 viewBox and emitted with absolute
// M/L/Q/C commands only (Z closes become explicit L). Multi-word phrases are
// wrapped into up to 3 lines; glyph subpaths are ordered in logical writing
// order so the pen demo draws them the way a hand would.
//
// Characters with guide="" fall back to text-mode rendering in the game
// (render the char as large text). After a full regeneration there should be
// none — the generator fails loudly if any item cannot be shaped.
//
// Each character entry has:
//   id        — stable identifier (used as the characterId in the API)
//   char      — the Unicode character(s) to display
//   label     — romanised pronunciation label shown beneath the character
//   guide     — SVG path data (viewBox 0 0 100 100) or "" for text-mode
`;


function renderFile(chapters: TraceChapter[]): string {
  const charBlock = (chars: TraceCharacter[]): string =>
    chars
      .map(
        (c) =>
          `      {\n        id: ${JSON.stringify(c.id)},\n        char: ${JSON.stringify(c.char)},\n        label: ${JSON.stringify(c.label)},\n        guide:\n          ${JSON.stringify(c.guide)},\n      },`,
      )
      .join("\n");

  const chapterBlock = chapters
    .map(
      (ch) =>
        `  {\n    id: ${JSON.stringify(ch.id)},\n    title: ${JSON.stringify(ch.title)},\n    scriptName: ${JSON.stringify(ch.scriptName)},\n    stage: ${JSON.stringify(ch.stage)},\n    characters: [\n${charBlock(ch.characters)}\n    ],\n  },`,
    )
    .join("\n");

  return `${HEADER}
export type ChapterStage = 'alphabet' | 'words' | 'sentences' | 'full-sentences';

export type TraceCharacter = {
  id: string;
  char: string;
  label: string;
  guide: string; // SVG path, viewBox 0 0 100 100; or "" -> char rendered as text guide
};

export type TraceChapter = {
  id: string;
  title: string;
  scriptName: string;
  stage: ChapterStage;
  characters: TraceCharacter[];
};

export const SCRIPT_TRACE_CHAPTERS: TraceChapter[] = [
${chapterBlock}
];
`;
}

const { chapters, generated, kept, stats } = buildChapters();

// ONE FILE NOW. This used to write the web copy and a mobile copy with an extra
// header comment, and scripts/src/checkScriptTraceSync.ts existed solely to
// police the two against drift. Both copies moved into @workspace/script-trace
// on 2026-08-20, so there is one file, no header, and nothing to keep in sync.
const chaptersPath = resolve(ROOT, "lib/script-trace/src/chapters.ts");

// PRESERVE WHAT THIS GENERATOR DID NOT WRITE.
//
// renderFile() emits the header, the types and SCRIPT_TRACE_CHAPTERS, and
// nothing else. But chapters.ts also carries LANG_CHAPTER_IDS, which is
// hand-maintained and lives AFTER the chapters array. Writing the rendered
// output on its own silently deleted it, and because the deletion is at the
// bottom of a 5000-line generated file nothing about the diff looks alarming.
// It surfaced as an import failing at runtime, which is a long way from the
// cause.
//
// So: keep everything from the first export that follows the chapters array
// onward, verbatim. Anything hand-written below the generated section survives
// a regeneration, which is the property this file needs and did not have.
const previous = existsSync(chaptersPath) ? readFileSync(chaptersPath, "utf8") : "";
const HANDWRITTEN_MARKER = "\nexport const LANG_CHAPTER_IDS";
const handIdx = previous.indexOf(HANDWRITTEN_MARKER);
const preserved = handIdx === -1 ? "" : "\n" + previous.slice(handIdx + 1);
if (previous && handIdx === -1) {
  // Loud rather than silent: if the marker ever moves or is renamed, the next
  // run would quietly drop it again.
  throw new Error(
    "chapters.ts has no LANG_CHAPTER_IDS to preserve. If it moved, update " +
      "HANDWRITTEN_MARKER in this script before regenerating.",
  );
}
writeFileSync(chaptersPath, renderFile(chapters).replace(/\n+$/, "\n") + preserved);

console.log(`Wrote ${chaptersPath}`);
console.log(`Kept ${kept} existing guides, generated ${generated} new ones.`);
const totalBytes = stats.reduce((s, x) => s + x.bytes, 0);
console.log(`Generated guide data: ${(totalBytes / 1024).toFixed(0)} KB total.`);
const top = [...stats].sort((a, b) => b.bytes - a.bytes).slice(0, 5);
console.log("Largest guides:");
for (const t of top) console.log(`  ${t.chapter}/${t.id}: ${(t.bytes / 1024).toFixed(1)} KB`);
