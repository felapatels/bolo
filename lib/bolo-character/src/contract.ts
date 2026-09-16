/**
 * THE 3D BOLO CONTRACT: ~/bolo3d-poc/brief.html, written as code.
 *
 * The designer's rigged bird (commissioned September 2026) is built to that
 * brief, and everything in the apps that drives a 3D Bolo is built against
 * THESE names, never against whichever file happens to be loaded. That is what
 * lets the runtime be written before she arrives: a stand-in is mapped onto the
 * contract by a rig profile (see rig.ts), and on the day the real bolo.glb lands
 * the profile shrinks to nothing because her names already match.
 *
 * If the brief changes, this file changes with it, and the audit below is how a
 * delivered file is checked against it before anyone looks at it by eye.
 */

/** Bone names the brief requires, exactly as it spells them. */
export const CONTRACT_BONES = [
  'Root',
  'Spine',
  'Neck',
  'Head',
  'Crest',
  'Wing_L',
  'Wing_R',
  'Tail',
  'Leg_L',
  'Leg_R',
] as const;
export type ContractBone = (typeof CONTRACT_BONES)[number];

/**
 * The joints the runtime actually drives. The brief asks for "at least two
 * joints" per wing, "one or two" for crest and tail, and "legs and feet", but
 * only names the first joint of each. The second joint is resolved as the first
 * child joint of the named one (so `Wing_L` then its child), which works whether
 * the designer calls it `Wing_L.001`, `Wing_L_mid` or anything else.
 *
 * `Jaw` is NOT in the brief. It exists for stand-ins with a hinged beak and no
 * shape keys, so the face layer has something to open; the real Bolo opens her
 * beak with the `beakOpen` shape key and leaves `Jaw` unmapped.
 */
export const JOINT_SLOTS = [
  'Root',
  'Spine',
  'Neck',
  'Head',
  'Jaw',
  'Crest',
  'Crest_2',
  'Wing_L',
  'Wing_L_2',
  'Wing_R',
  'Wing_R_2',
  'Tail',
  'Tail_2',
  'Leg_L',
  'Foot_L',
  'Leg_R',
  'Foot_R',
] as const;
export type JointSlot = (typeof JOINT_SLOTS)[number];

/** Second joints and the contract bone whose first child they are. */
export const CHILD_SLOTS: Partial<Record<JointSlot, ContractBone>> = {
  Crest_2: 'Crest',
  Wing_L_2: 'Wing_L',
  Wing_R_2: 'Wing_R',
  Tail_2: 'Tail',
  Foot_L: 'Leg_L',
  Foot_R: 'Leg_R',
};

/** Blend shapes, named exactly. Six of them are the speech visemes. */
export const SHAPE_KEYS = [
  'beakOpen',
  'blink',
  'browUp',
  'browDown',
  'smile',
  'viseme_AA',
  'viseme_E',
  'viseme_I',
  'viseme_O',
  'viseme_U',
  'viseme_MBP',
] as const;
export type ShapeKey = (typeof SHAPE_KEYS)[number];

export const VISEME_KEYS = [
  'viseme_AA',
  'viseme_E',
  'viseme_I',
  'viseme_O',
  'viseme_U',
  'viseme_MBP',
] as const;
export type VisemeKey = (typeof VISEME_KEYS)[number];

/** Empty nodes the wardrobe hangs on. The garments are a separate commission. */
export const SOCKETS = ['attach_head', 'attach_body', 'attach_wing_L', 'attach_wing_R'] as const;
export type Socket = (typeof SOCKETS)[number];

export type ClipKind = 'loop' | 'oneshot';
export type ClipGroup = 'core' | 'parrot' | 'expression' | 'movement' | 'games';

export type ClipSpec = {
  name: string;
  kind: ClipKind;
  /** The brief's length. "3 to 4s" is recorded as its midpoint. */
  seconds: number;
  group: ClipGroup;
  /** The brief's own description, shortened. */
  purpose: string;
};

/**
 * The clip library, in the brief's order. FIFTY clips: an earlier plan quoted
 * 48, and the brief's five tables add up to 14 + 10 + 9 + 9 + 8. Counted from
 * the brief itself on 2026-09-16.
 */
export const CLIPS = [
  { name: 'idle', kind: 'loop', seconds: 3.5, group: 'core', purpose: 'Gentle breathing, slight weight shift. Plays constantly.' },
  { name: 'idle_look', kind: 'oneshot', seconds: 2, group: 'core', purpose: 'An occasional glance around, every 8 to 15 seconds.' },
  { name: 'idle_variant', kind: 'loop', seconds: 4, group: 'core', purpose: 'A second resting behaviour for long sessions.' },
  { name: 'wave', kind: 'oneshot', seconds: 2, group: 'core', purpose: 'Greeting. One wing up and waving.' },
  { name: 'cheer', kind: 'oneshot', seconds: 2, group: 'core', purpose: 'Both wings up, a small hop. Wins and streaks.' },
  { name: 'celebrate_big', kind: 'oneshot', seconds: 3, group: 'core', purpose: 'A larger cheer with a spin or a jump.' },
  { name: 'listen', kind: 'loop', seconds: 3, group: 'core', purpose: 'Head cocked, attentive. While the learner speaks.' },
  { name: 'think', kind: 'loop', seconds: 3, group: 'core', purpose: 'Slow head tilt and sway. Processing.' },
  { name: 'talk', kind: 'loop', seconds: 2, group: 'core', purpose: 'Body only: head bob and shoulders. Beak is visemes.' },
  { name: 'correct', kind: 'oneshot', seconds: 1.5, group: 'core', purpose: 'A quick pleased bounce, many times a session.' },
  { name: 'tryagain', kind: 'oneshot', seconds: 2, group: 'core', purpose: 'Encouraging, never scolding. A sympathetic lean.' },
  { name: 'point', kind: 'oneshot', seconds: 1.5, group: 'core', purpose: 'One wing extended toward something.' },
  { name: 'nod', kind: 'oneshot', seconds: 1, group: 'core', purpose: 'Yes.' },
  { name: 'shake_head', kind: 'oneshot', seconds: 1, group: 'core', purpose: 'No.' },

  { name: 'head_bob', kind: 'loop', seconds: 1.5, group: 'parrot', purpose: 'The rhythmic parrot bob. Doubles as a metronome.' },
  { name: 'head_tilt', kind: 'oneshot', seconds: 1.5, group: 'parrot', purpose: 'Sharp sideways cock of the head. Curiosity.' },
  { name: 'preen', kind: 'loop', seconds: 4, group: 'parrot', purpose: 'Grooming a wing with her beak.' },
  { name: 'ruffle', kind: 'oneshot', seconds: 1.5, group: 'parrot', purpose: 'A whole-body feather shake. Reset.' },
  { name: 'stretch', kind: 'oneshot', seconds: 2.5, group: 'parrot', purpose: 'One wing and one leg extended.' },
  { name: 'scratch', kind: 'oneshot', seconds: 2.5, group: 'parrot', purpose: 'Scratching her head with a foot. Confusion.' },
  { name: 'peck', kind: 'oneshot', seconds: 1, group: 'parrot', purpose: 'A quick downward peck. Selecting, tapping.' },
  { name: 'fluff', kind: 'oneshot', seconds: 2, group: 'parrot', purpose: 'Puffing up and settling. Content.' },
  { name: 'sleep', kind: 'loop', seconds: 4, group: 'parrot', purpose: 'Head tucked, slow breathing. Streak lost, empty state.' },
  { name: 'wake', kind: 'oneshot', seconds: 2, group: 'parrot', purpose: 'From sleep back to idle.' },

  { name: 'clap', kind: 'oneshot', seconds: 1.5, group: 'expression', purpose: 'Wing tips together. Applause.' },
  { name: 'shrug', kind: 'oneshot', seconds: 1.5, group: 'expression', purpose: 'Wings out, "I don\'t know".' },
  { name: 'surprised', kind: 'oneshot', seconds: 1.5, group: 'expression', purpose: 'Rear back, wings flare, crest up.' },
  { name: 'sad', kind: 'oneshot', seconds: 2, group: 'expression', purpose: 'Droop. Crest flattens, wings and head lower.' },
  { name: 'laugh', kind: 'loop', seconds: 2, group: 'expression', purpose: 'Whole-body shake with a head throw.' },
  { name: 'whisper', kind: 'loop', seconds: 2, group: 'expression', purpose: 'Leaning in, small movements. Hints.' },
  { name: 'sing', kind: 'loop', seconds: 2.5, group: 'expression', purpose: 'Head back, chest out, big open posture.' },
  { name: 'dance', kind: 'loop', seconds: 3, group: 'expression', purpose: 'Rhythmic bob and side-step.' },
  { name: 'show', kind: 'oneshot', seconds: 2, group: 'expression', purpose: 'Both wings sweep out to reveal something.' },

  { name: 'hop', kind: 'loop', seconds: 0.8, group: 'movement', purpose: 'Hopping on the spot.' },
  { name: 'turn_left', kind: 'oneshot', seconds: 1, group: 'movement', purpose: 'Ninety degrees on the spot.' },
  { name: 'turn_right', kind: 'oneshot', seconds: 1, group: 'movement', purpose: 'The same, mirrored.' },
  { name: 'takeoff', kind: 'oneshot', seconds: 1, group: 'movement', purpose: 'Crouch, push, wings open. Ends in hover.' },
  { name: 'hover', kind: 'loop', seconds: 0.6, group: 'movement', purpose: 'Flapping in place. The most useful flight clip.' },
  { name: 'fly_forward', kind: 'loop', seconds: 0.8, group: 'movement', purpose: 'Body pitched forward, full wing beats.' },
  { name: 'glide', kind: 'loop', seconds: 2, group: 'movement', purpose: 'Wings held out, small adjustments.' },
  { name: 'land', kind: 'oneshot', seconds: 1.2, group: 'movement', purpose: 'Flare, feet down, settle to idle.' },
  { name: 'perch', kind: 'loop', seconds: 3, group: 'movement', purpose: 'Idle while gripping a branch or a bar.' },

  { name: 'countdown', kind: 'oneshot', seconds: 3, group: 'games', purpose: 'Building anticipation, then a go.' },
  { name: 'win', kind: 'oneshot', seconds: 2.5, group: 'games', purpose: 'Theatrical. End of a game.' },
  { name: 'lose', kind: 'oneshot', seconds: 2.5, group: 'games', purpose: 'Deflating, but still kind.' },
  { name: 'carry', kind: 'loop', seconds: 2, group: 'games', purpose: 'Idle while holding something.' },
  { name: 'give', kind: 'oneshot', seconds: 1.5, group: 'games', purpose: 'Offering something forward.' },
  { name: 'eat', kind: 'oneshot', seconds: 2, group: 'games', purpose: 'Pecking and swallowing. Rewards.' },
  { name: 'think_hard', kind: 'loop', seconds: 3, group: 'games', purpose: 'A more effortful think, for timed questions.' },
  { name: 'encourage', kind: 'oneshot', seconds: 2, group: 'games', purpose: 'Beckoning the learner on. "Your turn."' },
] as const satisfies readonly ClipSpec[];

export type ClipName = (typeof CLIPS)[number]['name'];
export const CLIP_NAMES: readonly ClipName[] = CLIPS.map((c) => c.name);
export const clipSpec = (name: ClipName): ClipSpec => CLIPS.find((c) => c.name === name) as ClipSpec;
export const isClipName = (name: string): name is ClipName => (CLIP_NAMES as readonly string[]).includes(name);

/** The brief's technical specification. */
export const BUDGET = {
  maxTriangles: 50_000,
  maxBytes: 4 * 1024 * 1024,
  materials: 1,
  fps: 30,
} as const;

// ---------------------------------------------------------------------------
// THE AUDIT: the half of the brief's sign-off a script can check.
//
// The other half is a person looking at her beside mascot-wave.png, and no
// script replaces that: a rigged Bolo was built once before, in SVG, and killed
// on 2026-07-29 for not matching the canonical art. Passing this only means the
// file is worth looking at.
// ---------------------------------------------------------------------------

/** Just the parts of a glTF document the audit reads. */
export type GltfDocument = {
  extensionsUsed?: string[];
  extensionsRequired?: string[];
  nodes?: {
    name?: string;
    children?: number[];
    matrix?: number[];
    translation?: number[];
    rotation?: number[];
    scale?: number[];
    mesh?: number;
  }[];
  meshes?: {
    name?: string;
    extras?: { targetNames?: string[] };
    primitives: { mode?: number; indices?: number; attributes: Record<string, number>; targets?: unknown[] }[];
  }[];
  accessors?: { count: number }[];
  materials?: unknown[];
  skins?: { joints: number[] }[];
  animations?: { name?: string; channels: { target: { node?: number; path: string } }[] }[];
};

export type AuditStatus = 'pass' | 'fail' | 'warn';
export type AuditCheck = { id: string; label: string; status: AuditStatus; detail: string };
export type AuditReport = {
  checks: AuditCheck[];
  bones: { name: ContractBone; found: boolean }[];
  shapeKeys: { name: ShapeKey; found: boolean }[];
  sockets: { name: Socket; found: boolean }[];
  clips: { name: ClipName; found: boolean }[];
  extraClips: string[];
  triangles: number;
  bytes: number | null;
  /** Every check passed. Warnings do not block. */
  ok: boolean;
};

export function countTriangles(doc: GltfDocument): number {
  let tris = 0;
  for (const mesh of doc.meshes ?? []) {
    for (const prim of mesh.primitives) {
      if ((prim.mode ?? 4) !== 4) continue;
      const accessor = prim.indices !== undefined ? prim.indices : prim.attributes.POSITION;
      tris += Math.floor((doc.accessors?.[accessor]?.count ?? 0) / 3);
    }
  }
  return tris;
}

export function auditGltf(doc: GltfDocument, bytes: number | null = null): AuditReport {
  const nodes = doc.nodes ?? [];
  const names = new Set(nodes.map((n) => n.name ?? ''));
  const checks: AuditCheck[] = [];
  const check = (id: string, label: string, status: AuditStatus, detail: string) => checks.push({ id, label, status, detail });

  const extensions = [...new Set([...(doc.extensionsUsed ?? []), ...(doc.extensionsRequired ?? [])])];
  check('core-gltf', 'Core glTF only, no Draco, meshopt or vendor extensions', extensions.length ? 'fail' : 'pass', extensions.length ? extensions.join(', ') : 'none used');

  const triangles = countTriangles(doc);
  check('triangles', `Under ${BUDGET.maxTriangles.toLocaleString('en-US')} triangles`, triangles <= BUDGET.maxTriangles ? 'pass' : 'fail', triangles.toLocaleString('en-US'));

  if (bytes !== null) {
    check('bytes', 'Under 4 MB with textures', bytes <= BUDGET.maxBytes ? 'pass' : 'fail', `${(bytes / 1024 / 1024).toFixed(2)} MB`);
  }

  const materials = doc.materials?.length ?? 0;
  check('materials', 'One material', materials === BUDGET.materials ? 'pass' : 'warn', `${materials}`);

  // "Every node must carry its own transform." Two Tripo rigs came back with
  // none, and the rest pose could only be rebuilt with the joints at the floor.
  const joints = new Set((doc.skins ?? []).flatMap((s) => s.joints));
  const bare = [...joints].filter((j) => {
    const n = nodes[j];
    return !n || (!n.matrix && !n.translation && !n.rotation && !n.scale);
  });
  if (joints.size === 0) check('skinned', 'Rigged and skinned', 'fail', 'no skin in the file');
  else check('transforms', 'Every joint carries its own transform', bare.length === 0 ? 'pass' : 'fail', bare.length ? `${bare.length} of ${joints.size} joints carry none: bind pose not exported` : `${joints.size} joints`);

  const bones = CONTRACT_BONES.map((name) => ({ name, found: names.has(name) }));
  const missingBones = bones.filter((b) => !b.found).map((b) => b.name);
  check('bones', 'Bone names match the brief exactly', missingBones.length ? 'fail' : 'pass', missingBones.length ? `missing ${missingBones.join(', ')}` : 'all ten');

  const targetNames = new Set((doc.meshes ?? []).flatMap((m) => m.extras?.targetNames ?? []));
  const shapeKeys = SHAPE_KEYS.map((name) => ({ name, found: targetNames.has(name) }));
  const missingKeys = shapeKeys.filter((k) => !k.found).map((k) => k.name);
  check('shape-keys', 'All 11 blend shapes, named exactly', missingKeys.length ? 'fail' : 'pass', missingKeys.length ? `missing ${missingKeys.join(', ')}` : 'all eleven');

  const sockets = SOCKETS.map((name) => ({ name, found: names.has(name) }));
  const missingSockets = sockets.filter((s) => !s.found).map((s) => s.name);
  check('sockets', 'All four attachment nodes', missingSockets.length ? 'fail' : 'pass', missingSockets.length ? `missing ${missingSockets.join(', ')}` : 'all four');

  const animationNames = new Set((doc.animations ?? []).map((a) => a.name ?? ''));
  const clips = CLIPS.map((c) => ({ name: c.name, found: animationNames.has(c.name) }));
  const missingClips = clips.filter((c) => !c.found).map((c) => c.name);
  const extraClips = [...animationNames].filter((n) => !isClipName(n));
  check('clips', `All ${CLIPS.length} clips, named exactly`, missingClips.length ? 'fail' : 'pass', missingClips.length ? `${CLIPS.length - missingClips.length} of ${CLIPS.length} present` : `all ${CLIPS.length}`);
  if (extraClips.length) check('extra-clips', 'No clips outside the library', 'warn', extraClips.join(', '));

  // "In place, no root motion." A clip that translates Root moves her out of
  // the UI slot she is composited into.
  const rootIndex = nodes.findIndex((n) => n.name === 'Root');
  const drifting = (doc.animations ?? [])
    .filter((a) => a.channels.some((c) => c.target.node === rootIndex && c.target.path === 'translation'))
    .map((a) => a.name ?? '(unnamed)');
  if (rootIndex >= 0) check('root-motion', 'Every clip in place, no root motion', drifting.length ? 'fail' : 'pass', drifting.length ? drifting.join(', ') : 'none translate Root');

  return {
    checks,
    bones,
    shapeKeys,
    sockets,
    clips,
    extraClips,
    triangles,
    bytes,
    ok: checks.every((c) => c.status !== 'fail'),
  };
}
