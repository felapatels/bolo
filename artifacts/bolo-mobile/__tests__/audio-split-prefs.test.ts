/**
 * Tests for the audio-toggle split (Build 35):
 *   bolo.soundEffects  — UI cues (correct/wrong beeps, paper-tear, squawk SFX)
 *   bolo.coachVoice    — all Bolo speech (phrase audio, meaning, feedback, chat)
 *
 * Covers: migration behaviour, save+load round-trip. The settings-surface and
 * consumer behaviour (coachVoiceRef gates in practice/review/chat) are covered
 * by the manual smoke criteria and the existing RNTL suite baselines.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { loadCoachVoicePref, saveCoachVoicePref, COACH_VOICE_PREF_KEY } from '../lib/coachVoicePref';
import { SOUND_PREF_KEY } from '../lib/soundPref';

beforeEach(async () => {
  // Clear all storage so each test starts from a known state.
  await AsyncStorage.clear();
});

describe('loadCoachVoicePref — migration from legacy soundEffects key', () => {
  it('returns true (default on) when neither key is stored', async () => {
    expect(await loadCoachVoicePref()).toBe(true);
  });

  it('inherits false from legacy bolo.soundEffects when coachVoice is absent', async () => {
    await AsyncStorage.setItem(SOUND_PREF_KEY, 'off');
    expect(await loadCoachVoicePref()).toBe(false);
  });

  it('inherits true from legacy bolo.soundEffects when coachVoice is absent', async () => {
    await AsyncStorage.setItem(SOUND_PREF_KEY, 'on');
    expect(await loadCoachVoicePref()).toBe(true);
  });

  it('own key takes precedence over the legacy soundEffects value', async () => {
    // Legacy says "off" — but user explicitly set coachVoice to "on".
    await AsyncStorage.setItem(SOUND_PREF_KEY, 'off');
    await AsyncStorage.setItem(COACH_VOICE_PREF_KEY, 'on');
    expect(await loadCoachVoicePref()).toBe(true);
  });

  it('own key "off" is respected even when legacy key is absent', async () => {
    await AsyncStorage.setItem(COACH_VOICE_PREF_KEY, 'off');
    expect(await loadCoachVoicePref()).toBe(false);
  });
});

describe('saveCoachVoicePref + loadCoachVoicePref round-trip', () => {
  it('persists false across a reload', async () => {
    await saveCoachVoicePref(false);
    expect(await loadCoachVoicePref()).toBe(false);
  });

  it('persists true across a reload', async () => {
    await saveCoachVoicePref(true);
    expect(await loadCoachVoicePref()).toBe(true);
  });
});
