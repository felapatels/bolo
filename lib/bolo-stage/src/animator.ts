/**
 * Turning clips into bone transforms.
 *
 * Two sources feed one skeleton. A clip the FILE carries plays through three's
 * AnimationMixer, exactly as authored. A clip it does not carry plays from
 * procedural.ts. The real Bolo is expected to arrive with all fifty, at which
 * point the procedural path simply stops being chosen.
 *
 * THE PIVOT FORMULA. A turn R about a pivot p, both in the character's rest
 * space, applied to a joint whose parent is at rest-matrix P and which is
 * itself at rest-matrix B, gives the joint the local matrix
 *
 *     local = inverse(P) * T(p) * R * T(-p) * B
 *
 * which does not depend on where the parent has moved to. Parents' turns then
 * compose through the hierarchy for free. With `pivots: 'bone'`, p is the
 * joint's own origin and this is an ordinary local rotation; with `'skin'` it
 * is the pivot recovered from the skin weights.
 */

import * as THREE from 'three';
import {
  clipSpec,
  isClipName,
  type ClipName,
  type ClipSource,
  type JointSlot,
  type RigProfile,
} from '@workspace/bolo-character';
import type { JointRig, LoadedModel } from './model';
import { PROCEDURAL_CLIPS, type Axis, type Channel, type Pose } from './procedural';

const BASE_FADE = 0.35;
const ONESHOT_RISE = 0.15;
const ONESHOT_FALL = 0.25;

const smooth = (x: number) => {
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return c * c * (3 - 2 * c);
};

type Playing = { clip: ClipName; time: number; source: ClipSource };

export class Animator {
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<ClipName, THREE.AnimationAction>();
  private base: Playing;
  private previous: (Playing & { fade: number }) | null = null;
  private oneShot: (Playing & { seconds: number }) | null = null;
  private readonly bodyEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly scratch = {
    turn: new THREE.Quaternion(),
    euler: new THREE.Euler(0, 0, 0, 'YXZ'),
    m: new THREE.Matrix4(),
    t1: new THREE.Matrix4(),
    t2: new THREE.Matrix4(),
    r: new THREE.Matrix4(),
  };

  constructor(
    private readonly model: LoadedModel,
    private readonly profile: RigProfile,
    private readonly motion: THREE.Object3D,
    private readonly onClip: (clip: ClipName, source: ClipSource, phase: 'start' | 'end') => void,
  ) {
    this.mixer = new THREE.AnimationMixer(model.gltf.scene);
    for (const [name, clip] of model.clips) this.actions.set(name, this.mixer.clipAction(clip));
    this.base = { clip: 'idle', time: 0, source: this.sourceOf('idle') };
    this.startFileAction(this.base, true);
  }

  sourceOf(clip: ClipName): ClipSource {
    return this.actions.has(clip) ? 'file' : 'stand-in';
  }

  get current(): { base: ClipName; oneShot: ClipName | null } {
    return { base: this.base.clip, oneShot: this.oneShot?.clip ?? null };
  }

  /** Change the standing loop, cross-fading from whatever is playing. */
  setBase(clip: ClipName) {
    if (clip === this.base.clip) return;
    this.previous = { ...this.base, fade: 0 };
    this.stopFileAction(this.base.clip, BASE_FADE);
    this.base = { clip, time: 0, source: this.sourceOf(clip) };
    this.startFileAction(this.base, true);
    this.onClip(clip, this.base.source, 'start');
  }

  /** A one-shot over the current loop. A loop clip replaces the loop instead. */
  play(clip: ClipName) {
    if (!isClipName(clip)) return;
    if (clipSpec(clip).kind === 'loop') {
      this.setBase(clip);
      return;
    }
    if (this.oneShot) {
      this.stopFileAction(this.oneShot.clip, ONESHOT_FALL);
      this.onClip(this.oneShot.clip, this.oneShot.source, 'end');
    }
    const source = this.sourceOf(clip);
    const seconds = source === 'file' ? this.model.clips.get(clip)!.duration : clipSpec(clip).seconds;
    this.oneShot = { clip, time: 0, source, seconds };
    this.startFileAction(this.oneShot, false);
    this.onClip(clip, source, 'start');
  }

  /**
   * Advance and pose. `extra` is added on top (the jaw's speech, a look-at),
   * and `reduced` holds her at rest: no loops and no one-shots, per Reduce Motion.
   */
  update(dt: number, reduced: boolean, extra: Pose) {
    const pose: Pose = {};
    if (!reduced) {
      this.base.time += dt;
      if (this.previous) {
        this.previous.time += dt;
        this.previous.fade += dt / BASE_FADE;
        if (this.previous.fade >= 1) this.previous = null;
      }
      if (this.oneShot) {
        this.oneShot.time += dt;
        if (this.oneShot.time >= this.oneShot.seconds) {
          const ended = this.oneShot;
          this.oneShot = null;
          this.stopFileAction(ended.clip, ONESHOT_FALL);
          this.onClip(ended.clip, ended.source, 'end');
        }
      }

      const basePose = this.sampleProcedural(this.base);
      if (this.previous) {
        const from = this.sampleProcedural(this.previous);
        blendInto(pose, from, 1 - smooth(this.previous.fade));
        blendInto(pose, basePose, smooth(this.previous.fade));
      } else {
        blendInto(pose, basePose, 1);
      }
      if (this.oneShot && this.oneShot.source === 'stand-in') {
        const t = this.oneShot.time;
        const w = smooth(t / ONESHOT_RISE) * smooth((this.oneShot.seconds - t) / ONESHOT_FALL);
        const shot = this.sampleProcedural(this.oneShot);
        for (const channel of new Set([...Object.keys(pose), ...Object.keys(shot)]) as Set<Channel>) {
          pose[channel] = (pose[channel] ?? 0) * (1 - w) + (shot[channel] ?? 0) * w;
        }
      }
      this.mixer.update(dt);
    }
    for (const [channel, value] of Object.entries(extra) as [Channel, number][]) {
      pose[channel] = (pose[channel] ?? 0) + value;
    }
    this.apply(pose);
  }

  private sampleProcedural(playing: Playing): Pose {
    if (playing.source === 'file') return {};
    const clip = PROCEDURAL_CLIPS.get(playing.clip);
    if (!clip) return {};
    const t = clip.loop ? playing.time % clip.seconds : Math.min(playing.time, clip.seconds);
    return clip.sample(t);
  }

  private startFileAction(playing: Playing, loop: boolean) {
    const action = this.actions.get(playing.clip);
    if (!action) return;
    action.reset();
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = !loop;
    action.fadeIn(loop ? BASE_FADE : ONESHOT_RISE).play();
  }

  private stopFileAction(clip: ClipName, fade: number) {
    this.actions.get(clip)?.fadeOut(fade);
  }

  private get fileDriven(): boolean {
    for (const action of this.actions.values()) if (action.isRunning() && action.getEffectiveWeight() > 0) return true;
    return false;
  }

  /** Write a pose (plus the profile's rest corrections) onto the joints. */
  private apply(pose: Pose) {
    const turns = new Map<JointSlot, Record<Axis, number>>();
    const body = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 };
    for (const [channel, raw] of Object.entries(pose) as [Channel, number][]) {
      const [slot, axis] = channel.split('.') as [string, keyof typeof body];
      if (slot === 'Body') {
        body[axis] += raw;
        continue;
      }
      const joint = slot as JointSlot;
      const scale = this.profile.motionScale?.[joint] ?? 1;
      if (!turns.has(joint)) turns.set(joint, { pitch: 0, yaw: 0, roll: 0 });
      turns.get(joint)![axis as Axis] += raw * scale;
    }

    this.motion.position.set(body.x, body.y, body.z);
    this.bodyEuler.set(THREE.MathUtils.degToRad(body.pitch), THREE.MathUtils.degToRad(body.yaw), THREE.MathUtils.degToRad(body.roll));
    this.motion.quaternion.setFromEuler(this.bodyEuler);

    const fileDriven = this.fileDriven;
    for (const rig of this.model.joints.values()) {
      const turn = turns.get(rig.slot) ?? { pitch: 0, yaw: 0, roll: 0 };
      if (rig.restTurn) {
        turn.pitch += rig.restTurn.pitch ?? 0;
        turn.yaw += rig.restTurn.yaw ?? 0;
        turn.roll += rig.restTurn.roll ?? 0;
      }
      const still = turn.pitch === 0 && turn.yaw === 0 && turn.roll === 0;
      for (const part of [rig, ...rig.followers]) {
        if (fileDriven) {
          // The mixer has already posed this joint; layer the turn on top of it.
          if (!still) this.turnFromCurrent(part, turn);
        } else if (still) {
          part.bone.position.copy(part.rest.position);
          part.bone.quaternion.copy(part.rest.quaternion);
          part.bone.scale.copy(part.rest.scale);
        } else {
          this.turnFromRest(part, turn);
        }
      }
    }
  }

  private turnMatrix(pivot: THREE.Vector3, turn: Record<Axis, number>): THREE.Matrix4 {
    const { euler, turn: q, t1, t2, r, m } = this.scratch;
    euler.set(THREE.MathUtils.degToRad(turn.pitch), THREE.MathUtils.degToRad(turn.yaw), THREE.MathUtils.degToRad(turn.roll));
    q.setFromEuler(euler);
    r.makeRotationFromQuaternion(q);
    t1.makeTranslation(pivot.x, pivot.y, pivot.z);
    t2.makeTranslation(-pivot.x, -pivot.y, -pivot.z);
    return m.multiplyMatrices(t1, r).multiply(t2);
  }

  private turnFromRest(rig: JointRig, turn: Record<Axis, number>) {
    const local = new THREE.Matrix4()
      .multiplyMatrices(rig.parentRestWorldInverse, this.turnMatrix(rig.pivot, turn))
      .multiply(rig.restWorld);
    local.decompose(rig.bone.position, rig.bone.quaternion, rig.bone.scale);
  }

  /**
   * On a file-driven pose the joint is not at rest, so the turn is taken about
   * where the joint IS: its current position in model space, from the matrices
   * the mixer just produced.
   */
  private turnFromCurrent(rig: JointRig, turn: Record<Axis, number>) {
    const normalizer = this.model.normalizer;
    normalizer.updateMatrixWorld(true);
    const toModel = new THREE.Matrix4().copy(normalizer.matrixWorld).invert();
    const world = new THREE.Matrix4().multiplyMatrices(toModel, rig.bone.matrixWorld);
    const parentWorld = rig.bone.parent ? new THREE.Matrix4().multiplyMatrices(toModel, rig.bone.parent.matrixWorld) : new THREE.Matrix4();
    const pivot = new THREE.Vector3().setFromMatrixPosition(world);
    const local = new THREE.Matrix4().multiplyMatrices(parentWorld.invert(), this.turnMatrix(pivot, turn)).multiply(world);
    local.decompose(rig.bone.position, rig.bone.quaternion, rig.bone.scale);
  }
}

function blendInto(target: Pose, source: Pose, weight: number) {
  for (const [channel, value] of Object.entries(source) as [Channel, number][]) {
    target[channel] = (target[channel] ?? 0) + value * weight;
  }
}
