// THE LEARNER'S CAMERA IS A SERVER FLAG, OFF BY DEFAULT (build 17).
//
// 1.0.5 (520) went to TestFlight with the learner's own camera previewed in
// the corner of every call, mounted unconditionally, and the owner asked for
// it off without a build: "i don't want the camera in the call. That is going
// to cause an approval delay." That build could not be switched from
// anywhere. Every build after it mounts the preview only when the call's
// start response said selfView: true, and absent means no.
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { InCall } from '@/components/call/InCall';

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => false }));
jest.mock('expo-video', () => {
  const { View } = require('react-native');
  return {
    VideoView: View,
    useVideoPlayer: () => ({ play: jest.fn(), pause: jest.fn(), muted: true, loop: true }),
  };
});
// The camera itself reaches native; the question here is only whether it is
// asked for at all.
jest.mock('@/components/call/SelfView', () => {
  const { View } = require('react-native');
  return { SelfView: () => <View testID="call-self-view" /> };
});
jest.mock('@/components/XpCounter', () => ({ XpCounter: () => null }));
jest.mock('@/lib/haptics', () => ({ hapticMedium: jest.fn(), hapticLight: jest.fn() }));

const base = {
  backdrop: 'driving' as const,
  phase: 'listening' as const,
  text: 'કેમ છો',
  elapsedSeconds: 3,
  onHangUp: () => {},
};

describe('the self view on a call', () => {
  test('is not mounted when the server said nothing', () => {
    render(<InCall {...base} />);
    expect(screen.queryByTestId('call-self-view')).toBeNull();
  });

  test('is not mounted when the server said no', () => {
    render(<InCall {...base} selfView={false} />);
    expect(screen.queryByTestId('call-self-view')).toBeNull();
  });

  test('is mounted only when the server said yes', () => {
    render(<InCall {...base} selfView />);
    expect(screen.getByTestId('call-self-view')).toBeTruthy();
  });
});
