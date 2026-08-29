// THE RINGTONE (build 17). "Chachaji phone call game and journey interruption
// should have a ringtone when calling. right now its silent on this screen."
// The screen buzzed and animated and made no sound. It loops a bundled ring
// while it is on screen, honours the sound preference, and stops the moment
// the screen goes, so a learner who answers on the first ring does not hear
// one more ring after picking up.
import React from 'react';
import { render, waitFor, screen } from '@testing-library/react-native';
import { IncomingCall } from '@/components/call/IncomingCall';

const mockPlayer = { play: jest.fn(), pause: jest.fn(), remove: jest.fn(), loop: false };
jest.mock('expo-audio', () => ({
  __esModule: true,
  createAudioPlayer: jest.fn(() => mockPlayer),
}));
const mockSoundPref = { on: true };
jest.mock('@/lib/soundPref', () => ({
  loadSoundPref: jest.fn(async () => mockSoundPref.on),
}));
jest.mock('@/lib/haptics', () => ({
  hapticHeavy: jest.fn(),
  hapticLight: jest.fn(),
  hapticMedium: jest.fn(),
}));
jest.mock('react-native-reanimated', () => ({
  useReducedMotion: () => true,
}));

const { createAudioPlayer } = jest.requireMock('expo-audio') as {
  createAudioPlayer: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPlayer.loop = false;
  mockSoundPref.on = true;
});

describe('the incoming call rings', () => {
  it('loops the bundled ringtone while the screen is up, and stops with it', async () => {
    const view = render(
      <IncomingCall backdrop="driving" onAnswer={() => {}} onIgnore={() => {}} reduceMotionOverride />,
    );
    await waitFor(() => expect(mockPlayer.play).toHaveBeenCalledTimes(1));
    expect(createAudioPlayer).toHaveBeenCalledTimes(1);
    // The mockPlayer loops, not a timer: a timer drifts against the clip.
    expect(mockPlayer.loop).toBe(true);
    expect(screen.getByText('Answer')).toBeTruthy();

    view.unmount();
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
    expect(mockPlayer.remove).toHaveBeenCalledTimes(1);
  });

  it('stays silent when the learner has turned sound effects off', async () => {
    mockSoundPref.on = false;
    render(
      <IncomingCall backdrop="driving" onAnswer={() => {}} onIgnore={() => {}} reduceMotionOverride />,
    );
    // Give the preference read a tick to resolve, then assert nothing rang.
    await waitFor(() => expect(jest.requireMock('@/lib/soundPref').loadSoundPref).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(createAudioPlayer).not.toHaveBeenCalled();
    expect(mockPlayer.play).not.toHaveBeenCalled();
  });
});
