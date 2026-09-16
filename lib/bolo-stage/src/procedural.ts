/**
 * STAND-IN MOTION: every clip in the contract, made of maths instead of keys.
 *
 * These exist so the apps can be built against the full clip library before
 * the designer delivers it. When a loaded file carries a clip by the same name,
 * the file's clip plays and the one here is never touched. None of this is
 * meant to survive contact with the real Bolo: it is scaffolding with the right
 * names on it.
 *
 * Every value is a turn about the CHARACTER's own axes, in degrees:
 *   pitch  nods or leans forward (a leg: swings back)
 *   yaw    turns toward her left
 *   roll   lifts her left side
 * Wings are easier read through `wings()` below: spread, lift and pitch.
 * `Body` channels move the whole bird: x, y, z in character heights, and turns.
 *
 * Loops only use periods that divide their length, so they wrap seamlessly;
 * one-shots begin and end at rest, so they chain without a snap. Both are the
 * brief's own rules for the real clips.
 */

import { CLIPS, type ClipName, type JointSlot } from '@workspace/bolo-character';

export type Axis = 'pitch' | 'yaw' | 'roll';
export type Channel = `${JointSlot}.${Axis}` | `Body.${'x' | 'y' | 'z' | Axis}`;
export type Pose = Partial<Record<Channel, number>>;

export type ProceduralClip = {
  name: ClipName;
  seconds: number;
  loop: boolean;
  sample: (t: number) => Pose;
};

const TAU = Math.PI * 2;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};
/** A sine of the given period, amplitude and phase. */
const osc = (t: number, period: number, amp: number, phase = 0) => amp * Math.sin((TAU * t) / period + phase);
/** 0 outside [a, b], rising to 1 in the middle and back. */
const bump = (t: number, a: number, b: number) => (t <= a || t >= b ? 0 : Math.sin((Math.PI * (t - a)) / (b - a)));
/** Fade in over `rise`, hold, fade out over `fall` before `seconds`. */
const envelope = (t: number, seconds: number, rise: number, fall: number) => smooth(t / rise) * smooth((seconds - t) / fall);
/** |sin|, for hops and bounces: zero at both ends of each period. */
const hopWave = (t: number, period: number) => Math.abs(Math.sin((Math.PI * t) / period));

/**
 * Smooth curve through keys [time, value], flat at both ends. Cubic Hermite
 * with finite-difference tangents: continuous in velocity THROUGH each key.
 * (smoothstep between keys stops dead at every key, which reads as robotic.)
 */
export function keys(t: number, points: [number, number][]): number {
  if (t <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (t >= last[0]) return last[1];
  let i = 0;
  while (t > points[i + 1][0]) i++;
  const [t0, v0] = points[i];
  const [t1, v1] = points[i + 1];
  const slope = (a: number) => {
    if (a <= 0 || a >= points.length - 1) return 0;
    return (points[a + 1][1] - points[a - 1][1]) / (points[a + 1][0] - points[a - 1][0]);
  };
  const h = t1 - t0;
  const u = (t - t0) / h;
  const m0 = slope(i) * h;
  const m1 = slope(i + 1) * h;
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * v0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * v1 + (u3 - u2) * m1;
}

type WingMove = {
  /** Out to the sides, away from the body. */
  spread?: number;
  /** Up and out, about the forward axis. */
  lift?: number;
  /** Tips up and back (negative: forward, toward the chest). */
  pitch?: number;
};

/**
 * Both wings, mirrored, in words instead of signs. Measured on the stand-in
 * (2026-09-16), whose folded wings lie back along its flanks: spreading them is
 * a NEGATIVE yaw on the left wing, lifting is a positive roll, and the cleanest
 * "wings up" is pitch and lift together, which stretches the flank least.
 */
function wings(pose: Pose, move: WingMove, tip?: { lift?: number; pitch?: number }) {
  if (move.spread !== undefined) {
    pose['Wing_L.yaw'] = (pose['Wing_L.yaw'] ?? 0) - move.spread;
    pose['Wing_R.yaw'] = (pose['Wing_R.yaw'] ?? 0) + move.spread;
  }
  if (move.lift !== undefined) {
    pose['Wing_L.roll'] = (pose['Wing_L.roll'] ?? 0) + move.lift;
    pose['Wing_R.roll'] = (pose['Wing_R.roll'] ?? 0) - move.lift;
  }
  if (move.pitch !== undefined) {
    pose['Wing_L.pitch'] = (pose['Wing_L.pitch'] ?? 0) + move.pitch;
    pose['Wing_R.pitch'] = (pose['Wing_R.pitch'] ?? 0) + move.pitch;
  }
  if (tip?.lift !== undefined) {
    pose['Wing_L_2.roll'] = (pose['Wing_L_2.roll'] ?? 0) + tip.lift;
    pose['Wing_R_2.roll'] = (pose['Wing_R_2.roll'] ?? 0) - tip.lift;
  }
  if (tip?.pitch !== undefined) {
    pose['Wing_L_2.pitch'] = (pose['Wing_L_2.pitch'] ?? 0) + tip.pitch;
    pose['Wing_R_2.pitch'] = (pose['Wing_R_2.pitch'] ?? 0) + tip.pitch;
  }
  return pose;
}

const sleepPose = (t: number): Pose =>
  wings(
    {
      'Neck.pitch': 38,
      'Head.pitch': 30,
      'Head.yaw': 25,
      'Head.roll': 10,
      'Spine.pitch': 10 + osc(t, 4, 2),
      'Body.y': -0.01,
    },
    { lift: -4 + osc(t, 4, 2) },
  );

const DEFINITIONS: Record<ClipName, (t: number) => Pose> = {
  // ---- core -----------------------------------------------------------------
  idle: (t) =>
    wings(
      {
        'Spine.pitch': osc(t, 3.5, 1.6),
        'Neck.pitch': osc(t, 3.5, -1.2, 0.6),
        'Head.yaw': osc(t, 3.5, 4, 1),
        'Head.roll': osc(t, 3.5, 2, 2),
        'Body.y': 0.003 * Math.sin((TAU * t) / 3.5),
      },
      { lift: osc(t, 3.5, 2.5, 0.3) },
    ),
  idle_look: (t) => ({
    'Neck.yaw': keys(t, [[0, 0], [0.35, 28], [0.9, 28], [1.25, -14], [1.6, -14], [2, 0]]),
    'Head.pitch': keys(t, [[0, 0], [0.35, -6], [0.9, -6], [1.25, 4], [2, 0]]),
    'Head.roll': keys(t, [[0, 0], [0.4, 6], [1.3, -4], [2, 0]]),
  }),
  idle_variant: (t) => ({
    'Body.roll': osc(t, 4, 3),
    'Body.x': osc(t, 4, 0.01),
    'Spine.roll': osc(t, 4, -2),
    'Head.roll': osc(t, 4, 5, 0.5),
    'Neck.yaw': osc(t, 4, 8, 1),
  }),
  wave: (t) => {
    const e = envelope(t, 2, 0.3, 0.4);
    return {
      'Wing_L.pitch': 50 * e,
      'Wing_L.roll': 60 * e,
      'Wing_L_2.roll': e * osc(t, 0.4, 30),
      'Head.roll': -10 * e,
      'Head.yaw': 12 * e,
      'Spine.roll': -4 * e,
    };
  },
  cheer: (t) => {
    const e = envelope(t, 2, 0.25, 0.4);
    const hop = bump(t, 0.55, 1.05);
    return wings(
      {
        'Body.y': 0.07 * hop + 0.04 * bump(t, 1.1, 1.45),
        'Head.pitch': -14 * e,
        'Spine.pitch': -6 * e,
        'Leg_L.pitch': -15 * hop,
        'Leg_R.pitch': -15 * hop,
      },
      { pitch: 60 * e, lift: 50 * e + e * osc(t, 0.3, 10), spread: 10 * e },
      { lift: 20 * e },
    );
  },
  celebrate_big: (t) => {
    const e = envelope(t, 3, 0.25, 0.5);
    return wings(
      {
        'Body.yaw': 360 * smooth((t - 0.6) / 1.2),
        'Body.y': 0.14 * bump(t, 0.6, 1.8),
        'Head.pitch': -18 * e,
        'Leg_L.pitch': -20 * bump(t, 0.6, 1.8),
        'Leg_R.pitch': -20 * bump(t, 0.6, 1.8),
      },
      { pitch: 65 * e, lift: 55 * e + e * osc(t, 0.25, 15) },
      { lift: 20 * e },
    );
  },
  listen: (t) => ({
    'Head.roll': 16 + osc(t, 3, 2),
    'Neck.pitch': 7 + osc(t, 3, 1.5, 1),
    'Spine.pitch': 5,
    'Head.yaw': -8 + osc(t, 3, 2, 2),
  }),
  think: (t) => ({
    'Head.roll': osc(t, 3, 12),
    'Neck.yaw': osc(t, 3, 10, 0.8),
    'Head.pitch': -10 + osc(t, 3, 3, 1.6),
    'Body.roll': osc(t, 3, 2),
    'Wing_R.pitch': -45,
    'Wing_R.roll': -(30 + osc(t, 1.5, 3)),
  }),
  talk: (t) => ({
    'Head.pitch': osc(t, 0.5, 4),
    'Neck.pitch': osc(t, 1, 2, 0.5),
    'Spine.pitch': osc(t, 2, 1.5),
    'Head.roll': osc(t, 2, 4),
    'Wing_L.roll': 6 + osc(t, 1, 5),
    'Wing_R.roll': -(6 + osc(t, 1, 5, Math.PI)),
  }),
  correct: (t) => {
    const e = envelope(t, 1.5, 0.15, 0.5);
    return wings(
      {
        'Body.y': 0.045 * bump(t, 0.1, 0.45) + 0.03 * bump(t, 0.5, 0.8),
        'Head.pitch': keys(t, [[0, 0], [0.85, 0], [1.05, 14], [1.25, 0], [1.5, 0]]),
      },
      { pitch: 25 * e, lift: 20 * e },
    );
  },
  tryagain: (t) => {
    const e = envelope(t, 2, 0.35, 0.5);
    return wings(
      { 'Spine.roll': 7 * e, 'Head.roll': -14 * e, 'Head.pitch': 10 * e, 'Neck.pitch': 6 * e },
      { spread: 20 * e, lift: 10 * e, pitch: -10 * e },
    );
  },
  point: (t) => {
    const e = envelope(t, 1.5, 0.25, 0.35);
    return {
      'Wing_L.yaw': -85 * e,
      'Wing_L.roll': 25 * e,
      'Wing_L_2.roll': -10 * e,
      'Head.yaw': 25 * e,
      'Spine.yaw': 10 * e,
    };
  },
  nod: (t) => ({ 'Head.pitch': keys(t, [[0, 0], [0.2, 18], [0.4, -4], [0.6, 15], [0.8, -2], [1, 0]]) }),
  shake_head: (t) => ({ 'Head.yaw': keys(t, [[0, 0], [0.15, 22], [0.38, -22], [0.62, 20], [0.85, -10], [1, 0]]) }),

  // ---- parrot behaviour -------------------------------------------------------
  head_bob: (t) => ({ 'Neck.pitch': osc(t, 0.5, 9), 'Head.pitch': osc(t, 0.5, -7, 0.4) }),
  head_tilt: (t) => ({
    'Head.roll': keys(t, [[0, 0], [0.18, 28], [1.1, 26], [1.5, 0]]),
    'Neck.yaw': keys(t, [[0, 0], [0.2, -10], [1.1, -8], [1.5, 0]]),
  }),
  preen: (t) => {
    const w = keys(t, [[0, 0], [0.8, 1], [3.2, 1], [4, 0]]);
    return {
      'Neck.yaw': 70 * w,
      'Neck.pitch': 28 * w,
      'Head.pitch': w * (10 + osc(t, 0.4, 8)),
      'Wing_L.yaw': -18 * w,
      'Wing_L.roll': 14 * w,
    };
  },
  ruffle: (t) => {
    const d = envelope(t, 1.5, 0.1, 0.6);
    return wings(
      {
        'Body.roll': osc(t, 0.12, 5) * d,
        'Spine.roll': osc(t, 0.12, -4) * d,
        'Head.roll': osc(t, 0.12, 10, 1) * d,
        'Body.y': 0.01 * d,
      },
      { lift: (12 + osc(t, 0.1, 8)) * d, spread: 10 * d },
    );
  },
  stretch: (t) => {
    const e = envelope(t, 2.5, 0.6, 0.6);
    return {
      'Wing_L.yaw': -70 * e,
      'Wing_L.roll': 50 * e,
      'Wing_L.pitch': 20 * e,
      'Leg_L.pitch': 35 * e,
      'Foot_L.pitch': 25 * e,
      'Spine.pitch': 8 * e,
      'Head.pitch': -12 * e,
      'Neck.pitch': -8 * e,
    };
  },
  scratch: (t) => {
    const e = envelope(t, 2.5, 0.5, 0.5);
    return {
      'Leg_R.pitch': -55 * e,
      'Foot_R.pitch': (osc(t, 0.25, 15) - 20) * e,
      'Head.roll': 22 * e,
      'Head.pitch': 18 * e,
      'Spine.roll': -6 * e,
      'Body.x': 0.02 * e,
    };
  },
  peck: (t) => ({
    'Neck.pitch': keys(t, [[0, 0], [0.25, 38], [0.35, 40], [0.6, 0], [1, 0]]),
    'Head.pitch': keys(t, [[0, 0], [0.25, 18], [0.6, 0], [1, 0]]),
    'Spine.pitch': keys(t, [[0, 0], [0.25, 12], [0.6, 0], [1, 0]]),
  }),
  fluff: (t) => {
    const puff = bump(t, 0.2, 1.2);
    return wings(
      {
        'Spine.pitch': -5 * puff,
        'Head.pitch': -6 * puff,
        'Body.y': 0.012 * puff,
        'Body.roll': osc(t, 0.15, 3) * bump(t, 1.2, 1.8),
      },
      { lift: 14 * puff, spread: 10 * puff },
    );
  },
  sleep: sleepPose,
  wake: (t) => {
    const asleep = 1 - smooth((t - 0.2) / 0.9);
    const stretch = bump(t, 0.9, 1.9);
    const pose: Pose = {};
    for (const [channel, value] of Object.entries(sleepPose(0))) pose[channel as Channel] = (value ?? 0) * asleep;
    pose['Head.pitch'] = (pose['Head.pitch'] ?? 0) - 12 * stretch;
    return wings(pose, { pitch: 40 * stretch, lift: 40 * stretch });
  },

  // ---- expression and reaction ------------------------------------------------
  clap: (t) => {
    const e = envelope(t, 1.5, 0.2, 0.3);
    const tap = osc(t, 0.25, 12);
    return {
      'Wing_L.pitch': -50 * e,
      'Wing_R.pitch': -50 * e,
      'Wing_L.roll': (35 + tap) * e,
      'Wing_R.roll': -(35 + tap) * e,
      'Head.pitch': -8 * e,
    };
  },
  shrug: (t) => {
    const e = envelope(t, 1.5, 0.25, 0.4);
    return wings({ 'Head.roll': 12 * e, 'Head.pitch': -6 * e, 'Body.y': 0.01 * e }, { spread: 35 * e, lift: 25 * e }, { lift: -20 * e });
  },
  surprised: (t) => {
    const e = envelope(t, 1.5, 0.1, 0.6);
    return wings(
      {
        'Spine.pitch': -14 * e,
        'Neck.pitch': -10 * e,
        'Head.pitch': -10 * e,
        'Crest.pitch': -35 * e,
        'Body.y': 0.03 * bump(t, 0, 0.3),
      },
      { spread: 35 * e, pitch: 35 * e, lift: 30 * e },
    );
  },
  sad: (t) => {
    const e = envelope(t, 2, 0.5, 0.6);
    return wings({ 'Head.pitch': 26 * e, 'Neck.pitch': 14 * e, 'Spine.pitch': 10 * e, 'Crest.pitch': 30 * e }, { lift: -8 * e });
  },
  laugh: (t) =>
    wings(
      {
        'Spine.pitch': -6 + osc(t, 0.25, 4),
        'Head.pitch': -18 + osc(t, 0.25, 6, 1),
        'Body.y': 0.006 * hopWave(t, 0.25),
      },
      { lift: 12 + osc(t, 0.25, 6), pitch: 10 },
    ),
  whisper: (t) => ({
    'Spine.pitch': 14 + osc(t, 2, 1.5),
    'Neck.pitch': 10,
    'Head.roll': 14 + osc(t, 1, 3),
    'Head.yaw': 10,
    'Wing_L.pitch': -45,
    'Wing_L.roll': 35 + osc(t, 1, 4),
  }),
  sing: (t) =>
    wings(
      {
        'Head.pitch': -26 + osc(t, 1.25, 5),
        'Neck.pitch': -12,
        'Spine.pitch': -10 + osc(t, 2.5, 2),
        'Body.roll': osc(t, 2.5, 4),
      },
      { spread: 35 + osc(t, 1.25, 8), lift: 30, pitch: 20 },
    ),
  dance: (t) => ({
    'Body.y': 0.03 * hopWave(t, 0.75),
    'Body.yaw': osc(t, 1.5, 14),
    'Head.roll': osc(t, 0.75, 12),
    'Neck.pitch': osc(t, 0.375, 6),
    'Wing_L.roll': 20 + osc(t, 0.75, 15),
    'Wing_R.roll': -(20 + osc(t, 0.75, 15, Math.PI)),
    'Wing_L.pitch': 25 + osc(t, 0.75, 10),
    'Wing_R.pitch': 25 + osc(t, 0.75, 10, Math.PI),
    'Leg_L.pitch': osc(t, 1.5, 15),
    'Leg_R.pitch': -osc(t, 1.5, 15),
  }),
  show: (t) => {
    const e = envelope(t, 2, 0.35, 0.5);
    return wings(
      { 'Head.pitch': -8 * e, 'Spine.pitch': -6 * e },
      { spread: keys(t, [[0, 0], [0.3, -20], [0.9, 60], [1.6, 60], [2, 0]]), lift: 20 * e },
    );
  },

  // ---- movement and flight ----------------------------------------------------
  hop: (t) => {
    const h = hopWave(t, 0.8);
    return wings({ 'Body.y': 0.07 * h, 'Leg_L.pitch': -12 * h, 'Leg_R.pitch': -12 * h, 'Spine.pitch': -4 * h }, { lift: 12 * h, pitch: 15 * h });
  },
  turn_left: (t) => ({ 'Body.yaw': keys(t, [[0, 0], [0.4, 90], [0.6, 90], [1, 0]]), 'Body.y': 0.02 * bump(t, 0, 0.4) }),
  turn_right: (t) => ({ 'Body.yaw': keys(t, [[0, 0], [0.4, -90], [0.6, -90], [1, 0]]), 'Body.y': 0.02 * bump(t, 0, 0.4) }),
  takeoff: (t) =>
    wings(
      {
        'Spine.pitch': keys(t, [[0, 0], [0.3, 16], [0.5, -5], [1, 8]]),
        'Body.y': keys(t, [[0, 0], [0.3, -0.02], [0.55, 0.1], [1, 0.08]]),
        'Leg_L.pitch': keys(t, [[0, 0], [0.3, -10], [0.6, 30], [1, 35]]),
        'Leg_R.pitch': keys(t, [[0, 0], [0.3, -10], [0.6, 30], [1, 35]]),
      },
      {
        pitch: keys(t, [[0, 0], [0.3, 20], [0.55, 70], [0.8, 30], [1, 55]]),
        lift: keys(t, [[0, 0], [0.3, 10], [0.55, 60], [0.8, 15], [1, 45]]),
      },
    ),
  hover: (t) =>
    wings(
      {
        'Body.y': 0.09 + osc(t, 0.3, 0.012, Math.PI),
        'Spine.pitch': 6,
        'Leg_L.pitch': 30,
        'Leg_R.pitch': 30,
        'Foot_L.pitch': 30,
        'Foot_R.pitch': 30,
      },
      { spread: 55, lift: 35 + osc(t, 0.3, 40), pitch: 20 },
      { lift: osc(t, 0.3, 20, -0.8) },
    ),
  fly_forward: (t) =>
    wings(
      {
        'Spine.pitch': 38,
        'Neck.pitch': -30,
        'Head.pitch': -12,
        'Body.y': 0.1 + osc(t, 0.4, 0.015),
        'Leg_L.pitch': 55,
        'Leg_R.pitch': 55,
      },
      { spread: 65, lift: 25 + osc(t, 0.4, 50), pitch: 10 },
    ),
  glide: (t) =>
    wings(
      {
        'Spine.pitch': 18,
        'Neck.pitch': -12,
        'Body.roll': osc(t, 2, 6),
        'Body.y': 0.1 + osc(t, 2, 0.01),
        'Leg_L.pitch': 50,
        'Leg_R.pitch': 50,
      },
      { spread: 85, lift: 12 + osc(t, 2, 4) },
    ),
  land: (t) =>
    wings(
      {
        'Body.y': keys(t, [[0, 0.1], [0.6, 0.04], [0.85, -0.01], [1.2, 0]]),
        'Spine.pitch': keys(t, [[0, 10], [0.5, -14], [0.85, 10], [1.2, 0]]),
        'Leg_L.pitch': keys(t, [[0, 40], [0.6, -5], [0.9, 5], [1.2, 0]]),
        'Leg_R.pitch': keys(t, [[0, 40], [0.6, -5], [0.9, 5], [1.2, 0]]),
      },
      {
        spread: keys(t, [[0, 55], [0.5, 75], [0.9, 20], [1.2, 0]]),
        lift: keys(t, [[0, 35], [0.5, 55], [0.9, 10], [1.2, 0]]),
        pitch: keys(t, [[0, 20], [0.5, 30], [0.9, 5], [1.2, 0]]),
      },
    ),
  perch: (t) => ({
    'Leg_L.pitch': -8,
    'Leg_R.pitch': -8,
    'Foot_L.pitch': 18,
    'Foot_R.pitch': 18,
    'Body.y': -0.02,
    'Spine.pitch': 4 + osc(t, 3, 1.5),
    'Head.yaw': osc(t, 3, 5, 1),
  }),

  // ---- games and lessons ------------------------------------------------------
  countdown: (t) => {
    const go = smooth((t - 2.25) / 0.25) * smooth((3 - t) / 0.4);
    return wings(
      {
        'Head.pitch': 14 * (bump(t, 0.1, 0.5) + bump(t, 0.85, 1.25) + bump(t, 1.6, 2)),
        'Body.y': 0.03 * bump(t, 2.3, 2.8),
        'Spine.pitch': 6 * envelope(t, 3, 0.3, 0.6) - 10 * bump(t, 2.3, 2.9),
      },
      { pitch: 60 * go, lift: 50 * go },
    );
  },
  win: (t) => {
    const e = envelope(t, 2.5, 0.2, 0.5);
    return wings(
      {
        'Body.yaw': 360 * smooth((t - 0.2) / 0.9),
        'Body.y': 0.1 * bump(t, 0.2, 1.1) + 0.05 * bump(t, 1.3, 1.7),
        'Head.pitch': -16 * e,
      },
      { pitch: 60 * e, lift: 50 * e + e * osc(t, 0.3, 14) },
    );
  },
  lose: (t) => {
    const e = envelope(t, 2.5, 0.5, 0.7);
    const shrug = bump(t, 1.4, 2.2);
    return wings(
      { 'Head.pitch': 22 * e * smooth(t / 0.8), 'Spine.pitch': 8 * e, 'Head.roll': 10 * shrug },
      { lift: -8 * e + 25 * shrug, spread: 30 * shrug },
    );
  },
  carry: (t) =>
    wings(
      {
        'Head.pitch': 6 + osc(t, 2, 2),
        'Neck.pitch': 4,
        'Spine.pitch': 3 + osc(t, 2, 1),
      },
      { lift: 5 },
    ),
  give: (t) => {
    const e = envelope(t, 1.5, 0.3, 0.4);
    return wings({ 'Spine.pitch': 16 * e, 'Neck.pitch': 10 * e, 'Head.pitch': -6 * e }, { pitch: -50 * e, lift: 25 * e });
  },
  eat: (t) => {
    const pecks = bump(t, 0.1, 0.45) + bump(t, 0.6, 0.95);
    const swallow = bump(t, 1.2, 1.9);
    return {
      'Neck.pitch': 36 * pecks - 14 * swallow,
      'Head.pitch': 16 * pecks - 16 * swallow,
      'Body.y': 0.01 * bump(t, 1.3, 1.8),
    };
  },
  think_hard: (t) => ({
    'Head.roll': osc(t, 1.5, 16),
    'Neck.yaw': osc(t, 1.5, 14, 0.7),
    'Head.pitch': -12,
    'Wing_R.pitch': -50,
    'Wing_R.roll': -(35 + osc(t, 0.75, 6)),
    'Wing_R_2.pitch': osc(t, 0.375, 12),
    'Spine.pitch': 4 + osc(t, 1.5, 2),
  }),
  encourage: (t) => {
    const e = envelope(t, 2, 0.3, 0.5);
    return {
      'Spine.pitch': 10 * e,
      'Head.roll': 12 * e,
      'Head.pitch': 6 * e,
      'Wing_L.yaw': -45 * e,
      'Wing_L.roll': 35 * e,
      'Wing_L_2.pitch': osc(t, 0.45, -35) * e,
      'Body.y': 0.01 * bump(t, 1.4, 1.8),
    };
  },
};

/** Every contract clip, as a stand-in. The record type guarantees none is missing. */
export const PROCEDURAL_CLIPS: ReadonlyMap<ClipName, ProceduralClip> = new Map(
  CLIPS.map((spec) => [
    spec.name,
    { name: spec.name, seconds: spec.seconds, loop: spec.kind === 'loop', sample: DEFINITIONS[spec.name] },
  ]),
);
