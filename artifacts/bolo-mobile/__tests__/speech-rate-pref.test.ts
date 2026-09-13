/**
 * The speaking-speed preference and, more importantly, the two things that
 * break silently if it is wired carelessly.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  SPEECH_RATE_PREF_KEY,
  SPEECH_RATE_OPTIONS,
  NORMAL_SPEECH_RATE,
  currentSpeechRate,
  loadSpeechRatePref,
  saveSpeechRatePref,
} from '@/lib/speechRatePref';
import { stallBoundMs, PLAYBACK_STALL_FACTOR, PLAYBACK_STALL_SLACK_MS } from '@/lib/audio';

beforeEach(async () => {
  await AsyncStorage.clear();
  await saveSpeechRatePref(NORMAL_SPEECH_RATE);
});

describe('the speaking-speed preference', () => {
  test('defaults to normal when nothing is stored', async () => {
    await AsyncStorage.clear();
    expect(await loadSpeechRatePref()).toBe(NORMAL_SPEECH_RATE);
  });

  test('round-trips every offered rate', async () => {
    for (const { rate } of SPEECH_RATE_OPTIONS) {
      await saveSpeechRatePref(rate);
      expect(await loadSpeechRatePref()).toBe(rate);
    }
  });

  // A value this module did not write is corruption or a future version's.
  // Clamping to the nearest option would apply a rate nobody chose, so an
  // unrecognised value reads as normal instead.
  test('an unrecognised stored value reads as normal, not as the nearest rate', async () => {
    await AsyncStorage.setItem(SPEECH_RATE_PREF_KEY, '0.42');
    expect(await loadSpeechRatePref()).toBe(NORMAL_SPEECH_RATE);
    await AsyncStorage.setItem(SPEECH_RATE_PREF_KEY, 'slow');
    expect(await loadSpeechRatePref()).toBe(NORMAL_SPEECH_RATE);
  });

  // lib/audio.ts reads the rate SYNCHRONOUSLY when it creates a player,
  // because playback is on the chat reply path. If the cache did not move
  // until the AsyncStorage write resolved, the very next phrase after the
  // learner touched the control would still play at the old speed.
  test('the in-memory rate moves before the write resolves', () => {
    const slower = SPEECH_RATE_OPTIONS[SPEECH_RATE_OPTIONS.length - 1]!.rate;
    void saveSpeechRatePref(slower);
    expect(currentSpeechRate()).toBe(slower);
  });

  test('a rejected write still leaves the session on the chosen rate', async () => {
    const spy = jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('full'));
    await saveSpeechRatePref(0.8);
    expect(currentSpeechRate()).toBe(0.8);
    spy.mockRestore();
  });
});

describe('the stall watchdog at a slowed rate', () => {
  // THE BUG THIS PREVENTS IS A CUT-OFF SENTENCE. The watchdog bound is derived
  // from the clip's own duration, which is its length at NORMAL speed. At 0.65
  // the clip runs about 54% longer, so an undivided bound fires while Bolo is
  // still talking, calls onDone, and the chat screen moves on mid-reply.
  test('the bound grows as the rate falls', () => {
    const secs = 10;
    saveSpeechRatePref(NORMAL_SPEECH_RATE);
    const atNormal = stallBoundMs(secs);
    expect(atNormal).toBe(secs * 1000 * PLAYBACK_STALL_FACTOR + PLAYBACK_STALL_SLACK_MS);

    for (const { rate } of SPEECH_RATE_OPTIONS) {
      void saveSpeechRatePref(rate);
      const bound = stallBoundMs(secs);
      // The real clip length at this rate, with the factor's headroom on top.
      const realPlayMs = (secs * 1000) / rate;
      expect(bound).toBeGreaterThan(realPlayMs);
      expect(bound).toBeGreaterThanOrEqual(atNormal);
    }
  });

  test('the slowest rate still leaves the factor intact', () => {
    const slowest = SPEECH_RATE_OPTIONS[SPEECH_RATE_OPTIONS.length - 1]!.rate;
    void saveSpeechRatePref(slowest);
    expect(stallBoundMs(10)).toBeCloseTo(
      (10 * 1000 * PLAYBACK_STALL_FACTOR) / slowest + PLAYBACK_STALL_SLACK_MS,
      5,
    );
  });
});
