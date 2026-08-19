// Task #1117, mobile mock + measurement: train skins on leaderboard friend rows.
//
// Writes a TEMPORARY top-level Expo route from the template in
// qa/skins/mobile/, captures it through the running Expo web dev server at a
// 360px width in light and dark, measures the painted pixels, and deletes the
// route again (including on failure). A top-level route renders outside the
// (app) auth gate, so no sign-in is needed; Metro cannot resolve imports from
// outside the project root, so the shared palettes are injected as JSON.
//
// Run from the repo root, with the bolo-mobile expo workflow running:
//   CHROME_BIN=$(which chromium) node qa/task1117-mobile-skin-mock.mjs
//
// Nothing in the app is edited: Task #1112 is live in the friends screen.
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import {
  BACKGROUND_TREATMENT_OPACITY,
  ENGINE_BOX,
  PALETTES,
  ROLE_SAMPLES,
  ROWS,
} from "./skins/palettes.mjs";
import { contrast, deltaE00, hex, hueDelta, lch } from "./skins/color.mjs";

const ROUTE = "artifacts/bolo-mobile/app/qa-skin-mock.tsx";
const EXPO = `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`;
const OUT = "qa/shots/task1117";
const DPR = 2;
const ROLES = Object.keys(ROLE_SAMPLES);
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a);

writeFileSync(
  ROUTE,
  readFileSync("qa/skins/mobile/qa-skin-mock.template.tsx", "utf8").replace(
    "__SKIN_MOCK_DATA__",
    JSON.stringify(
      {
        opacity: BACKGROUND_TREATMENT_OPACITY,
        engine: ENGINE_BOX,
        palettes: PALETTES,
        rows: ROWS,
      },
      null,
      2,
    ),
  ),
);
let browser;
const cleanup = () => rmSync(ROUTE, { force: true });
process.on("exit", cleanup);

// Same rule as the web probe: a screenshot is the only honest record of what
// was painted, so the samples are decoded out of the PNG itself.
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
        const d = cx.getImageData(Math.round(x) - 1, Math.round(y) - 1, 3, 3).data;
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

// Geometry is taken RELATIVE TO THE SECTION, and each section is sampled from
// its own element screenshot. RN-web scrolls an inner div, so a single tall
// window shot cannot be trusted to contain every row.
const GEOMETRY = ([sectionId, roleSamples]) => {
  const root = document.querySelector(`[data-testid="section-${sectionId}"]`);
  const origin = root.getBoundingClientRect();
  const rel = (r) => ({ x: r.x - origin.x, y: r.y - origin.y, w: r.width, h: r.height });
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
  const id = (el, prefix) => el.dataset.testid.slice(prefix.length);

  // The engine's layout box is the 64x42 BODY box (steam headroom hangs above
  // it), so viewBox coordinates map onto the box linearly, same as web.
  const trains = [...root.querySelectorAll('[data-testid^="train-"]')]
    // TrainEngine puts testID="train-engine" on its own inner view; the probe
    // wrapper is the one carrying the layout box.
    .filter((el) => el.dataset.testid !== "train-engine")
    .map((el) => {
      const r = rel(el.getBoundingClientRect());
      const pts = {};
      for (const [role, s] of Object.entries(roleSamples))
        pts[role] = { x: r.x + (s.x / 64) * r.w, y: r.y + (s.y / 42) * r.h };
      return { id: id(el, "train-"), pts };
    });

  const rows = [...root.querySelectorAll('[data-testid^="row-"]')].map((el) => {
    const r = rel(el.getBoundingClientRect());
    const rowId = id(el, "row-");
    const xp = root.querySelector(`[data-testid="xp-${rowId}"]`);
    return {
      id: rowId,
      // Horizontally centred (well inside the 16px corner radius) and in the
      // 14px top padding band: above every child and above the engine.
      bgPoint: { x: r.x + r.w / 2, y: r.y + 5 },
      xpColor: xp ? paint([255, 255, 255], getComputedStyle(xp).color) : null,
    };
  });
  return { trains, rows };
};

const results = { themes: {} };
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN,
    args: ["--no-sandbox"],
  });

  for (const theme of ["light", "dark"]) {
    const ctx = await browser.newContext({
      viewport: { width: 360, height: 1600 },
      deviceScaleFactor: DPR,
      colorScheme: theme,
    });
    const page = await ctx.newPage();
    page.on("console", (m) => {
      if (m.type() === "error") log(`[console] ${m.text().slice(0, 200)}`);
    });
    await page.goto(`${EXPO}/qa-skin-mock`, {
      waitUntil: "networkidle",
      timeout: 240000,
    });
    await page.getByTestId("section-strip").waitFor({ timeout: 120000 });
    await page.waitForTimeout(3000);

    const trains = {};
    const rows = {};
    for (const section of [
      "reference",
      "treatment-a",
      "treatment-b",
      "treatment-c",
      "grid",
      "strip",
    ]) {
      const loc = page.getByTestId(`section-${section}`);
      await loc.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      const shot = await loc.screenshot({
        path: `${OUT}/mobile-${section}-${theme}.png`,
      });
      const geo = await page.evaluate(GEOMETRY, [section, ROLE_SAMPLES]);
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
      const px = await samplePixels(ctx, shot, points);
      px.forEach((rgb, i) => {
        const meta = index[i];
        if (meta.kind === "train") (trains[meta.id] ??= {})[meta.role] = rgb;
        else
          rows[meta.id] = {
            ...geo.rows.find((r) => r.id === meta.id),
            painted: rgb,
          };
      });
    }
    results.themes[theme] = { trains, rows };
    await ctx.close();
    log(
      `captured ${theme}: ${Object.keys(trains).length} engines, ${Object.keys(rows).length} rows`,
    );
  }
} finally {
  if (browser) await browser.close();
  cleanup();
}

// ── report (identical maths to the web probe) ──────────────────────────────
const rowOf = (theme, id) => results.themes[theme].rows[id];
const trainOf = (theme, id) => results.themes[theme].trains[id];
const report = { opacity: BACKGROUND_TREATMENT_OPACITY, light: {}, dark: {} };

for (const theme of ["light", "dark"]) {
  log(`\n================ MOBILE / ${theme.toUpperCase()} ================`);
  const selfBg = rowOf(theme, "strip-self-P1").painted;
  const cardBg = rowOf(theme, "strip-card-P1").painted;
  log(`self-row painted background : ${hex(selfBg)}`);
  log(`card painted background     : ${hex(cardBg)}`);
  report[theme].backgrounds = { self: hex(selfBg), card: hex(cardBg) };

  const table = [];
  for (const p of PALETTES) {
    const rowKey = ROWS.find((r) => r.palette === p.id)?.key;
    for (const e of [
      { treatment: "A inline", id: `a-${rowKey}` },
      { treatment: "C bg / self-row", id: `strip-self-${p.id}` },
      { treatment: "C bg / card", id: `strip-card-${p.id}` },
    ]) {
      const t = trainOf(theme, e.id);
      if (!t) continue;
      const bg = rowOf(theme, e.id).painted;
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
  log("palette treatment        rowbg   body    cr    chassis cr    trim    cr    best");
  for (const r of table)
    log(
      `${r.palette.padEnd(7)} ${r.treatment.padEnd(16)} ${r.bg} ${r.body} ${String(r.body_cr).padStart(5)} ${r.chassis} ${String(r.chassis_cr).padStart(5)} ${r.trim} ${String(r.trim_cr).padStart(5)} ${String(r.best_cr).padStart(5)}`,
    );

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
      for (let j = i + 1; j < set.length; j++)
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
    return out;
  };
  const sep = [...pairs(setFor("self"), "self-row"), ...pairs(setFor("card"), "card")];
  report[theme].separation = sep;
  log(`\n-- skin vs skin separation in treatment C (JND ~2.3 dE00) --`);
  for (const s of sep)
    log(
      `  ${s.pair.padEnd(7)} on ${s.where.padEnd(9)} dE00(body)=${String(s.dE_body).padStart(6)}  contrast=${String(s.cr_body).padStart(5)}:1  dE00(3-role mean)=${s.dE_signature}`,
    );

  const refs = PALETTES.map((p) => ({ id: p.id, sig: sigOf(`ref-${p.id}`) }));
  const naming = [];
  for (const where of ["self", "card"])
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
        background: where === "self" ? "self-row" : "card",
        nearestReference: scores[0].id,
        correct: scores[0].id === p.id,
        margin: +(scores[1].d - scores[0].d).toFixed(2),
        dE_to_own_reference: +scores.find((s) => s.id === p.id).d.toFixed(2),
        chroma_reference: +bodyRef.C.toFixed(1),
        chroma_in_row: +bodyRow.C.toFixed(1),
        chroma_retained: `${Math.round((bodyRow.C / bodyRef.C) * 100)}%`,
        hue_shift_deg: +hueDelta(bodyRow.h, bodyRef.h).toFixed(1),
      });
    }
  report[theme].naming = naming;
  log(`\n-- naming test: treatment-C row vs full-size reference --`);
  for (const n of naming)
    log(
      `  ${n.palette} on ${n.background.padEnd(8)}: nearest ref=${n.nearestReference} ${n.correct ? "(own) " : "(WRONG)"} margin=${String(n.margin).padStart(5)}  dE00 to own ref=${String(n.dE_to_own_reference).padStart(5)}  chroma ${n.chroma_reference}->${n.chroma_in_row} (${n.chroma_retained})  hue shift ${n.hue_shift_deg}deg`,
    );

  const legibility = [];
  for (const where of ["self", "card"])
    for (const p of PALETTES) {
      const id = `strip-${where}-${p.id}`;
      legibility.push({
        palette: p.id,
        background: where === "self" ? "self-row" : "card",
        xp_text_over_engine: +contrast(
          rowOf(theme, id).xpColor,
          trainOf(theme, id).body,
        ).toFixed(2),
        xp_text_over_plain_row: +contrast(
          rowOf(theme, id).xpColor,
          rowOf(theme, id).painted,
        ).toFixed(2),
      });
    }
  report[theme].legibility = legibility;
  log(`\n-- XP sub-label over the background engine (needs 4.5:1) --`);
  for (const l of legibility)
    log(
      `  ${l.palette} on ${l.background.padEnd(8)}: over engine ${String(l.xp_text_over_engine).padStart(5)}:1   over plain row ${l.xp_text_over_plain_row}:1`,
    );
}

writeFileSync(`${OUT}/mobile-measurements.json`, JSON.stringify(report, null, 2));
log(`\nwrote ${OUT}/mobile-measurements.json and the shots in ${OUT}/`);
