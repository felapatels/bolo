/**
 * A RIG PROFILE maps one model file onto the contract.
 *
 * The runtime only ever speaks contract names (JointSlot, Socket, ClipName).
 * A file built to the brief needs almost nothing here, because its bones
 * already carry those names. A stand-in needs the rest: which of its bones plays
 * which part, where its sockets would be, and how to correct a rest pose it was
 * exported in.
 *
 * DELETE THE STAND-IN'S PROFILE WHEN BOLO LANDS. Nothing else in the apps
 * refers to a stand-in by name.
 */

import type { JointSlot, Socket } from './contract';

export type Vec3 = [number, number, number];

/** Degrees about the character's own axes: pitch nods forward, yaw turns to her left, roll tips her left side up. */
export type Turn = { pitch?: number; yaw?: number; roll?: number };

/**
 * Where to hang a socket on a file that has no attach_* node. Measured from
 * the vertices that joint moves (its own region, not its mapped children's):
 * `top` is the crown, `front` the chest, `center` the middle.
 */
export type SocketAnchor = {
  joint: JointSlot;
  at: 'top' | 'front' | 'center';
  /** Extra offset in character heights (feet at 0, crown at 1). */
  offset?: Vec3;
};

export type RigCredit = {
  title: string;
  author: string;
  license: string;
  source: string;
};

export type RigProfile = {
  id: string;
  label: string;
  /** True for anything that is not the commissioned Bolo. The UI says so. */
  standIn: boolean;
  credit?: RigCredit;
  /**
   * File node names per slot, exactly as the glTF spells them. Slots left out
   * resolve by contract name, and a slot that resolves to nothing is simply not
   * driven.
   */
  joints?: Partial<Record<JointSlot, string>>;
  /**
   * `bone`: turn each joint about its own origin, which is right for a rig
   * built to the brief.
   * `skin`: recover each joint's pivot from where its skin weights hand over to
   * its parent. For stand-ins whose joint origins are not at their joints: the
   * duck's head bone sits 1.7 units above its head, so turning it about its own
   * origin swings the head through a wide arc instead of nodding it.
   */
  pivots: 'bone' | 'skin';
  /**
   * Pivots placed by hand, in the FILE's own units, for joints where neither
   * rule finds the real joint. The duck's wing bones also own most of its
   * flanks, so skin weights put its "shoulders" in the middle of its sides.
   */
  pivotOverrides?: Partial<Record<JointSlot, Vec3>>;
  /**
   * Extra bones that turn WITH a joint, about the same pivot. For a part the
   * file splits across siblings: the duck's lower bill is Bone.013, but the
   * edge of its lower lip hangs off the head on Bone.030, and opening one
   * without the other tore the bill along its edge.
   */
  jointFollowers?: Partial<Record<JointSlot, string[]>>;
  sockets?: Partial<Record<Socket, SocketAnchor>>;
  /** A rest pose correction, applied under every clip. */
  restPose?: Partial<Record<JointSlot, Turn>>;
  /** For a file with no beak shape keys: how far the Jaw joint turns to open fully. */
  jaw?: { openDegrees: number };
  /**
   * Multiplies stand-in motion per joint. The procedural clips are tuned for
   * Bolo's proportions; a duck's stub wings need more swing to read at all.
   */
  motionScale?: Partial<Record<JointSlot, number>>;
};

/** The commissioned bird. Her names match the brief, so the profile is empty. */
export const BOLO_RIG: RigProfile = {
  id: 'bolo',
  label: 'Bolo',
  standIn: false,
  pivots: 'bone',
};
