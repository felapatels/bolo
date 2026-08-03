// R4: the paper-tear SFX layer (lib/tearAudio.ts). Contract pins:
//   - preloadTearAudio creates ONE module-cached player at TEAR_SFX_GAIN and
//     is idempotent; a create failure leaves the layer silently disabled.
//   - playTearSfx is fire-and-forget: returns synchronously, never throws,
//     rewinds then plays, and stays silent without a preload, when the app
//     is backgrounded, or when the sound preference is off.
// The module caches the player at module scope, so every test re-requires a
// fresh copy via jest.isolateModules.

const mockCreateAudioPlayer = jest.fn();
jest.mock('expo-audio', () => ({
  createAudioPlayer: (...args: unknown[]) => mockCreateAudioPlayer(...args),
}));

const mockLoadSoundPref = jest.fn<Promise<boolean>, []>();
jest.mock('@/lib/soundPref', () => ({
  loadSoundPref: () => mockLoadSoundPref(),
}));

// 34B item 4: tearAudio now imports the serialized playback-only route flip
// from lib/audio (speaker, not earpiece, while the mic session is warm). The
// real lib/audio would crash under this file's minimal expo-audio mock, so
// stub just the seam tearAudio uses.
const mockActivateSfxPlaybackRoute = jest.fn<Promise<void>, []>(() =>
  Promise.resolve(),
);
jest.mock('@/lib/audio', () => ({
  activateSfxPlaybackRoute: () => mockActivateSfxPlaybackRoute(),
}));

import { AppState } from 'react-native';

type TearAudio = typeof import('@/lib/tearAudio');

const freshModule = (): TearAudio => {
  let mod: TearAudio;
  jest.isolateModules(() => {
    mod = require('@/lib/tearAudio');
  });
  return mod!;
};

const makePlayer = () => ({
  volume: 1,
  seekTo: jest.fn(() => Promise.resolve()),
  play: jest.fn(),
  remove: jest.fn(),
});

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadSoundPref.mockResolvedValue(true);
  (AppState as { currentState: string }).currentState = 'active';
});

describe('preloadTearAudio', () => {
  it('creates one player at TEAR_SFX_GAIN and is idempotent', () => {
    const player = makePlayer();
    mockCreateAudioPlayer.mockReturnValue(player);
    const mod = freshModule();

    mod.preloadTearAudio();
    mod.preloadTearAudio();
    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1);
    expect(player.volume).toBe(mod.TEAR_SFX_GAIN);
    expect(mod.TEAR_SFX_GAIN).toBe(0.4);
  });

  it('a create failure is silent and leaves playback disabled', async () => {
    mockCreateAudioPlayer.mockImplementation(() => {
      throw new Error('no audio backend');
    });
    const mod = freshModule();

    expect(() => mod.preloadTearAudio()).not.toThrow();
    expect(() => mod.playTearSfx()).not.toThrow();
    await flush();
    // Nothing to play against; the sound pref is never even consulted.
    expect(mockLoadSoundPref).not.toHaveBeenCalled();
  });
});

describe('playTearSfx', () => {
  it('rewinds then plays the preloaded clip', async () => {
    const player = makePlayer();
    mockCreateAudioPlayer.mockReturnValue(player);
    const mod = freshModule();
    mod.preloadTearAudio();

    mod.playTearSfx();
    await flush();
    expect(player.seekTo).toHaveBeenCalledWith(0);
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('is silent without a preload', async () => {
    const mod = freshModule();
    expect(() => mod.playTearSfx()).not.toThrow();
    await flush();
    expect(mockCreateAudioPlayer).not.toHaveBeenCalled();
  });

  it('is silent when the app is backgrounded', async () => {
    const player = makePlayer();
    mockCreateAudioPlayer.mockReturnValue(player);
    const mod = freshModule();
    mod.preloadTearAudio();

    (AppState as { currentState: string }).currentState = 'background';
    mod.playTearSfx();
    await flush();
    expect(player.play).not.toHaveBeenCalled();
  });

  it('is silent when the sound preference is off', async () => {
    const player = makePlayer();
    mockCreateAudioPlayer.mockReturnValue(player);
    mockLoadSoundPref.mockResolvedValue(false);
    const mod = freshModule();
    mod.preloadTearAudio();

    mod.playTearSfx();
    await flush();
    expect(player.play).not.toHaveBeenCalled();
  });

  it('swallows seek/play failures (fire-and-forget, never throws)', async () => {
    const player = makePlayer();
    player.seekTo.mockRejectedValue(new Error('seek failed'));
    mockCreateAudioPlayer.mockReturnValue(player);
    const mod = freshModule();
    mod.preloadTearAudio();

    expect(() => mod.playTearSfx()).not.toThrow();
    await flush();
    expect(player.play).not.toHaveBeenCalled(); // failed seek skips play, quietly
  });
});

// 34B item 4: while the mic session is warm, iOS routes playback to the
// earpiece; the tear must flip to playback-only mode (speaker) first, inside
// the fire-and-forget chain — before play, but never gating the animation.
describe('speaker reroute (34B)', () => {
  it('runs the playback-only route flip before playing', async () => {
    let resolveRoute!: () => void;
    mockActivateSfxPlaybackRoute.mockImplementationOnce(
      () => new Promise<void>((r) => { resolveRoute = r; }),
    );
    const player = makePlayer();
    mockCreateAudioPlayer.mockReturnValue(player);
    const mod = freshModule();
    mod.preloadTearAudio();

    mod.playTearSfx();
    await flush();
    // The flip has been requested but not settled: play must wait for it.
    expect(mockActivateSfxPlaybackRoute).toHaveBeenCalledTimes(1);
    expect(player.play).not.toHaveBeenCalled();

    resolveRoute();
    await flush();
    expect(player.seekTo).toHaveBeenCalledWith(0);
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('a route-flip failure still plays the clip', async () => {
    mockActivateSfxPlaybackRoute.mockImplementationOnce(() =>
      Promise.reject(new Error('mode set failed')),
    );
    const player = makePlayer();
    mockCreateAudioPlayer.mockReturnValue(player);
    const mod = freshModule();
    mod.preloadTearAudio();

    expect(() => mod.playTearSfx()).not.toThrow();
    await flush();
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('never touches the audio session when the sound preference is off', async () => {
    const player = makePlayer();
    mockCreateAudioPlayer.mockReturnValue(player);
    mockLoadSoundPref.mockResolvedValue(false);
    const mod = freshModule();
    mod.preloadTearAudio();

    mod.playTearSfx();
    await flush();
    expect(mockActivateSfxPlaybackRoute).not.toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();
  });
});
