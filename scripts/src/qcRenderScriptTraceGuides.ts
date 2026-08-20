// Render a QC grid of Script Trace guides to an HTML file for visual review.
// Run: pnpm --filter @workspace/scripts exec tsx src/qcRenderScriptTraceGuides.ts
// Then screenshot /tmp/qc-guides.html with headless chromium.

import { writeFileSync } from "node:fs";
import { SCRIPT_TRACE_CHAPTERS } from "@workspace/script-trace";

/** chapterId → character ids to sample ("*" = first item). */
const SAMPLES: [chapter: string, ids: string[]][] = [
  ["gujarati-vowels", ["gu_v_0"]],
  ["gujarati-words", ["*", "gu_w_1", "gu_w_2"]],
  ["gujarati-sentences", ["*", "gu_s1"]],
  ["hindi-words", ["*", "hi_w_1"]],
  ["hindi-sentences", ["*"]],
  ["bengali-vowels", ["*"]],
  ["bengali-words", ["*", "bn_w_1"]],
  ["gurmukhi-words", ["*"]],
  ["odia-vowels", ["*"]],
  ["tamil-words", ["*"]],
  ["tamil-sentences", ["tamil_s2"]],
  ["telugu-words", ["*"]],
  ["kannada-sentences", ["kannada_s1"]],
  ["malayalam-sentences", ["malayalam_s3"]],
  ["urdu-letters", ["*", "ur_l_1"]],
  ["urdu-words", ["*", "ur_w_1"]],
  ["urdu-sentences", ["*", "ur_s1"]],
  ["sindhi-additional", ["sd_l_14"]],
  ["kashmiri-additional", ["*"]],
  ["olchiki-letters", ["*"]],
  ["meitei-letters", ["*"]],
  ["meitei-words", ["*"]],
  ["meitei-sentences", ["meitei_s0", "meitei_s2"]],
];

const cells: string[] = [];
for (const [chapterId, ids] of SAMPLES) {
  const ch = SCRIPT_TRACE_CHAPTERS.find((c) => c.id === chapterId);
  if (!ch) {
    cells.push(`<div class="cell missing">chapter ${chapterId} missing</div>`);
    continue;
  }
  for (const id of ids) {
    const item = id === "*" ? ch.characters[0] : ch.characters.find((c) => c.id === id);
    if (!item) {
      cells.push(`<div class="cell missing">${chapterId}/${id} missing</div>`);
      continue;
    }
    const ok = item.guide.length > 0;
    cells.push(`<div class="cell">
      <svg viewBox="0 0 100 100">
        <rect x="0" y="0" width="100" height="100" fill="#fff" stroke="#ddd"/>
        <rect x="12" y="12" width="76" height="76" fill="none" stroke="#eef" stroke-dasharray="2 2"/>
        ${ok ? `<path d="${item.guide}" fill="#334" fill-rule="nonzero"/>` : `<text x="50" y="55" text-anchor="middle" font-size="10" fill="#c00">NO GUIDE</text>`}
      </svg>
      <div class="lbl">${ch.id}/${item.id} · ${item.char} · ${item.label} · ${(item.guide.length / 1024).toFixed(1)}KB</div>
    </div>`);
  }
}

const html = `<!doctype html><meta charset="utf-8"><style>
body { font-family: sans-serif; margin: 12px; background: #f6f6f8; }
.grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
.cell { background: #fff; border: 1px solid #ccc; border-radius: 6px; padding: 6px; }
.cell svg { width: 100%; aspect-ratio: 1; display: block; }
.lbl { font-size: 10px; color: #444; margin-top: 4px; word-break: break-all; }
.missing { color: #c00; font-size: 11px; }
</style><div class="grid">${cells.join("\n")}</div>`;

writeFileSync("/tmp/qc-guides.html", html);
console.log(`Wrote /tmp/qc-guides.html with ${cells.length} cells`);
