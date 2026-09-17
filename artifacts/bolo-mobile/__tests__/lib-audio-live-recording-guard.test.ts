/**
 * A LIVE RECORDING MUST SURVIVE THE SESSION QUEUE.
 *
 * India iPad, production 1.0.19 (549), 2026-09-17: two chat turns worked and
 * the third came back as the can't-hear tease, with no "Recording failed" and
 * nothing in Sentry. The tease needs metering that never cleared the speech
 * bar, so record() ran and the hold measured silence.
 *
 * expo-audio 1.1.1's native iOS code has two ways to end a capture without
 * telling JS, and both are reachable from lib/audio's queue:
 *
 *   1. setAudioModeAsync({ allowsRecording: false }) calls
 *      AVAudioRecorder.stop() on every recording recorder
 *      (ios/AudioModule.swift setAudioMode).
 *   2. prepareToRecordAsync on a recording recorder stops it and swaps in a
 *      fresh AVAudioRecorder (ios/AudioRecorder.swift prepare).
 *
 * And a third that leaves the hold silent from the start: record() on a
 * recorder that is not in its prepared state returns an empty status and does
 * nothing (ios/AudioRecorder.swift startRecording).
 *
 * The expo-audio double below models exactly those three native behaviours,
 * so each test fails if lib/audio lets them happen.
 */

type StatusListener = (status: { didJustFinish: boolean }) => void;

const mockOpLog: string[] = [];
const mockCapture = jest.fn();

type FakeRecorder = {
  state: 'idle' | 'prepared' | 'recording' | 'stopped';
  capturing: boolean;
  readonly isRecording: boolean;
  prepareToRecordAsync: jest.Mock;
  record: jest.Mock;
  stop: jest.Mock;
  getCurrentInput: jest.Mock;
};

const mockRecorders: FakeRecorder[] = [];

function mockMakeRecorder(): FakeRecorder {
  const r: FakeRecorder = {
    state: 'idle',
    capturing: false,
    get isRecording() {
      return this.capturing;
    },
    prepareToRecordAsync: jest.fn(async () => {
      // Native prepare: a recording recorder is stopped and replaced.
      if (r.capturing) mockOpLog.push('native:prepare stopped live capture');
      r.capturing = false;
      r.state = 'prepared';
      mockOpLog.push('prepare');
    }),
    record: jest.fn(() => {
      // Native startRecording: silently does nothing unless prepared.
      if (r.state !== 'prepared') {
        mockOpLog.push('record:no-op unprepared');
        return;
      }
      r.state = 'recording';
      r.capturing = true;
      mockOpLog.push('record');
    }),
    stop: jest.fn(async () => {
      r.capturing = false;
      r.state = 'stopped';
    }),
    getCurrentInput: jest.fn(async () => ({ type: 'MicrophoneBuiltIn', name: 'x', uid: 'y' })),
  };
  mockRecorders.push(r);
  return r;
}

function mockMakePlayer() {
  let listener: StatusListener | null = null;
  return {
    play: jest.fn(() => mockOpLog.push('play')),
    pause: jest.fn(),
    remove: jest.fn(),
    addListener: jest.fn((_e: string, cb: StatusListener) => {
      listener = cb;
      return { remove: jest.fn(() => (listener = null)) };
    }),
    emitFinish: () => listener?.({ didJustFinish: true }),
  };
}

jest.mock('expo-audio', () => ({
  AudioModule: {
    requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
  },
  RecordingPresets: { HIGH_QUALITY: { ios: {} } },
  setAudioModeAsync: jest.fn(async (mode: { allowsRecording: boolean }) => {
    if (!mode.allowsRecording) {
      // Native setAudioMode: every recording recorder is stopped.
      for (const r of mockRecorders) {
        if (r.capturing) {
          r.capturing = false;
          mockOpLog.push('native:playback mode stopped live capture');
        }
      }
    }
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

jest.mock('@/lib/sentry', () => ({
  Sentry: {
    addBreadcrumb: jest.fn(),
    captureException: jest.fn(),
    captureMessage: (...args: unknown[]) => mockCapture(...args),
  },
}));

import type { AudioRecorder } from 'expo-audio';
import {
  beginRecording,
  ensureRecordingMode,
  playStreamingAudio,
  prepareRecorderInSession,
  prepareRecordingSession,
  reportSilentRecording,
} from '@/lib/audio';

const asRecorder = (r: FakeRecorder) => r as unknown as AudioRecorder;

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** A warm session and a recorder that is capturing, started the chat way. */
async function liveHold(): Promise<FakeRecorder> {
  await prepareRecordingSession();
  const r = mockMakeRecorder();
  await prepareRecorderInSession(asRecorder(r));
  await ensureRecordingMode();
  await beginRecording(asRecorder(r));
  mockOpLog.length = 0;
  return r;
}

beforeEach(() => {
  mockOpLog.length = 0;
  mockRecorders.length = 0;
  mockCapture.mockClear();
});

describe('a playback flip queued behind a live hold', () => {
  test('does not switch the session to playback-only, so the capture survives', async () => {
    const r = await liveHold();

    // The late reply clip: its flip lands after record(), which is the order
    // a buffered reply's file write or a stale turn can produce.
    const handle = await playStreamingAudio('https://x/audio', {});

    expect(mockOpLog).not.toContain('mode:playback');
    expect(mockOpLog).not.toContain('native:playback mode stopped live capture');
    expect(r.isRecording).toBe(true);

    handle.stop();
    await flush();
  });

  test('still flips once the recording has stopped, so coach audio keeps the speaker', async () => {
    const r = await liveHold();
    await r.stop();

    const handle = await playStreamingAudio('https://x/audio', {});
    expect(mockOpLog).toContain('mode:playback');

    handle.stop();
    await flush();
  });
});

describe('a recorder prepare queued behind a live hold', () => {
  test('does not run the native prepare, and reports that it did not', async () => {
    const r = await liveHold();

    // The idle pre-warm landing after record().
    const prepared = await prepareRecorderInSession(asRecorder(r));

    expect(prepared).toBe(false);
    expect(mockOpLog).not.toContain('native:prepare stopped live capture');
    expect(r.isRecording).toBe(true);
  });

  test('prepares normally, and says so, when the recorder is not capturing', async () => {
    await prepareRecordingSession();
    const r = mockMakeRecorder();
    await expect(prepareRecorderInSession(asRecorder(r))).resolves.toBe(true);
    expect(r.state).toBe('prepared');
  });
});

describe('beginRecording verifies the capture started', () => {
  test('re-prepares and retries a record() that silently did nothing', async () => {
    await prepareRecordingSession();
    mockOpLog.length = 0;
    const r = mockMakeRecorder(); // never prepared: record() is a native no-op

    await beginRecording(asRecorder(r));

    // Whether the prepare also re-applies recording mode depends on module
    // state left by earlier tests, so assert the order that matters.
    expect(mockOpLog[0]).toBe('record:no-op unprepared');
    expect(mockOpLog.slice(-3)).toEqual(['prepare', 'mode:recording', 'record']);
    expect(r.isRecording).toBe(true);
  });

  test('throws when the retry does not start either, so the caller can say so', async () => {
    await prepareRecordingSession();
    const r = mockMakeRecorder();
    r.record.mockImplementation(() => undefined); // refuses every time

    await expect(beginRecording(asRecorder(r))).rejects.toThrow(
      'recorder did not start capturing',
    );
  });

  test('does not second-guess a platform that does not report isRecording', async () => {
    await prepareRecordingSession();
    const bare = { record: jest.fn() } as unknown as AudioRecorder;
    await expect(beginRecording(bare)).resolves.toBeUndefined();
    expect((bare as unknown as { record: jest.Mock }).record).toHaveBeenCalledTimes(1);
  });
});

describe('reportSilentRecording', () => {
  test('sends the readings, the native recorder state and the input port type, tagged at the floor', async () => {
    const r = await liveHold();
    await r.stop();

    await reportSilentRecording({
      source: 'client',
      meteringReadings: 9,
      meteringMinDb: -160,
      meteringMaxDb: -160,
      floorReadings: 9,
      holdMs: 2300,
      recorder: asRecorder(r),
    });

    expect(mockCapture).toHaveBeenCalledTimes(1);
    const [message, ctx] = mockCapture.mock.calls[0] as [
      string,
      { level: string; tags: Record<string, string>; extra: Record<string, unknown> },
    ];
    expect(message).toBe('audio silent recording');
    expect(ctx.level).toBe('warning');
    expect(ctx.tags).toMatchObject({
      audioStage: 'silent_recording',
      silentSource: 'client',
      meteringAtFloor: 'yes',
    });
    expect(ctx.extra).toMatchObject({
      meteringReadings: 9,
      floorReadings: 9,
      recorderIsRecording: false,
      inputPortType: 'MicrophoneBuiltIn',
      recordingSessionActive: true,
    });
    // A port TYPE only: never its name or uid.
    expect(JSON.stringify(ctx.extra)).not.toContain('"uid"');
  });

  test('labels a quiet room as not at the floor, and survives a missing input route', async () => {
    const r = mockMakeRecorder();
    r.getCurrentInput.mockImplementation(() => {
      throw new Error('No input found');
    });

    await reportSilentRecording({
      source: 'server',
      meteringReadings: 8,
      meteringMinDb: -58,
      meteringMaxDb: -47,
      floorReadings: 0,
      holdMs: 1800,
      recorder: asRecorder(r),
    });

    const ctx = mockCapture.mock.calls[0][1] as {
      tags: Record<string, string>;
      extra: Record<string, unknown>;
    };
    expect(ctx.tags.meteringAtFloor).toBe('no');
    expect(ctx.extra.inputPortType).toBe('none');
  });
});
