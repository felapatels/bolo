/**
 * Guards the recording preset's bitrate.
 *
 * 96 kbps was bench-selected for noise (docs/specs/noise-robustness-bench.md
 * §7 scored the same clips at both rates: +6.1 points at 12 dB SNR with the
 * no-score rate falling 15 % → 5 %, +3.1 on replication, +2.4 on clean audio)
 * and it broke recording on iOS. AVAudioRecorder rejects AAC-LC at 16 kHz
 * mono 96 kbps; expo-audio's `createRecorder` swallows the settings error and
 * hands back a bare `AVAudioRecorder`, `prepareToRecord()` then returns false,
 * and the learner gets "Recording failed" with no usable microphone. 32 kbps
 * is the known-good rate, restored August 14, 2026.
 *
 * Where the encoder's real ceiling sits between 32 and 96 kbps is unmeasured.
 * Raising this value is a device test, not a config edit, the failure mode is
 * a swallowed exception, so nothing in CI or on Expo web will catch it.
 *
 * The other half of this guard is that the value reaches iOS at all, since
 * bitrate is the only capture-side lever available there without a native
 * build. expo-audio flattens a preset per platform before handing it to the
 * native recorder: common fields first, then the platform block. A `bitRate`
 * inside the `ios` block would therefore silently win over the top-level one.
 * The flattening test below drives the REAL function rather than restating
 * that rule, so the guarantee is checked against expo-audio's behaviour.
 *
 * See CODEBASE-FACTS §10ad (the raise) and §10be (the revert).
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
  test('records at 32 kbps, the rate iOS accepts at 16 kHz mono AAC-LC', () => {
    expect(RECORDING_PRESET.bitRate).toBe(32000);
  });

  test('stays 16 kHz mono, Whisper resamples anyway', () => {
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

  test('the accepted 32 kbps survives expo-audio flattening on iOS', () => {
    const flattened = createRecordingOptions(RECORDING_PRESET);
    expect(flattened.bitRate).toBe(32000);
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
