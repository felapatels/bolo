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
 * Picks the public SDK key for the current runtime. Expo Go and web run against
 * the Test Store; production iOS/Android builds use their store key. Returns null
 * when keys aren't configured yet (the payments/provider task wires them), so the
 * app degrades gracefully instead of crashing.
 */
function resolveApiKey(): string | null {
  const inTestRuntime =
    __DEV__ ||
    Platform.OS === 'web' ||
    Constants.executionEnvironment === 'storeClient';
  if (inTestRuntime) return TEST_API_KEY ?? null;
  if (Platform.OS === 'ios') return IOS_API_KEY ?? TEST_API_KEY ?? null;
  if (Platform.OS === 'android') return ANDROID_API_KEY ?? TEST_API_KEY ?? null;
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
};

const PurchasesContext = createContext<PurchasesContextValue | null>(null);

export function PurchasesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = useAuth();
  const [isConfigured, setIsConfigured] = useState(sdkConfigured);
  const [isReady, setIsReady] = useState(false);
  const [allAccessOffering, setAllAccessOffering] =
    useState<PurchasesOffering | null>(null);
  const [oneLanguageOffering, setOneLanguageOffering] =
    useState<PurchasesOffering | null>(null);
  const [, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // Configure RevenueCat with the Clerk user id as the app_user_id, so the
  // server webhook/reconcile can map a store purchase back to this account.
  useEffect(() => {
    const apiKey = resolveApiKey();
    if (!apiKey || !userId) {
      setIsConfigured(sdkConfigured && configuredUserId === userId);
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
        if (!cancelled) setIsConfigured(true);
      } catch {
        if (!cancelled) setIsConfigured(false);
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
    ],
  );

  return (
    <PurchasesContext.Provider value={value}>
      {children}
    </PurchasesContext.Provider>
  );
}

export function usePurchases(): PurchasesContextValue {
  const ctx = useContext(PurchasesContext);
  if (!ctx) {
    throw new Error('usePurchases must be used within a PurchasesProvider');
  }
  return ctx;
}
