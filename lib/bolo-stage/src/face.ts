/**
 * The face: blinks, brows and the beak, played independently of the body.
 *
 * The brief makes this a separate layer on purpose ("Never bake a mouth shape
 * into a body animation"), so any mouth can play over any clip. A rig built to
 * the brief drives it with shape keys. A stand-in with a hinged beak and no
 * shape keys (the duck) gets the jaw fallback: the mouth track's openness turns
 * the Jaw joint instead.
 */

import {
  MOUTH_OPENNESS,
  SHAPE_KEY_FOR_MOUTH,
  VISEME_KEYS,
  mouthTrackEnd,
  sampleMouth,
  type FaceChannel,
  type MouthKey,
  type MouthShape,
  type RigProfile,
} from '@workspace/bolo-character';
import { hasShapeKeys, type LoadedModel } from './model';
import type { Pose } from './procedural';

export type FaceMode = 'shape-keys' | 'jaw' | 'none';

export class Face {
  readonly mode: FaceMode;
  private readonly manual = new Map<FaceChannel, number>();
  private speech: { track: MouthKey[]; start: number; end: number } | null = null;
  private nextBlink = 2;
  private blinkStart = -1;

  constructor(
    private readonly model: LoadedModel,
    private readonly profile: RigProfile,
  ) {
    this.mode = hasShapeKeys(model) ? 'shape-keys' : model.joints.has('Jaw') && profile.jaw ? 'jaw' : 'none';
  }

  /** `position` is where the audio already is, in seconds, at `now`. */
  speak(track: MouthKey[], now: number, position = 0) {
    this.speech = { track, start: now - position, end: mouthTrackEnd(track) };
  }

  sync(now: number, position: number) {
    if (this.speech) this.speech.start = now - position;
  }

  silence() {
    this.speech = null;
  }

  isSpeaking(now: number): boolean {
    return !!this.speech && now - this.speech.start <= this.speech.end;
  }

  set(channel: FaceChannel, value: number) {
    this.manual.set(channel, Math.max(0, Math.min(1, value)));
  }

  /** Apply shape keys directly; return joint turns for the jaw fallback. */
  update(now: number, reduced: boolean): Pose {
    let weights: Partial<Record<MouthShape, number>> = { closed: 1 };
    if (this.speech) {
      const t = now - this.speech.start;
      if (t > this.speech.end + 0.25) this.speech = null;
      // Reduce Motion: one resting mouth, never a flutter.
      else if (!reduced) weights = sampleMouth(this.speech.track, t);
    }

    const blink = reduced ? 0 : this.blink(now);

    if (this.mode === 'shape-keys') {
      for (const key of VISEME_KEYS) this.setMorph(key, 0);
      for (const [shape, w] of Object.entries(weights) as [MouthShape, number][]) {
        const key = SHAPE_KEY_FOR_MOUTH[shape];
        if (key) this.setMorph(key, w);
      }
      this.setMorph('beakOpen', this.manual.get('beakOpen') ?? 0);
      this.setMorph('blink', Math.max(blink, this.manual.get('blink') ?? 0));
      for (const channel of ['browUp', 'browDown', 'smile'] as const) this.setMorph(channel, this.manual.get(channel) ?? 0);
      return {};
    }

    if (this.mode === 'jaw') {
      let open = 0;
      for (const [shape, w] of Object.entries(weights) as [MouthShape, number][]) open += MOUTH_OPENNESS[shape] * w;
      open = Math.max(open, this.manual.get('beakOpen') ?? 0);
      return { 'Jaw.pitch': open * (this.profile.jaw?.openDegrees ?? 0) };
    }
    return {};
  }

  /** A blink every 2.5 to 6 seconds, 160 ms long. Only shape-key rigs have eyelids. */
  private blink(now: number): number {
    if (this.mode !== 'shape-keys') return 0;
    if (this.blinkStart < 0 && now >= this.nextBlink) this.blinkStart = now;
    if (this.blinkStart < 0) return 0;
    const t = (now - this.blinkStart) / 0.16;
    if (t >= 1) {
      this.blinkStart = -1;
      this.nextBlink = now + 2.5 + Math.random() * 3.5;
      return 0;
    }
    return Math.sin(Math.PI * t);
  }

  private setMorph(name: string, value: number) {
    for (const { mesh, index } of this.model.morphs.get(name) ?? []) {
      if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = value;
    }
  }
}
