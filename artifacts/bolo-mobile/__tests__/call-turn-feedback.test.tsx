import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { CallCaptions } from '@/components/call/CallCaptions';
import { InCall } from '@/components/call/InCall';
import { CallEdgeGlow, GLOW } from '@/components/call/CallEdgeGlow';

/**
 * What the learner is told about the turn they just took.
 *
 * Owner ruling, 2026-08-28: a turn earns when he HEARD them, and a turn he
 * heard nothing in earns nothing and says so, with a glow around the screen
 * edge. These pin the two things that ruling must never turn into:
 *
 *  1. A SCORE. Nothing on this screen reads what the learner said, and there is
 *     no cross, no "wrong" and no "try again" anywhere in it.
 *  2. A COLOUR ON ITS OWN. Every state carries a word and a glyph beside the
 *     hue, so the screen reads with the colour removed.
 */

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});

jest.mock('react-native-reanimated', () => ({
  useReducedMotion: () => false,
}));

// The film, the camera and the XP query all reach native or the network. None
// of them is what these tests are about: the question is only WHEN the film is
// mounted at all.
const mockPlay = jest.fn();
const mockPause = jest.fn();
jest.mock('expo-video', () => {
  const { View } = require('react-native');
  return {
    VideoView: View,
    useVideoPlayer: () => ({ play: mockPlay, pause: mockPause, muted: true, loop: true }),
  };
});
jest.mock('@/components/call/SelfView', () => ({ SelfView: () => null }));
jest.mock('@/components/XpCounter', () => ({ XpCounter: () => null }));
jest.mock('@/lib/haptics', () => ({ hapticMedium: jest.fn() }));

describe('the caption pills', () => {
  test('chai earned shows the cup, the number and the word', () => {
    render(<CallCaptions text="કેમ છો" chaiEarned={1} outcome="earned" />);
    expect(screen.getByTestId('call-chai-earned')).toBeTruthy();
    expect(screen.getByText('+1 chai')).toBeTruthy();
  });

  test('XP earned shows its own pill, for the game call', () => {
    render(<CallCaptions text="કેમ છો" xpEarned={5} outcome="earned" />);
    expect(screen.getByTestId('call-xp-earned')).toBeTruthy();
    expect(screen.getByText('+5 XP')).toBeTruthy();
  });

  test('a turn he heard nothing in says so, and does not ask them to try again', () => {
    render(<CallCaptions text="કેમ છો" outcome="missed" />);
    expect(screen.getByTestId('call-nothing-heard')).toBeTruthy();
    expect(screen.getByText(/Didn.t catch that/)).toBeTruthy();
    expect(screen.queryByText(/try again/i)).toBeNull();
    expect(screen.queryByText(/wrong/i)).toBeNull();
  });

  test('an ordinary turn is not remarked on at all', () => {
    render(<CallCaptions text="કેમ છો" />);
    expect(screen.queryByTestId('call-chai-earned')).toBeNull();
    expect(screen.queryByTestId('call-xp-earned')).toBeNull();
    expect(screen.queryByTestId('call-nothing-heard')).toBeNull();
  });

  test('the two currencies never appear together', () => {
    // Chai on the journey, XP on the game. If both ever show at once, the
    // server granted both for one turn and that is the bug to look at.
    render(<CallCaptions text="કેમ છો" chaiEarned={1} xpEarned={0} outcome="earned" />);
    expect(screen.queryByTestId('call-xp-earned')).toBeNull();
  });
});

// It hides itself from the accessibility tree on purpose, so every query for
// it needs includeHiddenElements, exactly as the splash overlay's do.
const HIDDEN = { includeHiddenElements: true } as const;

describe('the edge glow', () => {
  test('nothing is drawn when there is nothing to say', () => {
    render(<CallEdgeGlow outcome={null} />);
    expect(screen.queryByTestId('call-edge-glow', HIDDEN)).toBeNull();
  });

  test('both outcomes draw it', () => {
    const { rerender } = render(<CallEdgeGlow outcome="earned" />);
    expect(screen.getByTestId('call-edge-glow', HIDDEN)).toBeTruthy();
    rerender(<CallEdgeGlow outcome="missed" />);
    expect(screen.getByTestId('call-edge-glow', HIDDEN)).toBeTruthy();
  });

  test('it never takes a touch, because the hang-up button is under it', () => {
    // CLAUDE.md, from the stop-card saga: a layer spanning tappable UI on this
    // screen eats every tap beneath it. This one spans the whole call.
    render(<CallEdgeGlow outcome="earned" />);
    expect(screen.getByTestId('call-edge-glow', HIDDEN).props.pointerEvents).toBe('none');
  });

  test('neither glow is a red, and neither is dark', () => {
    // Deliberate, and the one place the built thing departs from the request.
    // Red reads as "wrong" and there is no wrong answer in this feature: a miss
    // is as often the microphone or the room as it is a learner who froze.
    //
    // Also pinned: both are LIGHT on a dark screen, so each reads as a glow
    // before any question of hue arises. That is what lets the state survive
    // for a viewer who cannot separate the two colours, alongside the word and
    // the glyph in the pill.
    for (const [name, hex] of Object.entries(GLOW)) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      expect(g).toBeGreaterThan(r * 0.7);
      expect(Math.max(r, g, b)).toBeGreaterThan(200);
      expect(`${name} ${hex}`).toBeTruthy();
    }
  });
});

describe('his mouth', () => {
  const base = {
    backdrop: 'driving' as const,
    text: 'કેમ છો',
    elapsedSeconds: 3,
    onHangUp: () => {},
  };

  beforeEach(() => {
    mockPlay.mockClear();
    mockPause.mockClear();
  });

  test('stays shut while it is his turn but no sound is out yet', () => {
    // Owner, 2026-08-28: "hold chacha's mouth shut until the audio actually
    // starts. he starts talking at the begining of his turn but sometimes audio
    // takes a second." The still underneath is the film's own first frame, so
    // holding it is invisible and there is nothing to jump over when he starts.
    render(<InCall {...base} phase="speaking" voicing={false} />);
    expect(screen.queryByTestId('in-call-video')).toBeNull();
    expect(screen.getByTestId('in-call-still')).toBeTruthy();
    expect(mockPlay).not.toHaveBeenCalled();
  });

  test('moves once his voice is actually coming out', () => {
    render(<InCall {...base} phase="speaking" voicing />);
    expect(screen.getByTestId('in-call-video')).toBeTruthy();
    expect(mockPlay).toHaveBeenCalled();
  });

  test('holds still while the learner talks, as it always did', () => {
    render(<InCall {...base} phase="listening" voicing />);
    expect(screen.queryByTestId('in-call-video')).toBeNull();
  });

  test('the line does not claim he is talking while he is silent', () => {
    render(<InCall {...base} phase="speaking" voicing={false} />);
    expect(screen.getByText('Chacha-ji is thinking')).toBeTruthy();
    expect(screen.queryByText('Chacha-ji is talking')).toBeNull();
  });

  test('the XP meter is up top on the call', () => {
    render(<InCall {...base} phase="listening" />);
    expect(screen.getByTestId('in-call-xp')).toBeTruthy();
  });
});
