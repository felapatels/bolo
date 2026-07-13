import React from 'react';
import { Alert, Linking } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import type { SubscriptionDetails } from '@workspace/api-client-react';

// ---------------------------------------------------------------------------
// Mocks
//
// We drive the real subscription screen but stub its data hooks so each test
// shapes the exact server snapshot the page receives. Presentational wrappers
// (Screen) are light stand-ins; the interactive primitives (ChunkyButton,
// PressableScale) render for real so their press wiring is exercised. Store
// deep-linking goes through react-native's Linking, which we spy on.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {
  sub: undefined,
  cancel: undefined,
  pause: undefined,
  retention: undefined,
  restore: jest.fn(),
  isRestoring: false,
};

const mockRouter = { push: jest.fn(), back: jest.fn() };
const mockQueryClient = {
  setQueryData: jest.fn(),
  invalidateQueries: jest.fn(),
};

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
}));

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('@workspace/api-client-react', () => ({
  useGetAccountSubscription: () => mockState.sub,
  useCancelAccountSubscription: () => mockState.cancel,
  usePauseAccountSubscription: () => mockState.pause,
  useAcceptRetentionOffer: () => mockState.retention,
  getGetAccountSubscriptionQueryKey: () => ['account-subscription'],
  getGetEntitlementsQueryKey: () => ['entitlements'],
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    languages: [
      { code: 'hi', name: 'Hindi' },
      { code: 'gu', name: 'Gujarati' },
    ],
  }),
}));

jest.mock('@/contexts/PurchasesContext', () => ({
  usePurchases: () => ({
    restore: mockState.restore,
    isRestoring: mockState.isRestoring,
  }),
}));

jest.mock('@/constants/fonts', () => ({
  AppFonts: {
    regular: 'Inter_400Regular',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
    extrabold: 'Inter_800ExtraBold',
  },
}));

jest.mock('@/components/Screen', () => {
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    TAB_BAR_CLEARANCE: 0,
  };
});

// Imported after the mocks are declared.
import SubscriptionScreen from '@/app/(app)/account/subscription';

// -------------------------------- fixtures --------------------------------

function successQuery(data: unknown, extra?: Record<string, unknown>) {
  return {
    data,
    isLoading: false,
    isError: false,
    isSuccess: true,
    error: null,
    refetch: jest.fn(),
    ...extra,
  };
}
function loadingQuery() {
  return { data: undefined, isLoading: true, isError: false, refetch: jest.fn() };
}

// A mutation whose `.mutateAsync()` resolves to the configured snapshot.
function mutation(result?: unknown) {
  const mutateAsync = jest.fn().mockResolvedValue(result);
  return { mutateAsync, isPending: false };
}

function detailsFixture(over: Partial<SubscriptionDetails> = {}): SubscriptionDetails {
  return {
    tier: 'plus',
    status: 'active',
    chosenLanguage: null,
    trialEndsAt: null,
    currentPeriodEnd: '2026-09-01T00:00:00.000Z',
    pauseUntil: null,
    cancelAtPeriodEnd: false,
    retentionOfferAcceptedAt: null,
    provider: 'revenuecat',
    paymentMethod: { store: 'App Store', managementUrl: null },
    billingHistory: [],
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState.cancel = mutation(detailsFixture({ cancelAtPeriodEnd: true, status: 'canceled' }));
  mockState.pause = mutation(detailsFixture({ status: 'paused', pauseUntil: '2026-08-01T00:00:00.000Z' }));
  mockState.retention = mutation(detailsFixture({ retentionOfferAcceptedAt: '2026-07-13T00:00:00.000Z' }));
  mockState.restore = jest.fn().mockResolvedValue(false);
  mockState.isRestoring = false;
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

// --------------------------------- tests ----------------------------------

describe('SubscriptionScreen', () => {
  it('shows a loading state while the snapshot loads', () => {
    mockState.sub = loadingQuery();
    render(<SubscriptionScreen />);
    expect(screen.queryByText('Free plan')).toBeNull();
    expect(screen.queryByText('Bolo! Plus')).toBeNull();
  });

  it('routes a free learner to the paywall', () => {
    mockState.sub = successQuery(detailsFixture({ tier: 'free', status: 'none' }));
    render(<SubscriptionScreen />);

    expect(screen.getByText('Free plan')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('See plans'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(app)/paywall');
  });

  it('shows plan, status and chosen language for a One Language subscriber', () => {
    mockState.sub = successQuery(
      detailsFixture({ tier: 'one_language', chosenLanguage: 'gu' }),
    );
    render(<SubscriptionScreen />);

    expect(screen.getByText('One Language')).toBeOnTheScreen();
    expect(screen.getByText('Active')).toBeOnTheScreen();
    // Chosen language code resolves to a human name.
    expect(screen.getByText('Gujarati')).toBeOnTheScreen();
  });

  it('presents the retention offers before canceling', () => {
    mockState.sub = successQuery(detailsFixture());
    render(<SubscriptionScreen />);

    fireEvent.press(screen.getByLabelText('Cancel subscription'));

    expect(screen.getByText('3 months at a discount')).toBeOnTheScreen();
    expect(screen.getByText('Pause instead')).toBeOnTheScreen();
  });

  it('accepts the 3-month discount through the backend', async () => {
    mockState.sub = successQuery(detailsFixture());
    render(<SubscriptionScreen />);

    fireEvent.press(screen.getByLabelText('Cancel subscription'));
    fireEvent.press(screen.getByText('Claim the offer'));

    await waitFor(() =>
      expect(mockState.retention.mutateAsync).toHaveBeenCalled(),
    );
    expect(mockQueryClient.setQueryData).toHaveBeenCalled();
  });

  it('pauses the subscription through the backend', async () => {
    mockState.sub = successQuery(detailsFixture());
    render(<SubscriptionScreen />);

    fireEvent.press(screen.getByLabelText('Cancel subscription'));
    fireEvent.press(screen.getByText('Pause subscription'));

    await waitFor(() => expect(mockState.pause.mutateAsync).toHaveBeenCalledWith({ data: { months: 1 } }));
  });

  it('records cancel intent and deep-links to the store for a store subscriber', async () => {
    mockState.sub = successQuery(detailsFixture());
    render(<SubscriptionScreen />);

    fireEvent.press(screen.getByLabelText('Cancel subscription'));
    fireEvent.press(screen.getByLabelText('Continue to cancel'));

    await waitFor(() => expect(mockState.cancel.mutateAsync).toHaveBeenCalled());
    expect(Linking.openURL).toHaveBeenCalled();
  });

  it('shows a friendly empty state when there is no billing history', () => {
    mockState.sub = successQuery(detailsFixture({ billingHistory: [] }));
    render(<SubscriptionScreen />);

    expect(screen.getByText('Billing history')).toBeOnTheScreen();
    expect(
      screen.getByText(/No past payments to show yet/i),
    ).toBeOnTheScreen();
  });

  it('lists past billing periods with dates, plan and status', () => {
    mockState.sub = successQuery(
      detailsFixture({
        billingHistory: [
          {
            productId: 'bolo_plus_monthly',
            store: 'App Store',
            purchasedAt: '2026-06-01T00:00:00.000Z',
            expiresAt: '2026-07-01T00:00:00.000Z',
            periodType: 'normal',
            status: 'expired',
          },
          {
            productId: 'bolo_plus_monthly',
            store: 'App Store',
            purchasedAt: '2026-07-01T00:00:00.000Z',
            expiresAt: '2026-08-01T00:00:00.000Z',
            periodType: 'normal',
            status: 'active',
          },
        ],
      }),
    );
    render(<SubscriptionScreen />);

    expect(screen.getByText('Billing history')).toBeOnTheScreen();
    expect(screen.queryByText(/No past payments/i)).toBeNull();
    // A humanized plan label is derived from the product id.
    expect(screen.getAllByText(/Bolo! Plus · Subscription/).length).toBe(2);
    // Both period statuses render (one active, plus the plan-state "Active").
    expect(screen.getByText('Expired')).toBeOnTheScreen();
  });

  it('lets a canceling store subscriber reactivate through the resume path', async () => {
    mockState.sub = successQuery(
      detailsFixture({ cancelAtPeriodEnd: true, status: 'canceled' }),
    );
    render(<SubscriptionScreen />);

    fireEvent.press(screen.getByText('Reactivate my plan'));

    await waitFor(() =>
      expect(mockState.retention.mutateAsync).toHaveBeenCalled(),
    );
    expect(mockQueryClient.setQueryData).toHaveBeenCalled();
    // A store reactivation stays in-app; it does not deep-link out.
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('falls back to the store when the resume path is already spent', async () => {
    mockState.retention = {
      mutateAsync: jest.fn().mockRejectedValue(new Error('already redeemed')),
      isPending: false,
    };
    mockState.sub = successQuery(
      detailsFixture({
        cancelAtPeriodEnd: true,
        status: 'canceled',
        retentionOfferAcceptedAt: '2026-06-01T00:00:00.000Z',
      }),
    );
    render(<SubscriptionScreen />);

    fireEvent.press(screen.getByText('Reactivate my plan'));

    await waitFor(() => expect(Linking.openURL).toHaveBeenCalled());
  });

  it('sends a canceling Stripe subscriber to the web portal to reactivate', async () => {
    mockState.sub = successQuery(
      detailsFixture({
        provider: 'stripe',
        cancelAtPeriodEnd: true,
        status: 'canceled',
        paymentMethod: { store: null, managementUrl: 'https://billing.example/portal' },
      }),
    );
    render(<SubscriptionScreen />);

    fireEvent.press(screen.getByText('Reactivate my plan'));

    await waitFor(() =>
      expect(Linking.openURL).toHaveBeenCalledWith('https://billing.example/portal'),
    );
    // Stripe reactivation must not touch the DB-only resume endpoint.
    expect(mockState.retention.mutateAsync).not.toHaveBeenCalled();
  });

  it('hides in-app retention offers for a Stripe (web) subscriber', () => {
    mockState.sub = successQuery(detailsFixture({ provider: 'stripe' }));
    render(<SubscriptionScreen />);

    fireEvent.press(screen.getByLabelText('Cancel subscription'));

    expect(screen.queryByText('3 months at a discount')).toBeNull();
    expect(screen.queryByText('Pause instead')).toBeNull();
    // The cancel action does not touch the DB-only endpoint for Stripe.
    fireEvent.press(screen.getByLabelText('Continue to cancel'));
    expect(mockState.cancel.mutateAsync).not.toHaveBeenCalled();
  });
});
