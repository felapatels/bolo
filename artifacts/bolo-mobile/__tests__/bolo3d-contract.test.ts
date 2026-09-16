/**
 * The 3D Bolo contract and its lip sync, pinned (docs/bolo3d.md).
 *
 * The mouth track is pinned against the REAL Swahili line the lab plays,
 * ElevenLabs' own timings included, because the two bugs this caught on the
 * day it was written only showed on real data: a "b" merged out of "Karibu"
 * by the 60 ms rule, and "sana" opening on the vowel of the word before it.
 */

import {
  CLIPS,
  CLIP_NAMES,
  MIN_HOLD_SECONDS,
  SHAPE_KEYS,
  SOCKETS,
  auditGltf,
  mouthTrackFromAlignment,
  mouthTrackFromDuration,
  sampleMouth,
  soundOf,
  type Alignment,
  type GltfDocument,
  type MouthKey,
} from '@workspace/bolo-character';

const SAMPLE = require('../assets/bolo3d/lab/swahili-karibu.alignment.json') as { alignment: Alignment };

const holds = (track: MouthKey[]) => track.slice(0, -1).map((k, i) => track[i + 1].t - k.t);
const shapeAt = (track: MouthKey[], t: number) => [...track].reverse().find((k) => k.t <= t)?.shape;

describe('the contract', () => {
  it('carries the brief\'s fifty clips, each named once', () => {
    expect(CLIPS).toHaveLength(50);
    expect(new Set(CLIP_NAMES).size).toBe(50);
    expect(CLIP_NAMES).toEqual(expect.arrayContaining(['idle', 'listen', 'think', 'talk', 'point', 'hover', 'encourage']));
  });

  it('names the eleven shape keys and four sockets exactly as the brief does', () => {
    expect(SHAPE_KEYS).toHaveLength(11);
    expect(SHAPE_KEYS).toEqual(expect.arrayContaining(['beakOpen', 'blink', 'viseme_AA', 'viseme_MBP']));
    expect(SOCKETS).toEqual(['attach_head', 'attach_body', 'attach_wing_L', 'attach_wing_R']);
  });
});

describe('the audit', () => {
  const built = (overrides: Partial<GltfDocument> = {}): GltfDocument => ({
    nodes: [
      ...['Root', 'Spine', 'Neck', 'Head', 'Crest', 'Wing_L', 'Wing_R', 'Tail', 'Leg_L', 'Leg_R'].map((name) => ({ name, translation: [0, 0, 0] })),
      ...SOCKETS.map((name) => ({ name })),
      { name: 'body', mesh: 0 },
    ],
    skins: [{ joints: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] }],
    meshes: [{ extras: { targetNames: [...SHAPE_KEYS] }, primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [{ count: 30000 }, { count: 90000 }],
    materials: [{}],
    animations: CLIPS.map((c) => ({ name: c.name, channels: [{ target: { node: 3, path: 'rotation' } }] })),
    ...overrides,
  });

  it('passes a file built to the brief', () => {
    const report = auditGltf(built(), 3 * 1024 * 1024);
    expect(report.checks.filter((c) => c.status === 'fail')).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('fails a rig whose joints carry no transform, the Tripo export that bit twice', () => {
    const doc = built();
    doc.nodes = doc.nodes!.map((n) => ({ name: n.name, mesh: n.mesh }));
    const report = auditGltf(doc);
    expect(report.checks.find((c) => c.id === 'transforms')?.status).toBe('fail');
    expect(report.ok).toBe(false);
  });

  it('fails root motion and a budget overrun', () => {
    const doc = built({
      accessors: [{ count: 30000 }, { count: 180000 }],
      animations: [{ name: 'hop', channels: [{ target: { node: 0, path: 'translation' } }] }],
    });
    const report = auditGltf(doc, 5 * 1024 * 1024);
    expect(report.checks.find((c) => c.id === 'root-motion')?.status).toBe('fail');
    expect(report.checks.find((c) => c.id === 'triangles')?.status).toBe('fail');
    expect(report.checks.find((c) => c.id === 'bytes')?.status).toBe('fail');
  });
});

describe('the mouth track, on the real Swahili line', () => {
  const track = mouthTrackFromAlignment(SAMPLE.alignment);

  it('is deterministic, because the track is cached with the audio', () => {
    expect(mouthTrackFromAlignment(SAMPLE.alignment)).toEqual(track);
  });

  it('never holds a shape for less than 60 ms', () => {
    for (const hold of holds(track)) expect(hold).toBeGreaterThanOrEqual(MIN_HOLD_SECONDS - 0.001);
  });

  it('shuts when the line ends', () => {
    const ends = SAMPLE.alignment.character_end_times_seconds;
    expect(track[track.length - 1]).toEqual({ t: expect.any(Number), shape: 'closed' });
    expect(track[track.length - 1].t).toBeLessThanOrEqual(ends[ends.length - 1] + 0.001);
  });

  it('keeps the closures a viewer notices: habari, karibu, pamoja', () => {
    expect(shapeAt(track, 0.14)).toBe('MBP'); // haBari
    expect(shapeAt(track, 1.68)).toBe('MBP'); // kariBu, lost to the 60 ms merge the first time
    expect(shapeAt(track, 3.66)).toBe('MBP'); // Pamoja
    expect(shapeAt(track, 3.82)).toBe('MBP'); // paMoja
  });

  it('does not open a word on the vowel of the word before it', () => {
    expect(shapeAt(track, 1.9)).toBe('rest'); // Sana, after the pause following karibu
  });

  it('cross-fades between shapes instead of cutting', () => {
    const key = track.find((k) => k.shape === 'AA')!;
    const weights = sampleMouth(track, key.t + 0.02);
    expect(Object.keys(weights)).toHaveLength(2);
  });
});

describe('the fallback rhythm, for audio with no timings', () => {
  it('ends shut at the audio\'s own length and never flutters', () => {
    const track = mouthTrackFromDuration(2.4, 'Habari yako');
    expect(track[track.length - 1].shape).toBe('closed');
    expect(track[track.length - 1].t).toBeLessThanOrEqual(2.4);
    for (const hold of holds(track)) expect(hold).toBeGreaterThanOrEqual(MIN_HOLD_SECONDS - 0.001);
  });
});

describe('scripts this fork teaches', () => {
  it('reads Ge\'ez vowel orders and bilabial rows', () => {
    expect(soundOf('ሙ')).toEqual({ onset: 'MBP', nucleus: 'U' });
    expect(soundOf('ሰ').nucleus).toBe('AA');
  });

  it('reads Yoruba and Igbo dotted vowels as their vowels', () => {
    expect(soundOf('ẹ').nucleus).toBe('E');
    expect(soundOf('ọ').nucleus).toBe('O');
    expect(soundOf('ị').nucleus).toBe('I');
  });

  it('closes on Arabic meem and baa', () => {
    expect(soundOf('م').nucleus).toBe('MBP');
    expect(soundOf('ب').nucleus).toBe('MBP');
  });
});
