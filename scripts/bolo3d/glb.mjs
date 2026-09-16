// The smallest GLB reader and writer that the 3D tools need, with no
// dependencies, in the same spirit as ~/bolo3d-poc: the brief forbids Draco,
// meshopt and vendor extensions precisely so a file this plain can be read by
// something this plain.

import { readFileSync, writeFileSync } from 'node:fs';

const MAGIC = 0x46546c67; // "glTF"
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

/** Parse a .glb into its JSON document and its single BIN buffer. */
export function readGlb(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== MAGIC) throw new Error(`${path} is not a GLB`);
  let offset = 12;
  let json = null;
  let bin = Buffer.alloc(0);
  while (offset < buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const body = buf.subarray(offset + 8, offset + 8 + length);
    if (type === JSON_CHUNK) json = JSON.parse(body.toString('utf8'));
    else if (type === BIN_CHUNK) bin = Buffer.from(body);
    offset += 8 + length;
  }
  if (!json) throw new Error(`${path} has no JSON chunk`);
  return { json, bin, bytes: buf.length };
}

const pad4 = (n) => (4 - (n % 4)) % 4;

/** Write a JSON document and BIN buffer back out as a .glb. */
export function writeGlb(path, json, bin) {
  const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPadded = Buffer.concat([jsonBytes, Buffer.alloc(pad4(jsonBytes.length), 0x20)]);
  const binPadded = Buffer.concat([bin, Buffer.alloc(pad4(bin.length), 0)]);
  const total = 12 + 8 + jsonPadded.length + (binPadded.length ? 8 + binPadded.length : 0);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonPadded.length, 0);
  jsonHeader.writeUInt32LE(JSON_CHUNK, 4);
  const parts = [header, jsonHeader, jsonPadded];
  if (binPadded.length) {
    const binHeader = Buffer.alloc(8);
    binHeader.writeUInt32LE(binPadded.length, 0);
    binHeader.writeUInt32LE(BIN_CHUNK, 4);
    parts.push(binHeader, binPadded);
  }
  const out = Buffer.concat(parts);
  writeFileSync(path, out);
  return out.length;
}

/** The raw bytes a bufferView points at. */
export function viewBytes(json, bin, index) {
  const view = json.bufferViews[index];
  const start = view.byteOffset ?? 0;
  return bin.subarray(start, start + view.byteLength);
}

/**
 * Drop every accessor, bufferView, image, texture, sampler and material that
 * nothing reaches any more, and repack the BIN buffer so the bytes go too.
 * `replaceImage(index, bytes, mimeType)` lets a caller swap an image's bytes
 * (a downscale) in the same pass.
 */
export function prune(json, bin, { imageOverrides = new Map() } = {}) {
  const usedMaterials = new Set();
  const usedAccessors = new Set();
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives) {
      if (prim.material !== undefined) usedMaterials.add(prim.material);
      if (prim.indices !== undefined) usedAccessors.add(prim.indices);
      for (const a of Object.values(prim.attributes)) usedAccessors.add(a);
      for (const target of prim.targets ?? []) for (const a of Object.values(target)) usedAccessors.add(a);
    }
  }
  for (const skin of json.skins ?? []) {
    if (skin.inverseBindMatrices !== undefined) usedAccessors.add(skin.inverseBindMatrices);
  }
  for (const anim of json.animations ?? []) {
    for (const s of anim.samplers) {
      usedAccessors.add(s.input);
      usedAccessors.add(s.output);
    }
  }

  const textureRefs = (material) => {
    const refs = [];
    const pbr = material.pbrMetallicRoughness ?? {};
    for (const slot of [pbr.baseColorTexture, pbr.metallicRoughnessTexture, material.normalTexture, material.occlusionTexture, material.emissiveTexture]) {
      if (slot) refs.push(slot);
    }
    return refs;
  };
  const usedTextures = new Set();
  for (const m of usedMaterials) for (const ref of textureRefs(json.materials[m])) usedTextures.add(ref.index);
  const usedImages = new Set();
  const usedSamplers = new Set();
  for (const t of usedTextures) {
    const tex = json.textures[t];
    if (tex.source !== undefined) usedImages.add(tex.source);
    if (tex.sampler !== undefined) usedSamplers.add(tex.sampler);
  }

  const remap = (count, used) => {
    const map = new Map();
    let next = 0;
    for (let i = 0; i < count; i++) if (used.has(i)) map.set(i, next++);
    return map;
  };

  // REPACK PER ACCESSOR, NOT PER BUFFERVIEW. Sketchfab (and plenty of other
  // exporters) put every mesh's positions in ONE shared bufferView, with each
  // accessor at its own byteOffset inside it. Keeping the view because one
  // survivor points into it keeps every dropped mesh's bytes too: the duck came
  // out at 4.11 MB for 26,140 triangles that way. Each surviving accessor now
  // gets a bufferView holding only its own elements, de-interleaved.
  const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
  const chunks = [];
  const views = [];
  let cursor = 0;
  const pushView = (bytes, extra = {}) => {
    const padding = pad4(cursor);
    if (padding) {
      chunks.push(Buffer.alloc(padding));
      cursor += padding;
    }
    views.push({ buffer: 0, byteOffset: cursor, byteLength: bytes.length, ...extra });
    chunks.push(bytes);
    cursor += bytes.length;
    return views.length - 1;
  };

  const accessorView = new Map();
  for (let a = 0; a < json.accessors.length; a++) {
    if (!usedAccessors.has(a)) continue;
    const acc = json.accessors[a];
    if (acc.sparse) throw new Error(`accessor ${a} is sparse; prune() does not repack sparse accessors`);
    if (acc.bufferView === undefined) continue;
    const view = json.bufferViews[acc.bufferView];
    const elementBytes = COMPONENT_BYTES[acc.componentType] * TYPE_COMPONENTS[acc.type];
    const stride = view.byteStride ?? elementBytes;
    const start = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    const out = Buffer.alloc(acc.count * elementBytes);
    for (let e = 0; e < acc.count; e++) bin.copy(out, e * elementBytes, start + e * stride, start + e * stride + elementBytes);
    const extra = view.target !== undefined ? { target: view.target } : {};
    accessorView.set(a, pushView(out, extra));
  }

  const imageView = new Map();
  for (let i = 0; i < (json.images?.length ?? 0); i++) {
    if (!usedImages.has(i) || json.images[i].bufferView === undefined) continue;
    const override = imageOverrides.get(i);
    imageView.set(i, pushView(override ? override.bytes : Buffer.from(viewBytes(json, bin, json.images[i].bufferView))));
  }

  const accessorMap = remap(json.accessors.length, usedAccessors);
  const materialMap = remap(json.materials?.length ?? 0, usedMaterials);
  const textureMap = remap(json.textures?.length ?? 0, usedTextures);
  const imageMap = remap(json.images?.length ?? 0, usedImages);
  const samplerMap = remap(json.samplers?.length ?? 0, usedSamplers);

  const out = { ...json };
  out.bufferViews = views;
  out.buffers = [{ byteLength: cursor }];
  out.accessors = json.accessors
    .map((a, i) => [a, i])
    .filter(([, i]) => usedAccessors.has(i))
    .map(([a, i]) => {
      if (a.bufferView === undefined) return a;
      const { byteOffset, ...rest } = a;
      void byteOffset;
      return { ...rest, bufferView: accessorView.get(i) };
    });
  out.meshes = (json.meshes ?? []).map((mesh) => ({
    ...mesh,
    primitives: mesh.primitives.map((prim) => {
      const next = { ...prim, attributes: {} };
      for (const [k, a] of Object.entries(prim.attributes)) next.attributes[k] = accessorMap.get(a);
      if (prim.indices !== undefined) next.indices = accessorMap.get(prim.indices);
      if (prim.material !== undefined) next.material = materialMap.get(prim.material);
      if (prim.targets) {
        next.targets = prim.targets.map((t) => Object.fromEntries(Object.entries(t).map(([k, a]) => [k, accessorMap.get(a)])));
      }
      return next;
    }),
  }));
  out.skins = (json.skins ?? []).map((s) => (s.inverseBindMatrices !== undefined ? { ...s, inverseBindMatrices: accessorMap.get(s.inverseBindMatrices) } : s));
  if (json.animations) {
    out.animations = json.animations.map((anim) => ({
      ...anim,
      samplers: anim.samplers.map((s) => ({ ...s, input: accessorMap.get(s.input), output: accessorMap.get(s.output) })),
    }));
  }
  out.materials = (json.materials ?? [])
    .filter((_, i) => usedMaterials.has(i))
    .map((m) => {
      const next = JSON.parse(JSON.stringify(m));
      for (const ref of textureRefs(next)) ref.index = textureMap.get(ref.index);
      return next;
    });
  out.textures = (json.textures ?? [])
    .filter((_, i) => usedTextures.has(i))
    .map((t) => ({
      ...t,
      ...(t.source !== undefined ? { source: imageMap.get(t.source) } : {}),
      ...(t.sampler !== undefined ? { sampler: samplerMap.get(t.sampler) } : {}),
    }));
  out.images = (json.images ?? [])
    .map((im, i) => [im, i])
    .filter(([, i]) => usedImages.has(i))
    .map(([im, i]) => {
      const override = imageOverrides.get(i);
      const next = im.bufferView !== undefined ? { ...im, bufferView: imageView.get(i) } : { ...im };
      if (override) next.mimeType = override.mimeType;
      return next;
    });
  out.samplers = (json.samplers ?? []).filter((_, i) => usedSamplers.has(i));
  for (const key of ['materials', 'textures', 'images', 'samplers', 'animations', 'skins']) {
    if (Array.isArray(out[key]) && out[key].length === 0) delete out[key];
  }
  return { json: out, bin: Buffer.concat(chunks) };
}

/** Remove whole nodes (and their subtrees' references) and renumber the rest. */
export function removeNodes(json, doomed) {
  const keep = new Map();
  let next = 0;
  json.nodes.forEach((_, i) => {
    if (!doomed.has(i)) keep.set(i, next++);
  });
  const fix = (i) => keep.get(i);
  json.nodes = json.nodes
    .filter((_, i) => !doomed.has(i))
    .map((n) => (n.children ? { ...n, children: n.children.filter((c) => keep.has(c)).map(fix) } : n))
    .map((n) => (n.children && n.children.length === 0 ? (({ children, ...rest }) => rest)(n) : n));
  for (const scene of json.scenes ?? []) scene.nodes = scene.nodes.filter((c) => keep.has(c)).map(fix);
  for (const skin of json.skins ?? []) {
    skin.joints = skin.joints.map(fix);
    if (skin.skeleton !== undefined) skin.skeleton = fix(skin.skeleton);
  }
  for (const anim of json.animations ?? []) {
    anim.channels = anim.channels.filter((c) => c.target.node === undefined || keep.has(c.target.node));
    for (const c of anim.channels) if (c.target.node !== undefined) c.target.node = fix(c.target.node);
  }
  return json;
}

/** Triangle count over every triangle-list primitive in the file. */
export function triangleCount(json) {
  let tris = 0;
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives) {
      if ((prim.mode ?? 4) !== 4) continue;
      const count = prim.indices !== undefined ? json.accessors[prim.indices].count : json.accessors[prim.attributes.POSITION].count;
      tris += Math.floor(count / 3);
    }
  }
  return tris;
}
