/**
 * STAND-IN: "Ducky the duck" by BlueMesh, CC-BY-4.0, from Sketchfab.
 *
 * The owner supplied it on 2026-09-16 so the 3D runtime could be built and seen
 * before the designer's Bolo is delivered: "this is not BOLO, just a temporary
 * stand-in. but i want the apps to be ready to bring BOLO in when ready."
 *
 * Every joint below was identified by measuring which vertices it moves
 * (session of 2026-09-16), because the file names its 85 bones `Bone.001`
 * through `Bone.083`:
 *
 *   Bone.001            lower spine, carries everything above the hips
 *   Bone.006            base of the neck (the neck runs .006 to .008)
 *   Bone.009            head
 *   Bone.013            lower bill; Bone.010 chain is the upper bill
 *   Bone.039 / .045     wing on +x, which is HER LEFT (she faces +z)
 *   Bone.040 / .046     wing on -x
 *   Bone.062 / .068     leg and foot on +x
 *   Bone.063 / .069     leg and foot on -x
 *
 * There is no crest and no tail joint; the tail is weighted to the root. The
 * upper skeleton sits well above the mesh, hence `pivots: 'skin'`.
 *
 * The prepared file is artifacts/bolo-mobile/assets/bolo3d/standin-ducky.glb,
 * made by scripts/bolo3d/prepare-standin.mjs and repair-standin-eyes.mjs.
 */

import type { RigProfile } from '../rig';

export const STANDIN_DUCKY_RIG: RigProfile = {
  id: 'standin-ducky',
  label: 'Ducky (stand-in)',
  standIn: true,
  credit: {
    title: 'Ducky the duck',
    author: 'BlueMesh',
    license: 'CC-BY-4.0',
    source: 'https://sketchfab.com/3d-models/ducky-the-duck-9166765df5c741a1ad0d680c6964d36e',
  },
  joints: {
    Root: 'Bone_Armature',
    Spine: 'Bone.001_Armature',
    Neck: 'Bone.006_Armature',
    Head: 'Bone.009_Armature',
    Jaw: 'Bone.013_Armature',
    Wing_L: 'Bone.039_Armature',
    Wing_L_2: 'Bone.045_Armature',
    Wing_R: 'Bone.040_Armature',
    Wing_R_2: 'Bone.046_Armature',
    Leg_L: 'Bone.062_Armature',
    Foot_L: 'Bone.068_Armature',
    Leg_R: 'Bone.063_Armature',
    Foot_R: 'Bone.069_Armature',
  },
  pivots: 'skin',
  // Recovered from skin weights, the wing roots landed mid-flank (0.33, -0.72,
  // -0.89), because Bone.039 also carries the side of the body; turning there
  // swept the wing INTO the torso. These sit at the front top of each wing,
  // where the Bone.043 chain's vertices begin (measured 2026-09-16).
  //
  // The jaw's recovered pivot landed mid-bill (0.16, 0.19, 0.58), because the
  // lip bones share weights along the whole bill edge, so turning it see-sawed
  // the bill: "closed" rendered more open than "AA". The mouth corner is the
  // hinge, measured in a close-up test of three candidates on 2026-09-16.
  pivotOverrides: {
    Wing_L: [0.5, -0.5, -0.65],
    Wing_R: [-0.5, -0.5, -0.65],
    Jaw: [0.16, 0.24, 0.22],
  },
  jointFollowers: {
    Jaw: ['Bone.030_Armature'],
  },
  sockets: {
    attach_head: { joint: 'Head', at: 'top' },
    attach_body: { joint: 'Spine', at: 'front' },
    attach_wing_L: { joint: 'Wing_L', at: 'center' },
    attach_wing_R: { joint: 'Wing_R', at: 'center' },
  },
  // The bill is exported hanging open. -20 closes it at the new hinge (checked
  // in the close-up), so speech opens FROM shut; 32 degrees reads as a wide AA.
  restPose: { Jaw: { pitch: -20 } },
  jaw: { openDegrees: 32 },
  motionScale: { Wing_L: 1.3, Wing_R: 1.3, Wing_L_2: 1.3, Wing_R_2: 1.3 },
};
