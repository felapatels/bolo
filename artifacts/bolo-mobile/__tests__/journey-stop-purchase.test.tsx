jest.mock('@/lib/useStopPurchaseOrder', () => ({ useStopPurchaseOrder: () => ({ ready: true, canBuy: mockCanBuy }) }));
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { JourneyStopPurchase } from '@/components/JourneyStopPurchase';

const mockBuy = jest.fn();
const mockReplace = jest.fn();
let mockCanBuy = true;
let mockBalance = 0;
let mockOwned = false;
const target = { kind: 'story' as const, languageCode: 'id', journey: 1, zone: 2 };
jest.mock('@workspace/api-client-react', () => ({
  ApiError: class extends Error {},
  useListCategories: () => ({ data: [{ id: 778, slug: 'family' }] }),
  useGetTokens: () => ({ data: { balance: mockBalance }, refetch: jest.fn() }),
  useGetJourneyStopUnlocks: () => ({ data: { cost: 50, unlockedStops: mockOwned ? [{ kind: 'story', languageCode: 'id', journey: 1, zone: 2 }, { kind: 'lesson', languageCode: 'id', journey: 1, zone: 2, lessonGroupId: 55 }] : [] }, refetch: jest.fn() }),
  useUnlockJourneyStop: () => ({ mutate: mockBuy, isPending: false }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: jest.fn() }) }));
jest.mock('@/components/ChaiWallet', () => ({ ChaiWalletSheet: () => null }));
jest.mock('@/hooks/useColors', () => ({ useColors: () => ({ primary: '#600', foreground: '#000', card: '#fff', border: '#ccc' }) }));
beforeEach(() => { mockCanBuy = true; mockBalance = 0; mockOwned = false; mockBuy.mockClear(); mockReplace.mockClear(); });
test('insufficient balance keeps Buy Chai available and prevents an unlock request', () => {
  render(<JourneyStopPurchase target={target} />);
  fireEvent.press(screen.getByTestId('use-chai-unlock'));
  expect(mockBuy).not.toHaveBeenCalled();
  expect(screen.getByTestId('buy-chai-for-stop')).toBeTruthy();
});
test('sufficient funds purchase the exact story target', () => {
  mockBalance = 50;
  render(<JourneyStopPurchase target={target} />);
  fireEvent.press(screen.getByTestId('use-chai-unlock'));
  expect(mockBuy).toHaveBeenCalledWith({ data: target });
});
test('an owned stop opens without another charge even with an empty wallet', () => {
  mockOwned = true;
  render(<JourneyStopPurchase target={target} />);
  fireEvent.press(screen.getByTestId('use-chai-unlock'));
  expect(mockBuy).not.toHaveBeenCalled();
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/(app)/(tabs)/games/storybook', params: { journey: '1', zone: '2' } });
});

test('an affordable later stop cannot be purchased before earlier stops', () => {
  mockCanBuy = false; mockBalance = 1000;
  render(<JourneyStopPurchase target={target} />);
  fireEvent.press(screen.getByTestId('use-chai-unlock'));
  expect(mockBuy).not.toHaveBeenCalled();
});

// THE THIRD DOOR (2026-09-15). A lesson stop the map plays as a game must open as
// that game once it is owned, never practice: the stop card and the elder's stall
// already route through gradedStopHref. Both kinds enter through Answer Back,
// which hands a group that cannot field enough exchanges to Last Call itself.
const lessonTarget = { kind: 'lesson' as const, languageCode: 'id', journey: 1, zone: 2, lessonGroupId: 55 };
test('an owned lesson stop the map plays as Last Call opens the game, not practice', () => {
  mockOwned = true;
  render(<JourneyStopPurchase target={lessonTarget} play="last_call" stopLabel="Stop 3 of 11" />);
  fireEvent.press(screen.getByTestId('use-chai-unlock'));
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/(app)/(tabs)/games/answer-back', params: { group: '55', cat: '778', stop: 'Stop 3 of 11' } });
});
test('an owned lesson stop played as itself still opens practice', () => {
  mockOwned = true;
  render(<JourneyStopPurchase target={lessonTarget} />);
  fireEvent.press(screen.getByTestId('use-chai-unlock'));
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/(app)/practice/[id]', params: { id: '778', group: '55' } });
});
