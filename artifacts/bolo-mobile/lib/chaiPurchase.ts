/**
 * Buying Chai on iOS, and recovering a purchase Apple charged for that the
 * server did not credit.
 *
 * Everything here is deliberately free of the RevenueCat SDK and of React: the
 * store and the server are passed in as small function bags, so the two rules
 * that matter can be tested directly.
 *
 * THE TWO RULES
 *
 *   1. The client never asserts an amount, and never mints Chai. It can see
 *      which consumables Apple sold it; it cannot see whether we credited
 *      them, so it ASKS (`isCredited`, a read) and believes the answer. The
 *      Chai itself is credited by the RevenueCat webhook from the server's own
 *      catalog.
 *
 *   2. A purchase "succeeded" when the SERVER shows the transaction credited —
 *      not when the store call resolved. A consumable grants no entitlement,
 *      so the subscription flow's "did an entitlement appear?" test reports a
 *      perfectly good pack purchase as a failure.
 *
 * RECOVERY
 *
 * Apple takes the money before we hear about it. If the webhook never lands
 * (delivery failure, our downtime, a device that lost the network at exactly
 * the wrong moment), the learner has paid and has nothing. Owner ruling: this
 * is recovered by REPLAY at launch. We read the customer's non-subscription
 * transactions, ask the server which of them are already credited, and ask the
 * store to re-deliver the rest. Double-crediting is impossible not because we
 * keep careful local books but because the ledger's (user, reason, refId)
 * index refuses a second row for the same Apple transaction id.
 *
 * The rejected alternative, for the record: taking over purchase completion
 * app-side (RevenueCat's "purchases are completed by my app") would let us
 * hold a transaction open until the credit lands, but it changes how EVERY
 * purchase — including the subscriptions that work today — is finished. That
 * is the wrong trade on a money path that is not broken.
 */

/** One pack, as GET /chai-packs reports it. The server's catalog, verbatim. */
export type ChaiPackCatalogEntry = {
  id: string;
  appleProductId: string;
  chai: number;
};

/** The fields of a RevenueCat store transaction this module reads. */
export type StoreTransactionLike = {
  transactionIdentifier: string;
  productIdentifier: string;
};

/** The fields of RevenueCat's CustomerInfo this module reads. */
export type CustomerInfoLike = {
  nonSubscriptionTransactions?: readonly StoreTransactionLike[] | null;
};

/** Asks the server which of these transaction ids it has already credited. */
export type CreditedReader = (transactionIds: string[]) => Promise<string[]>;

export type Sleep = (ms: number) => Promise<void>;

export const realSleep: Sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * How long to keep asking the server after a purchase before giving up on
 * THIS run. Giving up is not losing the purchase: the launch recovery below
 * picks it up next time, which is the whole point of having it.
 */
export const CREDIT_POLL_DELAYS_MS = [400, 800, 1500, 2500, 4000] as const;

/** How many times launch recovery asks the store to re-deliver. */
export const RECOVERY_REPLAY_ATTEMPTS = 2;

/**
 * The consumables Apple has sold this customer that belong to OUR packs.
 *
 * Filtered against the server's catalog, so another product's transaction (a
 * future consumable, a leftover from a different SKU) is never replayed as a
 * Chai pack. Deduplicated by transaction id.
 */
export function consumableTransactions(
  info: CustomerInfoLike | null | undefined,
  packs: readonly ChaiPackCatalogEntry[],
): StoreTransactionLike[] {
  const ours = new Set(packs.map((pack) => pack.appleProductId));
  const seen = new Set<string>();
  const out: StoreTransactionLike[] = [];
  for (const tx of info?.nonSubscriptionTransactions ?? []) {
    const id = tx?.transactionIdentifier;
    if (typeof id !== 'string' || id.length === 0) continue;
    if (!ours.has(tx.productIdentifier)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(tx);
  }
  return out;
}

/**
 * Waits for the server to report a transaction credited.
 *
 * This is the success signal for a purchase. It polls rather than trusting the
 * store call because the credit arrives out-of-band, over RevenueCat's webhook
 * — there is a real beat between Apple taking the money and the Chai landing,
 * and the copy the learner sees must not pretend otherwise.
 */
export async function waitForCredit(
  transactionId: string,
  isCredited: CreditedReader,
  {
    delays = CREDIT_POLL_DELAYS_MS,
    sleep = realSleep,
  }: { delays?: readonly number[]; sleep?: Sleep } = {},
): Promise<boolean> {
  // One look before any waiting: a fast webhook is the common case.
  try {
    if ((await isCredited([transactionId])).includes(transactionId)) return true;
  } catch {
    // A failed read is not a failed purchase; keep trying.
  }
  for (const delay of delays) {
    await sleep(delay);
    try {
      if ((await isCredited([transactionId])).includes(transactionId)) {
        return true;
      }
    } catch {
      // As above.
    }
  }
  return false;
}

export type RecoveryResult = {
  /** Our consumables Apple has sold this customer. */
  seen: string[];
  /** Of those, the ones the server had not credited when we looked. */
  uncredited: string[];
  /** The ones still uncredited after the replays (nothing was lost — the next
   *  launch tries again). */
  stillUncredited: string[];
  /** Whether the store was asked to re-deliver at all. */
  replayed: boolean;
};

/**
 * Launch recovery: replay any consumable the server has not credited.
 *
 * Runs at launch, once the SDK is configured for the signed-in learner. The
 * common case costs one store read and one server read and does nothing else.
 *
 * `replay` re-posts the customer's receipt to RevenueCat, which re-delivers
 * the transaction to our webhook. It is the only lever available that does not
 * involve the client asserting a purchase, which it must never do.
 */
export async function recoverUncreditedPurchases({
  getCustomerInfo,
  replay,
  isCredited,
  packs,
  attempts = RECOVERY_REPLAY_ATTEMPTS,
  delays = CREDIT_POLL_DELAYS_MS,
  sleep = realSleep,
}: {
  getCustomerInfo: () => Promise<CustomerInfoLike>;
  replay: () => Promise<void>;
  isCredited: CreditedReader;
  packs: readonly ChaiPackCatalogEntry[];
  attempts?: number;
  delays?: readonly number[];
  sleep?: Sleep;
}): Promise<RecoveryResult> {
  const empty: RecoveryResult = {
    seen: [],
    uncredited: [],
    stillUncredited: [],
    replayed: false,
  };
  if (packs.length === 0) return empty;

  let info: CustomerInfoLike;
  try {
    info = await getCustomerInfo();
  } catch {
    return empty;
  }

  const seen = consumableTransactions(info, packs).map(
    (tx) => tx.transactionIdentifier,
  );
  if (seen.length === 0) return empty;

  let outstanding: string[];
  try {
    const credited = await isCredited(seen);
    outstanding = seen.filter((id) => !credited.includes(id));
  } catch {
    // We could not find out. Doing nothing is right: replaying blind would be
    // the client deciding something it is not allowed to decide.
    return { ...empty, seen };
  }

  const result: RecoveryResult = {
    seen,
    uncredited: outstanding,
    stillUncredited: outstanding,
    replayed: false,
  };
  if (outstanding.length === 0) return result;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await replay();
      result.replayed = true;
    } catch {
      // The store refused to re-deliver right now. Nothing is lost.
      break;
    }
    // Give the webhook a beat, then ask again. Same read as everywhere else.
    await sleep(delays[Math.min(attempt, delays.length - 1)] ?? 1000);
    try {
      const credited = await isCredited(result.stillUncredited);
      result.stillUncredited = result.stillUncredited.filter(
        (id) => !credited.includes(id),
      );
    } catch {
      break;
    }
    if (result.stillUncredited.length === 0) break;
  }

  return result;
}
