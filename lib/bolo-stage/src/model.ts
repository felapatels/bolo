/**
 * Loading a character file and mapping it onto the contract.
 *
 * Everything the rest of the stage needs about a model is worked out here,
 * once, at rest: which bone plays each contract joint, where each joint really
 * pivots, where the sockets are, which clips and shape keys the file carries,
 * and whether the file passes the brief's machine-checkable sign-off.
 */

import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  CHILD_SLOTS,
  CONTRACT_BONES,
  JOINT_SLOTS,
  SHAPE_KEYS,
  SOCKETS,
  auditGltf,
  isClipName,
  type ClipName,
  type ContractBone,
  type GltfDocument,
  type JointSlot,
  type RigProfile,
  type Socket,
  type SocketAnchor,
  type Turn,
} from '@workspace/bolo-character';

export type JointRig = {
  slot: JointSlot;
  bone: THREE.Object3D;
  nodeName: string;
  rest: { position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 };
  /** Rest matrices in model space (the space the file's scene sits in). */
  restWorld: THREE.Matrix4;
  parentRestWorldInverse: THREE.Matrix4;
  /** Where the joint turns, in model space. */
  pivot: THREE.Vector3;
  restTurn: Turn | null;
  /** Bones that turn with this joint about the same pivot (RigProfile.jointFollowers). */
  followers: JointRig[];
};

/** The contract joint that moves a bone: its nearest mapped ancestor, or itself. */
export function slotOfBone(model: LoadedModel, bone: THREE.Object3D | null): JointSlot | null {
  for (let node: THREE.Object3D | null = bone; node; node = node.parent) {
    const slot = model.boneSlots.get(node);
    if (slot) return slot;
  }
  return null;
}

export type SocketRig = {
  name: Socket;
  object: THREE.Object3D;
  source: 'file' | 'derived';
  /** Size of the body region the socket sits on, in model units. */
  regionSize: THREE.Vector3;
  /** Where the socket sits at rest, in model space. */
  anchor: THREE.Vector3;
};

export type LoadedModel = {
  gltf: GLTF;
  /** Scales and centres the file: feet at 0, crown at 1, centred on x and z. */
  normalizer: THREE.Group;
  /** File units per character height. */
  unit: number;
  joints: Map<JointSlot, JointRig>;
  /** Mapped joint bones and their followers, for reading a touch. */
  boneSlots: Map<THREE.Object3D, JointSlot>;
  sockets: Map<Socket, SocketRig>;
  morphs: Map<string, { mesh: THREE.Mesh; index: number }[]>;
  clips: Map<ClipName, THREE.AnimationClip>;
  /**
   * The head's bounds in character space (feet at 0, crown at 1), for the
   * close-up framing. Measured, because proportions differ wildly: Bolo's head
   * is a third of her, the duck's is an eighth on top of a long neck.
   */
  headBox: THREE.Box3 | null;
  /**
   * The outline of the neck near its base, in model space: where a collar,
   * scarf or necklace has to sit to go AROUND her rather than float in front.
   * Measured from the Neck joint's own vertices. Null without a Neck joint.
   */
  neckRing: { center: THREE.Vector3; axis: THREE.Vector3; points: THREE.Vector3[]; radius: number } | null;
  /**
   * The tip of her beak, riding the Head joint: where something she catches or
   * carries is held (the gift moment's cowrie; the feeding game banked
   * 2026-09-16 needs the same point). Measured as the most forward part of the
   * head and a hinged jaw, so it is the duck's bill today and Bolo's tomorrow.
   * `anchor` is in model space at rest. Null without a Head joint.
   */
  beak: { object: THREE.Object3D; anchor: THREE.Vector3 } | null;
  triangles: number;
  bytes: number;
  audit: ReturnType<typeof auditGltf>;
};

/**
 * XHR, not fetch. On the phone the model is a file:// URL next to the page,
 * and neither WebKit's nor Android WebView's fetch() will read file:// at all,
 * while XHR will once the WebView allows file access.
 */
export function loadBytes(url: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = () => {
      // status 0 is what a file:// read reports on success
      if ((xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)) && xhr.response) resolve(xhr.response as ArrayBuffer);
      else reject(new Error(`model request failed: ${xhr.status} ${url}`));
    };
    xhr.onerror = () => reject(new Error(`model request failed: ${url}`));
    xhr.send();
  });
}

export async function loadModel(url: string, profile: RigProfile): Promise<LoadedModel> {
  const bytes = await loadBytes(url);
  const gltf = await new GLTFLoader().parseAsync(bytes, '');
  const doc = gltf.parser.json as GltfDocument;

  const normalizer = new THREE.Group();
  normalizer.name = 'normalizer';
  normalizer.add(gltf.scene);

  // The loader sanitises node names ("Bone.009" becomes "Bone009"). Profiles
  // are written against the FILE's names, so map back through its own record
  // of which node made which object.
  const byFileName = new Map<string, THREE.Object3D>();
  gltf.scene.traverse((object) => {
    const association = gltf.parser.associations.get(object);
    const index = association?.nodes;
    if (index === undefined) return;
    const name = doc.nodes?.[index]?.name;
    if (name && !byFileName.has(name)) byFileName.set(name, object);
  });

  const meshes: THREE.Mesh[] = [];
  gltf.scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      const mesh = o as THREE.Mesh;
      mesh.frustumCulled = false; // skinned bounds do not follow the pose
      meshes.push(mesh);
    }
  });

  // ---- normalise: feet on the floor, one unit tall, centred ----------------
  gltf.scene.updateMatrixWorld(true);
  const box = new THREE.Box3();
  for (const mesh of meshes) box.expandByObject(mesh, true);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const unit = size.y || 1;
  normalizer.scale.setScalar(1 / unit);
  normalizer.position.set(-center.x / unit, -box.min.y / unit, -center.z / unit);
  normalizer.updateMatrixWorld(true);

  // Model space is the normaliser's local space: the file's own units, which is
  // where the skin data lives. Everything below is measured there.
  const toModel = new THREE.Matrix4().copy(normalizer.matrixWorld).invert();
  const worldInModel = (o: THREE.Object3D) => new THREE.Matrix4().multiplyMatrices(toModel, o.matrixWorld);

  // ---- joints ---------------------------------------------------------------
  const joints = new Map<JointSlot, JointRig>();
  const resolve = (slot: JointSlot): { object: THREE.Object3D; name: string } | null => {
    const mapped = profile.joints?.[slot];
    if (mapped) {
      const object = byFileName.get(mapped);
      return object ? { object, name: mapped } : null;
    }
    if ((CONTRACT_BONES as readonly string[]).includes(slot)) {
      const object = byFileName.get(slot);
      return object ? { object, name: slot } : null;
    }
    const parentSlot = CHILD_SLOTS[slot] as ContractBone | undefined;
    if (!parentSlot) return null;
    const parent = byFileName.get(parentSlot);
    const child = parent?.children.find((c) => (c as THREE.Bone).isBone);
    if (!child) return null;
    const entry = [...byFileName.entries()].find(([, o]) => o === child);
    return { object: child, name: entry?.[0] ?? child.name };
  };

  const makeRig = (slot: JointSlot, bone: THREE.Object3D, nodeName: string): JointRig => {
    const parentWorld = bone.parent ? worldInModel(bone.parent) : new THREE.Matrix4();
    const restWorld = worldInModel(bone);
    return {
      slot,
      bone,
      nodeName,
      rest: { position: bone.position.clone(), quaternion: bone.quaternion.clone(), scale: bone.scale.clone() },
      restWorld,
      parentRestWorldInverse: parentWorld.clone().invert(),
      pivot: new THREE.Vector3().setFromMatrixPosition(restWorld),
      restTurn: profile.restPose?.[slot] ?? null,
      followers: [],
    };
  };
  for (const slot of JOINT_SLOTS) {
    const found = resolve(slot);
    if (found) joints.set(slot, makeRig(slot, found.object, found.name));
  }

  // ---- skin analysis: pivots and body regions --------------------------------
  const skinned = meshes.filter((m) => (m as THREE.SkinnedMesh).isSkinnedMesh) as THREE.SkinnedMesh[];
  const subtreeOf = (root: THREE.Object3D) => {
    const set = new Set<THREE.Object3D>();
    root.traverse((o) => set.add(o));
    return set;
  };

  // Skin every vertex ONCE, at rest, into model space. The per-joint passes
  // below then only re-read weights; re-skinning per joint was ~220,000
  // transforms for the duck, which is nothing on a Mac and real time on a phone.
  const skinCache = skinned.map((mesh) => {
    const count = mesh.geometry.getAttribute('position').count;
    const positions = new Float32Array(count * 3);
    const toModelFromMesh = new THREE.Matrix4().multiplyMatrices(toModel, mesh.matrixWorld);
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      mesh.getVertexPosition(i, v).applyMatrix4(toModelFromMesh);
      positions.set([v.x, v.y, v.z], i * 3);
    }
    return {
      mesh,
      count,
      positions,
      skinIndex: mesh.geometry.getAttribute('skinIndex'),
      skinWeight: mesh.geometry.getAttribute('skinWeight'),
    };
  });

  type Sample = { position: THREE.Vector3; share: number };
  const sampleJoint = (rig: JointRig, exclude: THREE.Object3D[] = []): Sample[] => {
    const inside = subtreeOf(rig.bone);
    for (const e of exclude) for (const o of subtreeOf(e)) inside.delete(o);
    const out: Sample[] = [];
    for (const { mesh, count, positions, skinIndex, skinWeight } of skinCache) {
      const insideIndex = mesh.skeleton.bones.map((b) => inside.has(b));
      for (let i = 0; i < count; i++) {
        let share = 0;
        let total = 0;
        for (let k = 0; k < 4; k++) {
          const w = skinWeight.getComponent(i, k);
          total += w;
          if (insideIndex[skinIndex.getComponent(i, k)]) share += w;
        }
        if (total > 0) share /= total;
        if (share <= 0) continue;
        out.push({ position: new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]), share });
      }
    }
    return out;
  };

  if (profile.pivots === 'skin') {
    for (const rig of joints.values()) {
      // A joint turns where its skin hands over to its parent's: the vertices
      // that are part it, part not. Weight each by how evenly it is shared.
      let weight = 0;
      const sum = new THREE.Vector3();
      for (const s of sampleJoint(rig)) {
        const mix = Math.min(s.share, 1 - s.share);
        if (mix < 0.15) continue;
        sum.addScaledVector(s.position, mix);
        weight += mix;
      }
      if (weight > 1e-3) rig.pivot.copy(sum.multiplyScalar(1 / weight));
    }
  }
  for (const [slot, pivot] of Object.entries(profile.pivotOverrides ?? {})) {
    const rig = joints.get(slot as JointSlot);
    if (rig && pivot) rig.pivot.set(pivot[0], pivot[1], pivot[2]);
  }
  for (const [slot, names] of Object.entries(profile.jointFollowers ?? {})) {
    const lead = joints.get(slot as JointSlot);
    if (!lead) continue;
    for (const name of names ?? []) {
      const bone = byFileName.get(name);
      if (!bone) continue;
      // Same pivot object, same rest correction: it is one joint in two bones.
      lead.followers.push({ ...makeRig(lead.slot, bone, name), pivot: lead.pivot, restTurn: lead.restTurn });
    }
  }

  // ---- sockets --------------------------------------------------------------
  const sockets = new Map<Socket, SocketRig>();
  const regionOf = (slot: JointSlot): Sample[] => {
    const rig = joints.get(slot);
    if (!rig) return [];
    // A joint's own region: what it moves, minus what its mapped children move.
    const children = [...joints.values()].filter((j) => j !== rig && subtreeOf(rig.bone).has(j.bone)).map((j) => j.bone);
    return sampleJoint(rig, children).filter((s) => s.share >= 0.5);
  };
  const regionBox = (samples: Sample[]) => {
    const b = new THREE.Box3();
    for (const s of samples) b.expandByPoint(s.position);
    return b;
  };
  const SOCKET_REGION: Record<Socket, JointSlot> = {
    attach_head: 'Head',
    attach_body: 'Spine',
    attach_wing_L: 'Wing_L',
    attach_wing_R: 'Wing_R',
  };

  const anchorPoint = (samples: Sample[], anchor: SocketAnchor): THREE.Vector3 => {
    const b = regionBox(samples);
    const c = b.getCenter(new THREE.Vector3());
    const h = b.max.y - b.min.y;
    let point: THREE.Vector3;
    if (anchor.at === 'top') {
      const crown = samples.filter((s) => s.position.y > b.max.y - h * 0.12);
      const cb = regionBox(crown);
      point = new THREE.Vector3((cb.min.x + cb.max.x) / 2, b.max.y, (cb.min.z + cb.max.z) / 2);
    } else if (anchor.at === 'front') {
      const chest = samples.filter((s) => s.position.y > b.min.y + h * 0.55 && s.position.y < b.min.y + h * 0.9);
      const front = chest.reduce((best, s) => (s.position.z > best.z ? s.position : best), new THREE.Vector3(c.x, c.y, -Infinity));
      point = new THREE.Vector3(c.x, front.y, front.z);
    } else {
      point = c;
    }
    if (anchor.offset) point.add(new THREE.Vector3(...anchor.offset).multiplyScalar(unit));
    return point;
  };

  for (const name of SOCKETS) {
    const regionSlot = SOCKET_REGION[name];
    const samples = regionOf(regionSlot);
    const regionSize = regionBox(samples).getSize(new THREE.Vector3());
    const fromFile = byFileName.get(name);
    if (fromFile) {
      sockets.set(name, { name, object: fromFile, source: 'file', regionSize, anchor: new THREE.Vector3().setFromMatrixPosition(worldInModel(fromFile)) });
      continue;
    }
    const anchor = profile.sockets?.[name];
    const host = anchor ? joints.get(anchor.joint) : undefined;
    if (!anchor || !host || !samples.length) continue;
    const hostSamples = anchor.joint === regionSlot ? samples : regionOf(anchor.joint);
    const point = anchorPoint(hostSamples, anchor);
    // Child of the joint, placed so that at rest it sits at the anchor with the
    // character's own axes: garments are authored facing +z, up +y.
    const object = new THREE.Object3D();
    object.name = name;
    const restWorldInverse = host.restWorld.clone().invert();
    const local = new THREE.Matrix4().multiplyMatrices(restWorldInverse, new THREE.Matrix4().makeTranslation(point.x, point.y, point.z));
    local.decompose(object.position, object.quaternion, object.scale);
    host.bone.add(object);
    sockets.set(name, { name, object, source: 'derived', regionSize, anchor: point.clone() });
  }

  const headSamples = regionOf('Head');
  const headBox = headSamples.length ? new THREE.Box3() : null;
  if (headBox) for (const s of headSamples) headBox.expandByPoint(s.position.clone().applyMatrix4(normalizer.matrix));

  // THE NECK'S OUTLINE, for anything worn around it. Owner, 2026-09-16, on the
  // first stand-in bandana (a flat triangle on the chest): "bandana doesn't
  // look right", "should wrap the neck". A hand-sized ring fits one bird; this
  // measures the neck it is given. Take the neck's own vertices in a thin
  // slice just above where it leaves the body, and for each
  // direction around the neck keep the outermost one.
  const neckRig = joints.get('Neck');
  const headRig = joints.get('Head');
  let neckRing: LoadedModel['neckRing'] = null;
  if (neckRig && headRig) {
    const along = new THREE.Vector3().subVectors(headRig.pivot, neckRig.pivot);
    const length = along.length();
    const axis = along.clone().normalize();
    const center = neckRig.pivot.clone().addScaledVector(axis, length * 0.1);
    const side = new THREE.Vector3(1, 0, 0).addScaledVector(axis, -axis.x).normalize();
    const front = new THREE.Vector3().crossVectors(side, axis).normalize();
    const BUCKETS = 32;
    const outer = new Array<number>(BUCKETS).fill(0);
    const offset = new THREE.Vector3();
    for (const s of regionOf('Neck')) {
      offset.subVectors(s.position, center);
      if (Math.abs(offset.dot(axis)) > length * 0.07) continue;
      const u = offset.dot(side);
      const v = offset.dot(front);
      const bucket = Math.floor(((Math.atan2(v, u) + Math.PI) / (Math.PI * 2)) * BUCKETS) % BUCKETS;
      outer[bucket] = Math.max(outer[bucket], Math.hypot(u, v));
    }
    const found = outer.filter((r) => r > 0);
    if (found.length >= BUCKETS / 3) {
      // Fill directions the slice missed from their nearest measured neighbours.
      for (let i = 0; i < BUCKETS; i++) {
        if (outer[i] > 0) continue;
        let before = 1;
        let after = 1;
        while (outer[(i - before + BUCKETS) % BUCKETS] === 0) before++;
        while (outer[(i + after) % BUCKETS] === 0) after++;
        const a = outer[(i - before + BUCKETS) % BUCKETS];
        const b = outer[(i + after) % BUCKETS];
        outer[i] = a + ((b - a) * before) / (before + after);
      }
      const points = outer.map((r, i) => {
        const angle = ((i + 0.5) / BUCKETS) * Math.PI * 2 - Math.PI;
        return center.clone().addScaledVector(side, Math.cos(angle) * r).addScaledVector(front, Math.sin(angle) * r);
      });
      neckRing = { center, axis, points, radius: found.reduce((a, b) => a + b, 0) / found.length };
    }
  }

  // THE BEAK TIP. The front of the head region (and of a hinged jaw, whose
  // lower bill is a separate region), averaged over the few most forward
  // vertices so it lands between the mandibles rather than on one of them.
  let beak: LoadedModel['beak'] = null;
  if (headRig) {
    const billSamples = [...headSamples, ...(joints.has('Jaw') ? regionOf('Jaw') : [])];
    const front = billSamples.reduce((best, s) => Math.max(best, s.position.z), -Infinity);
    const tip = billSamples.filter((s) => s.position.z > front - unit * 0.02);
    if (tip.length) {
      const anchor = tip.reduce((sum, s) => sum.add(s.position), new THREE.Vector3()).multiplyScalar(1 / tip.length);
      const object = new THREE.Object3D();
      object.name = 'beak';
      const local = new THREE.Matrix4().multiplyMatrices(headRig.restWorld.clone().invert(), new THREE.Matrix4().makeTranslation(anchor.x, anchor.y, anchor.z));
      local.decompose(object.position, object.quaternion, object.scale);
      headRig.bone.add(object);
      beak = { object, anchor };
    }
  }

  // ---- shape keys and clips -------------------------------------------------
  const morphs = new Map<string, { mesh: THREE.Mesh; index: number }[]>();
  for (const mesh of meshes) {
    const dictionary = mesh.morphTargetDictionary;
    if (!dictionary) continue;
    for (const [name, index] of Object.entries(dictionary)) {
      if (!morphs.has(name)) morphs.set(name, []);
      morphs.get(name)!.push({ mesh, index });
    }
  }
  const clips = new Map<ClipName, THREE.AnimationClip>();
  for (const clip of gltf.animations) if (isClipName(clip.name)) clips.set(clip.name, clip);

  return {
    gltf,
    normalizer,
    unit,
    joints,
    boneSlots: new Map([...joints.values()].flatMap((rig) => [rig, ...rig.followers].map((part) => [part.bone, rig.slot] as const))),
    sockets,
    morphs,
    clips,
    headBox,
    neckRing,
    beak,
    triangles: auditGltf(doc).triangles,
    bytes: bytes.byteLength,
    audit: auditGltf(doc, bytes.byteLength),
  };
}

export const hasShapeKeys = (model: LoadedModel) => SHAPE_KEYS.some((k) => model.morphs.has(k));
