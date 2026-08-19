// Buying Chai on iOS: the parts that decide whether a learner who paid gets
// what they paid for (lib/chaiPurchase.ts).
//
// The store and the server are injected here, which is the point of the
// module existing at all, these paths must be provable without a device.
//
// What is pinned:
//   1. Only OUR consumables are considered, and each one only once.
//   2. A purchase is "done" when the SERVER says the transaction is credited,
//      never when the store call resolved.
//   3. THE FULL ARC: Apple charges, the credit does not land, and the next
//      launch recovers it, with no second charge, and with the client never
//      once stating an amount.
//   4. The client cannot double-credit, because it never credits at all: it
//      asks the store to re-deliver and the ledger's refId index decides.

import {
  consumableTransactions,
  recoverUncreditedPurchases,
  waitForCredit,
  type ChaiPackCatalogEntry,
} from '@/lib/chaiPurchase';

const PACKS: ChaiPackCatalogEntry[] = [
  { id: 'small', appleProductId: 'bolo_chai_cutting', chai: 25 },
  { id: 'medium', appleProductId: 'bolo_chai_kulhad', chai: 75 },
  { id: 'large', appleProductId: 'bolo_chai_kettle', chai: 200 },
];

// No real waiting anywhere in this file.
const nap = jest.fn(async () => {});
const noDelays = [0, 0, 0] as const;

function tx(transactionIdentifier: string, productIdentifier: string) {
  return { transactionIdentifier, productIdentifier };
}

beforeEach(() => {
  nap.mockClear();
});

describe('reading the customer’s consumables', () => {
  it('keeps our packs and drops everything else', () => {
    const info = {
      nonSubscriptionTransactions: [
        tx('100', 'bolo_chai_cutting'),
        tx('101', 'some_other_consumable'),
        tx('102', 'bolo_chai_kettle'),
      ],
    };
    expect(
      consumableTransactions(info, PACKS).map((t) => t.transactionIdentifier),
    ).toEqual(['100', '102']);
  });

  it('lists a repeat purchase of the same pack as two transactions', () => {
    // Apple gives each purchase its own transaction id even when the product
    // is identical. Collapsing them here would lose a learner's second buy.
    const info = {
      nonSubscriptionTransactions: [
        tx('200', 'bolo_chai_cutting'),
        tx('201', 'bolo_chai_cutting'),
      ],
    };
    expect(consumableTransactions(info, PACKS)).toHaveLength(2);
  });

  it('deduplicates the same transaction and survives an empty customer', () => {
    const info = {
      nonSubscriptionTransactions: [
        tx('300', 'bolo_chai_kulhad'),
        tx('300', 'bolo_chai_kulhad'),
      ],
    };
    expect(consumableTransactions(info, PACKS)).toHaveLength(1);
    expect(consumableTransactions(null, PACKS)).toEqual([]);
    expect(consumableTransactions({}, PACKS)).toEqual([]);
  });
});

describe('the success signal', () => {
  it('is the server reporting the transaction credited', async () => {
    const isCredited = jest.fn(async () => ['400']);
    expect(
      await waitForCredit('400', isCredited, { delays: noDelays, sleep: nap }),
    ).toBe(true);
    // The fast path: no waiting when the webhook already landed.
    expect(nap).not.toHaveBeenCalled();
  });

  it('keeps asking while the credit is in flight', async () => {
    const isCredited = jest
      .fn<Promise<string[]>, [string[]]>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValue(['401']);
    expect(
      await waitForCredit('401', isCredited, { delays: noDelays, sleep: nap }),
    ).toBe(true);
    expect(isCredited).toHaveBeenCalledTimes(3);
  });

  it('gives up without lying when the credit never lands', async () => {
    const isCredited = jest.fn(async () => [] as string[]);
    expect(
      await waitForCredit('402', isCredited, { delays: noDelays, sleep: nap }),
    ).toBe(false);
  });

  it('treats a failed read as "not yet", not as a failed purchase', async () => {
    const isCredited = jest
      .fn<Promise<string[]>, [string[]]>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(['403']);
    expect(
      await waitForCredit('403', isCredited, { delays: noDelays, sleep: nap }),
    ).toBe(true);
  });
});

describe('launch recovery', () => {
  it('does nothing when every consumable is already credited', async () => {
    const replay = jest.fn(async () => {});
    const result = await recoverUncreditedPurchases({
      getCustomerInfo: async () => ({
        nonSubscriptionTransactions: [tx('500', 'bolo_chai_cutting')],
      }),
      replay,
      isCredited: async () => ['500'],
      packs: PACKS,
      delays: noDelays,
      sleep: nap,
    });
    expect(result.uncredited).toEqual([]);
    expect(replay).not.toHaveBeenCalled();
  });

  it('THE ARC: Apple charged, the credit failed, the next launch recovers it', async () => {
    // Launch 1, the purchase goes through at Apple and the webhook never
    // credits it. The learner is out of pocket with nothing to show.
    const isCreditedLaunchOne = jest.fn(async () => [] as string[]);
    const boughtButUncredited = await waitForCredit('600', isCreditedLaunchOne, {
      delays: noDelays,
      sleep: nap,
    });
    expect(boughtButUncredited).toBe(false);

    // Launch 2, the app reads the same transaction from the store, learns
    // the server still has no row for it, and asks the store to re-deliver.
    // The credit lands on the replay.
    let creditLanded = false;
    const replay = jest.fn(async () => {
      creditLanded = true;
    });
    const isCredited = jest.fn(async (ids: string[]) =>
      creditLanded ? ids : [],
    );

    const result = await recoverUncreditedPurchases({
      getCustomerInfo: async () => ({
        nonSubscriptionTransactions: [tx('600', 'bolo_chai_cutting')],
      }),
      replay,
      isCredited,
      packs: PACKS,
      delays: noDelays,
      sleep: nap,
    });

    expect(result.uncredited).toEqual(['600']);
    expect(result.stillUncredited).toEqual([]);
    // One re-delivery, not one re-charge: replay re-posts a receipt Apple has
    // already charged for.
    expect(replay).toHaveBeenCalledTimes(1);
  });

  it('an already-credited transaction is never credited twice', async () => {
    // The recovery run for a customer whose purchase DID credit. It asks,
    // hears yes, and stops, and even if it had replayed, the server's refId
    // index is what refuses the second row. The client keeps no books.
    const replay = jest.fn(async () => {});
    const result = await recoverUncreditedPurchases({
      getCustomerInfo: async () => ({
        nonSubscriptionTransactions: [
          tx('700', 'bolo_chai_cutting'),
          tx('701', 'bolo_chai_kettle'),
        ],
      }),
      replay,
      isCredited: async () => ['700', '701'],
      packs: PACKS,
      delays: noDelays,
      sleep: nap,
    });
    expect(result.stillUncredited).toEqual([]);
    expect(replay).not.toHaveBeenCalled();
  });

  it('gives up after a bounded number of replays, losing nothing', async () => {
    const replay = jest.fn(async () => {});
    const result = await recoverUncreditedPurchases({
      getCustomerInfo: async () => ({
        nonSubscriptionTransactions: [tx('800', 'bolo_chai_kulhad')],
      }),
      replay,
      isCredited: async () => [],
      packs: PACKS,
      attempts: 2,
      delays: noDelays,
      sleep: nap,
    });
    expect(replay).toHaveBeenCalledTimes(2);
    expect(result.stillUncredited).toEqual(['800']);
  });

  it('does not replay blind when it cannot find out what is credited', async () => {
    // Not knowing is not permission to act. Replaying here would be the
    // client deciding something only the server may decide.
    const replay = jest.fn(async () => {});
    const result = await recoverUncreditedPurchases({
      getCustomerInfo: async () => ({
        nonSubscriptionTransactions: [tx('900', 'bolo_chai_cutting')],
      }),
      replay,
      isCredited: async () => {
        throw new Error('offline');
      },
      packs: PACKS,
      delays: noDelays,
      sleep: nap,
    });
    expect(replay).not.toHaveBeenCalled();
    expect(result.seen).toEqual(['900']);
  });

  it('ignores a consumable that is not one of our packs', async () => {
    const replay = jest.fn(async () => {});
    const isCredited = jest.fn(async () => []);
    await recoverUncreditedPurchases({
      getCustomerInfo: async () => ({
        nonSubscriptionTransactions: [tx('1000', 'someone_elses_product')],
      }),
      replay,
      isCredited,
      packs: PACKS,
      delays: noDelays,
      sleep: nap,
    });
    expect(isCredited).not.toHaveBeenCalled();
    expect(replay).not.toHaveBeenCalled();
  });
});
