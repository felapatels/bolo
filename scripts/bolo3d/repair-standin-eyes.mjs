#!/usr/bin/env node
// A REPAIR FOR THE DUCK STAND-IN, AND NOTHING ELSE. Delete with the stand-in.
//
// Sketchfab's export of "Ducky the duck" binds the eyeball mesh with the wrong
// transform: both eyeballs render three times too large, fused together, and
// floating ABOVE the head, while the head's texture carries two painted eye
// rings with nothing in them. Shown to the owner as-is, the first thing anyone
// would conclude is that the 3D runtime is broken.
//
// The repair is measured, not eyeballed. For each painted ring (its UV centre
// and radius read off the colour texture), find the triangle of the body mesh
// whose UVs contain that point, interpolate its rendered position and normal,
// and convert the ring's radius from texels to scene units with the same
// triangle. Each eyeball is then scaled and moved so it sits in its ring, a
// little under half buried. Vertices are written back through the inverse of
// their own skin matrix, so the eyes stay bound to the head bone exactly as
// before.
//
//   node scripts/bolo3d/repair-standin-eyes.mjs <in.glb> <out.glb>

import { readGlb, writeGlb } from './glb.mjs';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: repair-standin-eyes.mjs <in.glb> <out.glb>');
  process.exit(2);
}

// Read off the 1024px colour map: ring centre in UV, ring radius in UV units.
const RINGS = [
  { uv: [0.160, 0.693], radius: 15 / 1024 },
  { uv: [0.5645, 0.8032], radius: 15 / 1024 },
];
const EYEBALL_TO_RING = 1.15; // the ball slightly overfills the painted ring
const BURIED = 0.45; // fraction of the radius sunk into the head

const { json, bin } = readGlb(input);

// ---- column-major 4x4 matrices -------------------------------------------
const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const mul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
const fromTRS = (t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) => {
  const [x, y, z, w] = q;
  return [
    (1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0,
    2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0,
    2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
};
const invert = (m) => {
  const inv = new Array(16);
  inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
  inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
  inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
  inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
  inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
  inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
  inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
  inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
  inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
  inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
  inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
  inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
  inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
  inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
  inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
  inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
  const det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
  if (Math.abs(det) < 1e-12) throw new Error('singular skin matrix');
  return inv.map((v) => v / det);
};
const point = (m, [x, y, z]) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
const dir = (m, [x, y, z]) => [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => scale(a, 1 / (len(a) || 1));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// ---- scene graph ------------------------------------------------------------
const parent = new Map();
json.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)));
const worldCache = new Map();
const world = (i) => {
  if (worldCache.has(i)) return worldCache.get(i);
  const n = json.nodes[i];
  const local = n.matrix ? [...n.matrix] : fromTRS(n.translation, n.rotation, n.scale);
  const m = parent.has(i) ? mul(world(parent.get(i)), local) : local;
  worldCache.set(i, m);
  return m;
};

// ---- accessors ----------------------------------------------------------------
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const ARRAYS = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const accessor = (i) => {
  const a = json.accessors[i];
  const view = json.bufferViews[a.bufferView];
  const Arr = ARRAYS[a.componentType];
  const n = COMPONENTS[a.type];
  const start = bin.byteOffset + (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
  if (view.byteStride && view.byteStride !== n * Arr.BYTES_PER_ELEMENT) throw new Error('interleaved accessor; run prepare-standin.mjs first');
  const data = new Arr(bin.buffer.slice(start, start + a.count * n * Arr.BYTES_PER_ELEMENT));
  return { a, n, data, at: (k) => Array.from(data.subarray(k * n, k * n + n)), writeStart: start - bin.byteOffset };
};

const skin = json.skins[0];
const ibm = accessor(skin.inverseBindMatrices);
const jointMats = skin.joints.map((node, j) => mul(world(node), ibm.at(j)));
const skinMatrix = (joints, weights) => {
  const m = new Array(16).fill(0);
  for (let k = 0; k < 4; k++) {
    if (!weights[k]) continue;
    const jm = jointMats[joints[k]];
    for (let e = 0; e < 16; e++) m[e] += weights[k] * jm[e];
  }
  return m;
};

const meshByName = (name) => {
  const mesh = json.meshes.find((m) => m.name === name);
  if (!mesh) throw new Error(`no mesh named ${name}`);
  return mesh.primitives[0];
};

// ---- where each painted ring lands on the head ---------------------------------
const body = meshByName('MAIN');
const bPos = accessor(body.attributes.POSITION);
const bUv = accessor(body.attributes.TEXCOORD_0);
const bJ = accessor(body.attributes.JOINTS_0);
const bW = accessor(body.attributes.WEIGHTS_0);
const bIdx = accessor(body.indices);
const worldOf = (k) => point(skinMatrix(bJ.at(k), bW.at(k)), bPos.at(k));

const rings = RINGS.map((ring) => {
  const [pu, pv] = ring.uv;
  for (let t = 0; t < bIdx.data.length; t += 3) {
    const [i0, i1, i2] = [bIdx.data[t], bIdx.data[t + 1], bIdx.data[t + 2]];
    const [u0, v0] = bUv.at(i0);
    const [u1, v1] = bUv.at(i1);
    const [u2, v2] = bUv.at(i2);
    const d = (v1 - v2) * (u0 - u2) + (u2 - u1) * (v0 - v2);
    if (Math.abs(d) < 1e-12) continue;
    const b0 = ((v1 - v2) * (pu - u2) + (u2 - u1) * (pv - v2)) / d;
    const b1 = ((v2 - v0) * (pu - u2) + (u0 - u2) * (pv - v2)) / d;
    const b2 = 1 - b0 - b1;
    if (b0 < -1e-6 || b1 < -1e-6 || b2 < -1e-6) continue;
    const [w0, w1, w2] = [worldOf(i0), worldOf(i1), worldOf(i2)];
    const centre = add(add(scale(w0, b0), scale(w1, b1)), scale(w2, b2));
    const worldArea = len(cross(sub(w1, w0), sub(w2, w0))) / 2;
    const uvArea = Math.abs((u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0)) / 2;
    const unitsPerUv = Math.sqrt(worldArea / uvArea);
    const normal = norm(cross(sub(w1, w0), sub(w2, w0)));
    return { centre, normal, radius: ring.radius * unitsPerUv };
  }
  throw new Error(`no body triangle carries UV ${ring.uv}`);
});

// THE HEAD IS NOT CENTRED ON x = 0 in this file (it sits about 0.1 to one
// side), so "which side" is measured from the midpoint between the two rings,
// never from the origin. Pairing by sign of x put one eyeball on the centre
// line the first time this ran.
const midX = (rings[0].centre[0] + rings[1].centre[0]) / 2;
for (const ring of rings) {
  const outward = ring.centre[0] - midX;
  if (ring.normal[0] * outward < 0) ring.normal = scale(ring.normal, -1);
}
rings.sort((a, b) => a.centre[0] - b.centre[0]);
console.log(`rings: ${rings.map((r) => `${r.centre.map((v) => v.toFixed(3))} r ${r.radius.toFixed(3)}`).join(' | ')}`);

// ---- move each eyeball into the ring on its own side ------------------------------
const eye = meshByName('EYE');
const ePos = accessor(eye.attributes.POSITION);
const eJ = accessor(eye.attributes.JOINTS_0);
const eW = accessor(eye.attributes.WEIGHTS_0);
const count = ePos.a.count;

// Split the two balls by RAW x, which is symmetric about zero in this file,
// then pair them with the rings by rendered x order, lowest with lowest.
const sides = [[], []];
for (let k = 0; k < count; k++) sides[ePos.at(k)[0] >= 0 ? 0 : 1].push(k);
const out = new Float32Array(ePos.data);

const balls = sides.map((verts) => {
  const mats = verts.map((k) => skinMatrix(eJ.at(k), eW.at(k)));
  const worlds = verts.map((k, i) => point(mats[i], ePos.at(k)));
  const centre = scale(worlds.reduce(add, [0, 0, 0]), 1 / worlds.length);
  const radius = worlds.reduce((s, w) => s + len(sub(w, centre)), 0) / worlds.length;
  return { verts, mats, worlds, centre, radius };
});
balls.sort((a, b) => a.centre[0] - b.centre[0]);

for (const [index, { verts, mats, worlds, centre, radius }] of balls.entries()) {
  const ring = rings[index];
  const newRadius = ring.radius * EYEBALL_TO_RING;
  const newCentre = sub(ring.centre, scale(ring.normal, newRadius * BURIED));
  const factor = newRadius / radius;
  verts.forEach((k, i) => {
    const target = add(newCentre, scale(sub(worlds[i], centre), factor));
    const local = point(invert(mats[i]), target);
    out.set(local, k * 3);
  });
  console.log(
    `eye x${centre[0] >= 0 ? '+' : '-'}: centre ${centre.map((v) => v.toFixed(3))} r ${radius.toFixed(3)} -> ` +
      `${newCentre.map((v) => v.toFixed(3))} r ${newRadius.toFixed(3)}`,
  );
}

Buffer.from(out.buffer).copy(bin, ePos.writeStart);
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
for (let k = 0; k < count; k++) for (let c = 0; c < 3; c++) {
  min[c] = Math.min(min[c], out[k * 3 + c]);
  max[c] = Math.max(max[c], out[k * 3 + c]);
}
ePos.a.min = min;
ePos.a.max = max;
json.asset.extras.bolo3d = { ...(json.asset.extras.bolo3d ?? {}), eyesRepaired: 'scripts/bolo3d/repair-standin-eyes.mjs' };
writeGlb(output, json, bin);
console.log(`wrote ${output}`);
