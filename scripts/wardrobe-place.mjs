// THE PLACEMENT TOOL. `pnpm wardrobe place` and drag the clothes on.
//
// WHY IT EXISTS. Seating a hat automatically works for an upright pose and
// keeps missing on a rolled one, and the loop it produced was the owner
// describing pixel shifts in chat ("move it 50% of its size to the right")
// while I re-rendered and guessed. Six rounds of that on ONE accessory. The
// owner: "or create a tool that i can drag and drop items and rotate". This is
// that, and it replaces the whole loop.
//
// WHAT IT EDITS, and both kinds go through it because the owner asked for the
// existing wardrobe to be fixable too, not just new pieces:
//
//   accessories   recipe.place[pose] = { x, y, w, rot }, fractions of the
//                 canvas, written per pose. A placed pose wins outright: the
//                 generator skips its crown seating and its clearance loop
//                 rather than fighting a deliberate placement.
//   garments      recipe.wfrac / dy / squash / freefrac, which the outfit
//                 generator already reads and which are whole-item rather
//                 than per-pose.
//
// AND IT ERASES. Generated garment art keeps arriving with the wearer's body
// painted into it: the blue vest came with teal in both armholes and the neck,
// which is Bolo showing through in the render that made it. Nothing in the
// pipeline could remove that, so the eraser paints transparency onto the source
// and saves a cut copy. Non-destructive: the original file is never written,
// the manifest is pointed at the cut, and erasing again continues from the cut
// so it accumulates rather than starting over.
//
// LOCAL ONLY, AND THAT IS NOT A LIMITATION TO FIX. It writes into the repo, so
// it can only ever run on a machine that has the repo. The Nest links to it and
// says so, rather than offering a dead button.

import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { extname, join } from "node:path";

const PORT = Number(process.env.WARDROBE_PLACE_PORT ?? 8787);
const ROOT = process.cwd();
const MANIFEST = "scripts/wardrobe/manifest.json";
const CANON = "artifacts/gujarati-coach/public/mascot";
const POSES = ["wave", "cheer", "thumbsup", "thinking", "tryagain"];

const readManifest = () => JSON.parse(readFileSync(join(ROOT, MANIFEST), "utf8"));

/** Only ever serve PNGs from the two art trees and the canonical poses. A tool
 *  that reads any path the browser asks for is a file server, not a tool. */
function safePath(rel) {
  const ok = ["artifacts/gujarati-coach/public/mascot/", "scripts/mascot-accessory-art/",
    "scripts/mascot-garment-art/"];
  if (!ok.some((p) => rel.startsWith(p))) return null;
  if (rel.includes("..")) return null;
  const abs = join(ROOT, rel);
  return existsSync(abs) ? abs : null;
}

function send(res, code, body, type = "application/json") {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/") return send(res, 200, PAGE, "text/html; charset=utf-8");

  if (url.pathname === "/api/items") {
    const m = readManifest();
    return send(res, 200, JSON.stringify({
      poses: POSES,
      canon: POSES.map((p) => `${CANON}/mascot-${p}.png`),
      items: m.items.map((i) => ({
        id: i.id, name: i.name, kind: i.kind, art: i.art, recipe: i.recipe ?? {},
      })),
    }));
  }

  if (url.pathname === "/file") {
    const abs = safePath(url.searchParams.get("path") ?? "");
    if (!abs) return send(res, 404, JSON.stringify({ error: "not found" }));
    // TRIMMED ON REQUEST, because the generator trims before it places. Handing
    // the browser the untrimmed art would make every drag off by however much
    // transparent margin the artist left, which differs per file.
    if (url.searchParams.get("trim") === "1") {
      const out = "/tmp/wardrobe-place-trim.png";
      try {
        execFileSync("magick", [abs, "-trim", "+repage", out], { stdio: "ignore" });
        return send(res, 200, readFileSync(out), "image/png");
      } catch { /* fall through to the untrimmed file */ }
    }
    const type = extname(abs) === ".png" ? "image/png" : "application/octet-stream";
    return send(res, 200, readFileSync(abs), type);
  }

  if (url.pathname === "/api/auto") {
    // WHERE THE GENERATOR ACTUALLY PUT IT, so a first drag starts from the real
    // automatic seating instead of jumping. Written by the last render; absent
    // for an item nobody has rendered yet, which is not an error.
    const id = url.searchParams.get("id") ?? "";
    const f = `/tmp/mascot-acc/${id}/placement.json`;
    if (!/^[a-z0-9-]+$/.test(id) || !existsSync(f)) return send(res, 200, "{}");
    return send(res, 200, readFileSync(f, "utf8"));
  }

  if (url.pathname === "/api/save" && req.method === "POST") {
    const { id, place, knobs } = await readBody(req);
    const m = readManifest();
    const item = m.items.find((i) => i.id === id);
    if (!item) return send(res, 404, JSON.stringify({ error: "no such item" }));
    item.recipe = item.recipe ?? {};
    if (place && Object.keys(place).length) item.recipe.place = place;
    for (const [k, v] of Object.entries(knobs ?? {})) {
      if (v === null || v === "" || Number.isNaN(v)) delete item.recipe[k];
      else item.recipe[k] = v;
    }
    writeFileSync(join(ROOT, MANIFEST), `${JSON.stringify(m, null, 2)}\n`);
    return send(res, 200, JSON.stringify({ ok: true, recipe: item.recipe }));
  }

  if (url.pathname === "/api/erase" && req.method === "POST") {
    const { id, png } = await readBody(req);
    const m = readManifest();
    const item = m.items.find((i) => i.id === id);
    if (!item) return send(res, 404, JSON.stringify({ error: "no such item" }));
    // The cut lives beside the source and the source is never written, so a
    // bad erase costs one file rather than the art.
    const cut = item.art.replace(/\.png$/i, "-cut.png");
    const orig = item.art.replace(/\.png$/i, "-orig.png");
    if (!existsSync(join(ROOT, orig)) && !item.art.endsWith("-cut.png")) {
      copyFileSync(join(ROOT, item.art), join(ROOT, orig));
    }
    writeFileSync(join(ROOT, cut), Buffer.from(png.split(",")[1], "base64"));
    item.art = cut;
    writeFileSync(join(ROOT, MANIFEST), `${JSON.stringify(m, null, 2)}\n`);
    return send(res, 200, JSON.stringify({ ok: true, art: cut, kept: orig }));
  }

  if (url.pathname === "/api/render" && req.method === "POST") {
    const { id, install } = await readBody(req);
    try {
      const out = execFileSync("node", ["scripts/wardrobe.mjs", install ? "install" : "gen", id],
        { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 24 });
      return send(res, 200, JSON.stringify({ ok: true, log: out.slice(-4000) }));
    } catch (e) {
      return send(res, 200, JSON.stringify({ ok: false, log: String(e.stdout ?? e).slice(-4000) }));
    }
  }

  send(res, 404, JSON.stringify({ error: "not found" }));
});

const PAGE = String.raw`<!doctype html><meta charset="utf-8">
<title>Wardrobe placement</title>
<style>
:root{--ink:#1b1a17;--pap:#faf8f3;--line:#d9d3c7;--acc:#0e7a5f}
*{box-sizing:border-box}
body{margin:0;font:14px/1.5 ui-sans-serif,system-ui,-apple-system,sans-serif;background:var(--pap);color:var(--ink)}
header{display:flex;gap:14px;align-items:center;padding:12px 18px;border-bottom:1px solid var(--line);flex-wrap:wrap;position:sticky;top:0;background:var(--pap);z-index:5}
h1{font-size:15px;margin:0;font-weight:800;letter-spacing:.02em}
select,button{font:inherit;padding:6px 12px;border-radius:8px;border:1px solid var(--line);background:#fff;cursor:pointer}
button.primary{background:var(--acc);color:#fff;border-color:var(--acc);font-weight:700}
button[aria-pressed=true]{background:var(--ink);color:var(--pap);border-color:var(--ink)}
main{padding:18px;display:flex;gap:18px;flex-wrap:wrap}
.pose{border:1px solid var(--line);border-radius:12px;background:#fff;overflow:hidden}
.pose h2{font-size:12px;margin:0;padding:7px 10px;border-bottom:1px solid var(--line);letter-spacing:.08em;text-transform:uppercase;color:#6b6558}
.stage{position:relative;width:320px;height:375px;touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none;background:
  repeating-conic-gradient(#eee 0 25%,#fff 0 50%) 0 0/16px 16px}
.stage.dragging{cursor:grabbing}
.stage img{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:contain;pointer-events:none;-webkit-user-drag:none;user-select:none}
.stage .worn{z-index:2}
.stage .piece{transform-origin:center}
.row{display:flex;gap:8px;align-items:center;padding:8px 10px;border-top:1px solid var(--line);flex-wrap:wrap}
.row label{font-size:11px;color:#6b6558;text-transform:uppercase;letter-spacing:.06em}
input[type=range]{width:110px}
#toast{font-weight:700;color:var(--acc);opacity:0;transition:opacity .15s}
#toast.on{opacity:1}
#log{padding:10px 18px;font:12px ui-monospace,monospace;white-space:pre-wrap;color:#6b6558;border-top:1px solid var(--line)}
#eraser{padding:18px;display:none;gap:16px;align-items:flex-start}
#eraser canvas{border:1px solid var(--line);background:repeating-conic-gradient(#eee 0 25%,#fff 0 50%) 0 0/16px 16px;cursor:crosshair;max-width:520px;height:auto}
.hint{max-width:320px;color:#6b6558;font-size:13px}
</style>
<header>
  <h1>Wardrobe placement</h1>
  <select id="item"></select>
  <button id="tab-place" aria-pressed="true">Place</button>
  <button id="tab-erase" aria-pressed="false">Erase</button>
  <span id="kind" style="color:#6b6558"></span>
  <span style="flex:1"></span>
  <button id="reset">Reset pose</button>
  <button id="save" class="primary">Save</button>
  <button id="render">Save &amp; render</button>
  <button id="install">Save &amp; install</button>
  <span id="toast" role="status" aria-live="polite"></span>
</header>
<main id="place"></main>
<section id="eraser">
  <canvas id="cut"></canvas>
  <div class="hint">
    <p><b>Erase what the artist painted of Bolo.</b> Generated garment art keeps
    arriving with her body in it: teal in the armholes, teal at the neck. She is
    underneath, so any of it left over draws her twice.</p>
    <p>Drag to rub out. <b>Bracket keys</b> resize the brush.
    <b>Save</b> writes a cut copy beside the original and points the manifest at
    it. The original is never written, so a bad erase costs one file.</p>
    <p><label>Brush <input id="brush" type="range" min="6" max="160" value="46"></label></p>
    <p><button id="undo">Undo all erasing</button></p>
  </div>
</section>
<div id="log"></div>
<script>
const POSE_W = 1024, POSE_H = 1200;
let data = null, item = null, place = {}, mode = "place";
const log = (s) => { document.getElementById("log").textContent = s; };
/** SAY IT WHERE THE BUTTON IS. The log is at the foot of a long page, so a
 *  save that worked looked identical to one that did nothing: the owner hit
 *  Save, saw no answer, and had to ask whether it had taken. */
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("on"), 2600);
}
const fileURL = (p) => "/file?path=" + encodeURIComponent(p);
const artURL = (p) => fileURL(p) + "&trim=1";

async function boot() {
  data = await (await fetch("/api/items")).json();
  const sel = document.getElementById("item");
  sel.innerHTML = data.items.map((i) => '<option value="'+i.id+'">'+i.name+' ('+i.kind+')</option>').join("");
  sel.onchange = () => load(sel.value);
  load(data.items[0].id);
}

async function load(id) {
  item = data.items.find((i) => i.id === id);
  place = JSON.parse(JSON.stringify(item.recipe.place ?? {}));
  AUTO = await (await fetch("/api/auto?id=" + encodeURIComponent(id))).json().catch(() => ({}));
  document.getElementById("kind").textContent =
    item.kind === "garment" ? "garment: whole-item knobs" : "accessory: per pose";
  draw();
  drawEraser();
  log("");
}

/** A pose card: her, the piece over her, and the handles that move it. */
function card(pose) {
  const el = document.createElement("div");
  el.className = "pose";
  const p = place[pose] ?? null;
  el.innerHTML =
    '<h2>' + pose + (p ? ' &middot; placed' : ' &middot; auto') + '</h2>' +
    '<div class="stage" data-pose="' + pose + '">' +
      // An UNPLACED pose shows the pipeline's own composite, so "auto" is what
      // the app would actually ship rather than a ghost floating over her. The
      // moment you drag, this hides and the draggable piece takes over.
      '<img class="worn" src="' + fileURL("artifacts/gujarati-coach/public/mascot/outfits/" + item.id + "/mascot-" + pose + ".png") + '"' +
        ' onerror="this.style.display=\'none\'">' +
      '<img class="bird" draggable="false" src="' + fileURL("artifacts/gujarati-coach/public/mascot/mascot-" + pose + ".png") + '">' +
      '<img class="piece" draggable="false" src="' + artURL(item.art) + '">' +
    '</div>' +
    '<div class="row">' +
      '<label>size</label><input type="range" class="w" min="10" max="120" step="0.5">' +
      '<label>turn</label><input type="range" class="r" min="-60" max="60" step="0.5">' +
    '</div>';
  return el;
}

/** Fractions of the canvas in, CSS pixels out. The stage is the canvas. */
function apply(stage) {
  const pose = stage.dataset.pose;
  const piece = stage.querySelector(".piece");
  const worn = stage.querySelector(".worn");
  const bird = stage.querySelector(".bird");
  const p = place[pose];
  if (!p) {
    // Show the shipped composite alone.
    piece.style.display = "none";
    if (worn && worn.getAttribute("src")) { worn.style.display = ""; bird.style.opacity = "0"; }
    return;
  }
  piece.style.display = "";
  if (worn) worn.style.display = "none";
  bird.style.opacity = "1";
  piece.style.opacity = "1";
  const W = stage.clientWidth, H = stage.clientHeight;
  // The piece image is drawn object-contain in a full-stage box, so scaling it
  // means scaling that box: width fraction of the canvas, height to match.
  piece.style.left = (p.x * W) + "px";
  piece.style.top = (p.y * H) + "px";
  // THE ART'S OWN ASPECT, not the canvas's. Sizing the box to the canvas made
  // object-contain letterbox the piece, so it drew smaller than it renders and
  // every drag was corrected against a lie.
  const natW = piece.naturalWidth || 1, natH = piece.naturalHeight || 1;
  piece.style.width = (p.w * W) + "px";
  piece.style.height = (p.w * W * (natH / natW)) + "px";
  piece.style.transform = "rotate(" + p.rot + "deg)";
}

let AUTO = {};
function seed(pose) {
  // THE REAL AUTOMATIC SEATING, not a guess. Picking a hat up should move it
  // from where it already is; anything else throws away the crown maths the
  // moment you touch a pose and makes the tool feel like it fought you.
  const a = AUTO[pose];
  return a ? { ...a } : { x: 0.25, y: 0.02, w: 0.5, rot: 0 };
}

function draw() {
  const main = document.getElementById("place");
  main.innerHTML = "";
  if (item.kind === "garment") {
    // The four whole-item knobs the outfit generator reads, ALONGSIDE the same
    // per-pose drag accessories get. The knobs are what a garment gets for
    // free; a dragged pose overrides them outright, so both belong on screen.
    const k = item.recipe;
    const box = document.createElement("div");
    box.innerHTML = '<div class="hint"><p><b>Knobs place every pose at once. ' +
      'Dragging a pose overrides them for that pose only.</b> Leave a knob ' +
      'blank to use the generator default.</p></div>' +
      ["wfrac", "dy", "squash", "freefrac"].map((n) =>
        '<div class="row"><label style="width:70px">' + n + '</label>' +
        '<input class="knob" data-k="' + n + '" value="' + (k[n] ?? "") + '" ' +
        'style="padding:6px 10px;border:1px solid var(--line);border-radius:8px;width:120px"></div>').join("");
    main.appendChild(box);
  }
  if (!item.art) {
    const warn = document.createElement("div");
    warn.className = "hint";
    warn.innerHTML = '<p><b>This item has no source art in the repo.</b> Its ' +
      'poses were made by hand before the generator existed, so there is ' +
      'nothing to place or erase until new source art is added.</p>';
    main.appendChild(warn);
    return;
  }
  for (const pose of data.poses) main.appendChild(card(pose));
  for (const stage of document.querySelectorAll(".stage")) {
    apply(stage);
    wire(stage);
  }
}

function wire(stage) {
  const pose = stage.dataset.pose;
  const card = stage.closest(".pose");
  const wIn = card.querySelector(".w"), rIn = card.querySelector(".r");
  const sync = () => {
    const p = place[pose] ?? seed(pose);
    wIn.value = p.w * 100; rIn.value = p.rot;
  };
  sync();
  let drag = null;

  // DRAG, WRITTEN DEFENSIVELY, because the first version worked when I drove it
  // and not when the owner did. Three things were wrong with relying on pointer
  // capture alone, and all three are cheap to remove:
  //   - a throw from setPointerCapture aborted the handler BEFORE it recorded
  //     the drag, so the press silently did nothing
  //   - the browser's own image drag can swallow the gesture; the images are
  //     pointer-events:none and now draggable=false and preventDefault'd too
  //   - if capture is refused, a pointer that leaves the stage is never heard
  //     from again, so the move and up listeners go on the DOCUMENT
  const onMove = (e) => {
    if (!drag) return;
    const W = stage.clientWidth, H = stage.clientHeight;
    place[pose] = { ...drag.p,
      x: drag.p.x + (e.clientX - drag.x) / W,
      y: drag.p.y + (e.clientY - drag.y) / H };
    apply(stage);
  };
  const onUp = () => {
    if (!drag) return;
    drag = null;
    stage.classList.remove("dragging");
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    mark(card, pose);
  };
  stage.addEventListener("dragstart", (e) => e.preventDefault());
  stage.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (!place[pose]) place[pose] = seed(pose);
    try { stage.setPointerCapture(e.pointerId); } catch { /* capture is a nicety */ }
    stage.classList.add("dragging");
    drag = { x: e.clientX, y: e.clientY, p: { ...place[pose] } };
    apply(stage);
    mark(card, pose);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  });

  // SCROLL TO RESIZE, on the pose you are pointing at. The sliders below stay,
  // because a slider is the only one of the two you can aim precisely, but
  // nobody reaches for a slider mid-drag. Owner's ask.
  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    const p = place[pose] ?? seed(pose);
    const step = e.deltaY < 0 ? 1.03 : 1 / 1.03;
    place[pose] = { ...p, w: Math.min(1.4, Math.max(0.05, p.w * step)) };
    apply(stage);
    sync();
    mark(card, pose);
  }, { passive: false });

  wIn.oninput = () => { place[pose] = { ...(place[pose] ?? seed(pose)), w: +wIn.value / 100 }; apply(stage); mark(card, pose); };
  rIn.oninput = () => { place[pose] = { ...(place[pose] ?? seed(pose)), rot: +rIn.value }; apply(stage); mark(card, pose); };
}

function mark(card, pose) {
  card.querySelector("h2").innerHTML = pose + (place[pose] ? " &middot; placed" : " &middot; auto");
}

// ─── eraser ─────────────────────────────────────────────────────────────────
let ectx = null, painting = false, brush = 46;
function drawEraser() {
  const c = document.getElementById("cut");
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    ectx = c.getContext("2d");
    ectx.clearRect(0, 0, c.width, c.height);
    ectx.drawImage(img, 0, 0);
  };
  img.src = fileURL(item.art);
}
(function eraserWiring() {
  const c = document.getElementById("cut");
  const at = (e) => {
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };
  const rub = (e) => {
    if (!painting || !ectx) return;
    const { x, y } = at(e);
    ectx.save();
    ectx.globalCompositeOperation = "destination-out";
    ectx.beginPath(); ectx.arc(x, y, brush, 0, Math.PI * 2); ectx.fill();
    ectx.restore();
  };
  c.addEventListener("pointerdown", (e) => { painting = true; c.setPointerCapture(e.pointerId); rub(e); });
  c.addEventListener("pointermove", rub);
  c.addEventListener("pointerup", () => { painting = false; });
  document.getElementById("brush").oninput = (e) => { brush = +e.target.value; };
  addEventListener("keydown", (e) => {
    if (e.key === "[") brush = Math.max(6, brush - 6);
    if (e.key === "]") brush = Math.min(160, brush + 6);
    const b = document.getElementById("brush"); if (b) b.value = brush;
  });
  document.getElementById("undo").onclick = () => drawEraser();
})();

// ─── chrome ─────────────────────────────────────────────────────────────────
function setMode(m) {
  mode = m;
  document.getElementById("place").style.display = m === "place" ? "flex" : "none";
  document.getElementById("eraser").style.display = m === "erase" ? "flex" : "none";
  document.getElementById("tab-place").setAttribute("aria-pressed", String(m === "place"));
  document.getElementById("tab-erase").setAttribute("aria-pressed", String(m === "erase"));
}
document.getElementById("tab-place").onclick = () => setMode("place");
document.getElementById("tab-erase").onclick = () => setMode("erase");
document.getElementById("reset").onclick = () => {
  for (const k of Object.keys(place)) delete place[k];
  draw(); log("every pose back to automatic seating (not saved yet)");
};

async function save() {
  const knobs = {};
  for (const el of document.querySelectorAll(".knob")) {
    const v = el.value.trim();
    knobs[el.dataset.k] = v === "" ? null : Number(v);
  }
  if (mode === "erase" && ectx) {
    const png = document.getElementById("cut").toDataURL("image/png");
    const r = await (await fetch("/api/erase", { method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: item.id, png }) })).json();
    if (r.ok) {
      item.art = r.art;
      toast("erase saved");
      log("cut saved to " + r.art + "\noriginal kept at " + r.kept);
    } else toast("erase FAILED");
    return;
  }
  const r = await (await fetch("/api/save", { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: item.id, place, knobs }) })).json();
  item.recipe = r.recipe ?? item.recipe;
  const n = Object.keys(place).length;
  toast("saved " + n + " pose" + (n === 1 ? "" : "s") + " to manifest.json");
  log("saved to manifest.json\n" + JSON.stringify(item.recipe, null, 2));
}
document.getElementById("save").onclick = save;
for (const [btn, install] of [["render", false], ["install", true]]) {
  document.getElementById(btn).onclick = async () => {
    await save();
    toast("rendering...");
    log("rendering...");
    const r = await (await fetch("/api/render", { method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: item.id, install }) })).json();
    toast(r.ok ? "rendered" : "render FAILED");
    log(r.log);
    for (const img of document.querySelectorAll(".bird")) img.src = img.src.split("&t=")[0] + "&t=" + Date.now();
  };
}
boot();
</script>`;

server.listen(PORT, () => {
  console.log(`wardrobe placement  →  http://localhost:${PORT}`);
  console.log("drag to move, sliders to size and turn, Erase to rub out her body");
});
