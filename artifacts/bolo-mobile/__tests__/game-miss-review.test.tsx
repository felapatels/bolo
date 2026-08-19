import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

// End-of-run miss review (web parity). The pins:
//  - nothing at all renders when there is nothing to review, so a perfect run
//    never offers a dead "see what you missed" button
//  - one row per wrong round, in play order, worded by the game
//  - a round that lapsed with no answer says so instead of showing a blank
//  - a game that is not answered in words can relabel both rows

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    primary: '#6C3FC5',
    foreground: '#1A1A1A',
    mutedForeground: '#888888',
    background: '#FFFFFF',
    card: '#F9F9F9',
    border: '#E0E0E0',
    muted: '#F0F0F0',
  }),
}));

import {
  MissReviewCta,
  MissReviewModal,
  type GameMiss,
} from '@/components/GameMissReview';

const miss = (over: Partial<GameMiss> = {}): GameMiss => ({
  prompt: 'prompt one',
  promptSub: 'sub one',
  answer: 'picked two',
  correct: 'right one',
  ...over,
});

describe('MissReviewCta', () => {
  test('renders nothing when there is nothing to review', () => {
    render(<MissReviewCta count={0} onPress={() => {}} />);
    expect(screen.queryByTestId('miss-review-cta')).toBeNull();
  });

  test('offers the review and reports the tap', () => {
    const onPress = jest.fn();
    render(<MissReviewCta count={2} onPress={onPress} />);
    fireEvent.press(screen.getByTestId('miss-review-cta'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('MissReviewModal', () => {
  test('lists one row per miss, in order, with what was picked', () => {
    render(
      <MissReviewModal
        misses={[
          miss(),
          miss({
            prompt: 'prompt two',
            promptSub: 'sub two',
            answer: 'picked three',
            correct: 'right two',
          }),
        ]}
        visible
        onClose={() => {}}
      />,
    );
    const rows = screen.getAllByTestId('miss-review-row');
    expect(rows).toHaveLength(2);
    expect(screen.getByText('prompt one')).toBeTruthy();
    expect(screen.getByText('sub one')).toBeTruthy();
    expect(screen.getByText('picked two')).toBeTruthy();
    expect(screen.getByText('right one')).toBeTruthy();
    expect(screen.getByText('prompt two')).toBeTruthy();
  });

  test('native script on either line carries its romanized reading', () => {
    // Section 10j: script never appears without its reading, and an empty
    // romanization (several scripts have none) renders nothing at all.
    render(
      <MissReviewModal
        misses={[
          miss({
            prompt: 'Goodbye',
            promptSub: null,
            answer: 'શુભ રાત્રિ',
            answerSub: 'shubh raatri',
            correct: 'આવજો',
            correctSub: 'aavjo',
          }),
          miss({ prompt: 'Thank you', promptSub: null, correct: 'આભાર', correctSub: '  ' }),
        ]}
        visible
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('shubh raatri')).toBeTruthy();
    expect(screen.getByText('aavjo')).toBeTruthy();
    expect(screen.queryByText('  ')).toBeNull();
  });

  test('a lapsed round says so instead of showing a blank answer', () => {
    render(
      <MissReviewModal misses={[miss({ answer: null })]} visible onClose={() => {}} />,
    );
    expect(screen.getByText('nothing, the round ran out')).toBeTruthy();
  });

  test('a game that is not answered in words can relabel both rows', () => {
    // Script Trace is traced, not typed: "You said 32 out of 100" would be
    // nonsense, so the labels are the game's to word.
    render(
      <MissReviewModal
        misses={[
          miss({
            prompt: 'ક',
            promptSub: 'ka',
            answer: '32 out of 100',
            answerLabel: 'Your best',
            correct: '40 out of 100',
            correctLabel: 'Pass mark',
          }),
        ]}
        visible
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/Your best/)).toBeTruthy();
    expect(screen.getByText(/Pass mark/)).toBeTruthy();
    expect(screen.queryByText(/You said/)).toBeNull();
  });
});
