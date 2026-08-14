import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';
import { useAuth } from '@clerk/expo';
import {
  checkChaiPackCredits,
  getChaiPacks,
} from '@workspace/api-client-react';
import {
  recoverUncreditedPurchases,
  waitForCredit,
  type ChaiPackCatalogEntry,
} from '@/lib/chaiPurchase';

/**
 * The RevenueCat entitlement id that maps to all-access Bolo! Plus. Must match
 * the server's REVENUECAT_ENTITLEMENT_ID and the entitlement the seed creates.
 * Overridable via env so it can track the server without a code change.
 */
export const PLUS_ENTITLEMENT_ID =
  process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID?.trim() || 'plus';

/**
 * The RevenueCat entitlement id for the middle "One Language" ($6.99) tier —
 * matches the server's REVENUECAT_ONE_LANGUAGE_ENTITLEMENT_ID.
 */
export const ONE_LANGUAGE_ENTITLEMENT_ID =
  process.env.EXPO_PUBLIC_REVENUECAT_ONE_LANGUAGE_ENTITLEMENT_ID?.trim() ||
  'one_language';

/**
 * The identifier of the RevenueCat offering that carries the One-Language
 * monthly/annual packages. The all-access packages come from the `current`
 * offering (unchanged); the middle tier lives in its own offering so the two
 * price points never collide. Defaults to "one_language".
 */
const ONE_LANGUAGE_OFFERING_ID =
  process.env.EXPO_PUBLIC_REVENUECAT_ONE_LANGUAGE_OFFERING_ID?.trim() ||
  'one_language';

const TEST_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
const IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

/**
 * Picks the public SDK key for the current runtime.
 *
 * Expo Go, web and local dev run against the Test Store. A real store build
 * uses ONLY its own platform key and never falls back to the Test Store key:
 * a Test Store key handed to a shipped app is not a degraded configuration,
 * it is a fatal one. The native Android SDK answers it with a blocking "wrong
 * API key" dialog and kills the process on launch, so the fallback that looks
 * like resilience is the crash.
 *
 * Returns null when the platform's own key is missing, and the provider then
 * skips `Purchases.configure` entirely. Every purchase surface already handles
 * that state: no offerings load, the paywall shows no packages, restore
 * reports nothing found, and the Chai paths refuse to act. Entitlements are
 * unaffected either way, since they come from the server, not this SDK.
 */
function resolveApiKey(): string | null {
  const inTestRuntime =
    __DEV__ ||
    Platform.OS === 'web' ||
    Constants.executionEnvironment === 'storeClient';
  if (inTestRuntime) return TEST_API_KEY ?? null;
  if (Platform.OS === 'ios') return IOS_API_KEY ?? null;
  if (Platform.OS === 'android') return ANDROID_API_KEY ?? null;
  return TEST_API_KEY ?? null;
}

/** True in a store/dev sandbox where a purchase confirmation guard is prudent. */
export function isTestPurchaseRuntime(): boolean {
  return (
    __DEV__ ||
    Platform.OS === 'web' ||
    Constants.executionEnvironment === 'storeClient'
  );
}

export type PurchaseOutcome = 'success' | 'cancelled' | 'error';

/**
 * A Chai pack purchase has a fourth outcome the subscription flow does not.
 * Apple can charge and the credit can still be in flight (or lost) when we
 * stop waiting — the money is real, the Chai has not landed yet, and saying
 * either "done" or "failed" would be a lie. `pending` is that state; launch
 * recovery picks it up.
 */
export type ChaiPurchaseOutcome = PurchaseOutcome | 'pending';

/** The two paid tiers the paywall can drive a purchase for. */
export type PurchaseTier = 'one_language' | 'all_access';

// True when a store purchase left the customer with either paid entitlement
// active. The server (webhook / reconcile-on-read) remains the source of truth
// for the exact plan; this only decides whether the store flow "went through".
function hasAnyEntitlement(info: CustomerInfo): boolean {
  const active = info.entitlements.active ?? {};
  return (
    active[PLUS_ENTITLEMENT_ID] !== undefined ||
    active[ONE_LANGUAGE_ENTITLEMENT_ID] !== undefined
  );
}

// Module-level flags so React Fast Refresh / remounts don't reconfigure the SDK
// (RevenueCat warns on repeated configure()). Configure once, then logIn on
// account changes.
let sdkConfigured = false;
let configuredUserId: string | null = null;

type PurchasesContextValue = {
  /** SDK has a usable API key and finished configuring. */
  isConfigured: boolean;
  /** Offerings have been loaded (or the attempt has completed). */
  isReady: boolean;
  /** All-access Bolo! Plus packages (from the current offering). */
  allAccessMonthly: PurchasesPackage | null;
  allAccessAnnual: PurchasesPackage | null;
  /** One Language packages (from the one-language offering). */
  oneLanguageMonthly: PurchasesPackage | null;
  oneLanguageAnnual: PurchasesPackage | null;
  /**
   * Family packages (custom packages on the current offering, identified by
   * their RevenueCat lookup keys). Read-only price sources for family
   * surfaces; the mobile paywall does not sell the family tier (family
   * entitlement client handling is banked for future family-surfaces work).
   */
  familyMonthly: PurchasesPackage | null;
  familyAnnual: PurchasesPackage | null;
  isPurchasing: boolean;
  isRestoring: boolean;
  purchase: (pkg: PurchasesPackage) => Promise<PurchaseOutcome>;
  /** Restores prior purchases. Resolves to whether a paid tier is active. */
  restore: () => Promise<boolean>;
  /**
   * The Chai packs, straight from the server catalog: pack id, Apple product
   * id, and the Chai the ledger will credit. Empty until it loads (and if it
   * never loads, the shop simply does not appear). The PRICE is not in here —
   * that comes from the StoreKit product, so what the learner reads is what
   * Apple charges.
   */
  chaiPacks: ChaiPackCatalogEntry[];
  isBuyingChai: boolean;
  /**
   * Buys a Chai pack by its Apple product id. Resolves 'success' only once the
   * SERVER reports the transaction credited.
   */
  purchaseChaiPack: (appleProductId: string) => Promise<ChaiPurchaseOutcome>;
};

const PurchasesContext = createContext<PurchasesContextValue | null>(null);

export function PurchasesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = useAuth();
  const [isConfigured, setIsConfigured] = useState(sdkConfigured);
  const [configuredFor, setConfiguredFor] = useState<string | null>(
    sdkConfigured ? configuredUserId : null,
  );
  const [isReady, setIsReady] = useState(false);
  const [allAccessOffering, setAllAccessOffering] =
    useState<PurchasesOffering | null>(null);
  const [oneLanguageOffering, setOneLanguageOffering] =
    useState<PurchasesOffering | null>(null);
  const [, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [chaiPacks, setChaiPacks] = useState<ChaiPackCatalogEntry[]>([]);
  const [isBuyingChai, setIsBuyingChai] = useState(false);

  // Configure RevenueCat with the Clerk user id as the app_user_id, so the
  // server webhook/reconcile can map a store purchase back to this account.
  useEffect(() => {
    const apiKey = resolveApiKey();
    const alreadyBound = sdkConfigured && configuredUserId === userId;
    // Which account the STORE is actually bound to right now. `isConfigured`
    // is not that: it stays true across an account switch while the async
    // `logIn` is still in flight, and every Chai path must refuse to act in
    // that window — the store would answer for the previous customer while
    // the server answers for the new one.
    setConfiguredFor(alreadyBound ? userId : null);
    if (!apiKey || !userId) {
      setIsConfigured(alreadyBound);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (!sdkConfigured) {
          Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.WARN : LOG_LEVEL.ERROR);
          Purchases.configure({ apiKey, appUserID: userId });
          sdkConfigured = true;
          configuredUserId = userId;
        } else if (configuredUserId !== userId) {
          await Purchases.logIn(userId);
          configuredUserId = userId;
        }
        if (!cancelled) {
          setIsConfigured(true);
          setConfiguredFor(userId);
        }
      } catch {
        if (!cancelled) {
          setIsConfigured(false);
          setConfiguredFor(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Load the offerings + customer info once configured. The all-access packages
  // come from the current offering; the One-Language packages come from the
  // dedicated one-language offering (absent → that tier simply isn't shown).
  useEffect(() => {
    if (!isConfigured) return;
    let cancelled = false;
    (async () => {
      try {
        const offerings = await Purchases.getOfferings();
        if (!cancelled) {
          setAllAccessOffering(offerings.current ?? null);
          setOneLanguageOffering(
            offerings.all?.[ONE_LANGUAGE_OFFERING_ID] ?? null,
          );
        }
      } catch {
        if (!cancelled) {
          setAllAccessOffering(null);
          setOneLanguageOffering(null);
        }
      } finally {
        if (!cancelled) setIsReady(true);
      }
      try {
        const info = await Purchases.getCustomerInfo();
        if (!cancelled) setCustomerInfo(info);
      } catch {
        // Best effort — server entitlements remain the source of truth.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConfigured]);

  const allAccessMonthly = allAccessOffering?.monthly ?? null;
  const allAccessAnnual = allAccessOffering?.annual ?? null;
  const oneLanguageMonthly = oneLanguageOffering?.monthly ?? null;
  const oneLanguageAnnual = oneLanguageOffering?.annual ?? null;
  // Custom packages don't map to the offering's monthly/annual convenience
  // accessors; find them by their RevenueCat package lookup keys.
  const familyMonthly =
    allAccessOffering?.availablePackages.find(
      (p) => p.identifier === 'family_monthly',
    ) ?? null;
  const familyAnnual =
    allAccessOffering?.availablePackages.find(
      (p) => p.identifier === 'family_annual',
    ) ?? null;

  const purchase = useCallback(
    async (pkg: PurchasesPackage): Promise<PurchaseOutcome> => {
      setIsPurchasing(true);
      try {
        const { customerInfo: info } = await Purchases.purchasePackage(pkg);
        setCustomerInfo(info);
        return hasAnyEntitlement(info) ? 'success' : 'error';
      } catch (err) {
        if (err && typeof err === 'object' && 'userCancelled' in err) {
          if ((err as { userCancelled?: boolean }).userCancelled) {
            return 'cancelled';
          }
        }
        return 'error';
      } finally {
        setIsPurchasing(false);
      }
    },
    [],
  );

  // ── Chai packs (App Store consumables) ────────────────────────────────────
  //
  // Apple requires digital goods consumed in the app to be sold through IAP,
  // so Chai cannot be bought on iOS through the web's Stripe path. What we
  // sell is a consumable: money in, Chai in the ledger, no entitlement, no
  // subscription touched at either end.

  /**
   * Asks the server which of these Apple transaction ids it has credited.
   * A read, and the ONLY thing the client is allowed to know about crediting:
   * it never asserts an amount and never mints Chai.
   */
  const isChaiCredited = useCallback(
    async (transactionIds: string[]): Promise<string[]> => {
      const { credited } = await checkChaiPackCredits({ transactionIds });
      return credited;
    },
    [],
  );

  // The catalog. NOT read from the Stripe-priced /pricing endpoint: that one
  // 503s when Stripe is unreachable, and the iOS shop must not depend on the
  // web payment processor.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const { packs } = await getChaiPacks();
        if (!cancelled) setChaiPacks(packs);
      } catch {
        // No catalog → no shop. Better than a shop that cannot credit.
        if (!cancelled) setChaiPacks([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const purchaseChaiPack = useCallback(
    async (appleProductId: string): Promise<ChaiPurchaseOutcome> => {
      // Never buy against a store customer that is not this learner. Between
      // an account switch and `logIn` landing, the SDK still answers for the
      // previous account, and a purchase made there would be credited to them.
      if (!userId || configuredFor !== userId) return 'error';
      setIsBuyingChai(true);
      try {
        const [product] = await Purchases.getProducts([appleProductId]);
        if (!product) return 'error';
        const { customerInfo: info } = await Purchases.purchaseStoreProduct(
          product,
        );
        setCustomerInfo(info);

        // The success signal. A consumable grants no entitlement, so the
        // subscription flow's "did an entitlement appear?" check would call a
        // good purchase a failure; what makes it good is the SERVER showing
        // the transaction credited.
        const transactionId = info.nonSubscriptionTransactions
          ?.filter((tx) => tx.productIdentifier === appleProductId)
          .at(-1)?.transactionIdentifier;
        if (!transactionId) return 'pending';

        const credited = await waitForCredit(transactionId, isChaiCredited);
        // Not credited yet does NOT mean not bought. Launch recovery replays
        // it; the copy the learner sees must not claim the Chai has landed.
        return credited ? 'success' : 'pending';
      } catch (err) {
        if (
          err &&
          typeof err === 'object' &&
          (err as { userCancelled?: boolean }).userCancelled
        ) {
          return 'cancelled';
        }
        return 'error';
      } finally {
        setIsBuyingChai(false);
      }
    },
    [isChaiCredited, userId, configuredFor],
  );

  // Launch recovery. A purchase Apple charged for that we failed to credit is
  // replayed here — read the customer's consumables, ask which are credited,
  // re-deliver the rest. Double-crediting is stopped by the ledger's refId
  // index, not by anything remembered on this device.
  useEffect(() => {
    // `configuredFor === userId` and not merely `isConfigured`: during an
    // account switch the store still answers for the previous customer, and
    // replaying THEIR transactions while the server answers for this account
    // is how a purchase ends up on the wrong ledger.
    if (!userId || configuredFor !== userId || chaiPacks.length === 0) return;
    let cancelled = false;
    (async () => {
      // Every leg re-checks: the learner can sign out mid-recovery, and an
      // in-flight replay must stop rather than land on the next account.
      const stopIfStale = () => {
        if (cancelled) throw new Error('account changed');
      };
      const result = await recoverUncreditedPurchases({
        getCustomerInfo: async () => {
          stopIfStale();
          return Purchases.getCustomerInfo();
        },
        // Re-posts the receipt so RevenueCat re-delivers the transaction to
        // our webhook. Deliberately NOT the SDK-wide "purchases are completed
        // by my app" mode, which would change how subscriptions — a money
        // path that works — are finished.
        replay: async () => {
          stopIfStale();
          await Purchases.syncPurchases();
        },
        isCredited: async (ids) => {
          stopIfStale();
          return isChaiCredited(ids);
        },
        packs: chaiPacks,
      });
      if (!cancelled && result.uncredited.length > result.stillUncredited.length) {
        // Something landed; let balance readers pick it up on their next fetch.
        try {
          setCustomerInfo(await Purchases.getCustomerInfo());
        } catch {
          // Best effort.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configuredFor, userId, chaiPacks, isChaiCredited]);

  const restore = useCallback(async (): Promise<boolean> => {
    setIsRestoring(true);
    try {
      const info = await Purchases.restorePurchases();
      setCustomerInfo(info);
      return hasAnyEntitlement(info);
    } catch {
      return false;
    } finally {
      setIsRestoring(false);
    }
  }, []);

  const value = useMemo<PurchasesContextValue>(
    () => ({
      isConfigured,
      isReady,
      allAccessMonthly,
      allAccessAnnual,
      oneLanguageMonthly,
      oneLanguageAnnual,
      familyMonthly,
      familyAnnual,
      isPurchasing,
      isRestoring,
      purchase,
      restore,
      chaiPacks,
      isBuyingChai,
      purchaseChaiPack,
    }),
    [
      isConfigured,
      isReady,
      allAccessMonthly,
      allAccessAnnual,
      oneLanguageMonthly,
      oneLanguageAnnual,
      familyMonthly,
      familyAnnual,
      isPurchasing,
      isRestoring,
      purchase,
      restore,
      chaiPacks,
      isBuyingChai,
      purchaseChaiPack,
    ],
  );

  return (
    <PurchasesContext.Provider value={value}>
      {children}
    </PurchasesContext.Provider>
  );
}

/**
 * The context if a provider is above us, null otherwise.
 *
 * For surfaces that live inside the signed-in app but can also be rendered
 * standalone (the wallet sheet, in tests and in isolation): a missing purchase
 * provider means the shop simply does not appear, which is the right answer
 * rather than a crash on a screen that has nothing to do with buying.
 */
export function usePurchasesOptional(): PurchasesContextValue | null {
  return useContext(PurchasesContext);
}

export function usePurchases(): PurchasesContextValue {
  const ctx = useContext(PurchasesContext);
  if (!ctx) {
    throw new Error('usePurchases must be used within a PurchasesProvider');
  }
  return ctx;
}
