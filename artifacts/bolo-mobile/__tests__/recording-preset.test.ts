/**
 * Guards the recording preset's bitrate lever.
 *
 * The noise-robustness bench (docs/specs/noise-robustness-bench.md §7) scored
 * the same clips re-encoded at 32 kbps and 96 kbps: +6.1 points at 12 dB SNR
 * with the no-score rate falling 15 % → 5 %, +3.1 on replication, and +2.4 on
 * clean audio. 96 kbps is applied unconditionally — there is no client-side
 * room classifier to gate it with, and it costs nothing in a quiet room.
 *
 * The subtle part is that it must reach iOS, where bitrate is the only
 * capture-side lever available without a native build. expo-audio flattens a
 * preset per platform before handing it to the native recorder: common fields
 * first, then the platform block. A `bitRate` inside the `ios` block would
 * therefore silently win over the top-level one. This test drives the REAL
 * flattening function rather than restating that rule, so the guarantee is
 * checked against expo-audio's actual behaviour.
 */

// Only RecordingPresets is needed from expo-audio here; the rest of the module
// reaches for native modules that do not exist under jest. Take the presets
// from the module's own constants file so the merge below is the real one.
jest.mock('expo-audio', () => ({
  ...jest.requireActual('expo-audio/build/RecordingConstants'),
  AudioModule: {},
  createAudioPlayer: jest.fn(),
  setAudioModeAsync: jest.fn(),
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: '/cache/',
  EncodingType: { Base64: 'base64' },
  writeAsStringAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
}));

import { RECORDING_PRESET } from '../lib/audio';

// expo-audio's own per-platform flattener, exactly as prepareToRecordAsync
// calls it. Under jest-expo, Platform.OS is 'ios'.
const {
  createRecordingOptions,
} = require('expo-audio/build/utils/options') as {
  createRecordingOptions: (o: unknown) => Record<string, unknown>;
};

describe('RECORDING_PRESET', () => {
  test('records at the bench-selected 96 kbps', () => {
    expect(RECORDING_PRESET.bitRate).toBe(96000);
  });

  test('stays 16 kHz mono — Whisper resamples anyway', () => {
    expect(RECORDING_PRESET.sampleRate).toBe(16000);
    expect(RECORDING_PRESET.numberOfChannels).toBe(1);
    expect(RECORDING_PRESET.ios.sampleRate).toBe(16000);
    expect(RECORDING_PRESET.ios.numberOfChannels).toBe(1);
  });

  test('the iOS block does not shadow the bitrate', () => {
    // A bitRate here would override the top-level one when expo-audio spreads
    // the platform block second, silently leaving iOS at the old rate.
    expect(RECORDING_PRESET.ios).not.toHaveProperty('bitRate');
  });

  test('96 kbps survives expo-audio flattening on iOS', () => {
    const flattened = createRecordingOptions(RECORDING_PRESET);
    expect(flattened.bitRate).toBe(96000);
    expect(flattened.sampleRate).toBe(16000);
    expect(flattened.numberOfChannels).toBe(1);
  });

  test('metering stays enabled through flattening (silence auto-stop needs it)', () => {
    expect(RECORDING_PRESET.isMeteringEnabled).toBe(true);
    expect(createRecordingOptions(RECORDING_PRESET).isMeteringEnabled).toBe(
      true,
    );
  });
});
