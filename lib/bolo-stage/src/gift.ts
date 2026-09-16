/**
 * THE DAILY GIFT MOMENT: a box beside her, and what she does with it.
 *
 * The owner's second pick, from their 3D brief banked 2026-09-13: "Open the daily
 * gift. Tries lifting it, notices the lock, points at 'Finish a stop today'.
 * Once earned, tears the box and catches what pops out."
 *
 * BUILT FROM THE CONTRACT'S CLIPS, NOT NEW ONES. The brief's own table says
 * straining at a locked box and catching are not in the library, and adding
 * clip names would change the commission. So the scene plays library one-shots
 * at its cues (surprised, point, encourage, head_tilt, correct, give) and
 * layers on top only what no clip can know: which way the box is (a turn of
 * her whole body), the bend down to it, the tremble of a pull, and the beak.
 * Those are ADDITIVE turns, so the same scene plays over the stand-in's motion
 * today and over Bolo's authored clips tomorrow.
 *
 * PLAYED ON THE STAGE'S CLOCK. Her pull and the box tipping are one event; sent
 * across the bridge as separate commands they would drift apart by however long
 * the bridge took. The app starts a moment and hears beats back.
 *
 * THE BOX IS THE 2D BOX IN THREE DIMENSIONS (DailyGiftCard's GiftBox): the
 * indigo body with a teal band, the overhanging lid, the day written on the
 * front, sized by tier, and the bow on the grand box only.
 *
 * WHAT POPS OUT IS THE FORK'S OWN CURRENCY (GiftToken), drawn as its 2D glyph
 * draws it: a cowrie in Africa, a clay cup or a tea bowl elsewhere. Found while
 * porting to Southeast Asia on 2026-09-16, where cowrie shells would have paid
 * out a Kopi gift. The app names the token; nothing here picks one.
 */

import * as THREE from 'three';
import type { ClipName, GiftBoxSpec, GiftToken, MomentBeat, MomentName } from '@workspace/bolo-character';
import { keys, type Channel, type Pose } from './procedural';

export type MomentFrame = {
  /** Added on top of whatever clip she is playing. */
  pose: Pose;
  /** One-shots whose cue passed this frame. */
  play: ClipName[];
  beats: MomentBeat[];
  /** How open her beak is this frame. */
  beakOpen: number;
};

type Cue = { at: number; clip?: ClipName; beat?: MomentBeat };

type Token = {
  object: THREE.Object3D;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  resting: boolean;
};

/** One kind of token, and how the scene handles it whatever it is. */
type TokenKit = {
  kind: GiftToken;
  /** A new token, centred on its origin, at full size. */
  make: () => THREE.Object3D;
  /** How high its centre sits once it lands the right way up. */
  rest: number;
  /** Where it hangs below her beak tip: a shell sits in the bill, a cup hangs by its rim. */
  hold: number;
  /** A shell lies across the bill; a cup keeps facing the way she faces. */
  across: boolean;
  dispose: () => void;
};

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};
const osc = (t: number, period: number, amp: number, phase = 0) => amp * Math.sin((Math.PI * 2 * t) / period + phase);
/** A repeatable 0..1 per index, so the tokens fall the same way every time. */
const hash = (n: number) => {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
};

// ---- where things are, in character heights: feet at 0, crown at 1 ---------
//
// She stands at the origin facing +z (the learner). The box sits at her right
// hand, which is the viewer's left, and a little forward so it is not hidden
// behind her. She points with her LEFT wing (the contract's `point` on the
// stand-in), toward the side the words appear on.

/** The grand box's body. Smaller tiers scale by their 2D widths (60, 66, 72 of 80). */
const GRAND_WIDTH = 0.34;
const BOX_Z = 0.16;
/** From her centre line to the near edge of the lid. */
const BOX_GAP = 0.3;
const GRAVITY = 4;
/** Every moment blends in from where the last one left her, over this long. */
const BLEND = 0.35;

const INDIGO_TOP = '#4F46E5';
const INDIGO_BOTTOM = '#3730A3';
const INDIGO = '#4338CA';
const LID = '#312E81';
const TEAL = '#14B8A6';
const AMBER = '#F59E0B';
const INSIDE = '#DDD6FE';

const LOCKED_CUES: Cue[] = [
  // Lets go, then looks at the lock, which rattles, and she starts at it.
  { at: 2.45, clip: 'head_tilt' },
  { at: 3.2, clip: 'surprised' },
  { at: 4.2, clip: 'point' },
  { at: 4.45, beat: 'point' },
  { at: 5.8, clip: 'encourage' },
  { at: 7.7, beat: 'end' },
];
const WAITING_CUES: Cue[] = [{ at: 0.5, clip: 'head_tilt' }];
const OPEN_CUES: Cue[] = [
  { at: 1.0, beat: 'opened' },
  { at: 1.95, clip: 'correct' },
  { at: 1.97, beat: 'caught' },
  { at: 2.9, clip: 'give' },
  { at: 4.8, beat: 'end' },
];
/** When the lid comes off, the tokens fly and she catches one. */
const TEAR = 1.0;
const CATCH = 1.97;
/** She lets go of the token at the height of `give`, toward the learner. */
const RELEASE = 3.7;

/** The bend down to the top of the box. Negative leans back (the yank). */
function bend(amount: number): Pose {
  return {
    'Spine.pitch': 34 * amount,
    'Neck.pitch': 40 * amount,
    'Head.pitch': 10 * amount,
    'Body.y': -0.03 * Math.max(0, amount),
  };
}

function add(pose: Pose, channel: Channel, value: number) {
  pose[channel] = (pose[channel] ?? 0) + value;
}

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** A side of the box: the 2D box's gradient and teal band, and the day on the front one. */
function sideTexture(day: number | undefined, label: boolean): THREE.CanvasTexture {
  return canvasTexture(256, 176, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 176);
    g.addColorStop(0, INDIGO_TOP);
    g.addColorStop(1, INDIGO_BOTTOM);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 176);
    // The band sits where the 2D box draws it: just under the lid.
    ctx.fillStyle = TEAL;
    ctx.fillRect(0, 14, 256, 34);
    if (!label) return;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    if (day === undefined) {
      ctx.font = '900 46px -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif';
      ctx.fillText('GIFT', 128, 128);
      return;
    }
    ctx.font = '900 46px -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif';
    ctx.fillText(`Day ${day}`, 128, 112);
    ctx.globalAlpha = 0.75;
    ctx.font = '700 28px -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif';
    ctx.fillText('GIFT', 128, 152);
  });
}

/** A cowrie: cream, speckled, with the dark slit along its underside. */
function cowrieTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 64, (ctx) => {
    ctx.fillStyle = '#F6EBD9';
    ctx.fillRect(0, 0, 128, 64);
    ctx.fillStyle = 'rgba(156, 107, 63, 0.55)';
    for (let i = 0; i < 26; i += 1) {
      const x = hash(i + 1) * 128;
      const y = 6 + hash(i + 40) * 22;
      ctx.beginPath();
      ctx.arc(x, y, 2 + hash(i + 80) * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // The underside, and the slit that makes a shell a cowrie.
    ctx.fillStyle = '#E9D8BD';
    ctx.fillRect(0, 44, 128, 20);
    ctx.fillStyle = '#5B4331';
    ctx.fillRect(0, 60, 128, 4);
  });
}

/** A vessel turned from a profile of [radius, height] points, outside up and inside down. */
function lathe(points: [number, number][]): THREE.LatheGeometry {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), 36);
}

/**
 * THE TOKENS, built from primitives like the stand-in hats, each at `r`, the
 * token's size against the box. Every one is the fork's 2D glyph in three
 * dimensions, opened and checked on 2026-09-16 (`assets/images/stall/kulhad.png`
 * in each fork, whatever the file is called).
 */
function tokenKit(kind: GiftToken, r: number): TokenKit {
  const disposables: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(thing: T): T => {
    disposables.push(thing);
    return thing;
  };
  const dispose = () => disposables.forEach((d) => d.dispose());
  const clay = (color: string) => keep(new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide }));

  if (kind === 'kulhad') {
    // India, Southeast Asia and Europe: the terracotta cup, flared, two ridges.
    const s = r * 0.7;
    const body = clay('#C4663B');
    const inside = clay('#7E3419');
    const cupShape = keep(
      lathe([[0, -0.85], [0.5, -0.85], [0.53, -0.78], [0.58, -0.4], [0.66, -0.3], [0.63, -0.18], [0.68, 0.05], [0.76, 0.15], [0.73, 0.26], [0.8, 0.55], [0.86, 0.8], [0.82, 0.86], [0.76, 0.82], [0.66, 0.1], [0.54, -0.66], [0, -0.66]]),
    );
    const floorShape = keep(new THREE.CircleGeometry(0.53, 24));
    return {
      kind,
      rest: 0.85 * s,
      hold: -0.8 * s,
      across: false,
      dispose,
      make: () => {
        const group = new THREE.Group();
        const cup = new THREE.Mesh(cupShape, body);
        const floor = new THREE.Mesh(floorShape, inside);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -0.64;
        group.add(cup, floor);
        group.scale.setScalar(s);
        const holder = new THREE.Group();
        holder.add(group);
        return holder;
      },
    };
  }

  if (kind === 'tea-bowl') {
    // East Asia: white porcelain, a blue rim, amber tea.
    const s = r * 0.85;
    const porcelain = keep(new THREE.MeshStandardMaterial({ color: '#F5F4EF', roughness: 0.3, side: THREE.DoubleSide }));
    const blue = keep(new THREE.MeshStandardMaterial({ color: '#2D4C9B', roughness: 0.35 }));
    const tea = keep(new THREE.MeshStandardMaterial({ color: '#C27A2C', roughness: 0.15 }));
    const bowlShape = keep(
      lathe([[0, -0.5], [0.34, -0.5], [0.38, -0.44], [0.62, -0.18], [0.86, 0.2], [0.95, 0.46], [0.9, 0.5], [0.84, 0.44], [0.78, 0.2], [0.54, -0.14], [0.3, -0.36], [0, -0.38]]),
    );
    const rimShape = keep(new THREE.TorusGeometry(0.93, 0.035, 8, 40));
    const surfaceShape = keep(new THREE.CircleGeometry(0.78, 32));
    return {
      kind,
      rest: 0.5 * s,
      hold: -0.45 * s,
      across: false,
      dispose,
      make: () => {
        const group = new THREE.Group();
        const bowl = new THREE.Mesh(bowlShape, porcelain);
        const rim = new THREE.Mesh(rimShape, blue);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.47;
        const surface = new THREE.Mesh(surfaceShape, tea);
        surface.rotation.x = -Math.PI / 2;
        surface.position.y = 0.2;
        group.add(bowl, rim, surface);
        group.scale.setScalar(s);
        const holder = new THREE.Group();
        holder.add(group);
        return holder;
      },
    };
  }

  if (kind === 'cacao-cup') {
    // Latin America: a round clay cup, a dark band, foam on top.
    const s = r * 0.72;
    const body = clay('#B5592F');
    const band = keep(new THREE.MeshStandardMaterial({ color: '#6E2A12', roughness: 0.9 }));
    const foam = keep(new THREE.MeshStandardMaterial({ color: '#F4E8D5', roughness: 1 }));
    const cupShape = keep(
      lathe([[0, -0.85], [0.45, -0.85], [0.5, -0.78], [0.72, -0.35], [0.78, 0.05], [0.72, 0.45], [0.6, 0.7], [0.62, 0.78], [0.58, 0.82], [0.54, 0.76], [0.5, 0.6], [0, 0.58]]),
    );
    const ringShape = keep(new THREE.TorusGeometry(0.785, 0.045, 8, 40));
    const topShape = keep(new THREE.SphereGeometry(0.52, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2));
    return {
      kind,
      rest: 0.85 * s,
      hold: -0.75 * s,
      across: false,
      dispose,
      make: () => {
        const group = new THREE.Group();
        const cup = new THREE.Mesh(cupShape, body);
        const ring = new THREE.Mesh(ringShape, band);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.05;
        const top = new THREE.Mesh(topShape, foam);
        top.scale.y = 0.55;
        top.position.y = 0.6;
        group.add(cup, ring, top);
        group.scale.setScalar(s);
        const holder = new THREE.Group();
        holder.add(group);
        return holder;
      },
    };
  }

  // Africa: a cowrie, lying on its back once it lands.
  const geometry = keep(new THREE.SphereGeometry(1, 20, 14));
  const texture = keep(cowrieTexture());
  const material = keep(new THREE.MeshStandardMaterial({ map: texture, roughness: 0.45 }));
  return {
    kind: 'cowrie',
    rest: 0.45 * r,
    hold: 0,
    across: true,
    dispose,
    make: () => {
      const shell = new THREE.Mesh(geometry, material);
      shell.scale.set(r * 0.62, r * 0.45, r);
      const holder = new THREE.Group();
      holder.add(shell);
      return holder;
    },
  };
}

export class GiftScene {
  readonly group = new THREE.Group();
  kind: MomentName;

  private readonly w: number;
  private readonly h: number;
  private readonly d: number;
  private readonly lidW: number;
  private readonly lidH: number;
  private readonly boxX: number;
  private readonly wobble = new THREE.Group();
  private readonly tipper = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly panels: { pivot: THREE.Group; axis: 'x' | 'z'; sign: number }[] = [];
  private readonly lid = new THREE.Group();
  private readonly lidRest = new THREE.Vector3();
  private lock: THREE.Group | null = null;
  private kit: TokenKit | null = null;
  private tokens: Token[] = [];
  private catchToken: THREE.Object3D | null = null;
  private readonly releaseFrom = new THREE.Vector3();

  private time = 0;
  private cues: Cue[] = [];
  private cueIndex = 0;
  private from: Pose = {};
  private last: Pose = {};
  private yaw = 0;
  private settled = false;
  private readonly scratch = new THREE.Vector3();

  constructor(
    readonly box: GiftBoxSpec,
    kind: MomentName,
  ) {
    this.kind = kind;
    const size = Math.min(1, Math.max(0.5, box.size));
    this.w = GRAND_WIDTH * size;
    this.h = this.w * (52 / 76);
    this.d = this.w * 0.9;
    this.lidW = this.w * (88 / 76);
    this.lidH = this.w * (16 / 76);
    this.boxX = -(BOX_GAP + this.lidW / 2);
    this.group.name = 'gift-scene';
    this.group.position.set(this.boxX, 0, BOX_Z);

    this.build();
  }

  /** The same box, so a moment can carry on from the last one without a new box appearing. */
  sameBox(box: GiftBoxSpec): boolean {
    return box.day === this.box.day && box.size === this.box.size && box.bow === this.box.bow;
  }

  /**
   * Begin a moment. `gift-open` after `gift-waiting` keeps the box and carries
   * on; anything else starts clean. Her pose blends in from wherever the last
   * moment left her.
   */
  start(kind: MomentName, count: number, token: GiftToken = 'cowrie') {
    const continuing = this.kind === 'gift-waiting' && kind === 'gift-open';
    this.kind = kind;
    this.time = 0;
    this.cueIndex = 0;
    this.settled = false;
    this.from = continuing ? { ...this.last } : {};
    this.cues = kind === 'gift-locked' ? LOCKED_CUES : kind === 'gift-waiting' ? WAITING_CUES : OPEN_CUES;
    this.setLocked(kind === 'gift-locked');
    this.resetBox();
    this.clearTokens();
    if (kind !== 'gift-open') return;
    if (this.kit?.kind !== token) {
      this.kit?.dispose();
      this.kit = tokenKit(token, this.w * 0.12);
    }
    this.makeTokens(Math.max(1, Math.floor(count)));
  }

  /**
   * What the camera must see: from past the box to her pointing wing, and a
   * little lower and taller than her own framing, because the box stands
   * nearer the camera than she does.
   */
  frame(): { minX: number; maxX: number; centerY: number; height: number } {
    return { minX: this.boxX - this.lidW / 2 - 0.22, maxX: 0.36, centerY: 0.5, height: 1.32 };
  }

  /**
   * One frame. `beak` writes her beak tip, in WORLD space, into the vector it
   * is given (false when there is no beak to catch with).
   */
  update(dt: number, reduced: boolean, beak: (out: THREE.Vector3) => boolean): MomentFrame {
    const frame: MomentFrame = { pose: {}, play: [], beats: [], beakOpen: 0 };
    if (reduced) {
      // REDUCE MOTION: no pull, no flight. The scene jumps to how it ends and
      // every beat arrives now, so the words are never held back by motion
      // the learner asked not to see.
      if (!this.settled) {
        this.settleAtEnd();
        for (; this.cueIndex < this.cues.length; this.cueIndex += 1) {
          const beat = this.cues[this.cueIndex].beat;
          if (beat) frame.beats.push(beat);
        }
        this.settled = true;
      }
      this.last = {};
      return frame;
    }

    this.time += dt;
    const t = this.time;
    for (; this.cueIndex < this.cues.length && this.cues[this.cueIndex].at <= t; this.cueIndex += 1) {
      const cue = this.cues[this.cueIndex];
      if (cue.clip) frame.play.push(cue.clip);
      if (cue.beat) frame.beats.push(cue.beat);
    }

    let script: Pose;
    if (this.kind === 'gift-locked') {
      script = this.lockedPose(t);
      frame.beakOpen = keys(t, [[0, 0], [0.7, 0], [0.85, 1], [1.1, 0.12], [2.25, 0.12], [2.35, 0.9], [2.6, 0]]);
      this.lockedProps(t);
    } else if (this.kind === 'gift-waiting') {
      script = this.waitingPose(t);
      this.waitingProps(t);
    } else {
      script = this.openPose(t);
      frame.beakOpen = keys(t, [
        [0, 0], [0.4, 0], [0.52, 1], [0.68, 0.12], [0.95, 0.12], [1.02, 0.9], [1.2, 0.1],
        [1.55, 0.1], [1.7, 1], [1.9, 1], [CATCH, 0.2], [RELEASE - 0.08, 0.2], [RELEASE, 0.9], [RELEASE + 0.2, 0],
      ]);
      this.openProps(t, dt, beak);
    }

    // Blend in from where the previous moment left her.
    const k = smooth(t / BLEND);
    for (const channel of new Set([...Object.keys(this.from), ...Object.keys(script)]) as Set<Channel>) {
      frame.pose[channel] = (this.from[channel] ?? 0) * (1 - k) + (script[channel] ?? 0) * k;
    }
    this.last = frame.pose;
    this.yaw = THREE.MathUtils.degToRad(frame.pose['Body.yaw'] ?? 0);
    return frame;
  }

  dispose() {
    this.group.removeFromParent();
    this.clearTokens();
    this.kit?.dispose();
    this.kit = null;
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        (material as THREE.MeshStandardMaterial).map?.dispose();
        material.dispose();
      }
    });
  }

  // ---- her ------------------------------------------------------------------

  /** Turn to the box, bend and pull at it, let go, see the lock, point, beckon. */
  private lockedPose(t: number): Pose {
    const lean = keys(t, [[0, 0], [0.5, 0], [0.9, 1], [2.2, 1], [2.45, 0]]);
    const strain = smooth((t - 1.15) / 0.15) * smooth((2.25 - t) / 0.15);
    const heave = Math.abs(Math.sin((Math.PI * (t - 1.15)) / 0.38));
    const pose = bend(lean);
    // THE PULL KEEPS HOLD. The body heaves back and up while the neck gives the
    // same amount the other way, so the beak stays on the ribbon; letting the
    // whole bend relax read as letting go.
    add(pose, 'Spine.pitch', -8 * heave * strain);
    add(pose, 'Neck.pitch', 9 * heave * strain);
    add(pose, 'Body.y', 0.014 * heave * strain);
    add(pose, 'Body.yaw', keys(t, [[0, 0], [0.15, 0], [0.55, -45], [2.4, -45], [2.8, -34], [4.05, -34], [4.45, 16], [5.8, 16], [6.6, 0]]));
    // Looking AT the lock: head_tilt and surprised both lift her head, and a
    // bird that rears back at the sky has not noticed anything on the box.
    const atLock = keys(t, [[2.4, 0], [2.7, 1], [3.95, 1], [4.3, 0]]);
    add(pose, 'Head.pitch', 22 * atLock);
    add(pose, 'Neck.pitch', 14 * atLock);
    add(pose, 'Spine.roll', osc(t, 0.09, 2.5) * strain);
    add(pose, 'Head.roll', osc(t, 0.07, 4) * strain);
    // Wings flap with the effort.
    add(pose, 'Wing_L.roll', (18 + osc(t, 0.16, 16)) * strain);
    add(pose, 'Wing_R.roll', -(18 + osc(t, 0.16, 16, 0.6)) * strain);
    return pose;
  }

  /** Turned to the box, head cocked at it, while the claim is on the wire. */
  private waitingPose(t: number): Pose {
    const look = smooth(t / 0.45);
    return {
      'Body.yaw': -32 * look,
      'Head.pitch': 14 * look,
      'Neck.pitch': 8 * look,
      'Head.roll': (10 + osc(t, 2.6, 4)) * look,
    };
  }

  /** Grab the ribbon, yank, watch the token fly, catch it, face the learner, offer it. */
  private openPose(t: number): Pose {
    const lean = keys(t, [[0, 0], [0.3, 0.3], [0.55, 1], [0.8, 1], [TEAR, -0.4], [1.3, -0.15], [1.6, 0]]);
    // Her eyes follow the token: down into the burst box, then up as it comes to her.
    const up = keys(t, [[TEAR, 0], [1.15, -0.6], [1.5, 0], [1.9, 0.4], [2.2, 0]]);
    const pose = bend(lean);
    add(pose, 'Body.yaw', keys(t, [[0, -32], [0.3, -45], [1.2, -45], [1.45, -36], [2.0, -36], [2.6, 0]]));
    add(pose, 'Head.pitch', -24 * up);
    add(pose, 'Neck.pitch', -12 * up);
    // The yank: a sharp shake as the ribbon gives.
    const yank = smooth((t - 0.8) / 0.08) * smooth((TEAR + 0.1 - t) / 0.1);
    add(pose, 'Spine.roll', osc(t, 0.08, 4) * yank);
    return pose;
  }

  // ---- the box ----------------------------------------------------------------

  private build() {
    const { w, h, d, lidW, lidH } = this;
    const thick = w * 0.035;

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: canvasTexture(64, 64, (ctx) => {
          const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
          g.addColorStop(0, 'rgba(40,30,20,0.85)');
          g.addColorStop(0.5, 'rgba(40,30,20,0.4)');
          g.addColorStop(1, 'rgba(40,30,20,0)');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, 64, 64);
        }),
        transparent: true,
        depthWrite: false,
        opacity: 0.35,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.003;
    shadow.scale.set(lidW * 1.5, d * 1.6, 1);
    this.group.add(shadow);

    // wobble (the nudge, about the bottom centre) > tipper (tips about the
    // edge nearest her, +x) > the box itself, offset back by half a width.
    this.group.add(this.wobble);
    this.tipper.position.x = w / 2;
    this.wobble.add(this.tipper);
    const body = this.body;
    body.position.x = -w / 2;
    this.tipper.add(body);

    const plain = new THREE.MeshStandardMaterial({ color: INDIGO, roughness: 0.7 });
    const inside = new THREE.MeshStandardMaterial({ color: INSIDE, roughness: 0.9 });
    const side = new THREE.MeshStandardMaterial({ map: sideTexture(this.box.day, false), roughness: 0.7 });
    const front = new THREE.MeshStandardMaterial({ map: sideTexture(this.box.day, true), roughness: 0.7 });

    const bottom = new THREE.Mesh(new THREE.BoxGeometry(w, thick, d), [plain, plain, inside, plain, plain, plain]);
    bottom.position.y = thick / 2;
    body.add(bottom);

    // Four sides, each hinged at its bottom edge so it can fall open outward.
    // Box faces are ordered +x, -x, +y, -y, +z, -z.
    const addPanel = (axis: 'x' | 'z', sign: number) => {
      const pivot = new THREE.Group();
      const across = axis === 'z' ? w : d;
      const geometry = axis === 'z' ? new THREE.BoxGeometry(across, h, thick) : new THREE.BoxGeometry(thick, h, across);
      const outer = sign > 0 ? (axis === 'z' ? front : side) : side;
      const materials =
        axis === 'z'
          ? sign > 0
            ? [plain, plain, plain, plain, outer, inside]
            : [plain, plain, plain, plain, inside, outer]
          : sign > 0
            ? [outer, inside, plain, plain, plain, plain]
            : [inside, outer, plain, plain, plain, plain];
      const panel = new THREE.Mesh(geometry, materials);
      if (axis === 'z') {
        pivot.position.set(0, 0, (sign * d) / 2);
        panel.position.set(0, h / 2, (-sign * thick) / 2);
      } else {
        pivot.position.set((sign * w) / 2, 0, 0);
        panel.position.set((-sign * thick) / 2, h / 2, 0);
      }
      pivot.add(panel);
      body.add(pivot);
      this.panels.push({ pivot, axis, sign });
    };
    addPanel('z', 1);
    addPanel('z', -1);
    addPanel('x', 1);
    addPanel('x', -1);

    // The lid overhangs the body: that overhang is the whole read (the 2D box's
    // own comment), and a teal band runs over it front to back.
    this.lidRest.set(0, h, 0);
    this.lid.position.copy(this.lidRest);
    body.add(this.lid);
    const lidMaterial = new THREE.MeshStandardMaterial({ color: LID, roughness: 0.65 });
    const lidBox = new THREE.Mesh(new THREE.BoxGeometry(lidW, lidH, d * (88 / 76)), lidMaterial);
    lidBox.position.y = lidH / 2;
    this.lid.add(lidBox);
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.16, lidH * 1.04, d * (88 / 76) * 1.02),
      new THREE.MeshStandardMaterial({ color: TEAL, roughness: 0.6 }),
    );
    band.position.y = lidH / 2;
    this.lid.add(band);
    if (this.box.bow) {
      const bowMaterial = new THREE.MeshStandardMaterial({ color: AMBER, roughness: 0.5 });
      for (const sign of [-1, 1]) {
        const loop = new THREE.Mesh(new THREE.TorusGeometry(w * 0.13, w * 0.035, 10, 28), bowMaterial);
        loop.scale.set(1, 0.72, 1);
        loop.position.set(sign * w * 0.12, lidH + w * 0.08, 0);
        loop.rotation.z = sign * -0.45;
        this.lid.add(loop);
      }
      const knot = new THREE.Mesh(new THREE.SphereGeometry(w * 0.055, 14, 10), bowMaterial);
      knot.position.set(0, lidH + w * 0.04, 0);
      this.lid.add(knot);
    }
  }

  /**
   * THE PADLOCK: a gold body, a steel shackle and a keyhole, hung on the front
   * of the lid. It differs from the open box by SHAPE (it is there or it is
   * not), never by colour, and the words on screen say the same thing.
   */
  private setLocked(locked: boolean) {
    if (!locked) {
      this.lock?.removeFromParent();
      this.lock = null;
      return;
    }
    if (this.lock) return;
    const { lidH, d } = this;
    // Sized from the grand box at least, so it still reads as a padlock on the
    // smallest box (on the Day 1 box it was a gold speck on the simulator).
    const w = Math.max(this.w, GRAND_WIDTH * 0.95);
    const lock = new THREE.Group();
    lock.name = 'gift-lock';
    const gold = new THREE.MeshStandardMaterial({ color: '#D4A017', roughness: 0.35, metalness: 0.55 });
    const steel = new THREE.MeshStandardMaterial({ color: '#A7AFBA', roughness: 0.3, metalness: 0.8 });
    const bodyH = w * 0.2;
    const shackleR = w * 0.07;
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(shackleR, w * 0.018, 8, 24, Math.PI), steel);
    shackle.position.y = -shackleR * 0.2;
    lock.add(shackle);
    const lockBody = new THREE.Mesh(new THREE.BoxGeometry(w * 0.24, bodyH, w * 0.08), gold);
    lockBody.position.y = -shackleR * 0.2 - bodyH / 2;
    lock.add(lockBody);
    const keyhole = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.022, w * 0.022, w * 0.01, 16), new THREE.MeshBasicMaterial({ color: '#1F1300' }));
    keyhole.rotation.x = Math.PI / 2;
    keyhole.position.set(0, lockBody.position.y + bodyH * 0.08, w * 0.041);
    lock.add(keyhole);
    // Hung from the lid's front edge, swinging about the top of its shackle.
    lock.position.set(0, this.h + lidH * 0.35, (d * (88 / 76)) / 2 + this.w * 0.045);
    this.body.add(lock);
    this.lock = lock;
  }

  private resetBox() {
    this.wobble.rotation.set(0, 0, 0);
    this.wobble.position.set(0, 0, 0);
    this.tipper.rotation.set(0, 0, 0);
    for (const { pivot } of this.panels) pivot.rotation.set(0, 0, 0);
    this.lid.position.copy(this.lidRest);
    this.lid.rotation.set(0, 0, 0);
    this.lid.scale.setScalar(1);
    this.lid.visible = true;
    if (this.lock) this.lock.rotation.set(0, 0, 0);
  }

  /** Rock the box about its bottom centre, lifted so no edge sinks into the floor. */
  private rock(radians: number) {
    this.wobble.rotation.z = radians;
    this.wobble.position.y = (this.w / 2) * Math.abs(Math.sin(radians));
  }

  private lockedProps(t: number) {
    const strain = smooth((t - 1.15) / 0.15) * smooth((2.25 - t) / 0.15);
    const heave = Math.abs(Math.sin((Math.PI * (t - 1.15)) / 0.38));
    // Pulled toward her, the far side lifts a little and will not come up.
    this.tipper.rotation.z = -0.08 * heave * strain;
    // Dropped, it thumps and settles.
    const since = t - 2.3;
    this.rock(since > 0 ? 0.05 * Math.exp(-6 * since) * Math.sin((Math.PI * 2 * since) / 0.2) : 0);
    if (this.lock) {
      const swing = 0.3 * strain * Math.sin((Math.PI * 2 * t) / 0.42);
      const settle = since > 0 ? 0.55 * Math.exp(-3.2 * since) * Math.sin((Math.PI * 2 * since) / 0.55) : 0;
      // She notices it: it rattles.
      const rattle = t > 2.9 && t < 3.4 ? 0.16 * Math.sin((Math.PI * 2 * t) / 0.1) : 0;
      this.lock.rotation.z = swing + settle + rattle;
      this.lock.rotation.x = -0.12 * strain * heave;
    }
  }

  /** The 2D box's nudge: a shake, then a rest, so it reads as asking. */
  private waitingProps(t: number) {
    const cycle = t % 2.6;
    const shake = cycle < 1.46 ? keys(cycle / 1.46, [[0, 0], [0.14, -5], [0.32, 5], [0.5, -4], [0.68, 3], [0.86, -2], [1, 0]]) : 0;
    this.rock(THREE.MathUtils.degToRad(shake));
  }

  private openProps(t: number, dt: number, beak: (out: THREE.Vector3) => boolean) {
    // Whatever nudge was mid-way settles before she grabs.
    this.rock(this.wobble.rotation.z * Math.max(0, 1 - dt * 10));
    // The lid rises a little as she pulls, then flies off, tumbling, and is gone.
    const pull = keys(t, [[0.55, 0], [0.8, 1], [TEAR, 1]]);
    const u = t - TEAR;
    if (u < 0) {
      this.lid.position.set(this.lidRest.x, this.lidRest.y + 0.02 * pull, this.lidRest.z);
    } else {
      // Up and away BEHIND the box, so it never covers the tokens coming out
      // toward the learner, flipping its top (and the bow) toward them as it
      // goes: tumbling the other way showed only its dark underside.
      this.lid.position.set(this.lidRest.x - 0.12 * u, this.lidRest.y + 0.02 + 1.3 * u - 2.2 * u * u, this.lidRest.z - 0.55 * u);
      this.lid.rotation.set(3.2 * u, 0, 1.2 * u);
      const scale = 1 - smooth((u - 0.28) / 0.22);
      this.lid.scale.setScalar(Math.max(0.001, scale));
      this.lid.visible = scale > 0.01;
    }
    // The sides burst outward and land flat, with a little bounce.
    const open = keys(t, [[TEAR, 0], [TEAR + 0.28, 1.03], [TEAR + 0.38, 0.95], [TEAR + 0.48, 1]]) * (Math.PI / 2);
    for (const { pivot, axis, sign } of this.panels) {
      if (axis === 'z') pivot.rotation.x = sign * open;
      else pivot.rotation.z = -sign * open;
    }
    // The tokens, and the one she catches.
    if (t >= TEAR) {
      for (const token of this.tokens) this.stepToken(token, dt);
      this.flyCatchToken(t, beak);
    }
  }

  // ---- the tokens -----------------------------------------------------------------

  private makeTokens(count: number) {
    const kit = this.kit;
    if (!kit) return;
    const make = () => {
      const object = kit.make();
      object.visible = false;
      this.group.add(object);
      return object;
    };
    this.catchToken = make();
    for (let i = 1; i < count; i += 1) {
      // Out over the front and the far side of the box, never into her, and
      // mostly toward the learner: thrown wide left they landed against the
      // edge of the phone's stage.
      const angle = THREE.MathUtils.degToRad(60 + 95 * hash(i));
      const speed = 0.18 + 0.16 * hash(i + 17);
      this.tokens.push({
        object: make(),
        velocity: new THREE.Vector3(Math.cos(angle) * speed, 1.6 + 0.5 * hash(i + 33), Math.sin(angle) * speed),
        spin: new THREE.Vector3(8 * (hash(i + 51) - 0.5), 10 * (hash(i + 67) - 0.5), 8 * (hash(i + 83) - 0.5)),
        resting: false,
      });
    }
    // All of them start inside the box, at its centre.
    for (const token of this.tokens) token.object.position.set(0, this.h * 0.5, 0);
  }

  private clearTokens() {
    for (const token of this.tokens) token.object.removeFromParent();
    this.tokens = [];
    this.catchToken?.removeFromParent();
    this.catchToken = null;
  }

  private stepToken(token: Token, dt: number) {
    const o = token.object;
    o.visible = true;
    if (token.resting || !this.kit) return;
    const floor = this.kit.rest;
    token.velocity.y -= GRAVITY * dt;
    o.position.addScaledVector(token.velocity, dt);
    o.rotation.x += token.spin.x * dt;
    o.rotation.y += token.spin.y * dt;
    o.rotation.z += token.spin.z * dt;
    if (o.position.y > floor) return;
    o.position.y = floor;
    if (Math.abs(token.velocity.y) < 0.5) {
      token.resting = true;
      // It lands the right way up: a shell on its back, a cup on its foot.
      o.rotation.x = 0;
      o.rotation.z = 0;
      return;
    }
    token.velocity.set(token.velocity.x * 0.5, -token.velocity.y * 0.3, token.velocity.z * 0.5);
    token.spin.multiplyScalar(0.4);
  }

  /**
   * The caught token: thrown up out of the box, then drawn onto her beak, so
   * it lands where her beak IS on this frame, whatever clip is moving it.
   */
  private flyCatchToken(t: number, beak: (out: THREE.Vector3) => boolean) {
    const token = this.catchToken;
    const kit = this.kit;
    if (!token || !kit) return;
    token.visible = true;
    const u = t - TEAR;
    // The beak, in this scene's own space, and where the token hangs from it.
    const hasBeak = beak(this.scratch);
    if (hasBeak) {
      this.group.worldToLocal(this.scratch);
      this.scratch.y += kit.hold;
    }
    if (t < CATCH) {
      const thrown = new THREE.Vector3(0.12 * u, this.h * 0.5 + 2.1 * u - 0.5 * GRAVITY * u * u, 0.02 * u);
      const home = hasBeak ? smooth((u - 0.35) / (CATCH - TEAR - 0.35)) : 0;
      token.position.copy(thrown).lerp(this.scratch, home);
      // Tumbling in flight, and level by the time it reaches her.
      token.rotation.set(6 * u * (1 - home), 4 * u, 0);
      return;
    }
    if (t < RELEASE) {
      if (hasBeak) token.position.copy(this.scratch);
      token.rotation.set(0, this.yaw + (kit.across ? Math.PI / 2 : 0), 0);
      this.releaseFrom.copy(token.position);
      return;
    }
    // Given: it flies to the learner and is gone.
    const v = t - RELEASE;
    token.position.set(this.releaseFrom.x + 0.2 * v, this.releaseFrom.y + 0.35 * v, this.releaseFrom.z + 1.6 * v);
    const scale = 1 - smooth(v / 0.4);
    token.visible = scale > 0.01;
    token.scale.setScalar(Math.max(0.001, scale));
  }

  // ---- Reduce Motion ----------------------------------------------------------

  private settleAtEnd() {
    this.resetBox();
    if (this.kind !== 'gift-open') return;
    for (const { pivot, axis, sign } of this.panels) {
      if (axis === 'z') pivot.rotation.x = (sign * Math.PI) / 2;
      else pivot.rotation.z = (-sign * Math.PI) / 2;
    }
    this.lid.visible = false;
    for (const token of this.tokens) {
      for (let i = 0; i < 240 && !token.resting; i += 1) this.stepToken(token, 1 / 60);
    }
    if (this.catchToken && this.kit) {
      // Nothing flies: the one she would have caught stands in front of the box.
      this.catchToken.visible = true;
      this.catchToken.position.set(this.w * 0.2, this.kit.rest, this.d * 0.9);
    }
  }
}
