/**
 * THE SLOW HALO (build 21, owner: "i want view map button on web and ios to be
 * slowly pulsing since its a new area"). Three pins: the halo is drawn around
 * the child by default, Reduce Motion gets the plain control with no halo at
 * all, and `active={false}` parks it the same way. The loop itself is
 * useLoopProgress on reanimated, which the jest setup mocks wholesale, so it
 * is inert here by construction and not asserted; whether it ticks is a
 * simulator question (checked in build 21: halo mid-lap in one frame, gone
 * in the next).
 *
 * includeHiddenElements on every halo query: the halo hides itself from the
 * accessibility tree on purpose (it says nothing a screen reader can act on),
 * and RNTL drops hidden elements from queries by default. The same rule
 * CLAUDE.md records for the splash overlay.
 */
import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';
import { AttentionPulse } from '@/components/AttentionPulse';

describe('AttentionPulse', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('draws the halo around its child by default', () => {
    render(
      <AttentionPulse color="#4F46E5">
        <Text>View Map</Text>
      </AttentionPulse>,
    );
    expect(screen.getByText('View Map')).toBeTruthy();
    expect(screen.getByTestId('attention-pulse-halo', { includeHiddenElements: true })).toBeTruthy();
  });

  it('Reduce Motion gets the plain control: no halo', () => {
    jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(true);
    render(
      <AttentionPulse color="#4F46E5">
        <Text>View Map</Text>
      </AttentionPulse>,
    );
    expect(screen.getByText('View Map')).toBeTruthy();
    expect(screen.queryByTestId('attention-pulse-halo', { includeHiddenElements: true })).toBeNull();
  });

  it('active={false} parks it the same way', () => {
    render(
      <AttentionPulse color="#4F46E5" active={false}>
        <Text>View Map</Text>
      </AttentionPulse>,
    );
    expect(screen.queryByTestId('attention-pulse-halo', { includeHiddenElements: true })).toBeNull();
  });
});
