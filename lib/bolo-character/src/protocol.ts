/**
 * The messages between an app and the 3D stage.
 *
 * On the phone the stage runs inside a WebView and these cross the bridge as
 * JSON; on the web they are plain calls. Either way the app never touches
 * three.js: it sends a mood, a clip, a mouth track or a garment, and hears back
 * when she is ready and what she can do.
 */

import type { ClipName, JointSlot, Socket } from './contract';
import type { RigProfile } from './rig';
import type { MouthKey } from './visemes';

/** A standing state. Each plays its clip on loop until the next one. */
export type Mood = 'idle' | 'listen' | 'think' | 'talk' | 'sleep';
export const MOOD_CLIP: Record<Mood, ClipName> = {
  idle: 'idle',
  listen: 'listen',
  think: 'think',
  talk: 'talk',
  sleep: 'sleep',
};

/** `full` frames the whole bird; `bust` her head and chest, for talking. */
export type Framing = 'full' | 'bust';

export type FaceChannel = 'beakOpen' | 'blink' | 'browUp' | 'browDown' | 'smile';

/** The part of her a touch landed on, read from the skin under the finger. */
export type TouchPart = 'head' | 'beak' | 'wing' | 'body' | 'leg';

export type StageConfig = {
  modelUrl: string;
  /** A profile, or the id of one the stage already knows ('bolo', 'standin-ducky'). */
  rig: RigProfile | string;
  mood?: Mood;
  framing?: Framing;
  /**
   * Touch her and she reacts to the part touched; drag and she turns. On by
   * default everywhere, lesson screens included (owner, 2026-09-16: "i want
   * Bolo 3D to be interactive if someone touches it, it reacts and can spin it
   * around and look at it, even in lesson screens").
   */
  interactive?: boolean;
  reducedMotion?: boolean;
  wear?: Partial<Record<Socket, string | null>>;
};

/**
 * THE BOX IN THE DAILY GIFT MOMENT, described the way the 2D box is (the
 * DailyGiftState payload: day and tier). The stage knows nothing about the
 * economy, so the app turns the tier into a size and a bow.
 */
export type GiftBoxSpec = {
  /** Written on the box, as the 2D box writes it. Absent until the payload says. */
  day?: number;
  /**
   * The box against the largest (grand) one, 0 to 1. The tiers must be tellable
   * apart by SIZE rather than hue (openapi.yaml, DailyGiftState.tier).
   */
  size: number;
  /** Only the grand box has a bow: the second signal, in a different kind. */
  bow: boolean;
};

/**
 * A MOMENT: a short scene with a prop, played on the stage's own clock so the
 * prop and her body never drift apart across the bridge. The owner's second
 * pick (banked 2026-09-13): "Open the daily gift. Tries lifting it, notices the
 * lock, points at 'Finish a stop today'. Once earned, tears the box and
 * catches what pops out."
 *
 * `gift-waiting` is the box asking to be opened while the claim is on the
 * wire; `gift-open` continues from it with the same box, so the box only ever
 * opens once the gift was really granted.
 */
export type MomentName = 'gift-locked' | 'gift-waiting' | 'gift-open';

/**
 * What the app hears as a moment plays, so the words land on her gesture:
 * `point` (she points at where the words go), `opened` (the lid is off),
 * `caught` (she has what popped out), `end` (the scene is done; she idles).
 * Under Reduce Motion every beat arrives at once.
 */
export type MomentBeat = 'point' | 'opened' | 'caught' | 'end';

/**
 * WHAT POPS OUT OF THE GIFT: the fork's own currency, drawn the way its 2D
 * glyph draws it. A REGION choice, made per fork in the app
 * (lib/bolo3dGift.ts), never in the stage. As the glyphs stood on 2026-09-16:
 * Africa pays cowries; India, Southeast Asia and Europe draw a clay kulhad;
 * East Asia a porcelain tea bowl; Latin America a clay cacao cup.
 */
export type GiftToken = 'cowrie' | 'kulhad' | 'tea-bowl' | 'cacao-cup';

export type MomentCommand =
  | { type: 'moment'; moment: 'gift-locked' | 'gift-waiting'; box: GiftBoxSpec }
  /** `count` tokens pop out. The app caps it; the stage draws what it is told. */
  | { type: 'moment'; moment: 'gift-open'; box: GiftBoxSpec; token: GiftToken; count: number }
  /** Clear the scene: the props go and she is left standing. */
  | { type: 'moment'; moment: null };

export type StageCommand =
  | { type: 'load'; config: StageConfig }
  | MomentCommand
  | { type: 'mood'; mood: Mood }
  | { type: 'play'; clip: ClipName }
  /**
   * Start mouthing a track. `positionMs` is how far the AUDIO has already
   * played when the app sends this. The app and the WebView keep different
   * clocks, so the stage is told where the sound is, never what time it is.
   */
  | { type: 'speak'; track: MouthKey[]; positionMs?: number }
  /** Re-anchor to the audio's real position, so a slow decode cannot drift the beak. */
  | { type: 'sync'; positionMs: number }
  | { type: 'silence' }
  | { type: 'face'; channel: FaceChannel; value: number }
  | { type: 'wear'; socket: Socket; item: string | null }
  /** `returnToFront`: after a spin she turns back to face the learner (default). */
  | { type: 'view'; framing?: Framing; yaw?: number; interactive?: boolean; returnToFront?: boolean }
  | { type: 'motion'; reduced: boolean }
  | { type: 'pause'; paused: boolean };

export type ClipSource = 'file' | 'stand-in';

export type Capabilities = {
  rigId: string;
  label: string;
  standIn: boolean;
  credit: RigProfile['credit'] | null;
  triangles: number;
  bytes: number;
  clips: { name: ClipName; source: ClipSource }[];
  /** `shape-keys` on a rig built to the brief; `jaw` on a stand-in with a hinged beak. */
  face: 'shape-keys' | 'jaw' | 'none';
  shapeKeys: string[];
  sockets: { name: Socket; source: 'file' | 'derived' | 'missing' }[];
  joints: { slot: JointSlot; node: string | null }[];
  pivots: RigProfile['pivots'];
  /** The brief's machine-checkable sign-off, run on the loaded file. */
  audit: { ok: boolean; failed: string[] };
};

export type StageEvent =
  | { type: 'booted' }
  | { type: 'ready'; capabilities: Capabilities; loadMs: number }
  | { type: 'clip'; clip: ClipName; source: ClipSource; phase: 'start' | 'end' }
  | { type: 'tap'; part: TouchPart | null; reaction: ClipName | null }
  | { type: 'moment'; moment: MomentName; beat: MomentBeat }
  | { type: 'error'; message: string };
