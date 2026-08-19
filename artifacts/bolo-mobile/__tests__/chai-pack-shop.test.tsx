import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// The iOS Chai pack surface and the purchase behind it, through the real
// PurchasesContext.
//
// What is pinned here:
//   1. The shop is DARK by default, exactly as web's is, while every layer
//      beneath it runs.
//   2. Lit, it shows the server's Chai amounts and the STORE's prices, no
//      money string comes from our server.
//   3. A purchase reports success only when the SERVER says the transaction
//      is credited; a charge whose credit has not landed reports `pending`
//      and the copy never claims the Chai has arrived.
//   4. Launch recovery replays an uncredited consumable, and does nothing at
//      all when there is nothing outstanding.
// ---------------------------------------------------------------------------

const mockPurchases = {
  setLogLevel: jest.fn(),
  configure: jest.fn(),
  logIn: jest.fn(async () => ({})),
  getOfferings: jest.fn(async () => ({ current: null, all: {} })),
  getCustomerInfo: jest.fn(async () => ({
    entitlements: { active: {} },
    nonSubscriptionTransactions: [] as any[],
  })),
  getProducts: jest.fn(async (ids: string[]) =>
    ids.map((identifier) => ({
      identifier,
      priceString: identifier === 'bolo_chai_cutting' ? '$1.99' : '$4.99',
    })),
  ),
  purchaseStoreProduct: jest.fn(),
  purchasePackage: jest.fn(),
  restorePurchases: jest.fn(),
  syncPurchases: jest.fn(async () => undefined),
};

// A getter, not `default: mockPurchases`: babel hoists the mock factory above
// the const, so a direct reference captures it before it is assigned.
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  get default() {
    return mockPurchases;
  },
  LOG_LEVEL: { WARN: 'warn', ERROR: 'error' },
}));

const mockApi = {
  getChaiPacks: jest.fn(async () => ({
    packs: [
      { id: 'small', appleProductId: 'bolo_chai_cutting', chai: 25 },
      { id: 'medium', appleProductId: 'bolo_chai_kulhad', chai: 75 },
    ],
  })),
  checkChaiPackCredits: jest.fn(async (_body: { transactionIds: string[] }) => ({
    credited: [] as string[],
  })),
};

jest.mock('@workspace/api-client-react', () => ({
  getChaiPacks: (...args: any[]) => mockApi.getChaiPacks(...(args as [])),
  checkChaiPackCredits: (body: any) => mockApi.checkChaiPackCredits(body),
  getGetTokensQueryKey: () => ['/api/tokens'],
}));

const mockInvalidateQueries = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

let mockUserId: string | null = 'user_test_chai';
jest.mock('@clerk/expo', () => ({
  useAuth: () => ({ userId: mockUserId }),
}));

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    card: '#ffffff',
    border: '#e2e8f0',
    background: '#f8fafc',
    foreground: '#0f172a',
    mutedForeground: '#64748b',
  }),
}));

jest.mock('@/constants/fonts', () => ({
  AppFonts: {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
    black: 'Inter_900Black',
    extrabold: 'Inter_800ExtraBold',
  },
  nativeTextStyle: () => ({}),
}));

import { ChaiPackShop, PACK_COPY, CHAI_PACKS_LIVE } from '@/components/ChaiPackShop';
import {
  PurchasesProvider,
  usePurchases,
} from '@/contexts/PurchasesContext';

function withProvider(node: React.ReactNode) {
  return <PurchasesProvider>{node}</PurchasesProvider>;
}

/** Drives purchaseChaiPack from inside the provider and shows the outcome. */
function BuyProbe({ productId }: { productId: string }) {
  const { purchaseChaiPack, chaiPacks } = usePurchases();
  const [outcome, setOutcome] = React.useState<string>('none');
  return (
    <>
      <Text testID="probe-outcome">{outcome}</Text>
      <Text testID="probe-packs">{String(chaiPacks.length)}</Text>
      <Text
        testID="probe-buy"
        onPress={() => {
          void purchaseChaiPack(productId).then(setOutcome);
        }}
      >
        buy
      </Text>
    </>
  );
}

function customerWith(transactions: { id: string; product: string }[]) {
  return {
    entitlements: { active: {} },
    nonSubscriptionTransactions: transactions.map(({ id, product }) => ({
      transactionIdentifier: id,
      productIdentifier: product,
      purchaseDate: '2026-08-13T00:00:00Z',
      purchaseToken: null,
    })),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUserId = 'user_test_chai';
  mockApi.getChaiPacks.mockResolvedValue({
    packs: [
      { id: 'small', appleProductId: 'bolo_chai_cutting', chai: 25 },
      { id: 'medium', appleProductId: 'bolo_chai_kulhad', chai: 75 },
    ],
  });
  mockApi.checkChaiPackCredits.mockResolvedValue({ credited: [] });
  // clearAllMocks keeps implementations, so a test that leaves `logIn`
  // pending would silently disarm the next one's recovery assertions.
  mockPurchases.logIn.mockResolvedValue({} as any);
  mockPurchases.syncPurchases.mockResolvedValue(undefined);
  mockPurchases.getCustomerInfo.mockResolvedValue(customerWith([]) as any);
  mockPurchases.getProducts.mockImplementation(async (ids: string[]) =>
    ids.map((identifier) => ({
      identifier,
      priceString: identifier === 'bolo_chai_cutting' ? '$1.99' : '$4.99',
    })),
  );
  process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY = 'test_key';
});

describe('the shop surface', () => {
  it('ships LIT: the flag is on, and the default render shows the shop', async () => {
    // INVERTED on 2026-08-18, with web's. Was: the flag is off and the section
    // renders nothing. The packs shipped dark through review while the paths
    // behind them were exercised; the owner lit them for the next submission
    // build. The DARK path moved to its own case below, since it can no longer
    // be reached by rendering the default.
    expect(CHAI_PACKS_LIVE).toBe(true);
    render(withProvider(<ChaiPackShop />));
    await act(async () => {});
    expect(screen.queryByTestId('chai-pack-shop')).not.toBeNull();
  });

  it('the dark path still renders nothing, via the prop', async () => {
    render(withProvider(<ChaiPackShop live={false} />));
    await act(async () => {});
    expect(screen.queryByTestId('chai-pack-shop')).toBeNull();
  });

  it('shows the server’s Chai and the STORE’s price when lit', async () => {
    render(withProvider(<ChaiPackShop live />));
    await act(async () => {});
    expect(screen.getByTestId('chai-pack-shop')).toBeTruthy();
    expect(screen.getByText('25')).toBeTruthy();
    expect(screen.getByText('75')).toBeTruthy();
    // The price string is Apple's, verbatim. Our server never sends one.
    expect(screen.getByText('$1.99')).toBeTruthy();
    expect(screen.getByText(PACK_COPY.title)).toBeTruthy();
  });

  it('shows nothing when the store cannot price the packs', async () => {
    mockPurchases.getProducts.mockResolvedValue([] as any);
    render(withProvider(<ChaiPackShop live />));
    await act(async () => {});
    expect(screen.queryByTestId('chai-pack-shop')).toBeNull();
  });
});

describe('buying a pack', () => {
  it('succeeds only when the SERVER reports the transaction credited', async () => {
    mockPurchases.purchaseStoreProduct.mockResolvedValue({
      customerInfo: customerWith([
        { id: 'tx_1', product: 'bolo_chai_cutting' },
      ]),
    } as any);
    mockApi.checkChaiPackCredits.mockResolvedValue({ credited: ['tx_1'] });

    render(withProvider(<BuyProbe productId="bolo_chai_cutting" />));
    await act(async () => {});
    await act(async () => {
      fireEvent.press(screen.getByTestId('probe-buy'));
    });

    expect(screen.getByTestId('probe-outcome')).toHaveTextContent('success');
    // The client asked; it never told the server an amount.
    expect(mockApi.checkChaiPackCredits).toHaveBeenCalledWith({
      transactionIds: ['tx_1'],
    });
    const claimed = JSON.stringify(mockApi.checkChaiPackCredits.mock.calls);
    expect(claimed).not.toContain('25');
    expect(claimed).not.toContain('chai');
  });

  it('reports a charge whose credit has not landed as PENDING, not success', async () => {
    jest.useFakeTimers();
    mockPurchases.purchaseStoreProduct.mockResolvedValue({
      customerInfo: customerWith([
        { id: 'tx_2', product: 'bolo_chai_cutting' },
      ]),
    } as any);
    mockApi.checkChaiPackCredits.mockResolvedValue({ credited: [] });

    render(withProvider(<BuyProbe productId="bolo_chai_cutting" />));
    await act(async () => {});
    await act(async () => {
      fireEvent.press(screen.getByTestId('probe-buy'));
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(30_000);
    });

    // Not 'success', a consumable grants no entitlement, so the only honest
    // answer while the ledger is silent is "we do not know yet".
    expect(screen.getByTestId('probe-outcome')).toHaveTextContent('pending');
    jest.useRealTimers();
  });

  it('reports a cancelled purchase as cancelled', async () => {
    mockPurchases.purchaseStoreProduct.mockRejectedValue({ userCancelled: true });
    render(withProvider(<BuyProbe productId="bolo_chai_cutting" />));
    await act(async () => {});
    await act(async () => {
      fireEvent.press(screen.getByTestId('probe-buy'));
    });
    expect(screen.getByTestId('probe-outcome')).toHaveTextContent('cancelled');
  });

  it('the pending copy never claims the Chai has landed', () => {
    // Em dash removed 2026-08-19; app copy never carries one. The intent this
    // pins is unchanged and is the important half: "on the way" promises
    // delivery, not arrival, so a learner reading it while the webhook is still
    // in flight has not been lied to.
    expect(PACK_COPY.pending).toBe(
      'Chai on the way. Your balance updates in a moment.',
    );
    expect(PACK_COPY.pending).not.toMatch(/added|credited|landed|in your wallet/i);
    expect(PACK_COPY.failed).toContain('Nothing has been charged');
  });
});

describe('launch recovery, through the provider', () => {
  it('replays a consumable the server has not credited', async () => {
    mockPurchases.getCustomerInfo.mockResolvedValue(
      customerWith([{ id: 'tx_lost', product: 'bolo_chai_cutting' }]) as any,
    );
    // Uncredited when asked, credited once the store re-delivers.
    let replayed = false;
    mockApi.checkChaiPackCredits.mockImplementation(async ({ transactionIds }) => ({
      credited: replayed ? transactionIds : [],
    }));
    mockPurchases.syncPurchases.mockImplementation(async () => {
      replayed = true;
    });

    jest.useFakeTimers();
    render(withProvider(<BuyProbe productId="bolo_chai_cutting" />));
    await act(async () => {});
    await act(async () => {
      await jest.advanceTimersByTimeAsync(30_000);
    });

    expect(mockPurchases.syncPurchases).toHaveBeenCalled();
    // Recovery re-delivers a receipt; it never buys anything.
    expect(mockPurchases.purchaseStoreProduct).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('does not act on the previous account while the store is still switching', async () => {
    // Found in review: `isConfigured` stays true across an account switch
    // while `logIn` is in flight, so the store answers for the OLD customer
    // while the server answers for the NEW one, and replaying then can land
    // a purchase on the wrong ledger. Recovery waits for the binding.
    mockPurchases.getCustomerInfo.mockResolvedValue(
      customerWith([{ id: 'tx_previous_owner', product: 'bolo_chai_cutting' }]) as any,
    );
    mockApi.checkChaiPackCredits.mockResolvedValue({ credited: [] });

    jest.useFakeTimers();
    const { rerender } = render(withProvider(<BuyProbe productId="bolo_chai_cutting" />));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(30_000);
    });
    mockPurchases.syncPurchases.mockClear();

    // The switch: a new learner signs in, and logIn has not landed yet.
    let finishLogIn: (() => void) | undefined;
    mockPurchases.logIn.mockImplementation(
      () => new Promise<any>((resolve) => {
        finishLogIn = () => resolve({});
      }),
    );
    mockUserId = 'user_second_learner';
    rerender(withProvider(<BuyProbe productId="bolo_chai_cutting" />));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(30_000);
    });

    expect(mockPurchases.syncPurchases).not.toHaveBeenCalled();
    // A purchase in that same window is refused rather than charged to them.
    await act(async () => {
      fireEvent.press(screen.getByTestId('probe-buy'));
    });
    expect(mockPurchases.purchaseStoreProduct).not.toHaveBeenCalled();

    // Once the store is bound to the new learner, recovery runs normally.
    await act(async () => {
      finishLogIn?.();
      await jest.advanceTimersByTimeAsync(30_000);
    });
    expect(mockPurchases.syncPurchases).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('does nothing when there is nothing outstanding', async () => {
    mockPurchases.getCustomerInfo.mockResolvedValue(
      customerWith([{ id: 'tx_ok', product: 'bolo_chai_cutting' }]) as any,
    );
    mockApi.checkChaiPackCredits.mockResolvedValue({ credited: ['tx_ok'] });

    jest.useFakeTimers();
    render(withProvider(<BuyProbe productId="bolo_chai_cutting" />));
    await act(async () => {});
    await act(async () => {
      await jest.advanceTimersByTimeAsync(30_000);
    });

    expect(mockPurchases.syncPurchases).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});

describe('THE STALL SELLS CHAI', () => {
  // Owner ruling 2026-08-19: the bazaar's chai stall was a sign pointing at the
  // wallet, which is a strange thing for a stall to be. Someone standing at a
  // chai stall should be able to buy chai without being sent to another room.
  const bazaar = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'app', '(app)', 'bazaar.tsx'),
    'utf8',
  ) as string;

  it('the street serves the packs itself, not just a link', () => {
    expect(bazaar).toContain('<ChaiPackShop />');
  });

  it('and it is the SAME component the wallet renders', () => {
    // Two copies of a purchase surface is two places for a purchase bug to
    // hide, which is the note ChaiWallet.tsx already makes about this street.
    expect(bazaar).toContain("from '@/components/ChaiPackShop'");
    expect(bazaar).not.toMatch(/purchasePack|Purchases\.purchase/);
  });

  it('the wallet is still one tap away, for the balance and the ledger', () => {
    expect(bazaar).toContain('bazaar-open-wallet');
  });
});
