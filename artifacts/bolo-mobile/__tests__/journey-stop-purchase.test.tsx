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
  useListCategories: () => ({ data: [] }),
  useGetTokens: () => ({ data: { balance: mockBalance }, refetch: jest.fn() }),
  useGetJourneyStopUnlocks: () => ({ data: { cost: 50, unlockedStops: mockOwned ? [{ kind: 'story', languageCode: 'id', journey: 1, zone: 2 }] : [] }, refetch: jest.fn() }),
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
