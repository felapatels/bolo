// THE SHARE PICTURE ON THE WEB: a finished storybook drawn onto a canvas and
// handed to the share sheet, or downloaded where there is none.
//
// Owner, 2026-09-16: "add a share button to share the story once its done as
// an image file." WHAT goes into the picture and in what order is decided in
// @workspace/story (storySharePlan); this file only draws it. The phone twin is
// artifacts/bolo-mobile/components/story/StoryShareButton.tsx, which lays the
// same plan out as views and captures them with react-native-view-shot. Keep
// the two in step: same order, same sizes (STORY_SHARE_LAYOUT), same words.
//
// NO NEW DEPENDENCY. A canvas and the Web Share API are enough, and the stills
// are same-origin /story/madlib/<id>.webp files (storyStillPath in lib/story,
// since 2026-09-16), so the canvas is never tainted.
// crossOrigin is only set for a still served from another origin, where it is
// the difference between a PNG and a SecurityError at toBlob.

import {
  STORY_SHARE_LAYOUT as L,
  storyShareStillIds,
  withoutMissingStills,
  type StorySharePlan,
} from "@workspace/story";

/** How long one still may take before it is left out of the picture. */
export const STORY_SHARE_STILL_TIMEOUT_MS = 8000;

type Fonts = {
  /** The page's own family, for the title, the English and the footer. */
  ui: string;
  /** The learner's script, as useNativeText resolves it. */
  script: string;
  dir: "ltr" | "rtl";
  nastaliq: boolean;
};

function loadStill(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ok ? img : null);
    };
    const timer = setTimeout(() => done(false), STORY_SHARE_STILL_TIMEOUT_MS);
    try {
      if (new URL(src, window.location.href).origin !== window.location.origin) {
        img.crossOrigin = "anonymous";
      }
    } catch {
      // An unparseable src fails to load below, which leaves it out.
    }
    img.onload = () => done(img.naturalWidth > 0);
    img.onerror = () => done(false);
    img.src = src;
  });
}

/** Word wrap, falling back to characters for a word wider than the line. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  const push = (word: string) => {
    const trial = line ? `${line} ${word}` : word;
    if (ctx.measureText(trial).width <= maxWidth) {
      line = trial;
      return;
    }
    if (line) lines.push(line);
    line = "";
    if (ctx.measureText(word).width <= maxWidth) {
      line = word;
      return;
    }
    for (const ch of Array.from(word)) {
      if (ctx.measureText(line + ch).width > maxWidth && line) {
        lines.push(line);
        line = ch;
      } else {
        line += ch;
      }
    }
  };
  for (const word of text.split(/\s+/).filter(Boolean)) push(word);
  if (line) lines.push(line);
  return lines;
}

function roundedClip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Lay the picture out, and draw it when `draw` is true. Run once dry to learn
 * the height, then again onto a canvas of that height: a canvas cannot grow.
 */
function layout(
  ctx: CanvasRenderingContext2D,
  plan: StorySharePlan,
  images: Map<string, HTMLImageElement>,
  fonts: Fonts,
  draw: boolean,
): number {
  const inner = L.width - L.margin * 2;
  const stillH = Math.round(inner * L.stillAspect);
  const scriptLead = fonts.nastaliq ? 2 : 1.3;
  let y: number = L.margin;

  const text = (
    value: string,
    size: number,
    family: string,
    color: string,
    opts: { bold?: boolean; lead?: number; width?: number; rtl?: boolean } = {},
  ) => {
    ctx.font = `${opts.bold ? "800 " : ""}${size}px ${family}`;
    const lineH = Math.round(size * (opts.lead ?? 1.3));
    for (const l of wrap(ctx, value, opts.width ?? inner)) {
      if (draw) {
        ctx.fillStyle = color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.direction = opts.rtl ? "rtl" : "ltr";
        ctx.fillText(l, L.width / 2, y + lineH / 2);
      }
      y += lineH;
    }
  };

  const still = (stillId: string, x: number, w: number, h: number, radius: number) => {
    const img = images.get(stillId);
    if (!img) return;
    if (draw) {
      ctx.save();
      roundedClip(ctx, x, y, w, h, radius);
      ctx.clip();
      // Cover, centred: the stills are 3:2 already, so this only guards art
      // that was generated at another shape.
      const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      ctx.restore();
    }
    y += h;
  };

  if (draw) {
    ctx.fillStyle = L.background;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  text(plan.title, L.titleSize, fonts.ui, L.ink, { bold: true, lead: 1.2 });
  y += L.gap;

  if (plan.ending && images.has(plan.ending.stillId)) {
    still(plan.ending.stillId, L.margin, inner, stillH, L.radius);
    y += L.gap;
  }

  for (const panel of plan.panels) {
    const top = y;
    const hasStill = panel.still !== null && images.has(panel.still.stillId);
    // The card is drawn behind its contents, so measure it first.
    const cardH = (() => {
      const saved = y;
      const wasDraw = draw;
      draw = false;
      if (hasStill) y += stillH;
      if (panel.line) {
        y += L.cardPadV;
        text(panel.line.nativeScript, L.scriptSize, fonts.script, L.ink, {
          lead: scriptLead,
          width: inner - L.cardPadH * 2,
        });
        if (panel.line.english.trim() !== "") {
          y += L.lineGap;
          text(panel.line.english, L.englishSize, fonts.ui, L.muted, { width: inner - L.cardPadH * 2 });
        }
        y += L.cardPadV;
      }
      const h = y - saved;
      y = saved;
      draw = wasDraw;
      return h;
    })();
    if (draw) {
      ctx.save();
      roundedClip(ctx, L.margin, top, inner, cardH, L.radius);
      ctx.fillStyle = L.card;
      ctx.fill();
      ctx.restore();
    }
    if (hasStill) still(panel.still!.stillId, L.margin, inner, stillH, L.radius);
    if (panel.line) {
      y += L.cardPadV;
      text(panel.line.nativeScript, L.scriptSize, fonts.script, L.ink, {
        lead: scriptLead,
        width: inner - L.cardPadH * 2,
        rtl: fonts.dir === "rtl",
      });
      if (panel.line.english.trim() !== "") {
        y += L.lineGap;
        text(panel.line.english, L.englishSize, fonts.ui, L.muted, { width: inner - L.cardPadH * 2 });
      }
      y += L.cardPadV;
    }
    y = top + cardH + L.gap;
  }

  // THE FOOTER. The product name, and the address the app is served from,
  // read at runtime so a fork prints its own.
  y += 8;
  if (draw) {
    ctx.fillStyle = L.accent;
    ctx.fillRect(L.width / 2 - 60, y, 120, 6);
  }
  y += 6 + 24;
  text(plan.footer.brand, L.footerBrandSize, fonts.ui, L.accent, { bold: true, lead: 1.2 });
  if (plan.footer.domain) {
    text(plan.footer.domain, L.footerDomainSize, fonts.ui, L.muted, { lead: 1.3 });
  }
  return y + L.margin;
}

/**
 * Draw the finished book as one tall PNG.
 *
 * `stillUrl` is how this page names a still, so the picture fetches exactly
 * what the finished book on screen shows. A still that does not load in time
 * is LEFT OUT, never drawn as a box.
 */
export async function composeStoryShareImage(
  plan: StorySharePlan,
  stillUrl: (stillId: string) => string,
  fonts: Fonts,
): Promise<Blob> {
  const ids = storyShareStillIds(plan);
  const loaded = await Promise.all(ids.map((id) => loadStill(stillUrl(id))));
  const images = new Map<string, HTMLImageElement>();
  const missing = new Set<string>();
  ids.forEach((id, i) => {
    const img = loaded[i];
    if (img) images.set(id, img);
    else missing.add(id);
  });
  const finalPlan = withoutMissingStills(plan, missing);

  // The web fonts are loaded lazily per script, so ask for the ones this
  // picture uses before measuring anything, or the first share of a session
  // measures in a fallback face and draws in the real one.
  if (typeof document !== "undefined" && document.fonts?.load) {
    const sample = finalPlan.panels.map((p) => p.line?.nativeScript ?? "").join(" ");
    await Promise.allSettled([
      document.fonts.load(`${L.scriptSize}px ${fonts.script}`, sample || "a"),
      document.fonts.load(`800 ${L.titleSize}px ${fonts.ui}`, finalPlan.title),
      document.fonts.load(`${L.englishSize}px ${fonts.ui}`, "a"),
    ]);
  }

  const canvas = document.createElement("canvas");
  canvas.width = L.width;
  canvas.height = 1;
  const measureCtx = canvas.getContext("2d");
  if (!measureCtx) throw new Error("story share: no 2d canvas");
  const height = Math.ceil(layout(measureCtx, finalPlan, images, fonts, false));
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  layout(ctx, finalPlan, images, fonts, true);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("story share: toBlob returned null"))),
      "image/png",
    );
  });
}

export type StoryShareOutcome = "shared" | "downloaded" | "cancelled";

/**
 * The share sheet where the browser can send a file, a download everywhere
 * else. A dismissed sheet is the learner changing their mind, not an error.
 */
export async function shareStoryImage(blob: Blob, fileName: string): Promise<StoryShareOutcome> {
  const file = new File([blob], fileName, { type: "image/png" });
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  if (nav?.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file] });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
      throw err;
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Revoked on the next tick: some browsers start the download after click
    // returns, and a URL revoked first downloads nothing.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return "downloaded";
}
