#!/usr/bin/env node
// Harvest the pilot calibration corpus from R2 into a manifest (STEP 4,
// post-session queue, Aug 2 2026, incl. the owner's harvest amendments).
//
// Reads every sidecar under pilot-clips/, assigns protocol labels, and writes
// qa/pilot-results/manifest.json (gitignored; references clips by R2 key, 
// recordings NEVER enter the repo, per the ratified storage rule).
//
// Label sources:
//   explicit, sidecar has captureMode:true; its `label` is authoritative.
//              Duplicates per (user, phrase, attemptOfFour) keep the LATER
//              timestamp; sidecars with discarded:true are excluded.
//   order   , pre-capture-mode clips only: group by (user, language, phrase),
//              sort by timestamp, map position -> label for EXACT quads:
//              ["native", "american_accent", "subtle_error", "wrong_attempt"]
//              Incomplete/oversize groups go to needsReview.
//
// Amendments applied (owner sheet, Aug 2):
//   - yahoo-dev clips before 2026-08-02T02:10:00Z -> discarded owner_warmup
//   - fumbled quads discarded: kruti818 hi "maaf kijiye";
//     pikaboyliam hi "dhanyavaad" AND "maaf kijiye"
//
// Container sniff: first 4 bytes per clip; EBML magic 1a45dfa3 = webm
// (mobile-web MediaRecorder bytes under .m4a keys), else m4a.

import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require_ = createRequire(
  path.resolve(fileURLToPath(import.meta.url), "../../artifacts/api-server/package.json"),
);
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require_("@aws-sdk/client-s3");

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
  console.error("Missing R2 env vars");
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  requestChecksumCalculation: "WHEN_REQUIRED",
});
const Bucket = R2_BUCKET_NAME;

const ORDER_LABELS = ["native", "american_accent", "subtle_error", "wrong_attempt"];
const OWNER_WARMUP_USER = "user_3HBsumTkU4xtAYmMlH62DKnC5j9";
const OWNER_WARMUP_CUTOFF = "2026-08-02T02:10:00Z";
const TESTER_NAMES = {
  user_3H9XG2UWijYqRUXv6Ls0geMmX4Z: "owner",
  user_3HBsumTkU4xtAYmMlH62DKnC5j9: "owner-yahoo",
  user_3HL55BrHRZ4I4awBtW0b71hp9j9: "pikaboyliam",
  user_3HL5fvr9bkfBj29tZWAGv5KHOby: "lilrylan",
  user_3HL5XlUzTyT5USviDWu9XqEC7P1: "kruti818",
};

// Normalized-romanization matcher for the fumbled-quad discards.
function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
const FUMBLED_QUADS = [
  { userId: "user_3HL5XlUzTyT5USviDWu9XqEC7P1", lang: "hi", match: (r) => /maaf/.test(r) && /kij/.test(r) },
  { userId: "user_3HL55BrHRZ4I4awBtW0b71hp9j9", lang: "hi", match: (r) => /dhany?avaa?d/.test(r) },
  { userId: "user_3HL55BrHRZ4I4awBtW0b71hp9j9", lang: "hi", match: (r) => /maaf/.test(r) && /kij/.test(r) },
];

async function listAll(prefix) {
  const keys = [];
  let token;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken: token }),
    );
    for (const o of page.Contents ?? []) keys.push(o.Key);
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

async function getJson(key) {
  const res = await client.send(new GetObjectCommand({ Bucket, Key: key }));
  return JSON.parse(await res.Body.transformToString());
}

async function sniffContainer(key) {
  const res = await client.send(new GetObjectCommand({ Bucket, Key: key, Range: "bytes=0-11" }));
  const buf = Buffer.from(await res.Body.transformToByteArray());
  if (buf.length >= 4 && buf.readUInt32BE(0) === 0x1a45dfa3) return "webm";
  if (buf.length >= 12 && buf.toString("ascii", 4, 8) === "ftyp") return "m4a";
  return "unknown";
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    }),
  );
  return out;
}

const allKeys = await listAll("pilot-clips/");
const sidecarKeys = allKeys.filter((k) => k.endsWith(".json"));
const audioKeys = new Set(allKeys.filter((k) => !k.endsWith(".json")));

const records = (
  await mapLimit(sidecarKeys, 8, async (sidecarKey) => {
    const sc = await getJson(sidecarKey);
    const clipKey = sidecarKey.replace(/\.json$/, ".m4a");
    return { sidecarKey, clipKey, sc };
  })
).filter((r) => !String(r.sc.languageCode ?? "").startsWith("probe"));

const missingClips = [];
const discarded = [];
const labeled = [];
const needsReview = [];

const live = [];
for (const r of records) {
  if (!audioKeys.has(r.clipKey)) {
    missingClips.push({ sidecarKey: r.sidecarKey, clipKey: r.clipKey, userId: r.sc.userId });
    continue;
  }
  live.push(r);
}
// Audio objects with no sidecar are also unusable (no metadata).
const sidecarClipKeys = new Set(records.map((r) => r.clipKey));
for (const k of audioKeys) {
  if (k.startsWith("pilot-clips/probe")) continue;
  if (!sidecarClipKeys.has(k)) missingClips.push({ sidecarKey: null, clipKey: k, userId: null });
}

const explicit = live.filter((r) => r.sc.captureMode === true);
const preCapture = live.filter((r) => r.sc.captureMode !== true);

// ── Explicit-label clips ──
// 1. discarded:true sidecars (capture-mode redo) are excluded automatically.
const explicitActive = [];
for (const r of explicit) {
  if (r.sc.discarded === true) {
    discarded.push({ clipKey: r.clipKey, userId: r.sc.userId, languageCode: r.sc.languageCode, targetRomanized: r.sc.targetRomanized, reason: "capture_redo_discarded", timestamp: r.sc.timestamp });
  } else {
    explicitActive.push(r);
  }
}
// 2. duplicates per (user, phrase, attemptOfFour): keep the LATER timestamp.
const byQuadSlot = new Map();
for (const r of explicitActive) {
  const key = `${r.sc.userId}|${r.sc.languageCode}|${r.sc.phraseId ?? norm(r.sc.targetRomanized)}|${r.sc.attemptOfFour}`;
  const prev = byQuadSlot.get(key);
  if (!prev) byQuadSlot.set(key, r);
  else {
    const [older, newer] = prev.sc.timestamp <= r.sc.timestamp ? [prev, r] : [r, prev];
    byQuadSlot.set(key, newer);
    discarded.push({ clipKey: older.clipKey, userId: older.sc.userId, languageCode: older.sc.languageCode, targetRomanized: older.sc.targetRomanized, reason: "superseded_duplicate_slot", timestamp: older.sc.timestamp });
  }
}
for (const r of byQuadSlot.values()) {
  labeled.push({ ...toManifestClip(r), label: r.sc.label, source: "explicit", attemptOfFour: r.sc.attemptOfFour });
}

// ── Pre-capture-mode clips: amendments, then order reconstruction ──
const orderPool = [];
for (const r of preCapture) {
  if (r.sc.userId === OWNER_WARMUP_USER && r.sc.timestamp < OWNER_WARMUP_CUTOFF) {
    discarded.push({ clipKey: r.clipKey, userId: r.sc.userId, languageCode: r.sc.languageCode, targetRomanized: r.sc.targetRomanized, reason: "owner_warmup", timestamp: r.sc.timestamp });
    continue;
  }
  orderPool.push(r);
}

const groups = new Map();
for (const r of orderPool) {
  const key = `${r.sc.userId}|${r.sc.languageCode}|${r.sc.phraseId ?? norm(r.sc.targetRomanized)}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
}

for (const [key, members] of groups) {
  members.sort((a, b) => String(a.sc.timestamp).localeCompare(String(b.sc.timestamp)));
  const { userId, languageCode, targetRomanized } = members[0].sc;
  const romanNorm = norm(targetRomanized);
  const fumbled = FUMBLED_QUADS.some((f) => f.userId === userId && f.lang === languageCode && f.match(romanNorm));
  if (fumbled) {
    for (const r of members) {
      discarded.push({ clipKey: r.clipKey, userId, languageCode, targetRomanized, reason: "result_card_mis_tap_fumble", timestamp: r.sc.timestamp });
    }
    continue;
  }
  if (members.length === 4) {
    members.forEach((r, i) => {
      labeled.push({ ...toManifestClip(r), label: ORDER_LABELS[i], source: "order", attemptOfFour: i + 1 });
    });
  } else {
    needsReview.push({
      groupKey: key,
      userId,
      tester: TESTER_NAMES[userId] ?? userId,
      languageCode,
      targetRomanized,
      clipCount: members.length,
      clipKeys: members.map((r) => r.clipKey),
      timestamps: members.map((r) => r.sc.timestamp),
    });
  }
}

function toManifestClip(r) {
  const { sc } = r;
  return {
    clipKey: r.clipKey,
    sidecarKey: r.sidecarKey,
    userId: sc.userId,
    tester: TESTER_NAMES[sc.userId] ?? sc.userId,
    languageCode: sc.languageCode,
    phraseId: sc.phraseId,
    targetNative: sc.targetNative,
    targetRomanized: sc.targetRomanized,
    transcript: sc.transcript,
    score: sc.score,
    timestamp: sc.timestamp,
  };
}

// Container sniff on every labeled clip (matters to the calibration API call).
await mapLimit(labeled, 8, async (c) => {
  c.sniff = await sniffContainer(c.clipKey);
});

labeled.sort((a, b) => `${a.tester}|${a.languageCode}|${a.timestamp}`.localeCompare(`${b.tester}|${b.languageCode}|${b.timestamp}`));

const manifest = {
  generatedAt: new Date().toISOString(),
  bucketPrefix: "pilot-clips/",
  orderLabels: ORDER_LABELS,
  clips: labeled,
  needsReview,
  discarded,
  missingClips,
};

const outDir = path.resolve(fileURLToPath(import.meta.url), "../pilot-results");
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "manifest.json");
writeFileSync(outPath, JSON.stringify(manifest, null, 2));

// ── Summary ──
const bySource = { explicit: 0, order: 0 };
const quadCounts = new Map();
const sniffCounts = {};
for (const c of labeled) {
  bySource[c.source]++;
  const k = `${c.tester} / ${c.languageCode}`;
  if (!quadCounts.has(k)) quadCounts.set(k, new Set());
  quadCounts.get(k).add(`${c.userId}|${c.phraseId ?? norm(c.targetRomanized)}`);
  sniffCounts[c.sniff] = (sniffCounts[c.sniff] ?? 0) + 1;
}
console.log(`manifest: ${outPath}`);
console.log(`labeled clips: ${labeled.length} (explicit ${bySource.explicit}, order-reconstructed ${bySource.order})`);
console.log(`container sniff: ${JSON.stringify(sniffCounts)}`);
console.log(`quad groups per tester/language:`);
for (const [k, set] of [...quadCounts.entries()].sort()) console.log(`  ${k}: ${set.size} phrases (${[...set].length * 0 + [...set].length} groups)`);
console.log(`needsReview groups: ${needsReview.length}`);
for (const g of needsReview) console.log(`  ${g.tester} / ${g.languageCode} / ${g.targetRomanized}: ${g.clipCount} clips`);
const discardByReason = {};
for (const d of discarded) discardByReason[d.reason] = (discardByReason[d.reason] ?? 0) + 1;
console.log(`discarded: ${discarded.length} ${JSON.stringify(discardByReason)}`);
console.log(`missingClips: ${missingClips.length}`);
