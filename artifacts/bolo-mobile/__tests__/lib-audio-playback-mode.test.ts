/**
 * Guards lib/audio's iOS playback/recording session machinery:
 *
 *  1. Mode-flip ordering — every playback flips to playback-only mode BEFORE
 *     play() and restores recording mode when the clip finishes.
 *  2. The playbackModeToken race — a stale playback's deferred restore must
 *     never override a newer playback's mode claim, while a stopped playback
 *     that is still the latest claim DOES restore recording mode (the
 *     barge-in path: that restore IS the new recording's mode).
 *  3. keepAudioSessionActive — every player is created with the option so a
 *     finishing/paused clip can never trigger expo-audio's automatic
 *     AVAudioSession deactivation while another clip is still buffering
 *     (the build 29 "replies quieter than the greeting" seam).
 *
 * The real lib/audio module runs against a scripted expo-audio mock; the
 * shared opLog interleaves mode sets and play() calls so ordering is provable.
 */

type StatusListener = (status: { didJustFinish: boolean }) => void;

type FakePlayer = {
  play: jest.Mock;
  pause: jest.Mock;
  remove: jest.Mock;
  addListener: jest.Mock;
  emitFinish: () => void;
};

// Prefixed with `mock` so jest's hoisted factories may reference them.
const mockOpLog: string[] = [];
const mockPlayers: FakePlayer[] = [];

function mockMakePlayer(): FakePlayer {
  let listener: StatusListener | null = null;
  const player: FakePlayer = {
    play: jest.fn(() => {
      mockOpLog.push('play');
    }),
    pause: jest.fn(),
    remove: jest.fn(),
    addListener: jest.fn((_event: string, cb: StatusListener) => {
      listener = cb;
      return { remove: jest.fn(() => (listener = null)) };
    }),
    emitFinish: () => {
      listener?.({ didJustFinish: true });
    },
  };
  mockPlayers.push(player);
  return player;
}

jest.mock('expo-audio', () => ({
  AudioModule: {
    requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
  },
  RecordingPresets: { HIGH_QUALITY: { ios: {} } },
  setAudioModeAsync: jest.fn(async (mode: { allowsRecording: boolean }) => {
    mockOpLog.push(mode.allowsRecording ? 'mode:recording' : 'mode:playback');
  }),
  createAudioPlayer: jest.fn(() => mockMakePlayer()),
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: '/cache/',
  EncodingType: { Base64: 'base64' },
  writeAsStringAsync: jest.fn(async () => undefined),
  readAsStringAsync: jest.fn(async () => 'x'),
}));

import { createAudioPlayer } from 'expo-audio';
import {
  activateSfxPlaybackRoute,
  ensureRecordingMode,
  playBase64Audio,
  playStreamingAudio,
  prepareRecorderInSession,
  prepareRecordingSession,
} from '@/lib/audio';

/** Flush pending microtasks/timers so deferred restores land. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(async () => {
  // Put the module into the warm-mic state every playback cares about:
  // recordingSessionActive true, current mode = recording.
  await prepareRecordingSession();
  mockOpLog.length = 0;
  mockPlayers.length = 0;
  (createAudioPlayer as jest.Mock).mockClear();
});

describe('mode-flip ordering', () => {
  test('playBase64Audio flips to playback mode before play and restores recording mode on finish', async () => {
    await playBase64Audio('QUJD', 'mp3');

    expect(mockOpLog).toEqual(['mode:playback', 'play']);

    mockPlayers[0].emitFinish();
    await flush();

    expect(mockOpLog).toEqual(['mode:playback', 'play', 'mode:recording']);
  });

  test('playStreamingAudio flips to playback mode before play and restores recording mode on finish', async () => {
    const onDone = jest.fn();
    await playStreamingAudio('http://example.test/audio/s1', { Authorization: 'Bearer t' }, onDone);

    expect(mockOpLog).toEqual(['mode:playback', 'play']);

    mockPlayers[0].emitFinish();
    await flush();

    expect(onDone).toHaveBeenCalled();
    expect(mockOpLog).toEqual(['mode:playback', 'play', 'mode:recording']);
  });
});

describe('playbackModeToken race', () => {
  test('a stopped playback that is still the latest claim restores recording mode (barge-in path)', async () => {
    const handle = await playBase64Audio('QUJD', 'mp3');

    handle.stop();
    await flush();

    // The stop's restore IS the new recording's mode.
    expect(mockOpLog).toEqual(['mode:playback', 'play', 'mode:recording']);

    // A further ensureRecordingMode re-asserts rather than deduping: the
    // early-return on modeIsRecording was removed because any stale true (a
    // rejected set, or a prepare that claimed the mode without setting it)
    // silently disabled the re-assert for the rest of the process. A repeat
    // set is idempotent; what protects a newer playback's claim from a stale
    // restore is the playbackModeToken check, covered by the two tests below.
    await ensureRecordingMode();
    expect(mockOpLog).toEqual([
      'mode:playback',
      'play',
      'mode:recording',
      'mode:recording',
    ]);
  });

  test('a stale finish event must not override a newer playback claim', async () => {
    await playBase64Audio('QUJD', 'mp3'); // playback A
    await playStreamingAudio('http://example.test/audio/s2', {}); // playback B claims a newer token

    expect(mockOpLog).toEqual(['mode:playback', 'play', 'mode:playback', 'play']);

    // A finishes late; its deferred restore must be skipped or B's audio
    // would be re-routed to the earpiece at near-zero volume.
    mockPlayers[0].emitFinish();
    await flush();

    expect(mockOpLog).toEqual(['mode:playback', 'play', 'mode:playback', 'play']);
  });

  test('a stale stop() must not override a newer playback claim', async () => {
    const a = await playBase64Audio('QUJD', 'mp3');
    await playBase64Audio('REVG', 'mp3'); // newer claim

    a.stop();
    await flush();

    // No mode:recording may appear after the newer playback's claim.
    expect(mockOpLog).toEqual(['mode:playback', 'play', 'mode:playback', 'play']);
  });
});

describe('prepare during playback (builds 35/36 "Could not start recording")', () => {
  test('a prepare enqueued DURING playback applies recording mode before record', async () => {
    const recorder = {
      prepareToRecordAsync: jest.fn(async () => {
        mockOpLog.push('prepare');
      }),
      record: jest.fn(() => {
        mockOpLog.push('record');
      }),
    };

    // Coach phrase audio autoplays: the session flips to playback-only.
    await playBase64Audio('QUJD', 'mp3');
    expect(mockOpLog).toEqual(['mode:playback', 'play']);

    // The idle-phase warm-up prepares the recorder while that clip is STILL
    // PLAYING. The old code set modeIsRecording = true here without setting
    // any mode, so everything downstream believed the session was already
    // recording-capable while it sat in playback-only.
    await prepareRecorderInSession(
      recorder as unknown as Parameters<typeof prepareRecorderInSession>[0],
    );

    // The clip finishes; its deferred restore must still re-assert.
    mockPlayers[0].emitFinish();
    await flush();

    // The record path asserts the mode one last time, unconditionally.
    await ensureRecordingMode();
    recorder.record();

    expect(mockOpLog).toEqual([
      'mode:playback',
      'play',
      'mode:recording', // prepare asserts the mode instead of claiming it
      'prepare',
      'mode:recording', // the deferred restore is no longer skipped
      'mode:recording', // the record path's own unconditional re-assert
      'record',
    ]);

    // The witness: under the old code this log was
    // ['mode:playback', 'play', 'prepare', 'record'] — record() against a
    // playback-only session, which is the device-reported failure.
    expect(mockOpLog.indexOf('record')).toBeGreaterThan(
      mockOpLog.lastIndexOf('mode:recording'),
    );
  });
});

describe('activateSfxPlaybackRoute (34B tear SFX reroute)', () => {
  test('flips a warm recording session to playback-only, with no restore', async () => {
    await activateSfxPlaybackRoute();
    expect(mockOpLog).toEqual(['mode:playback']);

    await flush();
    // One-way flip: nothing schedules a recording-mode restore — the next
    // recorder prepare re-asserts it.
    expect(mockOpLog).toEqual(['mode:playback']);
  });

  test('claims the mode token so a stale finish cannot re-route the SFX to the earpiece', async () => {
    await playBase64Audio('QUJD', 'mp3'); // mode is already playback-only
    await activateSfxPlaybackRoute(); // no redundant set, but claims the token

    // The older playback finishes late; its deferred recording-mode restore
    // must be skipped or the tear clip would move to the earpiece mid-play.
    mockPlayers[0].emitFinish();
    await flush();
    expect(mockOpLog).toEqual(['mode:playback', 'play']);
  });
});

describe('keepAudioSessionActive (build 29 loudness seam)', () => {
  test('playBase64Audio creates its player with keepAudioSessionActive', async () => {
    await playBase64Audio('QUJD', 'mp3');

    expect(createAudioPlayer).toHaveBeenCalledWith(
      { uri: expect.stringContaining('/cache/') },
      { keepAudioSessionActive: true },
    );
  });

  test('playStreamingAudio creates its player with keepAudioSessionActive and forwards headers', async () => {
    await playStreamingAudio('http://example.test/audio/s3', { Authorization: 'Bearer t' });

    expect(createAudioPlayer).toHaveBeenCalledWith(
      { uri: 'http://example.test/audio/s3', headers: { Authorization: 'Bearer t' } },
      { keepAudioSessionActive: true },
    );
  });
});
