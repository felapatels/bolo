/**
 * Tests for the audio-toggle split (Build 35):
 *   bolo.soundEffects  — UI cues (correct/wrong beeps, squawk SFX)
 *   bolo.coachVoice    — all Bolo speech (phrase audio, meaning, feedback, chat)
 *
 * Covers: migration behaviour, save+load round-trip. The settings-surface render
 * (both rows visible) and consumer gates (coachVoiceRef in practice/chat) are
 * covered by the manual smoke criteria and the existing vitest suite baselines.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { loadCoachVoicePref, saveCoachVoicePref, COACH_VOICE_PREF_KEY } from '../lib/coachVoicePref';
import { SOUND_PREF_KEY } from '../lib/soundPref';

beforeEach(() => {
  localStorage.clear();
});

describe('loadCoachVoicePref — migration from legacy soundEffects key', () => {
  it('returns true (default on) when neither key is stored', () => {
    expect(loadCoachVoicePref()).toBe(true);
  });

  it('inherits false from legacy bolo.soundEffects when coachVoice is absent', () => {
    localStorage.setItem(SOUND_PREF_KEY, 'off');
    expect(loadCoachVoicePref()).toBe(false);
  });

  it('inherits true from legacy bolo.soundEffects when coachVoice is absent', () => {
    localStorage.setItem(SOUND_PREF_KEY, 'on');
    expect(loadCoachVoicePref()).toBe(true);
  });

  it('own key takes precedence over the legacy soundEffects value', () => {
    // Legacy says "off" — but user explicitly set coachVoice to "on".
    localStorage.setItem(SOUND_PREF_KEY, 'off');
    localStorage.setItem(COACH_VOICE_PREF_KEY, 'on');
    expect(loadCoachVoicePref()).toBe(true);
  });

  it('own key "off" is respected even when legacy key is absent', () => {
    localStorage.setItem(COACH_VOICE_PREF_KEY, 'off');
    expect(loadCoachVoicePref()).toBe(false);
  });
});

describe('saveCoachVoicePref + loadCoachVoicePref round-trip', () => {
  it('persists false across a reload', () => {
    saveCoachVoicePref(false);
    expect(loadCoachVoicePref()).toBe(false);
  });

  it('persists true across a reload', () => {
    saveCoachVoicePref(true);
    expect(loadCoachVoicePref()).toBe(true);
  });
});
