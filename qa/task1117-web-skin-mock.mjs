// Task #1117 — web mock + measurement: train skins on leaderboard friend rows.
//
// Renders the real leaderboard row markup with the real train component
// (qa/skins/web/harness.tsx) at a 360px viewport in light and dark, captures
// the three treatments, and MEASURES the painted pixels — no colour is ever
// read back out of a computed style string.
//
// Run from the repo root:
//   CHROME_BIN=$(which chromium) node qa/task1117-web-skin-mock.mjs
//
// The harness is copied into artifacts/gujarati-coach/src/<temp>/ so it
// resolves the artifact's deps, alias and Tailwind scan, and the copy is
// deleted again on the way out (including on failure). Nothing in the app is
// edited: Task #1112 is live in those files.
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  BACKGROUND_TREATMENT_OPACITY,
  PALETTES,
  ROLE_SAMPLES,
  ROWS,
} from "./skins/palettes.mjs";
import { contrast, deltaE00, hex, hueDelta, lch } from "./skins/color.mjs";

const REPO = process.cwd();
const ARTIFACT = path.join(REPO, "artifacts/gujarati-coach");
const TEMP = path.join(ARTIFACT, "src/__qa_skin_mock");
const OUT = "qa/shots/task1117";
const PORT = Number(process.env.SKIN_MOCK_PORT ?? 5599);
const DPR = 2;
const ROLES = Object.keys(ROLE_SAMPLES);

mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a);

// ── harness copy ───────────────────────────────────────────────────────────
rmSync(TEMP, { recursive: true, force: true });
mkdirSync(TEMP, { recursive: true });
cpSync("qa/skins/web", TEMP, { recursive: true });
cpSync("qa/skins/palettes.mjs", path.join(TEMP, "palettes.mjs"));

let vite;
let browser;
const cleanup = () => {
  // Kill the whole group: `pnpm exec` is a wrapper, and an orphaned vite keeps
  // the port (and this shell's stdout pipe) open.
  try {
    if (vite?.pid) process.kill(-vite.pid, "SIGKILL");
  } catch {}
  rmSync(TEMP, { recursive: true, force: true });
};
process.on("exit", cleanup);

async function startVite() {
  vite = spawn(
    "pnpm",
    ["exec", "vite", "--config", path.join(TEMP, "vite.config.mjs")],
    {
      cwd: ARTIFACT,
      env: { ...process.env, SKIN_MOCK_PORT: String(PORT) },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    },
  );
  vite.stdout.on("data", (d) => process.stdout.write(`[vite] ${d}`));
  vite.stderr.on("data", (d) => process.stderr.write(`[vite!] ${d}`));
  for (let i = 0; i < 90; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/`);
      if (res.ok) return;
    } catch {}
    await sleep(1000);
  }
  throw new Error("harness vite never came up");
}

// ── pixel sampling ─────────────────────────────────────────────────────────
// A screenshot is the only honest record of what was painted, so the samples
// come out of the PNG itself: decode it in a scratch page and read the pixels.
async function samplePixels(ctx, pngBuffer, points) {
  const page = await ctx.newPage();
  await page.setContent("<body></body>");
  const out = await page.evaluate(
    async ([b64, pts]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const cv = document.createElement("canvas");
      cv.width = img.width;
      cv.height = img.height;
      const cx = cv.getContext("2d", { willReadFrequently: true });
      cx.drawImage(img, 0, 0);
      const med = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
      return pts.map(({ x, y }) => {
        const px = Math.round(x);
        const py = Math.round(y);
        const d = cx.getImageData(px - 1, py - 1, 3, 3).data;
        const ch = [[], [], []];
        for (let i = 0; i < d.length; i += 4) {
          ch[0].push(d[i]);
          ch[1].push(d[i + 1]);
          ch[2].push(d[i + 2]);
        }
        return [med(ch[0]), med(ch[1]), med(ch[2])];
      });
    },
    [pngBuffer.toString("base64"), points],
  );
  await page.close();
  return out;
}

// Geometry + text colours, gathered in the page. Colours are produced by
// PAINTING the computed colour onto a canvas, never by parsing the string.
const GEOMETRY = (roleSamples) => {
  const doc = (r) => ({
    x: r.x + window.scrollX,
    y: r.y + window.scrollY,
    w: r.width,
    h: r.height,
  });
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const paint = (base, color) => {
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = `rgb(${base.join(",")})`;
    cx.fillRect(0, 0, 1, 1);
    cx.fillStyle = color;
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  };

  const trains = [...document.querySelectorAll("[data-train]")].map((el) => {
    const r = doc(el.getBoundingClientRect());
    const pts = {};
    for (const [role, s] of Object.entries(roleSamples)) {
      pts[role] = { x: r.x + (s.x / 64) * r.w, y: r.y + (s.y / 42) * r.h };
    }
    return { id: el.dataset.train, rect: r, pts };
  });

  const rows = [...document.querySelectorAll("[data-row]")].map((el) => {
    const r = doc(el.getBoundingClientRect());
    const xp = document.querySelector(`[data-probe="xp-${el.dataset.row}"]`);
    const numeral = xp?.querySelector(".tabular-nums");
    return {
      id: el.dataset.row,
      bgKind: el.dataset.rowbg,
      rect: r,
      // A clean patch of row background: horizontally centred (so it is well
      // inside the 16px corner radius) and in the top padding band, which is
      // above every child and above the vertically-centred engine.
      bgPoint: { x: r.x + r.w / 2, y: r.y + 5 },
      xpColor: numeral
        ? paint([255, 255, 255], getComputedStyle(numeral).color)
        : null,
    };
  });

  return { trains, rows, docHeight: document.documentElement.scrollHeight };
};

// ── run ────────────────────────────────────────────────────────────────────
const results = { opacity: BACKGROUND_TREATMENT_OPACITY, themes: {} };

try {
  await startVite();
  browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN,
    args: ["--no-sandbox"],
  });

  for (const theme of ["light", "dark"]) {
    const ctx = await browser.newContext({
      viewport: { width: 360, height: 900 },
      deviceScaleFactor: DPR,
      colorScheme: theme,
    });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => log(`[page] ${String(e).slice(0, 300)}`));
    page.on("console", (m) => {
      if (m.type() === "error") log(`[console] ${m.text().slice(0, 200)}`);
    });
    await page.goto(`http://127.0.0.1:${PORT}/?theme=${theme}`, {
      waitUntil: "networkidle",
      timeout: 120000,
    });
    // Fonts, then the row entrance springs, then the parked engine frame.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(2500);

    // Labelled deliverables, one per treatment.
    for (const section of [
      "reference",
      "treatment-a",
      "treatment-b",
      "treatment-c",
      "grid",
      "strip",
    ]) {
      await page
        .locator(`[data-section="${section}"]`)
        .screenshot({ path: `${OUT}/web-${section}-${theme}.png` });
    }

    const geo = await page.evaluate(GEOMETRY, ROLE_SAMPLES);
    await page.setViewportSize({ width: 360, height: Math.ceil(geo.docHeight) });
    await page.waitForTimeout(600);
    const full = await page.screenshot({
      path: `${OUT}/web-all-${theme}.png`,
      fullPage: true,
    });

    const points = [];
    const index = [];
    for (const t of geo.trains)
      for (const role of ROLES) {
        points.push({ x: t.pts[role].x * DPR, y: t.pts[role].y * DPR });
        index.push({ kind: "train", id: t.id, role });
      }
    for (const r of geo.rows) {
      points.push({ x: r.bgPoint.x * DPR, y: r.bgPoint.y * DPR });
      index.push({ kind: "row", id: r.id });
    }
    const px = await samplePixels(ctx, full, points);

    const trains = {};
    const rows = {};
    px.forEach((rgb, i) => {
      const meta = index[i];
      if (meta.kind === "train") {
        (trains[meta.id] ??= {})[meta.role] = rgb;
      } else {
        rows[meta.id] = { ...geo.rows.find((r) => r.id === meta.id), painted: rgb };
      }
    });
    results.themes[theme] = { trains, rows };
    await ctx.close();
    log(`captured ${theme}: ${Object.keys(trains).length} engines, ${Object.keys(rows).length} rows`);
  }
} finally {
  if (browser) await browser.close();
  cleanup();
}

// ── report ─────────────────────────────────────────────────────────────────
const rowOf = (theme, id) => results.themes[theme].rows[id];
const trainOf = (theme, id) => results.themes[theme].trains[id];

const report = { opacity: BACKGROUND_TREATMENT_OPACITY, light: {}, dark: {} };

for (const theme of ["light", "dark"]) {
  log(`\n================ WEB / ${theme.toUpperCase()} ================`);

  // Backgrounds actually painted, read off the strip rows.
  const selfBg = rowOf(theme, "strip-self-P1").painted;
  const cardBg = rowOf(theme, "strip-card-P1").painted;
  log(`self-row painted background : ${hex(selfBg)}`);
  log(`bg-card painted background  : ${hex(cardBg)}`);
  report[theme].backgrounds = { self: hex(selfBg), card: hex(cardBg) };

  // Painted colour and contrast for every livery, in each treatment, against
  // the background it actually sits on. Treatment A is measured on the live
  // row (the inline engine has nothing painted over it); treatment C is
  // measured on the text-hidden strip so the sample hits the engine.
  const table = [];
  for (const p of PALETTES) {
    const rowKey = ROWS.find((r) => r.palette === p.id)?.key;
    const entries = [
      { treatment: "A inline", id: `a-${rowKey}`, bgId: `a-${rowKey}` },
      {
        treatment: "C bg / self-row",
        id: `strip-self-${p.id}`,
        bgId: `strip-self-${p.id}`,
      },
      {
        treatment: "C bg / bg-card",
        id: `strip-card-${p.id}`,
        bgId: `strip-card-${p.id}`,
      },
    ];
    for (const e of entries) {
      const t = trainOf(theme, e.id);
      if (!t) continue;
      const bg = rowOf(theme, e.bgId).painted;
      const row = { palette: p.id, treatment: e.treatment, bg: hex(bg) };
      for (const role of ROLES) {
        row[role] = hex(t[role]);
        row[`${role}_cr`] = +contrast(t[role], bg).toFixed(2);
      }
      row.best_cr = Math.max(...ROLES.map((r) => row[`${r}_cr`]));
      table.push(row);
    }
  }
  report[theme].objects = table;
  log(`\n-- painted colour and contrast vs the background it sits on --`);
  log(
    "palette treatment        rowbg   body    cr    chassis cr    trim    cr    best",
  );
  for (const r of table) {
    log(
      `${r.palette.padEnd(7)} ${r.treatment.padEnd(16)} ${r.bg} ${r.body} ${String(r.body_cr).padStart(5)} ${r.chassis} ${String(r.chassis_cr).padStart(5)} ${r.trim} ${String(r.trim_cr).padStart(5)} ${String(r.best_cr).padStart(5)}`,
    );
  }

  // Skin versus skin, in the background treatment, on the same background.
  const sigOf = (id) => ROLES.map((role) => trainOf(theme, id)[role]);
  const setFor = (where) =>
    PALETTES.map((p) => ({
      id: p.id,
      rgb: trainOf(theme, `strip-${where}-${p.id}`).body,
      sig: sigOf(`strip-${where}-${p.id}`),
    }));
  const pairs = (set, label) => {
    const out = [];
    for (let i = 0; i < set.length; i++)
      for (let j = i + 1; j < set.length; j++) {
        out.push({
          pair: `${set[i].id}/${set[j].id}`,
          where: label,
          dE_body: +deltaE00(set[i].rgb, set[j].rgb).toFixed(2),
          cr_body: +contrast(set[i].rgb, set[j].rgb).toFixed(2),
          dE_signature: +(
            set[i].sig.reduce((s, c, k) => s + deltaE00(c, set[j].sig[k]), 0) /
            ROLES.length
          ).toFixed(2),
        });
      }
    return out;
  };
  const sep = [
    ...pairs(setFor("self"), "self-row"),
    ...pairs(setFor("card"), "bg-card"),
  ];
  report[theme].separation = sep;
  log(`\n-- skin vs skin separation in treatment C (JND ~2.3 dE00) --`);
  for (const s of sep)
    log(
      `  ${s.pair.padEnd(7)} on ${s.where.padEnd(9)} dE00(body)=${String(s.dE_body).padStart(6)}  contrast=${String(s.cr_body).padStart(5)}:1  dE00(3-role mean)=${s.dE_signature}`,
    );

  // Naming test: can the row be matched back to its full-size reference?
  // Chroma and hue are what a viewer names a livery by, so measure what
  // survives the compositing, and check the nearest-reference match.
  const refs = PALETTES.map((p) => ({ id: p.id, sig: sigOf(`ref-${p.id}`) }));
  const naming = [];
  for (const where of ["self", "card"]) {
    for (const p of PALETTES) {
      const id = `strip-${where}-${p.id}`;
      const rowSig = sigOf(id);
      const scores = refs
        .map((r) => ({
          id: r.id,
          d: rowSig.reduce((s, c, k) => s + deltaE00(c, r.sig[k]), 0) / ROLES.length,
        }))
        .sort((a, b) => a.d - b.d);
      const bodyRow = lch(trainOf(theme, id).body);
      const bodyRef = lch(trainOf(theme, `ref-${p.id}`).body);
      naming.push({
        palette: p.id,
        background: where === "self" ? "self-row" : "bg-card",
        nearestReference: scores[0].id,
        correct: scores[0].id === p.id,
        margin: +(scores[1].d - scores[0].d).toFixed(2),
        dE_to_own_reference: +(scores.find((s) => s.id === p.id).d).toFixed(2),
        chroma_reference: +bodyRef.C.toFixed(1),
        chroma_in_row: +bodyRow.C.toFixed(1),
        chroma_retained: `${Math.round((bodyRow.C / bodyRef.C) * 100)}%`,
        hue_shift_deg: +hueDelta(bodyRow.h, bodyRef.h).toFixed(1),
      });
    }
  }
  report[theme].naming = naming;
  log(`\n-- naming test: treatment-C row vs full-size reference --`);
  for (const n of naming)
    log(
      `  ${n.palette} on ${n.background.padEnd(8)}: nearest ref=${n.nearestReference} ${n.correct ? "(own) " : "(WRONG)"} margin=${String(n.margin).padStart(5)}  dE00 to own ref=${String(n.dE_to_own_reference).padStart(5)}  chroma ${n.chroma_reference}->${n.chroma_in_row} (${n.chroma_retained})  hue shift ${n.hue_shift_deg}deg`,
    );

  // The cost side of treatment C: the XP numerals now sit over the engine.
  const legibility = [];
  for (const where of ["self", "card"]) {
    for (const p of PALETTES) {
      const id = `strip-${where}-${p.id}`;
      const backdrop = trainOf(theme, id).body; // engine where it passes the XP cluster
      const text = rowOf(theme, id).xpColor;
      legibility.push({
        palette: p.id,
        background: where === "self" ? "self-row" : "bg-card",
        xp_text_over_engine: +contrast(text, backdrop).toFixed(2),
        xp_text_over_plain_row: +contrast(text, rowOf(theme, id).painted).toFixed(2),
      });
    }
  }
  report[theme].legibility = legibility;
  log(`\n-- XP numerals over the background engine (body area; needs 4.5:1) --`);
  for (const l of legibility)
    log(
      `  ${l.palette} on ${l.background.padEnd(8)}: over engine ${String(l.xp_text_over_engine).padStart(5)}:1   over plain row ${l.xp_text_over_plain_row}:1`,
    );
}

writeFileSync(`${OUT}/web-measurements.json`, JSON.stringify(report, null, 2));
log(`\nwrote ${OUT}/web-measurements.json and the shots in ${OUT}/`);
