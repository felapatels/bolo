// THE ONE-PAGER MAP (build 20). Pins: the poster loads by URL for the active
// language and falls back to the drawn placeholder when the file is missing;
// the legend draws six zones from the real useJourneyProgress against mocked
// zone payloads, with the same "Stop N of M" numbering the boarding pass uses
// (tracing and story rows counted); a finished zone, the current zone and a
// locked zone each read as words, not colour; tapping a zone opens the journey.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockState: { byZone: Record<number, any> } = { byZone: {} };

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));
jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  const icon = ({ name }: { name: string }) => <Text>{`icon-${name}`}</Text>;
  return { Feather: icon, MaterialCommunityIcons: icon };
});
jest.mock('@/constants/fonts', () => ({
  AppFonts: {
    regular: 'Inter_400Regular',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
    extrabold: 'Inter_800ExtraBold',
  },
  nativeTextStyle: () => ({}),
  isTallCascadingScript: () => false,
}));
jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    background: '#FFFFFF',
    card: '#F5F5F5',
    border: '#E0E0E0',
    cardBorder: '#E0E0E0',
    foreground: '#1A1A1A',
    mutedForeground: '#888888',
    primary: '#4F46E5',
    secondary: '#0D9488',
  }),
}));
jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    activeLang: 'hi',
    activeLanguage: { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  }),
}));
jest.mock('@/components/Screen', () => {
  const { View } = require('react-native');
  return { Screen: ({ children }: any) => <View>{children}</View>, TAB_BAR_CLEARANCE: 132 };
});
jest.mock('@/components/PressableScale', () => {
  const { Pressable } = require('react-native');
  return { PressableScale: (props: any) => <Pressable {...props} /> };
});
jest.mock('@/lib/haptics', () => ({ hapticLight: jest.fn(), hapticMedium: jest.fn() }));
// FULL REPLACEMENT: every hook the screen (and useJourneyProgress) calls must
// exist here or the file dies at render.
jest.mock('@workspace/api-client-react', () => ({
  useListCategoryLessonGroups: (categoryId: number) => mockState.byZone[categoryId],
}));

import JourneyMapScreen, { zoneDotsDone, zoneStatusCopy } from '@/app/(app)/map';

function group(position: number, status: string, stage: 'phrase' | 'sentence' = 'phrase') {
  return {
    id: position,
    position,
    status,
    stage,
    masteredCount: 0,
    phraseCount: 10,
    attemptedCount: status === 'in_progress' ? 2 : 0,
    planLocked: false,
  };
}
function zonePayload(groups: any[]) {
  return { data: { lessonGroups: groups, access: null }, isLoading: false, isError: false };
}
function nine(statusFor: (i: number) => string) {
  return Array.from({ length: 9 }, (_, i) => group(i + 1, statusFor(i), i < 4 ? 'phrase' : 'sentence'));
}

beforeEach(() => {
  mockPush.mockClear();
  mockBack.mockClear();
  mockState.byZone = {
    1: zonePayload(nine(() => 'completed')),
    2: zonePayload(nine((i) => (i < 2 ? 'completed' : i === 2 ? 'in_progress' : 'locked'))),
    3: zonePayload(Array.from({ length: 7 }, (_, i) => group(i + 1, 'locked', i < 2 ? 'phrase' : 'sentence'))),
    4: zonePayload(nine(() => 'locked')),
    5: zonePayload(nine(() => 'locked')),
    6: zonePayload(nine(() => 'locked')),
  };
});

describe('the one-pager map', () => {
  it('names the line, loads the poster by URL, and draws six zones from the live payloads', () => {
    render(<JourneyMapScreen />);
    expect(screen.getByText('Ganga Line')).toBeTruthy();
    const poster = screen.getByTestId('map-poster');
    expect(poster.props.source).toEqual({ uri: 'https://bolo-india.app/journey/maps/hi.jpg' });
    for (let i = 0; i < 6; i += 1) expect(screen.getByTestId(`map-zone-${i}`)).toBeTruthy();
    // 9 + 2 done of 52 graded groups.
    expect(screen.getByText('11 of 52 lessons done')).toBeTruthy();
  });

  it('numbers the current stop the way the boarding pass does, tracing and story rows included', () => {
    render(<JourneyMapScreen />);
    // Zone 2, graded index 2 of 9: the tracing and story rows land after the
    // fourth graded stop, so this is still row 3 of 11.
    expect(screen.getByTestId('map-zone-1-status').props.children).toBe('Stop 3 of 11');
    expect(screen.getByTestId('map-zone-0-status').props.children).toBe('All 11 stops done');
    // Numbers: 7 graded plus the two rows.
    expect(screen.getByTestId('map-zone-2-status').props.children).toBe('9 stops, locked');
    expect(screen.getByTestId('map-zone-5-status').props.children).toBe('11 stops, locked');
    expect(screen.getByText('New Delhi')).toBeTruthy();
    expect(screen.getByText('Varanasi')).toBeTruthy();
  });

  it('falls back to the drawn placeholder when the poster is missing', () => {
    render(<JourneyMapScreen />);
    fireEvent(screen.getByTestId('map-poster'), 'error');
    expect(screen.queryByTestId('map-poster')).toBeNull();
    const fallback = screen.getByTestId('map-poster-fallback');
    expect(fallback).toBeTruthy();
    expect(screen.getByText('1. New Delhi')).toBeTruthy();
    expect(screen.getByText('6. Varanasi')).toBeTruthy();
  });

  it('opens the journey from any zone, and goes back from the header', () => {
    render(<JourneyMapScreen />);
    fireEvent.press(screen.getByTestId('map-zone-3'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/journey');
    fireEvent.press(screen.getByLabelText('Go back'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('says "Finding your train..." while the payloads load', () => {
    mockState.byZone[4] = { data: undefined, isLoading: true, isError: false };
    render(<JourneyMapScreen />);
    expect(screen.getByText('Finding your train...')).toBeTruthy();
    expect(screen.queryByTestId('map-zone-0')).toBeNull();
  });
});

describe('the legend helpers', () => {
  const base = { zoneIndex: 0, geoName: 'Anand', stopCount: 11, gradedCount: 9, doneCount: 0, currentStopNumber: null, allDone: false, locked: false };
  it('word the state rather than colour it', () => {
    expect(zoneStatusCopy({ ...base, currentStopNumber: 5 })).toBe('Stop 5 of 11');
    expect(zoneStatusCopy({ ...base, doneCount: 9, allDone: true })).toBe('All 11 stops done');
    expect(zoneStatusCopy({ ...base, locked: true })).toBe('11 stops, locked');
    expect(zoneStatusCopy(base)).toBe('11 stops');
    expect(zoneStatusCopy({ ...base, stopCount: 0, gradedCount: 0 })).toBe('Not open yet');
  });
  it('fill the dots before the current stop, or all of a finished zone', () => {
    expect(zoneDotsDone({ ...base, currentStopNumber: 5 })).toBe(4);
    expect(zoneDotsDone({ ...base, doneCount: 9, allDone: true })).toBe(11);
    expect(zoneDotsDone(base)).toBe(0);
  });
});
