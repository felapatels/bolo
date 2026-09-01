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
import {
  readFileSync,
  writeFileSync,
  existsSync,
  copyFileSync,
  mkdirSync,
  statSync,
  unlinkSync,
  rmSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { extname, join } from "node:path";

const PORT = Number(process.env.WARDROBE_PLACE_PORT ?? 8787);
const ROOT = process.cwd();
const MANIFEST = "scripts/wardrobe/manifest.json";
const CANON = "artifacts/gujarati-coach/public/mascot";
const POSES = ["wave", "cheer", "thumbsup", "thinking", "tryagain"];
/** Ids become directory names and generated TS keys, so keep them boring. */
const ID_RE = /^[a-z][a-z0-9-]{1,39}$/;
const SHOPS = ["tailor", "station"];
/** garment is the WHOLE body; top and bottom are its two halves. */
const KINDS = ["garment", "top", "bottom", "accessory"];
const BANDS = ["standard", "premium", "accessory"];

const readManifest = () => JSON.parse(readFileSync(join(ROOT, MANIFEST), "utf8"));
const writeManifest = (m) =>
  writeFileSync(join(ROOT, MANIFEST), `${JSON.stringify(m, null, 2)}\n`);

/** The item fields the browser is allowed to see and set. */
const publicItem = (i) => ({
  id: i.id, name: i.name, kind: i.kind, art: i.art, recipe: i.recipe ?? {},
  tagline: i.tagline ?? "", shop: i.shop, costBand: i.costBand,
  cost: i.cost ?? null, preview: i.preview, status: i.status ?? "draft",
});

/**
 * Apply the shop-facing fields, returning an error string or null.
 *
 * VALIDATED HERE RATHER THAN AT CODEGEN, because codegen throwing means the
 * owner has already saved something the generators cannot read, and the tool
 * is the last place that can still say no cheaply. `cost` is the one the owner
 * asked for: a whole number of Chai that overrides the band (build 27).
 */
function applyMeta(item, meta) {
  if (meta.name !== undefined) {
    const v = String(meta.name).trim();
    if (!v) return "name cannot be empty";
    item.name = v;
  }
  if (meta.tagline !== undefined) item.tagline = String(meta.tagline).trim();
  if (meta.shop !== undefined) {
    if (!SHOPS.includes(meta.shop)) return `shop must be one of ${SHOPS.join(", ")}`;
    item.shop = meta.shop;
  }
  if (meta.costBand !== undefined) {
    if (!BANDS.includes(meta.costBand)) return `costBand must be one of ${BANDS.join(", ")}`;
    item.costBand = meta.costBand;
  }
  if (meta.cost !== undefined) {
    if (meta.cost === null || meta.cost === "") {
      // Back to the shared band. Deleting the key is the only way to say that;
      // 0 is a real price and must not mean "unset".
      delete item.cost;
    } else {
      const n = Number(meta.cost);
      if (!Number.isInteger(n) || n < 0) return "Chai price must be a whole number, 0 or more";
      item.cost = n;
    }
  }
  if (meta.status !== undefined) {
    if (!["draft", "shipped"].includes(meta.status)) return "status must be draft or shipped";
    item.status = meta.status;
  }
  return null;
}

/**
 * What Chai is worth, read from tokenEconomy.ts rather than restated.
 *
 * "How much should this cost" is unanswerable from a price box alone, and the
 * owner said so: the band dropdown offered "accessory" without ever saying what
 * an accessory costs, and nothing on screen said what a learner has to do to
 * earn one. Both halves are pulled straight out of the source of truth, so a
 * repricing there shows up here without anyone remembering to copy it.
 */
function chaiEconomy() {
  let src = "";
  try {
    src = readFileSync(join(ROOT, "artifacts/api-server/src/lib/tokenEconomy.ts"), "utf8");
  } catch { return null; }
  const num = (name) => {
    const m = new RegExp(`export const ${name}\\s*=\\s*(\\d+)`).exec(src);
    return m ? Number(m[1]) : null;
  };
  return {
    bands: {
      standard: num("OUTFIT_COST"),
      premium: num("PREMIUM_OUTFIT_COST"),
      accessory: num("ACCESSORY_COST"),
    },
    // A price only means something next to what it takes to earn it.
    earn: {
      "a practice streak day": num("TOKEN_EARN_STREAK_DAY"),
      "a quiz": num("TOKEN_EARN_QUIZ"),
      "meeting Chacha-ji": num("TOKEN_EARN_CHACHA_ENCOUNTER"),
      "a whole call with him": num("CHACHA_CALL_CHAI_MAX"),
      "finishing a zone": num("TOKEN_EARN_ZONE_COMPLETE"),
      "a referral": num("REFERRAL_REWARD_REFERRER_CHAI"),
    },
    alsoCosts: {
      "unlock a stop": num("STOP_UNLOCK_COST"),
      "repair a streak": num("STREAK_REPAIR_COST"),
      "retry a test-out": num("TESTOUT_RETRY_COST"),
      "First Class": num("FIRST_CLASS_COST"),
    },
  };
}

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

/**
 * The art with its transparent margin trimmed off, cached by file and mtime.
 *
 * IT USED TO TRIM INTO ONE SHARED /tmp PATH, and the page asks for five poses
 * AT ONCE. Five magick processes wrote the same file while five handlers read
 * it, so a card got a half-written or someone else's PNG and rendered nothing:
 * the owner saw a single pose load out of five and reported the tool as broken.
 * Found in build 27.
 *
 * The unique name is what fixes the race. The cache is why five cards now cost
 * one trim instead of five, which is also why a drag no longer stutters on a
 * megabyte of source art.
 */
const trimCache = new Map();
let trimSeq = 0;
/**
 * The art as the GENERATOR will see it: rotated first, then trimmed.
 *
 * THE ORDER IS THE WHOLE POINT, and getting it backwards cost a morning on
 * 2026-09-01. gen-mascot-accessories.mjs runs
 *
 *     -background none -rotate <rot> -trim +repage
 *
 * and then scales so the ROTATED-AND-TRIMMED width is `place.w * canvas`.
 * This server used to hand the browser art trimmed at rot 0 and let CSS spin
 * it about its centre, which scales against the UNROTATED width instead.
 * Rotation grows a bounding box, so the two disagree by more the further the
 * piece turns: on the pagdi's `thinking` pose at 19.01deg the preview drew the
 * turban 26% too large and its bottom edge 163px too low, so a placement that
 * looked seated on her head baked floating above it. `cheer` at 3.38deg was
 * nearly right, which is exactly why it looked like an art problem.
 *
 * Serving the art pre-rotated makes the preview exact BY CONSTRUCTION rather
 * than by re-deriving the generator's maths in a second place. The alpha shape
 * matters here and cannot be predicted analytically: rotating the pagdi's
 * 829x803 trimmed box by 19.01deg gives 981x751, where the rectangle bound
 * would say 1046x1029.
 */
function trimmedPng(abs, rot = 0) {
  const deg = Number.isFinite(rot) ? rot : 0;
  const key = `${abs}@${deg.toFixed(2)}`;
  const stamp = statSync(abs).mtimeMs;
  const hit = trimCache.get(key);
  if (hit && hit.stamp === stamp) return hit.buf;
  const out = `/tmp/wardrobe-place-trim-${process.pid}-${trimSeq++}.png`;
  try {
    // Byte-for-byte the generator's own invocation. Keep them identical.
    magickRun([abs, "-background", "none", "-rotate", deg.toFixed(2),
      "-trim", "+repage", out]);
    const buf = readFileSync(out);
    trimCache.set(key, { stamp, buf });
    return buf;
  } finally {
    try { unlinkSync(out); } catch { /* nothing to clean up */ }
  }
}

/** ImageMagick, for the one place the tool does image work of its own. */
const magickRun = (args) => execFileSync("magick", args, { encoding: "utf8", maxBuffer: 1 << 28 });

/**
 * Rub the opaque background off uploaded art, whatever it arrived as.
 *
 * TWO THINGS BUILD 27 GOT WRONG FIRST TIME, both found on the owner's pink
 * beanie:
 *
 *   1. IT ONLY RAN FOR JPEGs, on the reasoning that a PNG carries real alpha.
 *      That PNG was 74% transparent and still had a flat #DBDBDB slab painted
 *      across the rest — art exported with its backdrop baked in. The format
 *      says nothing about whether the background is real.
 *
 *   2. IT FLOOD-FILLED AGAINST HARDCODED WHITE. #DBDBDB is 14% away from
 *      white and the fuzz was 12%, so the fill matched nothing and returned
 *      the picture unchanged while reporting success. The seed colour is read
 *      from the corner itself now, so it cannot be wrong.
 *
 * FLOOD FILL FROM THE CORNERS, still, rather than "make every light pixel
 * transparent": a global key punches holes through a singlet's white
 * highlights and a hoodie's drawstrings. Only background connected to an edge
 * goes. A corner that is ALREADY transparent is skipped, so art that arrives
 * correct is left alone.
 *
 * Returns null when there was nothing opaque to remove.
 */
function keyBackground(src, dst) {
  const [w, h] = magickRun([src, "-format", "%w %h", "info:"]).trim().split(" ").map(Number);
  if (!w || !h) return null;
  const args = [src, "-alpha", "set", "-channel", "RGBA", "-fuzz", "16%", "-fill", "none"];
  const seeds = [];
  let dominant = null;
  for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) {
    const px = magickRun([src, "-format", `%[pixel:p{${x},${y}}]`, "info:"]).trim();
    const m = /^srgba?\((\d+),(\d+),(\d+)(?:,([\d.]+))?\)$/.exec(px);
    if (!m) continue;
    if (m[4] !== undefined && Number(m[4]) < 0.5) continue; // already transparent
    const rgb = `rgb(${m[1]},${m[2]},${m[3]})`;
    args.push("-floodfill", `+${x}+${y}`, rgb);
    seeds.push(`${x},${y} ${px}`);
    dominant ??= rgb;
  }
  if (!seeds.length) return null;
  /**
   * AND THEN THE SAME COLOUR GLOBALLY, on a TIGHT fuzz.
   *
   * The owner's beanie arrived with a CHECKERBOARD BAKED INTO ITS ALPHA:
   * alternating opaque-grey and transparent squares, a picture OF transparency
   * rather than transparency. Flood fill can never clear that, because
   * checkerboard squares touch only at their corners and a fill is
   * four-connected, so it clears one square and stops. Three corners came out
   * clean and the middle of the background stayed grey.
   *
   * The fuzz is deliberately much tighter here than for the flood. A global key
   * is the dangerous one — it is what punches holes through a singlet's white
   * highlights — so it is aimed at the exact colour measured off the corner,
   * close enough to take the checkerboard and far enough from white (#DBDBDB is
   * 14% away) to leave real art alone.
   */
  if (dominant) args.push("-fuzz", "6%", "-transparent", dominant);
  args.push("-trim", "+repage", dst);
  magickRun(args);
  return seeds;
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
      items: m.items.map(publicItem),
      economy: chaiEconomy(),
    }));
  }

  if (url.pathname === "/file") {
    const abs = safePath(url.searchParams.get("path") ?? "");
    if (!abs) return send(res, 404, JSON.stringify({ error: "not found" }));
    // TRIMMED ON REQUEST, because the generator trims before it places. Handing
    // the browser the untrimmed art would make every drag off by however much
    // transparent margin the artist left, which differs per file.
    // `rot` is the piece's current turn: pass it and the art comes back rotated
    // THEN trimmed, which is the only box the generator ever measures. See
    // trimmedPng. The browser must not rotate again on top of this.
    if (url.searchParams.get("trim") === "1") {
      try {
        const rot = Number.parseFloat(url.searchParams.get("rot") ?? "0");
        return send(res, 200, trimmedPng(abs, Number.isFinite(rot) ? rot : 0), "image/png");
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
    const { id, place, knobs, meta } = await readBody(req);
    const m = readManifest();
    const item = m.items.find((i) => i.id === id);
    if (!item) return send(res, 404, JSON.stringify({ error: "no such item" }));
    item.recipe = item.recipe ?? {};
    if (place && Object.keys(place).length) item.recipe.place = place;
    for (const [k, v] of Object.entries(knobs ?? {})) {
      if (v === null || v === "" || Number.isNaN(v)) delete item.recipe[k];
      else item.recipe[k] = v;
    }
    // Shop-facing fields (build 27). `cost` null means "use the band again"
    // rather than "free", because free is a real price and deleting the key is
    // the only way back to the shared constant.
    if (meta) {
      const err = applyMeta(item, meta);
      if (err) return send(res, 400, JSON.stringify({ error: err }));
    }
    writeManifest(m);
    return send(res, 200, JSON.stringify({ ok: true, recipe: item.recipe, item: publicItem(item) }));
  }

  // UPLOAD (build 27). New art arrives as a PNG from the owner's disk and
  // lands in the art tree the generators already read, so an uploaded piece is
  // indistinguishable from one committed by hand.
  if (url.pathname === "/api/upload" && req.method === "POST") {
    const { id, kind, png } = await readBody(req);
    if (!ID_RE.test(id ?? "")) {
      return send(res, 400, JSON.stringify({ error: "id must be lower-case letters, digits and dashes" }));
    }
    if (!KINDS.includes(kind)) {
      return send(res, 400, JSON.stringify({ error: `kind must be one of ${KINDS.join(", ")}` }));
    }
    const b64 = String(png ?? "").split(",").pop() ?? "";
    const buf = Buffer.from(b64, "base64");
    // A PNG starts \x89PNG\r\n\x1a\n; a JPEG starts \xff\xd8\xff. Sniffed rather
    // than trusted from the file name, because a JPEG renamed .png fails deep
    // inside a composite with a message about nothing in particular.
    const isPng = buf.length > 8 && buf.toString("latin1", 0, 8) === "\x89PNG\r\n\x1a\n";
    const isJpeg = buf.length > 3 && buf.toString("latin1", 0, 3) === "\xff\xd8\xff";
    if (!isPng && !isJpeg) {
      return send(res, 400, JSON.stringify({ error: "that file is neither a PNG nor a JPEG" }));
    }
    const dir = kind === "accessory" ? "scripts/mascot-accessory-art" : "scripts/mascot-garment-art";
    const rel = `${dir}/${id}.png`;
    mkdirSync(join(ROOT, dir), { recursive: true });
    // Never clobber art that is already on disk: a second upload for the same
    // id parks beside the first rather than overwriting a piece that may be
    // shipped. The manifest is repointed at whichever one is written.
    let target = rel;
    if (existsSync(join(ROOT, rel))) {
      let n = 2;
      while (existsSync(join(ROOT, `${dir}/${id}-v${n}.png`))) n += 1;
      target = `${dir}/${id}-v${n}.png`;
    }
    // ONE PATH FOR BOTH FORMATS. A JPEG cannot hold transparency at all, and a
    // PNG only might, so the question is never the container: it is whether
    // the corners are opaque. keyBackground answers that and no-ops when the
    // art already arrived cut out.
    const srcTmp = `/tmp/wardrobe-upload-src.${isJpeg ? "jpg" : "png"}`;
    const dstTmp = "/tmp/wardrobe-upload-out.png";
    writeFileSync(srcTmp, buf);
    let out = buf;
    let keyed = null;
    try {
      keyed = keyBackground(srcTmp, dstTmp);
      if (keyed) out = readFileSync(dstTmp);
      else if (isJpeg) {
        // Nothing opaque at the corners but still a JPEG, so it must at least
        // become a PNG for the generators to composite it.
        magickRun([srcTmp, dstTmp]);
        out = readFileSync(dstTmp);
      }
    } catch {
      if (isJpeg) {
        try {
          magickRun([srcTmp, dstTmp]);
          out = readFileSync(dstTmp);
        } catch {
          return send(res, 400, JSON.stringify({ error: "could not convert that JPEG" }));
        }
      }
      // A PNG that defeated the key is still usable art: the Erase tab exists
      // for exactly this, so keep the upload rather than refusing it.
    }
    writeFileSync(join(ROOT, target), out);
    return send(res, 200, JSON.stringify({
      ok: true, art: target, bytes: out.length,
      converted: isJpeg,
      keyed: Boolean(keyed),
      note: keyed
        ? `Background removed from ${keyed.length} corner${keyed.length === 1 ? "" : "s"}. Check the armholes and the neck; use Erase if any of it survived.`
        : isJpeg
          ? "Converted to PNG. The corners were already transparent, so nothing was keyed."
          : "The corners were already transparent, so the art was taken as it is.",
    }));
  }

  // NEW ITEM (build 27). Adding a piece used to mean hand-editing the manifest
  // in an editor, which is the one step of `wardrobe` that never got a UI.
  if (url.pathname === "/api/new-item" && req.method === "POST") {
    const body = await readBody(req);
    const { id, kind, art } = body;
    if (!ID_RE.test(id ?? "")) {
      return send(res, 400, JSON.stringify({ error: "id must be lower-case letters, digits and dashes" }));
    }
    const m = readManifest();
    if (m.items.some((i) => i.id === id)) {
      return send(res, 409, JSON.stringify({ error: `"${id}" already exists` }));
    }
    if (!KINDS.includes(kind)) {
      return send(res, 400, JSON.stringify({ error: `kind must be one of ${KINDS.join(", ")}` }));
    }
    if (!art || !safePath(art)) {
      return send(res, 400, JSON.stringify({ error: "upload the art first" }));
    }
    const item = {
      id,
      name: body.name?.trim() || id,
      tagline: body.tagline?.trim() || "",
      kind,
      shop: body.shop === "station" ? "station" : "tailor",
      // An accessory sits on her head, so its preview is cropped to it.
      costBand: kind === "accessory" ? "accessory" : "standard",
      preview: kind === "accessory" ? "head" : "full",
      status: "draft",
      art,
      recipe: {},
    };
    const err = applyMeta(item, body);
    if (err) return send(res, 400, JSON.stringify({ error: err }));
    m.items.push(item);
    writeManifest(m);
    return send(res, 200, JSON.stringify({ ok: true, item: publicItem(item) }));
  }

/**
 * Every path a wardrobe change is allowed to touch.
 *
 * LISTED, NEVER AN EXCLUSION. A commit built from "everything except" sweeps in
 * whatever else happens to be dirty in the tree, and this tool runs on a
 * machine where something else usually is.
 */
const WARDROBE_PATHS = [
  "scripts/wardrobe/manifest.json",
  "scripts/mascot-accessory-art",
  "scripts/mascot-garment-art",
  "artifacts/gujarati-coach/public/mascot",
  "artifacts/bolo-mobile/assets/images/mascot",
  "artifacts/api-server/src/lib/outfits.catalog.gen.ts",
  "artifacts/gujarati-coach/src/lib/mascotOutfits.gen.ts",
  "artifacts/gujarati-coach/src/lib/wardrobeShop.gen.ts",
  "artifacts/bolo-mobile/lib/mascotOutfits.gen.ts",
  "artifacts/bolo-mobile/lib/wardrobeShop.gen.ts",
  "docs/garment-review",
];

const git = (args) =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 24 });

/**
 * Commit and push exactly the wardrobe paths. Returns a log line or throws.
 *
 * `git commit -- <paths>` rather than a bare commit, because the index is
 * shared with whatever else is working in this repo and a bare commit takes
 * all of it.
 */
function commitWardrobe(subject) {
  const dirty = git(["status", "--porcelain", "--", ...WARDROBE_PATHS]).trim();
  if (!dirty) return null;
  git(["add", "--", ...WARDROBE_PATHS]);
  git(["commit", "-m", subject, "--", ...WARDROBE_PATHS]);
  git(["push", "origin", "HEAD"]);
  return `${dirty}\n\n${git(["log", "--oneline", "-1"]).trim()}`;
}

/**
 * WHO ALREADY PAID FOR THIS PIECE, asked of PRODUCTION.
 *
 * The owner's worry, and the right one: "something can be deleted that was
 * already purchased". Ownership is a ledger row, so deleting the catalogue
 * entry does not refund anybody — it strands what they bought. Tonight two
 * accounts had bought a kurta and it was only safe because both turned out to
 * be the owner's own; that check was done by hand, which is the wrong place
 * for it.
 *
 * READ-ONLY, AND AGAINST PROD ON PURPOSE. The Shell's database is development
 * and its emptiness means nothing. PROD_DATABASE_URL lives in ~/bolo/.env under
 * a name nothing in the repo reads, so nothing can pick it up by accident.
 *
 * Returns null when it cannot ask, which is NOT the same as "nobody bought it"
 * and is reported as the difference it is.
 */
function outfitPurchases(id) {
  let url = null;
  try {
    const env = readFileSync(join(ROOT, ".env"), "utf8");
    url = /^PROD_DATABASE_URL=(.+)$/m.exec(env)?.[1]?.trim().replace(/^["']|["']$/g, "");
  } catch { /* no .env on this machine */ }
  if (!url) return null;
  try {
    const rows = execFileSync("psql", [url, "-A", "-t", "-F", "\t", "-c",
      `SELECT user_id, created_at FROM token_ledger WHERE reason = 'spend_outfit' AND ref_id = 'outfit:${id}' ORDER BY created_at`],
      { encoding: "utf8", timeout: 20000 }).trim();
    if (!rows) return { buyers: [], owners: 0, learners: 0 };
    // The owner's own accounts are on the Nest allowlist, and a purchase by one
    // of those is a test rather than a customer. Read straight out of the gate
    // so the two can never drift.
    let allow = "";
    try { allow = readFileSync(join(ROOT, "artifacts/api-server/src/lib/ownerGate.ts"), "utf8"); } catch { /* fall back to counting all as learners */ }
    const buyers = rows.split("\n").map((r) => {
      const [userId, at] = r.split("\t");
      return { userId, at, mine: allow.includes(userId) };
    });
    return {
      buyers,
      owners: buyers.filter((b) => b.mine).length,
      learners: buyers.filter((b) => !b.mine).length,
    };
  } catch {
    return null;
  }
}

/**
 * PUBLISH (build 27). Render, install into both apps, regenerate the
 * registries, check they all agree, then COMMIT AND PUSH.
 *
 * The owner asked why there were four buttons when they wanted two, and the
 * honest answer was that the fourth one lied: it was called Publish and only
 * wrote files. Pushing is what makes the name true, and it removes the step
 * where a change sat on one laptop waiting for somebody to remember it.
 *
 * It still cannot reach a learner on its own, and the response says so: the
 * Repl has to pull and republish for web, and phones need a native build.
 */
  if (url.pathname === "/api/publish" && req.method === "POST") {
    const { id, message } = await readBody(req);
    const steps = [];
    const run = (args) => {
      const out = execFileSync("node", ["scripts/wardrobe.mjs", ...args],
        { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 24 });
      steps.push(`$ wardrobe ${args.join(" ")}\n${out.trim()}`);
    };
    try {
      if (id) run(["install", id]);
      run(["codegen"]);
      run(["check"]);
    } catch (e) {
      steps.push(String(e.stdout ?? e.stderr ?? e));
      return send(res, 200, JSON.stringify({ ok: false, stage: "build", log: steps.join("\n\n").slice(-6000) }));
    }
    // The build is done and on disk either way. A git failure from here is
    // worth reporting loudly and is NOT a reason to call the install a failure,
    // so it gets its own stage in the answer.
    try {
      const subject = String(message || "").trim() || `Wardrobe: ${id || "catalogue"} from the placement tool`;
      const line = commitWardrobe(subject);
      steps.push(line ? `$ git commit && push\n${line}` : "nothing to commit: the wardrobe already matches the last commit");
      return send(res, 200, JSON.stringify({ ok: true, pushed: Boolean(line), log: steps.join("\n\n").slice(-6000) }));
    } catch (e) {
      steps.push(`GIT FAILED (the art is installed, it just is not pushed)\n${String(e.stdout ?? e.stderr ?? e)}`);
      return send(res, 200, JSON.stringify({ ok: true, pushed: false, log: steps.join("\n\n").slice(-6000) }));
    }
  }

  // DELETE (build 27, owner's ask). Removes the piece from the shop and takes
  // its installed sprites out of both apps. The SOURCE ART IS KEPT: it is the
  // only thing here that cannot be regenerated, and a delete should cost a
  // catalogue entry rather than the artwork.
  if (url.pathname === "/api/delete" && req.method === "POST") {
    const { id, force } = await readBody(req);
    if (!ID_RE.test(id ?? "")) return send(res, 400, JSON.stringify({ error: "bad id" }));
    const m = readManifest();
    const item = m.items.find((i) => i.id === id);
    if (!item) return send(res, 404, JSON.stringify({ error: "no such item" }));
    // ASK PRODUCTION WHO OWNS IT FIRST. Deleting the catalogue entry does not
    // refund anybody, it strands what they bought, so a piece somebody paid for
    // needs a deliberate second press rather than a shrug.
    const paid = outfitPurchases(id);
    if (!force) {
      if (paid === null) {
        return send(res, 409, JSON.stringify({
          error: "unchecked",
          detail: "Production could not be reached, so whether anyone bought this is UNKNOWN. " +
            "That is not the same as nobody having bought it.",
        }));
      }
      if (paid.buyers.length) {
        return send(res, 409, JSON.stringify({
          error: "purchased",
          buyers: paid.buyers.length,
          owners: paid.owners,
          learners: paid.learners,
          detail:
            `${paid.buyers.length} purchase${paid.buyers.length === 1 ? "" : "s"} in production: ` +
            `${paid.owners} from your own accounts, ${paid.learners} from real learners. ` +
            (paid.learners
              ? "Deleting it takes away something a learner paid Chai for; it is not refunded."
              : "Every buyer is one of your own accounts, so nothing a learner paid for is lost."),
        }));
      }
    }
    m.items = m.items.filter((i) => i.id !== id);
    writeManifest(m);
    const removed = [];
    for (const base of [
      "artifacts/gujarati-coach/public/mascot/outfits",
      "artifacts/bolo-mobile/assets/images/mascot/outfits",
    ]) {
      const dir = join(ROOT, base, id);
      if (existsSync(dir)) { rmSync(dir, { recursive: true, force: true }); removed.push(`${base}/${id}`); }
    }
    let log = "";
    try {
      log = execFileSync("node", ["scripts/wardrobe.mjs", "codegen"],
        { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 24 });
    } catch (e) { log = String(e.stdout ?? e); }
    let pushed = false;
    let gitLog = "";
    try {
      const line = commitWardrobe(`Wardrobe: remove ${id}`);
      pushed = Boolean(line);
      gitLog = line ? `\n\n$ git commit && push\n${line}` : "\n\nnothing to commit";
    } catch (e) {
      gitLog = `\n\nGIT FAILED (it is deleted locally, just not pushed)\n${String(e.stdout ?? e.stderr ?? e)}`;
    }
    return send(res, 200, JSON.stringify({
      ok: true, removed, keptArt: item.art, pushed,
      log: `removed ${id}\n${removed.map((r) => "  " + r).join("\n")}\n\n${log.trim()}` +
        `\n\nsource art kept at ${item.art}` +
        (paid && paid.buyers.length
          ? `\n\n${paid.buyers.length} production purchase(s) existed; ownership rows are UNTOUCHED and unrefunded.`
          : "") +
        gitLog,
    }));
  }

  if (url.pathname === "/api/erase" && req.method === "POST") {
    const { id, png } = await readBody(req);
    const m = readManifest();
    const item = m.items.find((i) => i.id === id);
    if (!item) return send(res, 404, JSON.stringify({ error: "no such item" }));
    // The cut lives beside the source and the source is never written, so a
    // bad erase costs one file rather than the art.
    //
    // ONE CUT FILE, NOT A CHAIN. The suffix used to be appended to whatever the
    // manifest currently pointed at, and after the first erase that was already
    // the cut, so a second rub made -cut-cut and a sixth made
    // -cut-cut-cut-cut-cut-cut. The owner got there in one sitting on a beanie.
    // The base name is stripped of any cut suffixes first, so erasing again
    // overwrites the same file: the accumulation was only ever in the NAME, and
    // the pixels always continued from the previous cut either way.
    const base = item.art.replace(/(-cut)+\.png$/i, ".png");
    const cut = base.replace(/\.png$/i, "-cut.png");
    const orig = base.replace(/\.png$/i, "-orig.png");
    if (!existsSync(join(ROOT, orig))) {
      copyFileSync(join(ROOT, base), join(ROOT, orig));
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
button.danger{color:#a3243b;border-color:#e3bcc4}
button.danger:hover{background:#a3243b;color:#fff;border-color:#a3243b}
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
#shop,#newitem{padding:18px;display:none}
#legend{margin:14px 18px 0;padding:10px 14px;border:1px solid var(--line);border-radius:12px;background:#fff;max-width:900px;font-size:13px;color:#4a4740}
#legend summary{cursor:pointer;font-weight:700;color:var(--ink);letter-spacing:.01em}
#legend ol{margin:10px 0 6px;padding-left:20px}
#legend li{margin-bottom:5px}
#legend p{margin:8px 0 0;line-height:1.55}
#prepublish{position:fixed;inset:0;background:rgba(27,26,23,.45);display:none;
  align-items:center;justify-content:center;z-index:20;padding:20px;overflow:auto}
#prepublish .card{max-width:820px;max-height:92vh;overflow:auto}
#pricing td{padding:1px 0;border-bottom:1px solid #f0ece4}
.card{border:1px solid var(--line);border-radius:12px;background:#fff;padding:16px 18px;max-width:560px}
.card h3{margin:0 0 10px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#6b6558}
.card p{margin:0 0 12px}
.card label{font-size:11px;color:#6b6558;text-transform:uppercase;letter-spacing:.06em}
input[type=text],input[type=number],.card select{font:inherit;padding:6px 9px;border-radius:8px;border:1px solid var(--line);background:#fff;color:var(--ink)}
#eraser canvas{border:1px solid var(--line);background:repeating-conic-gradient(#eee 0 25%,#fff 0 50%) 0 0/16px 16px;cursor:crosshair;max-width:520px;height:auto}
.hint{max-width:320px;color:#6b6558;font-size:13px}
</style>
<header>
  <h1>Wardrobe placement</h1>
  <select id="item"></select>
  <button id="tab-place" aria-pressed="true">Place</button>
  <button id="tab-erase" aria-pressed="false">Erase</button>
  <button id="tab-shop" aria-pressed="false">Shop</button>
  <button id="tab-new" aria-pressed="false">Add a piece</button>
  <span id="kind" style="color:#6b6558"></span>
  <span style="flex:1"></span>
  <button id="reset" title="Throw away every placement for this piece and go back to the automatic seating. Only a Save away from permanent.">Reset poses</button>
  <button id="delete" class="danger" title="Take this piece out of the shop and remove its sprites from both apps. The source art is kept.">Delete piece</button>
  <button id="save" title="Write your placements and shop details to the manifest. Nothing is rendered and nobody sees it.">Save draft</button>
  <button id="publish" class="primary" title="Render, install into both apps, regenerate and check the registries, then commit and push.">Publish</button>
  <span id="toast" role="status" aria-live="polite"></span>
</header>
<details id="legend" open>
  <summary>What the two buttons do</summary>
  <p><b>Save draft</b> writes your placements and shop details to the manifest.
     Nothing is rendered and nobody sees it. Safe to hit as often as you like.</p>
  <p><b>Publish</b> does everything else in one go: composites the five poses,
     writes the sprites into the web app and the mobile app, regenerates the
     registries, checks they all agree, then commits and pushes.</p>
  <p><b>One step is left after Publish, and it is not on this Mac.</b> The Repl
     has to pull and republish, and then <b>web learners have it</b>.
     <b>Phones need a native build</b> on top of that, because their art is
     bundled at compile time: a piece that reaches the server without one turns
     up in the shop with nothing behind it.</p>
</details>
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

<section id="shop">
  <div class="card">
    <h3>What the Bazaar shows</h3>
    <p class="hint">Name, tagline and price as a learner sees them. <b>Save</b> writes
    them to the manifest; they reach the shop when you <b>Publish</b>.</p>
    <p><label>Name<br><input id="f-name" type="text" size="34"></label></p>
    <p><label>Tagline<br><input id="f-tagline" type="text" size="44"></label></p>
    <p>
      <label>Chai price<br><input id="f-cost" type="number" min="0" step="1" size="6"></label>
      <button id="f-cost-clear">Use the band instead</button>
    </p>
    <p class="hint" id="f-cost-note"></p>
    <p><label>Band (used when no price is set)<br>
      <select id="f-band">
        <option value="standard">standard</option>
        <option value="premium">premium</option>
        <option value="accessory">accessory</option>
      </select></label></p>
    <p><label>Shop door<br>
      <select id="f-shop">
        <option value="tailor">tailor</option>
        <option value="station">station</option>
      </select></label></p>
    <p><label>Status<br>
      <select id="f-status">
        <option value="draft">draft</option>
        <option value="shipped">shipped</option>
      </select></label></p>
    <p><button id="f-save" class="primary">Save shop details</button></p>
  </div>
</section>

<section id="newitem">
  <div class="card">
    <h3>Add a piece</h3>
    <p class="hint">Upload the source art, then place it on the poses like any other
    piece. <b>A garment is a flat piece of cloth over her belly</b> (her wings and
    feet get restacked in front); <b>an accessory is a transparent overlay</b> for
    her head. Sleeves can never work: her wings redraw in front of cloth.</p>
    <p><label>Kind<br>
      <select id="n-kind">
        <option value="accessory">accessory (a hat)</option>
        <option value="top">top (her upper half)</option>
        <option value="bottom">bottom (her lower half, needs a top)</option>
        <option value="garment">full body (a saree, a sherwani)</option>
      </select></label></p>
    <p><label>Id<br><input id="n-id" type="text" size="24" placeholder="marigold-topi"></label>
       <span class="hint">lower-case, dashes; becomes the folder name</span></p>
    <p><label>Name<br><input id="n-name" type="text" size="34" placeholder="Marigold topi"></label></p>
    <p><label>Tagline<br><input id="n-tagline" type="text" size="44"></label></p>
    <p><label>Chai price<br><input id="n-cost" type="number" min="0" step="1" size="6" placeholder="leave blank for the band"></label></p>
    <p><label>Source art (PNG or JPEG)<br><input id="n-file" type="file" accept="image/png,image/jpeg"></label></p>
    <p><img id="n-preview" alt="" style="max-width:260px;display:none;border:1px solid var(--line);border-radius:8px;background:repeating-conic-gradient(#eee 0 25%,#fff 0 50%) 0 0/16px 16px"></p>
    <p><button id="n-create" class="primary">Upload and add</button></p>
  </div>
</section>

<div id="prepublish">
  <div class="card">
    <h3>Last look before push</h3>
    <p class="hint">Publishing <b id="p-which"></b>. This is what a learner sees in the
    Bazaar. Change anything here and it is saved with the push.</p>
    <p><label>Name<br><input id="p-name" type="text" size="34"></label></p>
    <p><label>Tagline<br><input id="p-tagline" type="text" size="44"></label></p>
    <p><label>Chai price<br><input id="p-cost" type="number" min="0" step="1" size="6"
       placeholder="blank = use the band"></label></p>
    <p><label>Band (used when no price is set)<br>
      <select id="p-band">
        <option value="standard">standard</option>
        <option value="premium">premium</option>
        <option value="accessory">accessory</option>
      </select></label></p>
    <div id="pricing"></div>
    <p><button id="p-go" class="primary">Save and publish</button>
       <button id="p-cancel">Cancel</button></p>
  </div>
</div>
<div id="log"></div>
<script>
const POSE_W = 1024, POSE_H = 1200;
/** Everything worn on her BODY, which shares one generator and one set of
 *  whole-item knobs. Only the head slot is different. */
const CLOTH = ["garment", "top", "bottom"];
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
/**
 * The art AT A GIVEN TURN, rotated then trimmed on the server exactly as
 * gen-mascot-accessories.mjs does it. The rot belongs in the URL rather than in
 * a CSS transform: rotating in CSS scales the piece against its UNROTATED
 * width, which is a different and smaller box, and that mismatch is what made
 * the preview disagree with the bake. See trimmedPng.
 */
const artURL = (p, rot) => fileURL(p) + "&trim=1&rot=" + (Number(rot) || 0).toFixed(2);

/**
 * ONLY THE ACCESSORY PIPELINE TURNS A PIECE.
 *
 * gen-mascot-accessories.mjs rotates then trims. gen-mascot-outfits.mjs, which
 * every garment, top and bottom goes through, contains no -rotate at all: it
 * NO BACKTICKS ANYWHERE IN THIS BROWSER SCRIPT, not even in a comment.
 * Everything from PAGE down lives inside a String.raw template, so one
 * backtick closes that string and the next word is evaluated as JavaScript.
 * It cost a restart on 2026-09-01: a comment reading -rotate in backticks
 * threw "ReferenceError: rotate is not defined" at module load. Note that
 * node --check PASSES this, because the result is still valid syntax.
 * trims once and reads place.x/y/w, and place.rot is discarded in silence.
 *
 * So the turn control must not appear to do anything for cloth. Showing one is
 * how the preview lied about placement in the first place, and serving cloth
 * pre-rotated would be worse than the bug it fixed: the generator would then
 * disagree about the SCALE too, because it measures the untrimmed-unrotated
 * width. Cloth is always requested at rot 0.
 */
const TURNABLE = (it) => it.kind === "accessory";
const pieceRot = (p) => (TURNABLE(item) ? p.rot : 0);

async function boot() {
  data = await (await fetch("/api/items")).json();
  const sel = document.getElementById("item");
  // MARK THE UNPLACEABLE ONES. Navratri predates the generator and has no
  // source cloth in the repo, so it can never be dragged or erased. Saying so
  // in the list is the difference between "this piece is special" and "your
  // tool is broken".
  sel.innerHTML = data.items.map(function (i) {
    return '<option value="' + i.id + '">' + i.name + ' (' + i.kind + ')' +
      (i.art ? '' : ' — no source art') + '</option>';
  }).join("");
  sel.onchange = () => load(sel.value);
  // OPEN ON SOMETHING PLACEABLE. It used to open on items[0], which is
  // navratri, the one item with nothing to show: the owner opened the tool,
  // got an empty stage, and reported it as not loading (Aug 31 2026).
  const first = data.items.find((i) => i.art) ?? data.items[0];
  sel.value = first.id;
  load(first.id);
}

async function load(id) {
  item = data.items.find((i) => i.id === id);
  place = JSON.parse(JSON.stringify(item.recipe.place ?? {}));
  AUTO = await (await fetch("/api/auto?id=" + encodeURIComponent(id))).json().catch(() => ({}));
  document.getElementById("kind").textContent =
    CLOTH.indexOf(item.kind) >= 0
      ? item.kind + ": whole-item knobs"
      : "accessory: per pose";
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
      '<img class="worn" style="display:none" src="' + fileURL("artifacts/gujarati-coach/public/mascot/outfits/" + item.id + "/mascot-" + pose + ".png") + '"' +
        ' onload="wornLoaded(this)" onerror="this.style.display=\'none\'">' +
      '<img class="bird" draggable="false" src="' + fileURL("artifacts/gujarati-coach/public/mascot/mascot-" + pose + ".png") + '">' +
      // NO src HERE ON PURPOSE. layout() owns it, because the URL carries the
      // pose's current turn and only layout() knows what that is.
      '<img class="piece" draggable="false" onload="pieceLoaded(this)">' +
    '</div>' +
    '<div class="row">' +
      '<label>size</label><input type="range" class="w" min="10" max="120" step="0.5">' +
      // DISABLED FOR CLOTH, and labelled with the reason rather than just
      // vanishing. gen-mascot-outfits.mjs has no -rotate, so a turn set here
      // would be written to the manifest and then silently discarded at bake.
      // A control that does nothing is the exact shape of the bug this tool
      // just cost a morning on.
      '<label>' + (TURNABLE(item) ? "turn" : "turn &middot; cloth does not turn") + '</label>' +
      '<input type="range" class="r" min="-60" max="60" step="0.5"' +
        (TURNABLE(item) ? "" : " disabled") + '>' +
    '</div>';
  return el;
}

/** Fractions of the canvas in, CSS pixels out. The stage is the canvas. */
/** Put the draggable piece where a placement says, in stage pixels. */
function layout(piece, stage, p) {
  const W = stage.clientWidth, H = stage.clientHeight;

  // THE PIECE IS FETCHED ALREADY ROTATED, so the box being sized here IS the
  // rotated-and-trimmed box the generator measures, and left/top/width below
  // are then literally the generator's three lines:
  //     x = place.x * w ; baseY = place.y * h ; scale = place.w*w / rotated.w
  // Do not put a rotate() back on this element. That was the bug.
  const want = artURL(item.art, pieceRot(p));
  if (piece.dataset.want !== want) {
    piece.dataset.want = want;
    piece.src = want;
  }

  piece.style.left = (p.x * W) + "px";
  piece.style.top = (p.y * H) + "px";
  // THE ART'S OWN ASPECT, not the canvas's. Sizing the box to the canvas made
  // object-contain letterbox the piece, so it drew smaller than it renders and
  // every drag was corrected against a lie.
  const natW = piece.naturalWidth || 1, natH = piece.naturalHeight || 1;
  piece.style.width = (p.w * W) + "px";
  piece.style.height = (p.w * W * (natH / natW)) + "px";

  // TRANSIENT ONLY, and zero whenever the right art has arrived. Dragging the
  // turn slider outruns the server, so between the input and the new PNG the
  // piece is spun by the DIFFERENCE to keep the handle feeling live. The moment
  // the matching art loads this is rotate(0deg) and the preview is exact again.
  const loaded = Number(piece.dataset.loadedRot);
  const delta = Number.isFinite(loaded) ? pieceRot(p) - loaded : 0;
  piece.style.transform = delta ? "rotate(" + delta + "deg)" : "";
}

/**
 * The pre-rotated art arrived, so its natural size changed under the layout
 * that asked for it. Record the turn it represents and lay the piece out again
 * against the real numbers.
 */
function pieceLoaded(img) {
  const stage = img.closest(".stage");
  if (!stage) return;
  const m = /[?&]rot=(-?[\d.]+)/.exec(img.dataset.want || "");
  img.dataset.loadedRot = m ? m[1] : "0";
  apply(stage);
}

/**
 * The shipped composite has loaded, so show THAT instead of the ghost.
 *
 * Called from the image's own onload, not from apply(), because apply() runs
 * long before the picture arrives and cannot know whether it will.
 */
function wornLoaded(img) {
  const stage = img.closest(".stage");
  if (!stage || place[stage.dataset.pose]) return; // a drag already took over
  img.style.display = "";
  stage.querySelector(".bird").style.opacity = "0";
  stage.querySelector(".piece").style.display = "none";
}

function apply(stage) {
  const pose = stage.dataset.pose;
  const piece = stage.querySelector(".piece");
  const worn = stage.querySelector(".worn");
  const bird = stage.querySelector(".bird");
  const p = place[pose];
  if (!p) {
    /**
     * UNPLACED, AND THE COMPOSITE MAY NOT EXIST. It used to hide the bird and
     * the piece here and show the shipped composite, gated on whether the
     * composite element had a src ATTRIBUTE — which it always does, even when
     * that src 404s. So for a piece never installed, the composite hid itself
     * on error, the bird stayed at opacity 0, the piece stayed display:none,
     * and the card was blank. The owner uploaded a beanie and got five empty
     * stages with nothing to drag.
     *
     * The default is now the draggable ghost at the automatic seating, which
     * is the state a NEW piece needs. A composite that really does load swaps
     * to itself from its own onload, so a shipped piece still shows what the
     * app would actually ship rather than a ghost floating over her.
     */
    if (worn) worn.style.display = "none";
    bird.style.opacity = "1";
    piece.style.display = "";
    piece.style.opacity = "0.9";
    layout(piece, stage, seed(pose));
    return;
  }
  piece.style.display = "";
  if (worn) worn.style.display = "none";
  bird.style.opacity = "1";
  piece.style.opacity = "1";
  layout(piece, stage, p);
}

let AUTO = {};
function seed(pose) {
  // THE REAL AUTOMATIC SEATING, not a guess. Picking a hat up should move it
  // from where it already is; anything else throws away the crown maths the
  // moment you touch a pose and makes the tool feel like it fought you.
  const a = AUTO[pose];
  if (a) return { ...a };
  // NO SEATING TO START FROM, which is every piece nobody has rendered yet.
  // The fallback used to be one box for everything and it landed a hat across
  // her eyes, so the first thing the owner had to do was undo it. Aim it at the
  // slot the piece belongs to instead: a hat small and high, cloth wide and
  // over her belly. Still only a starting point, and one drag replaces it.
  return item.kind === "accessory"
    ? { x: 0.30, y: 0.00, w: 0.40, rot: 0 }
    : { x: 0.16, y: 0.46, w: 0.68, rot: 0 };
}

function draw() {
  const main = document.getElementById("place");
  main.innerHTML = "";
  if (CLOTH.indexOf(item.kind) >= 0) {
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
  document.getElementById("undo").onclick = () => { drawEraser(); toast("erasing undone (not saved)"); };
})();

// ─── chrome ─────────────────────────────────────────────────────────────────
const TABS = { place: "place", erase: "eraser", shop: "shop", new: "newitem" };
function setMode(m) {
  mode = m;
  for (const [name, section] of Object.entries(TABS)) {
    document.getElementById(section).style.display =
      name === m ? (name === "place" || name === "erase" ? "flex" : "block") : "none";
    document.getElementById("tab-" + name).setAttribute("aria-pressed", String(name === m));
  }
  // Only the placement tabs act on the selected piece; the header's Save,
  // render and install would all be lies on the other two.
  const onPiece = m === "place" || m === "erase";
  for (const b of ["reset", "delete", "save", "publish"]) {
    document.getElementById(b).style.display = onPiece ? "" : "none";
  }
  document.getElementById("legend").style.display = onPiece ? "" : "none";
  if (m === "shop") fillShop();
}
for (const name of Object.keys(TABS)) {
  document.getElementById("tab-" + name).onclick = () => { setMode(name); toast(name === "new" ? "add a piece" : name); };
}
document.getElementById("reset").onclick = () => {
  for (const k of Object.keys(place)) delete place[k];
  draw();
  toast("reset to automatic seating (not saved)");
  log("every pose back to automatic seating (not saved yet)");
};

// ─── shop details ───────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
/**
 * WHAT EVERYTHING ELSE COSTS, beside the price box.
 *
 * The owner, mid-publish: "I'm not sure how much to price things, can we show
 * the current prices of items on this screen." A number in a box has no scale
 * on its own, and the band dropdown was worse than silent — it offered
 * "accessory" without ever saying that an accessory is 10 Chai.
 *
 * So: what the bands are worth, what the shop already charges, and what a
 * learner has to DO to earn it, which is the half that turns a price into a
 * decision. All read from tokenEconomy.ts and the live catalogue, never
 * restated here.
 */
function pricingTable() {
  const e = data.economy;
  if (!e) return "";
  const row = (a, b) => "<tr><td>" + a + "</td><td style='text-align:right;padding-left:18px'>" + b + "</td></tr>";
  const bands = Object.entries(e.bands)
    .map(([k, v]) => row("<b>" + k + "</b> band", v + " Chai")).join("");
  const stock = data.items
    .map((i) => row(i.name + " <span style='color:#8a857a'>(" + i.kind + ")</span>",
      (i.cost == null ? e.bands[i.costBand] + " Chai <span style=\"color:#8a857a\">(band)</span>" : i.cost + " Chai"))).join("");
  const earn = Object.entries(e.earn).map(([k, v]) => row(k, v + " Chai")).join("");
  const spend = Object.entries(e.alsoCosts).map(([k, v]) => row(k, v + " Chai")).join("");
  const box = (title, body) =>
    "<div style='flex:1;min-width:210px'><div style='font-size:11px;text-transform:uppercase;" +
    "letter-spacing:.06em;color:#6b6558;margin-bottom:4px'>" + title + "</div>" +
    "<table style='width:100%;border-collapse:collapse;font-size:12px'>" + body + "</table></div>";
  return "<div style='display:flex;gap:22px;flex-wrap:wrap;border-top:1px solid var(--line);" +
    "margin-top:6px;padding-top:12px'>" +
    box("The bands", bands) + box("On the rack now", stock) +
    box("A learner earns", earn) + box("Chai also buys", spend) + "</div>";
}

function fillShop() {
  if (!item) return;
  $("f-name").value = item.name ?? "";
  $("f-tagline").value = item.tagline ?? "";
  $("f-cost").value = item.cost == null ? "" : item.cost;
  $("f-band").value = item.costBand ?? "standard";
  $("f-shop").value = item.shop ?? "tailor";
  $("f-status").value = item.status ?? "draft";
  noteCost();
}
function noteCost() {
  const v = $("f-cost").value.trim();
  $("f-cost-note").textContent = v === ""
    ? "No price set, so this piece follows the shared " + $("f-band").value + " band and moves whenever that band is retuned."
    : v === "0"
      ? "Free. 0 is a real price, not 'unset'."
      : v + " Chai, set on this piece alone. It will NOT move when the band is retuned.";
}
$("f-cost").oninput = noteCost;
$("p-cost").oninput = () => { const n = $("p-cost").value.trim(); $("p-cost").title = n === "" ? "Blank means the band below" : n + " Chai"; };
$("f-band").onchange = noteCost;
$("f-cost-clear").onclick = () => { $("f-cost").value = ""; noteCost(); toast("price cleared, band will apply"); };
$("f-save").onclick = async () => {
  const meta = {
    name: $("f-name").value, tagline: $("f-tagline").value,
    cost: $("f-cost").value.trim() === "" ? null : Number($("f-cost").value),
    costBand: $("f-band").value, shop: $("f-shop").value, status: $("f-status").value,
  };
  const r = await (await fetch("/api/save", { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: item.id, meta }) })).json();
  if (r.error) { toast("NOT saved: " + r.error); log(r.error); return; }
  Object.assign(item, r.item);
  toast("shop details saved");
  log("saved to manifest.json\n" + JSON.stringify(r.item, null, 2));
  const opt = [...$("item").options].find((o) => o.value === item.id);
  if (opt) opt.textContent = item.name + " (" + item.kind + ")";
};

// ─── add a piece ────────────────────────────────────────────────────────────
let newPng = null;
$("n-file").onchange = () => {
  const f = $("n-file").files[0];
  if (!f) { newPng = null; $("n-preview").style.display = "none"; return; }
  const fr = new FileReader();
  fr.onload = () => {
    newPng = fr.result;
    $("n-preview").src = newPng;
    $("n-preview").style.display = "";
    toast("art loaded, " + Math.round(f.size / 1024) + " KB");
  };
  fr.readAsDataURL(f);
};
$("n-create").onclick = async () => {
  const id = $("n-id").value.trim(), kind = $("n-kind").value;
  if (!newPng) { toast("choose a PNG or JPEG first"); return; }
  if (!id) { toast("give it an id"); return; }
  toast("uploading...");
  const up = await (await fetch("/api/upload", { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, kind, png: newPng }) })).json();
  if (!up.ok) { toast("upload FAILED: " + up.error); log(up.error); return; }
  if (up.note) { toast(up.keyed ? "JPEG converted and keyed" : "JPEG converted, key FAILED"); log(up.note); }
  const body = {
    id, kind, art: up.art,
    name: $("n-name").value, tagline: $("n-tagline").value,
    cost: $("n-cost").value.trim() === "" ? null : Number($("n-cost").value),
  };
  const r = await (await fetch("/api/new-item", { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body) })).json();
  if (!r.ok) { toast("NOT added: " + r.error); log(r.error); return; }
  data.items.push(r.item);
  const opt = new Option(r.item.name + " (" + r.item.kind + ")", r.item.id);
  $("item").add(opt);
  $("item").value = r.item.id;
  await load(r.item.id);
  setMode("place");
  toast("added " + r.item.id + ", now place it");
  log("art  -> " + up.art + "\nitem -> manifest.json (status: draft)\n\n" +
      "Nothing reaches a learner until you Publish, and mobile needs a native build.");
};

/* LAST LOOK BEFORE PUSH (build 27, owner: "i want to set price and name and
   Tagline at the end before push"). Placement and shop copy are decided at
   different moments: you drag the art first and decide what to call it and
   what to charge once you can see it. So Publish stops here rather than
   shipping whatever the Add-a-piece form happened to hold. */
function confirmShopDetails() {
  return new Promise((resolve) => {
    const box = document.getElementById("prepublish");
    document.getElementById("p-name").value = item.name ?? "";
    document.getElementById("p-tagline").value = item.tagline ?? "";
    document.getElementById("p-cost").value = item.cost == null ? "" : item.cost;
    document.getElementById("p-band").value = item.costBand ?? "standard";
    document.getElementById("p-which").textContent = item.name + " (" + item.kind + ")";
    document.getElementById("pricing").innerHTML = pricingTable();
    box.style.display = "flex";
    const done = (go) => {
      box.style.display = "none";
      document.getElementById("p-go").onclick = null;
      document.getElementById("p-cancel").onclick = null;
      resolve(go);
    };
    document.getElementById("p-go").onclick = () => {
      // A BLANK TAGLINE IS A FAILING TEST, not a cosmetic gap: the shop renders
      // one under every name and outfits.test.ts asserts it. Caught here so it
      // costs a sentence now rather than a red suite later.
      if (!$("p-tagline").value.trim()) {
        toast("give it a tagline first, the shop shows one under the name");
        $("p-tagline").focus();
        return;
      }
      if (!$("p-name").value.trim()) { toast("give it a name first"); $("p-name").focus(); return; }
      done(true);
    };
    document.getElementById("p-cancel").onclick = () => { toast("publish cancelled"); done(false); };
  });
}

document.getElementById("publish").onclick = async () => {
  if (!(await confirmShopDetails())) return;
  const meta = {
    name: $("p-name").value,
    tagline: $("p-tagline").value,
    cost: $("p-cost").value.trim() === "" ? null : Number($("p-cost").value),
    costBand: $("p-band").value,
  };
  const saved = await (await fetch("/api/save", { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: item.id, meta }) })).json();
  if (saved.error) { toast("NOT published: " + saved.error); log(saved.error); return; }
  Object.assign(item, saved.item);
  const opt = [...$("item").options].find((o) => o.value === item.id);
  if (opt) opt.textContent = item.name + " (" + item.kind + ")";
  await save();
  toast("publishing...");
  log("rendering, installing into both apps, regenerating registries, checking, then pushing...");
  const r = await (await fetch("/api/publish", { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: item.id }) })).json();
  toast(!r.ok ? "publish FAILED" : r.pushed ? "published and pushed" : "installed, NOT pushed");
  log(r.log + "\n\n" + (!r.ok
    ? "nothing was installed"
    : r.pushed
      ? "PUSHED. One step left and it is not here: pull and republish the Repl, and web learners have it. Phones need a native build on top of that."
      : "INSTALLED BUT NOT PUSHED. The art is on this Mac only; see the log above for why the push did not happen."));
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
      // REDRAW THE PLACE TAB TOO. It used to update only the item's art and
      // the log, so the pose cards kept showing the art from before the erase
      // and the rub looked like it had not taken. The owner rubbed the back
      // off a beanie in build 27 and watched Place carry on drawing the old
      // one. (No backticks in this comment on purpose: the whole page is one
      // template literal, and a stray backtick ends it mid-string.)
      draw();
      drawEraser();
      toast("erase saved, poses redrawn");
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

/**
 * DELETE, WITH PRODUCTION ASKED FIRST.
 *
 * The server refuses a piece somebody has bought and says who; this turns that
 * refusal into a question rather than a dead end, because the owner's own test
 * accounts are the usual answer and that IS safe to delete over.
 */
document.getElementById("delete").onclick = async () => {
  const doomed = item.id;
  if (!confirm("Delete " + item.name + " from the shop?\n\nIts sprites come out of both apps and the change is pushed. The source art is kept.")) {
    toast("delete cancelled");
    return;
  }
  const post = (force) => fetch("/api/delete", { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: doomed, force }) }).then((x) => x.json());
  let r = await post(false);
  if (r.error === "purchased" || r.error === "unchecked") {
    log(r.detail);
    if (!confirm(r.detail + "\n\nDelete it anyway?")) { toast("delete cancelled"); return; }
    r = await post(true);
  }
  if (!r.ok) { toast("delete FAILED"); log(r.error || "unknown error"); return; }
  toast(r.pushed ? "deleted and pushed" : "deleted, NOT pushed");
  log(r.log);
  data.items = data.items.filter((i) => i.id !== doomed);
  const sel = $("item");
  [...sel.options].filter((o) => o.value === doomed).forEach((o) => o.remove());
  if (data.items.length) { sel.value = data.items[0].id; await load(data.items[0].id); }
  else { document.getElementById("place").innerHTML = "<p class=hint>The wardrobe is empty. Add a piece.</p>"; }
};
boot();
</script>`;

server.listen(PORT, () => {
  console.log(`wardrobe placement  →  http://localhost:${PORT}`);
  console.log("drag to move, sliders to size and turn, Erase to rub out her body");
});
