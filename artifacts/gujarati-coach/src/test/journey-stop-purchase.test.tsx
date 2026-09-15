vi.mock('@/lib/use-stop-purchase-order', () => ({ useStopPurchaseOrder: () => ({ ready: true, canBuy: state.canBuy }) }));
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { JourneyStopPurchase } from '@/components/journey-stop-purchase';
import { journeyStopFromSearch, journeyStopPlayFromSearch, journeyStopUpgradeHref, ownsJourneyStop } from '@/lib/journey-stop-access';

const state = vi.hoisted(() => ({ canBuy: true, balance: 0, owned: false, buy: vi.fn(), navigate: vi.fn() }));
const target = { kind: 'story' as const, languageCode: 'id', journey: 1, zone: 2 };
vi.mock('@workspace/api-client-react', () => ({
  ApiError: class extends Error {},
  useListCategories: () => ({ data: [{ id: 778, slug: 'family' }] }),
  useGetTokens: () => ({ data: { balance: state.balance }, refetch: vi.fn() }),
  useGetJourneyStopUnlocks: () => ({ data: { cost: 50, unlockedStops: state.owned ? [{ kind: 'story', languageCode: 'id', journey: 1, zone: 2 }, { kind: 'lesson', languageCode: 'id', journey: 1, zone: 2, lessonGroupId: 55 }] : [] }, refetch: vi.fn() }),
  useUnlockJourneyStop: () => ({ mutate: state.buy, isPending: false }),
}));
vi.mock('wouter', () => ({ useLocation: () => ['/', state.navigate] }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@/components/chai-wallet', () => ({ ChaiWalletSheet: () => null }));
beforeEach(() => { cleanup(); state.canBuy = true; state.balance = 0; state.owned = false; vi.clearAllMocks(); });
describe('permanent stop purchase', () => {
  it('keeps buying currency available but never submits an unaffordable unlock', () => {
    render(<JourneyStopPurchase target={target} />);
    fireEvent.click(screen.getByTestId('use-currency-unlock'));
    expect(state.buy).not.toHaveBeenCalled();
    expect(screen.getByTestId('buy-currency-for-stop')).toBeTruthy();
  });
  it('buys exactly the selected stop when the balance is sufficient', () => {
    state.balance = 50;
    render(<JourneyStopPurchase target={target} />);
    fireEvent.click(screen.getByTestId('use-currency-unlock'));
    expect(state.buy).toHaveBeenCalledWith({ data: target });
  });
  it('opens an owned stop with an empty wallet without charging again', () => {
    state.owned = true;
    render(<JourneyStopPurchase target={target} />);
    fireEvent.click(screen.getByTestId('use-currency-unlock'));
    expect(state.buy).not.toHaveBeenCalled();
    expect(state.navigate).toHaveBeenCalledWith('/games/storybook?journey=1&zone=2');
  });
  it('does not mistake a different kind, language or zone for ownership', () => {
    expect(ownsJourneyStop([{ ...target, kind: 'trace' }], target)).toBe(false);
    expect(ownsJourneyStop([{ ...target, languageCode: 'en' }], target)).toBe(false);
    expect(ownsJourneyStop([{ ...target, zone: 3 }], target)).toBe(false);
  });
  it('round-trips a target and rejects malformed upgrade links', () => {
    expect(journeyStopFromSearch(journeyStopUpgradeHref(target).split('?')[1]!)).toEqual(target);
    expect(journeyStopFromSearch('lang=id&stopKind=lesson&journey=1&zone=2')).toBeNull();
    expect(journeyStopFromSearch('lang=id&stopKind=story&journey=1&zone=99')).toBeNull();
  });
});

it('an affordable later stop remains locked until earlier purchases', () => {
  state.canBuy = false; state.balance = 1000;
  render(<JourneyStopPurchase target={target} />);
  fireEvent.click(screen.getByTestId('use-currency-unlock'));
  expect(state.buy).not.toHaveBeenCalled();
});

// THE THIRD DOOR (2026-09-15). Mobile twin: __tests__/journey-stop-purchase.test.tsx.
describe('a bought stop the map plays as a game', () => {
  const lessonTarget = { kind: 'lesson' as const, languageCode: 'id', journey: 1, zone: 2, lessonGroupId: 55 };
  it('opens the game, entering through Answer Back, not practice', () => {
    state.owned = true;
    render(<JourneyStopPurchase target={lessonTarget} play={{ play: 'last_call', stop: 'Stop 3 of 11' }} />);
    fireEvent.click(screen.getByTestId('use-currency-unlock'));
    expect(state.navigate).toHaveBeenCalledWith('/games/answer-back?group=55&cat=778&stop=Stop%203%20of%2011');
  });
  it('still opens practice for a stop played as itself', () => {
    state.owned = true;
    render(<JourneyStopPurchase target={lessonTarget} />);
    fireEvent.click(screen.getByTestId('use-currency-unlock'));
    expect(state.navigate).toHaveBeenCalledWith('/practice/778?group=55');
  });
  it('carries the play kind on the upgrade link and ignores it for other kinds', () => {
    const href = journeyStopUpgradeHref(lessonTarget, { play: 'answer_back', stop: 'Stop 5 of 11' });
    expect(journeyStopPlayFromSearch(href.split('?')[1]!)).toEqual({ play: 'answer_back', stop: 'Stop 5 of 11' });
    expect(journeyStopFromSearch(href.split('?')[1]!)).toEqual(lessonTarget);
    expect(journeyStopPlayFromSearch(journeyStopUpgradeHref(target, { play: 'last_call' }).split('?')[1]!)).toBeUndefined();
    expect(journeyStopPlayFromSearch('play=practice')).toBeUndefined();
  });
});
