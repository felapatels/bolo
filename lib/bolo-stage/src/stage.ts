/**
 * THE 3D STAGE: one live Bolo on one canvas.
 *
 * The same code runs in two places. On the web it is imported directly; on the
 * phone it is bundled into a single HTML file (build.mjs) and shown in a
 * WebView, which keeps any GPU fault in the WebView's own process instead of
 * the app's. Apps talk to it only through StageCommand and StageEvent, so
 * neither app ever imports three.js.
 */

import * as THREE from 'three';
import {
  BOLO_RIG,
  CLIPS,
  JOINT_SLOTS,
  MOOD_CLIP,
  SOCKETS,
  STANDIN_DUCKY_RIG,
  isClipName,
  type Capabilities,
  type ClipName,
  type Framing,
  type MomentCommand,
  type Mood,
  type RigProfile,
  type JointSlot,
  type Socket,
  type StageCommand,
  type StageConfig,
  type StageEvent,
  type TouchPart,
} from '@workspace/bolo-character';
import { Animator } from './animator';
import { Face } from './face';
import { GiftScene } from './gift';
import { loadModel, slotOfBone, type LoadedModel } from './model';
import type { Channel, Pose } from './procedural';
import { wardrobeItem } from './wardrobe';

export { STANDIN_WARDROBE } from './wardrobe';

const KNOWN_RIGS: Record<string, RigProfile> = {
  [BOLO_RIG.id]: BOLO_RIG,
  [STANDIN_DUCKY_RIG.id]: STANDIN_DUCKY_RIG,
};

const FOV = 24;
/** Long enough to look at her back after a spin; short enough to face the learner again. */
const RETURN_TO_FRONT_AFTER = 4;

/**
 * WHAT A TOUCH DOES, by the part it lands on (owner, 2026-09-16: "if someone
 * touches it, it reacts"). One-shots only, rotated so a second tap on the same
 * part gets a different answer. A touch never cuts across a clip the SCREEN
 * asked for (a "correct" mid-lesson); it can cut across its own reactions.
 */
const REACTIONS: Record<TouchPart, ClipName[]> = {
  head: ['head_tilt', 'nod', 'surprised'],
  beak: ['peck', 'shake_head'],
  wing: ['wave', 'shrug', 'clap'],
  body: ['fluff', 'correct', 'ruffle'],
  leg: ['scratch', 'stretch'],
};
const PART_OF_SLOT: Record<JointSlot, TouchPart> = {
  Root: 'body',
  Spine: 'body',
  Tail: 'body',
  Tail_2: 'body',
  Neck: 'head',
  Head: 'head',
  Crest: 'head',
  Crest_2: 'head',
  Jaw: 'beak',
  Wing_L: 'wing',
  Wing_L_2: 'wing',
  Wing_R: 'wing',
  Wing_R_2: 'wing',
  Leg_L: 'leg',
  Foot_L: 'leg',
  Leg_R: 'leg',
  Foot_R: 'leg',
};
/** A release faster than this (radians a second) leaves her dizzy. */
const DIZZY_SPIN = 12;

export class BoloStage {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 50);
  private readonly turntable = new THREE.Group();
  private readonly motion = new THREE.Group();
  private readonly shadow: THREE.Mesh;
  private readonly cameraTarget = new THREE.Vector3(0, 0.55, 0);
  private cameraDistance = 3;

  private model: LoadedModel | null = null;
  private profile: RigProfile | null = null;
  private animator: Animator | null = null;
  private face: Face | null = null;
  private readonly worn = new Map<Socket, THREE.Object3D>();
  /** A moment's scene (the daily gift), in the turntable beside her. */
  private moment: GiftScene | null = null;
  /** True from a moment's start to its `end` beat: no idle glances across it. */
  private momentPlaying = false;

  private mood: Mood = 'idle';
  private framing: Framing = 'full';
  private interactive = true;
  private reduced = false;
  private paused = false;
  private disposed = false;
  private raf = 0;
  private clock = 0;
  private lastFrame = 0;
  private nextIdleLook = 9;
  private footprint = new THREE.Vector2(0.5, 0.5);

  private yaw = 0;
  private yawVelocity = 0;
  private viewYaw = 0;
  private returnToFront = true;
  private lastTouch = -Infinity;
  private drag: { id: number; x: number; y: number; at: number; moved: number; axis: 'x' | 'y' | null; peak: number } | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly reactionTurn = new Map<TouchPart, number>();
  /** The one-shot playing now was a touch reaction, so another touch may replace it. */
  private reacting = false;
  private dizzy = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly emit: (event: StageEvent) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Neutral, not ACES: the brief fixes her colours to the hex, and ACES shifts hue.
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb8a58c, 1.5));
    const key = new THREE.DirectionalLight(0xfff4e6, 2.3);
    key.position.set(-1.5, 2.5, 3);
    const fill = new THREE.DirectionalLight(0xe6f2ff, 0.7);
    fill.position.set(2, 1, 2);
    const rim = new THREE.DirectionalLight(0xffffff, 1.1);
    rim.position.set(0.5, 2, -3);
    this.scene.add(key, fill, rim);

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.32 }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.002;
    this.scene.add(this.shadow, this.turntable);
    this.turntable.add(this.motion);

    this.bindInput();
    this.resize();
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.resize()).observe(canvas);
    else window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.lastFrame = 0;
    });
    this.raf = requestAnimationFrame(this.loop);
  }

  async load(config: StageConfig) {
    const started = performance.now();
    try {
      const profile = typeof config.rig === 'string' ? KNOWN_RIGS[config.rig] : config.rig;
      if (!profile) throw new Error(`unknown rig ${String(config.rig)}`);
      if (this.model) this.motion.remove(this.model.normalizer);
      this.worn.clear();

      const model = await loadModel(config.modelUrl, profile);
      this.model = model;
      this.profile = profile;
      this.motion.add(model.normalizer);
      this.animator = new Animator(model, profile, this.motion, (clip, source, phase) => {
        if (phase === 'end' && this.animator && !this.animator.current.oneShot) this.reacting = false;
        this.emit({ type: 'clip', clip, source, phase });
      });
      this.face = new Face(model, profile);

      const bounds = new THREE.Box3().setFromObject(model.normalizer, true);
      this.footprint.set(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z);

      this.reduced = config.reducedMotion ?? this.reduced;
      this.interactive = config.interactive ?? this.interactive;
      this.framing = config.framing ?? this.framing;
      this.setMood(config.mood ?? 'idle');
      for (const [socket, item] of Object.entries(config.wear ?? {})) this.wear(socket as Socket, item ?? null);
      this.snapCamera();

      this.emit({ type: 'ready', capabilities: this.capabilities(), loadMs: Math.round(performance.now() - started) });
    } catch (error) {
      this.emit({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  command(cmd: StageCommand) {
    switch (cmd.type) {
      case 'load':
        void this.load(cmd.config);
        return;
      case 'moment':
        this.setMoment(cmd);
        return;
      case 'mood':
        this.setMood(cmd.mood);
        return;
      case 'play':
        if (!isClipName(cmd.clip)) return;
        this.animator?.play(cmd.clip);
        // The screen asked for this one: a touch must not cut it off.
        this.reacting = false;
        return;
      case 'speak':
        this.face?.speak(cmd.track, this.clock, (cmd.positionMs ?? 0) / 1000);
        return;
      case 'sync':
        this.face?.sync(this.clock, cmd.positionMs / 1000);
        return;
      case 'silence':
        this.face?.silence();
        return;
      case 'face':
        this.face?.set(cmd.channel, cmd.value);
        return;
      case 'wear':
        this.wear(cmd.socket, cmd.item);
        return;
      case 'view':
        if (cmd.framing) this.framing = cmd.framing;
        if (cmd.interactive !== undefined) this.interactive = cmd.interactive;
        if (cmd.returnToFront !== undefined) this.returnToFront = cmd.returnToFront;
        if (cmd.yaw !== undefined) this.viewYaw = THREE.MathUtils.degToRad(cmd.yaw);
        return;
      case 'motion':
        this.reduced = cmd.reduced;
        return;
      case 'pause':
        this.paused = cmd.paused;
        this.lastFrame = 0;
        return;
    }
  }

  capabilities(): Capabilities {
    const model = this.model;
    const profile = this.profile;
    if (!model || !profile) throw new Error('no model loaded');
    return {
      rigId: profile.id,
      label: profile.label,
      standIn: profile.standIn,
      credit: profile.credit ?? null,
      triangles: model.triangles,
      bytes: model.bytes,
      clips: CLIPS.map((c) => ({ name: c.name, source: model.clips.has(c.name) ? 'file' : 'stand-in' })),
      face: this.face?.mode ?? 'none',
      shapeKeys: [...model.morphs.keys()],
      sockets: SOCKETS.map((name) => ({ name, source: model.sockets.get(name)?.source ?? 'missing' })),
      joints: JOINT_SLOTS.map((slot) => ({ slot, node: model.joints.get(slot)?.nodeName ?? null })),
      pivots: profile.pivots,
      audit: { ok: model.audit.ok, failed: model.audit.checks.filter((c) => c.status === 'fail').map((c) => c.id) },
    };
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
  }

  /**
   * Mark every joint's pivot with a dot (and its rest origin with a smaller
   * one), riding the skeleton. For diagnosing a new rig: when a limb swings
   * wrong, the pivot is the first suspect, and this puts it on the screen
   * instead of in a log.
   */
  showPivots(on: boolean) {
    const model = this.model;
    if (!model) return;
    model.normalizer.getObjectByName('pivot-debug')?.removeFromParent();
    for (const rig of model.joints.values()) rig.bone.getObjectByName('pivot-dot')?.removeFromParent();
    if (!on) return;
    const size = model.unit * 0.018;
    for (const rig of model.joints.values()) {
      const hue = (JOINT_SLOTS.indexOf(rig.slot) / JOINT_SLOTS.length) * 360;
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(size, 12, 8),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(`hsl(${hue}, 90%, 50%)`), depthTest: false }),
      );
      dot.name = 'pivot-dot';
      dot.renderOrder = 10;
      // Parented to the joint at its rest pivot, so it moves with the joint.
      const local = new THREE.Vector3().copy(rig.pivot).applyMatrix4(rig.restWorld.clone().invert());
      dot.position.copy(local);
      rig.bone.add(dot);
    }
  }

  /**
   * Step time by hand and draw one frame. Pause first. It exists so a clip can
   * be photographed at an exact moment: a headless browser renders slowly, and
   * real time would land every shot somewhere different.
   */
  advance(seconds: number, step = 1 / 60) {
    let left = seconds;
    while (left > 1e-6) {
      const dt = Math.min(step, left);
      this.clock += dt;
      this.tick(dt);
      left -= dt;
    }
    this.renderer.render(this.scene, this.camera);
  }

  // ---------------------------------------------------------------------------

  /**
   * Start, continue or clear a moment. `gift-open` straight after
   * `gift-waiting` with the same box carries on with that box, so the box the
   * learner watched nudging is the one that opens.
   */
  private setMoment(cmd: MomentCommand) {
    if (cmd.moment === null) {
      this.moment?.dispose();
      this.moment = null;
      this.momentPlaying = false;
      this.face?.set('beakOpen', 0);
      return;
    }
    const carryOn = this.moment?.kind === 'gift-waiting' && cmd.moment === 'gift-open' && this.moment.sameBox(cmd.box);
    if (!carryOn || !this.moment) {
      this.moment?.dispose();
      this.moment = new GiftScene(cmd.box, cmd.moment);
      this.turntable.add(this.moment.group);
      // Straight to the wider framing: panning to it would show the box cut
      // off at the edge for the first half second.
      this.snapCamera();
    }
    if (cmd.moment === 'gift-open') this.moment.start(cmd.moment, cmd.count, cmd.token);
    else this.moment.start(cmd.moment, 0);
    this.momentPlaying = true;
    // A glance must not start the moment half-turned away.
    this.nextIdleLook = Math.max(this.nextIdleLook, this.clock + 8);
  }

  /** Her beak tip in world space, for a scene that hands her something. */
  private readonly beakWorld = (out: THREE.Vector3): boolean => {
    const beak = this.model?.beak;
    if (!beak) return false;
    beak.object.getWorldPosition(out);
    return true;
  };

  private setMood(mood: Mood) {
    this.mood = mood;
    this.animator?.setBase(MOOD_CLIP[mood]);
  }

  private wear(socket: Socket, id: string | null) {
    const previous = this.worn.get(socket);
    previous?.removeFromParent();
    this.worn.delete(socket);
    if (!id || !this.model) return;
    const item = wardrobeItem(id);
    if (!item) return;
    const socketRig = this.model.sockets.get(item.socket);
    const piece = item.build({ model: this.model, socket: socketRig });
    if (!piece) return;
    if (piece.joint) {
      // Authored in model space: hang it under the joint through the inverse
      // of the joint's rest matrix, so at rest it sits exactly where it was
      // drawn and from then on it turns with the joint.
      const joint = this.model.joints.get(piece.joint) ?? this.model.joints.get('Spine');
      if (!joint) return;
      const holder = new THREE.Object3D();
      holder.name = `${item.id}-holder`;
      joint.restWorld.clone().invert().decompose(holder.position, holder.quaternion, holder.scale);
      holder.add(piece.object);
      joint.bone.add(holder);
      this.worn.set(item.socket, holder);
      return;
    }
    if (!socketRig) return;
    socketRig.object.add(piece.object);
    this.worn.set(item.socket, piece.object);
  }

  private loop = (ms: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (this.paused || document.hidden) return;
    const now = ms / 1000;
    const dt = this.lastFrame ? Math.min(1 / 15, now - this.lastFrame) : 1 / 60;
    this.lastFrame = now;
    this.clock += dt;
    this.tick(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private tick(dt: number) {
    const animator = this.animator;
    if (animator && this.face) {
      // A moment runs first, so its cues and its beak land in this frame's pose.
      let momentPose: Pose | null = null;
      if (this.moment) {
        const frame = this.moment.update(dt, this.reduced, this.beakWorld);
        for (const clip of frame.play) {
          animator.play(clip);
          // The scene's clips are the screen's: a touch must not cut them off.
          this.reacting = false;
        }
        for (const beat of frame.beats) {
          if (beat === 'end') {
            this.momentPlaying = false;
            this.nextIdleLook = this.clock + 8 + Math.random() * 7;
          }
          this.emit({ type: 'moment', moment: this.moment.kind, beat });
        }
        this.face.set('beakOpen', frame.beakOpen);
        momentPose = frame.pose;
      }
      // An occasional glance, so she never looks frozen: the brief's own timing.
      if (!this.reduced && !this.momentPlaying && this.mood === 'idle' && !animator.current.oneShot && this.clock >= this.nextIdleLook) {
        animator.play('idle_look');
        // Ambient, not the screen's: a touch may cut straight across it. (The
        // first touch test on the simulator tapped her head mid-glance and got
        // nothing, because only touch reactions were marked interruptible.)
        this.reacting = true;
        this.nextIdleLook = this.clock + 8 + Math.random() * 7;
      }
      const facePose = this.face.update(this.clock, this.reduced);
      if (momentPose) {
        for (const [channel, value] of Object.entries(momentPose) as [Channel, number][]) {
          facePose[channel] = (facePose[channel] ?? 0) + value;
        }
      }
      animator.update(dt, this.reduced, facePose);
    }

    // Turntable: inertia while spinning free, then back to the front.
    if (!this.drag) {
      this.yaw += this.yawVelocity * dt;
      this.yawVelocity *= Math.pow(0.04, dt);
      // Spun hard? Once she stops, she shakes it off.
      if (this.dizzy && Math.abs(this.yawVelocity) < 0.5) {
        this.dizzy = false;
        this.react('ruffle');
      }
      if (this.returnToFront && this.clock - this.lastTouch > RETURN_TO_FRONT_AFTER) {
        const wrapped = Math.atan2(Math.sin(this.yaw - this.viewYaw), Math.cos(this.yaw - this.viewYaw));
        this.yaw = this.viewYaw + wrapped * Math.pow(0.02, dt);
      }
    }
    this.turntable.rotation.y = this.yaw;

    // The shadow stays on the floor as she leaves it.
    const lift = Math.max(0, this.motion.position.y);
    const spread = Math.max(0.35, 1 - lift * 2.5);
    this.shadow.scale.set(this.footprint.x * 1.25 * spread, this.footprint.y * 1.1 * spread, 1);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.32 * Math.max(0.2, 1 - lift * 3);

    this.updateCamera(dt);
  }

  private desiredCamera(): { target: THREE.Vector3; distance: number } {
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const aspect = this.camera.aspect || 1;
    if (this.framing === 'bust') {
      // Head and a little of what is under it, from the MEASURED head: a fixed
      // height framed Bolo's face and the duck's neck.
      const head = this.model?.headBox;
      if (head && !head.isEmpty()) {
        const visible = Math.max(0.32, (head.max.y - head.min.y) * 2.6);
        const target = new THREE.Vector3((head.min.x + head.max.x) / 2, head.max.y - visible * 0.45, (head.min.z + head.max.z) / 2);
        return { target, distance: Math.max(visible / 2 / tan, (visible * 0.62) / (tan * aspect)) };
      }
      return { target: new THREE.Vector3(0, 0.76, 0), distance: Math.max(0.62 / 2 / tan, 0.42 / (tan * aspect)) };
    }
    if (this.moment) {
      // Her and the scene beside her, from past the box to her pointing wing.
      const { minX, maxX, centerY, height } = this.moment.frame();
      return {
        target: new THREE.Vector3((minX + maxX) / 2, centerY, 0),
        distance: Math.max(height / 2 / tan, (maxX - minX) / 2 / (tan * aspect)),
      };
    }
    return { target: new THREE.Vector3(0, 0.54, 0), distance: Math.max(1.22 / 2 / tan, 0.62 / (tan * aspect)) };
  }

  private snapCamera() {
    const { target, distance } = this.desiredCamera();
    this.cameraTarget.copy(target);
    this.cameraDistance = distance;
    this.updateCamera(0);
  }

  private updateCamera(dt: number) {
    const { target, distance } = this.desiredCamera();
    const k = dt === 0 ? 1 : 1 - Math.pow(0.001, dt);
    this.cameraTarget.lerp(target, k);
    this.cameraDistance += (distance - this.cameraDistance) * k;
    this.camera.position.set(this.cameraTarget.x, this.cameraTarget.y + 0.06, this.cameraTarget.z + this.cameraDistance);
    this.camera.lookAt(this.cameraTarget);
  }

  private resize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** Play a touch reaction, unless the screen's own one-shot is playing. */
  private react(clip: ClipName): boolean {
    const animator = this.animator;
    if (!animator || this.reduced) return false;
    if (animator.current.oneShot && !this.reacting) return false;
    animator.play(clip);
    this.reacting = true;
    return true;
  }

  /** Which part of her is under a screen point, read from the skin there. */
  private partAt(clientX: number, clientY: number): TouchPart | null {
    const model = this.model;
    if (!model) return null;
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.scene.updateMatrixWorld(true);
    this.raycaster.setFromCamera(ndc, this.camera);
    const meshes: THREE.Object3D[] = [];
    model.gltf.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o);
    });
    // Skinned meshes raycast against their POSED vertices, so a raised wing is
    // hit where it is, not where it rests.
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    if (!hit?.face) return null;
    const mesh = hit.object as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return 'body';
    const skinIndex = mesh.geometry.getAttribute('skinIndex');
    const skinWeight = mesh.geometry.getAttribute('skinWeight');
    let bone = 0;
    let heaviest = -1;
    for (let k = 0; k < 4; k++) {
      const w = skinWeight.getComponent(hit.face.a, k);
      if (w > heaviest) {
        heaviest = w;
        bone = skinIndex.getComponent(hit.face.a, k);
      }
    }
    const slot = slotOfBone(model, mesh.skeleton.bones[bone] ?? null);
    return slot ? PART_OF_SLOT[slot] : 'body';
  }

  private bindInput() {
    const canvas = this.canvas;
    // pan-y, not none: on a lesson screen a vertical swipe that starts on her
    // must still scroll the page. Sideways drags are hers.
    canvas.style.touchAction = 'pan-y';
    canvas.addEventListener('pointerdown', (e) => {
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, at: performance.now(), moved: 0, axis: null, peak: 0 };
      this.lastTouch = this.clock;
      this.yawVelocity = 0;
    });
    canvas.addEventListener('pointermove', (e) => {
      const drag = this.drag;
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      drag.x = e.clientX;
      drag.y = e.clientY;
      this.lastTouch = this.clock;
      if (!drag.axis && drag.moved > 8) drag.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      if (!this.interactive || drag.axis !== 'x') return;
      canvas.setPointerCapture?.(e.pointerId);
      const turn = (dx / Math.max(1, canvas.clientWidth)) * Math.PI * 1.6;
      this.yaw += turn;
      this.yawVelocity = turn * 60;
      drag.peak = Math.max(drag.peak, Math.abs(this.yawVelocity));
    });
    canvas.addEventListener('pointerup', (e) => {
      const drag = this.drag;
      if (!drag || e.pointerId !== drag.id) return;
      this.drag = null;
      this.lastTouch = this.clock;
      if (drag.axis === 'x' && drag.peak > DIZZY_SPIN) this.dizzy = true;
      const tap = drag.moved < 8 && performance.now() - drag.at < 350;
      if (!tap) return;
      const part = this.interactive ? this.partAt(e.clientX, e.clientY) : null;
      let reaction: ClipName | null = null;
      if (part) {
        const turn = this.reactionTurn.get(part) ?? 0;
        const candidate = REACTIONS[part][turn % REACTIONS[part].length];
        if (this.react(candidate)) {
          reaction = candidate;
          this.reactionTurn.set(part, turn + 1);
        }
      }
      this.emit({ type: 'tap', part, reaction });
    });
    // The browser took the gesture (a vertical scroll): never a tap, never a spin.
    canvas.addEventListener('pointercancel', (e) => {
      if (this.drag && e.pointerId === this.drag.id) this.drag = null;
    });
  }
}

function shadowTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(40,30,20,0.9)');
    g.addColorStop(0.45, 'rgba(40,30,20,0.45)');
    g.addColorStop(1, 'rgba(40,30,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

export type { ClipName };
