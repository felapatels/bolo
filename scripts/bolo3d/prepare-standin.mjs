#!/usr/bin/env node
// Turn a downloaded rigged model into a stand-in the phone can afford.
//
// WHY THIS EXISTS. The owner asked (2026-09-16) for the 3D Bolo runtime to be
// built BEFORE the designer's bird lands, against a stand-in, so the app is
// ready to take Bolo the day she arrives. The stand-in he supplied is Sketchfab's
// "Ducky the duck" (BlueMesh, CC-BY-4.0): 11.2 MB, three 4096x4096 maps, and a
// static fuzz shell that no bone moves. Shipped as downloaded it would blow the
// brief's own budget (4 MB, 50,000 triangles) by a factor of three, and the
// shell would hang in the air while the body under it moved.
//
// So this does exactly what the brief asks of the designer, to a file that
// did not come from one: drop what cannot deform, drop the metal-roughness map
// that does not earn its bytes, and bring the maps down to a size a phone GPU
// holds comfortably. It is not specific to the duck; every choice is a flag.
//
//   node scripts/bolo3d/prepare-standin.mjs \
//     --in ~/Downloads/ducky_the_duck.glb \
//     --out artifacts/bolo-mobile/assets/bolo3d/standin-ducky.glb \
//     --drop-node Mesh --max-texture 1024
//
// ImageMagick does the resizing, as it already does for the wardrobe scripts.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { prune, readGlb, removeNodes, triangleCount, viewBytes, writeGlb } from './glb.mjs';

const { values: args } = parseArgs({
  options: {
    in: { type: 'string' },
    out: { type: 'string' },
    'drop-node': { type: 'string', multiple: true, default: [] },
    'max-texture': { type: 'string', default: '1024' },
    'keep-metal-rough': { type: 'boolean', default: false },
    'keep-tangents': { type: 'boolean', default: false },
    'jpeg-quality': { type: 'string', default: '88' },
  },
});
if (!args.in || !args.out) {
  console.error('usage: prepare-standin.mjs --in <file.glb> --out <file.glb> [--drop-node <name>]... [--max-texture 1024]');
  process.exit(2);
}

const { json, bin, bytes: bytesIn } = readGlb(args.in);
const trisIn = triangleCount(json);

// 1. Drop whole subtrees by node name, and the meshes only they used.
const doomed = new Set();
const byName = new Map(json.nodes.map((n, i) => [n.name, i]));
const collect = (i) => {
  doomed.add(i);
  for (const c of json.nodes[i].children ?? []) collect(c);
};
for (const name of args['drop-node']) {
  const i = byName.get(name);
  if (i === undefined) throw new Error(`--drop-node ${name}: no node has that name`);
  collect(i);
}
removeNodes(json, doomed);
const usedMeshes = new Set(json.nodes.filter((n) => n.mesh !== undefined).map((n) => n.mesh));
const meshMap = new Map();
json.meshes = json.meshes.filter((_, i) => {
  if (!usedMeshes.has(i)) return false;
  meshMap.set(i, meshMap.size);
  return true;
});
for (const n of json.nodes) if (n.mesh !== undefined) n.mesh = meshMap.get(n.mesh);

// 2. Tangents: three.js derives them in the shader when a normal map has none,
//    and they are 16 bytes a vertex.
if (!args['keep-tangents']) {
  for (const mesh of json.meshes) for (const prim of mesh.primitives) delete prim.attributes.TANGENT;
}

// 3. The metal-roughness map. The brief: "No metallic-roughness map unless it
//    earns its bytes." A cartoon character under soft UI lighting does not.
if (!args['keep-metal-rough']) {
  for (const m of json.materials ?? []) {
    const pbr = m.pbrMetallicRoughness;
    if (!pbr) continue;
    delete pbr.metallicRoughnessTexture;
    pbr.metallicFactor = 0;
    pbr.roughnessFactor = 0.9;
  }
}

// 4. Downscale every image that survives. Base colour goes to JPEG (the
//    material is opaque, so there is no alpha to lose); a normal map stays PNG,
//    because JPEG blocking reads as dents under a light.
const max = Number(args['max-texture']);
const liveMaterials = new Set();
for (const mesh of json.meshes) for (const prim of mesh.primitives) if (prim.material !== undefined) liveMaterials.add(prim.material);
const liveImages = new Map(); // image index -> 'normal' | 'color'
for (const m of liveMaterials) {
  const material = json.materials[m];
  const color = material.pbrMetallicRoughness?.baseColorTexture;
  if (color) liveImages.set(json.textures[color.index].source, 'color');
  if (material.normalTexture) liveImages.set(json.textures[material.normalTexture.index].source, 'normal');
}
const work = mkdtempSync(join(tmpdir(), 'bolo3d-'));
const overrides = new Map();
try {
  for (const [i, role] of liveImages) {
    const image = json.images[i];
    if (image.bufferView === undefined) continue;
    const src = join(work, `in-${i}`);
    writeFileSync(src, viewBytes(json, bin, image.bufferView));
    const dst = join(work, `out-${i}.${role === 'normal' ? 'png' : 'jpg'}`);
    const cmd = [src, '-resize', `${max}x${max}>`];
    if (role === 'color') cmd.push('-background', 'white', '-alpha', 'remove', '-quality', args['jpeg-quality']);
    cmd.push(dst);
    execFileSync('magick', cmd);
    overrides.set(i, { bytes: readFileSync(dst), mimeType: role === 'normal' ? 'image/png' : 'image/jpeg' });
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

const packed = prune(json, bin, { imageOverrides: overrides });

packed.json.asset = {
  ...packed.json.asset,
  extras: {
    ...(packed.json.asset?.extras ?? {}),
    bolo3d: {
      standIn: true,
      note: 'A STAND-IN, NOT BOLO. Prepared by scripts/bolo3d/prepare-standin.mjs.',
      droppedNodes: args['drop-node'],
      maxTexture: max,
    },
  },
};

const bytesOut = writeGlb(args.out, packed.json, packed.bin);
const trisOut = triangleCount(packed.json);
const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
console.log(`in   ${mb(bytesIn)}  ${trisIn.toLocaleString()} triangles`);
console.log(`out  ${mb(bytesOut)}  ${trisOut.toLocaleString()} triangles  -> ${args.out}`);
for (const im of packed.json.images ?? []) {
  console.log(`     image ${im.mimeType} ${packed.json.bufferViews[im.bufferView].byteLength.toLocaleString()} bytes`);
}
