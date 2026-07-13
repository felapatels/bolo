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
 * The RevenueCat entitlement id that maps to Bolo! Plus. Must match the server's
 * REVENUECAT_ENTITLEMENT_ID and the entitlement the seed script creates.
 */
export const PLUS_ENTITLEMENT_ID = 'plus';

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
  monthlyPackage: PurchasesPackage | null;
  annualPackage: PurchasesPackage | null;
  isPurchasing: boolean;
  isRestoring: boolean;
  purchase: (pkg: PurchasesPackage) => Promise<PurchaseOutcome>;
  /** Restores prior purchases. Resolves to whether Plus is active afterwards. */
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
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
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

  // Load the current offering + customer info once configured.
  useEffect(() => {
    if (!isConfigured) return;
    let cancelled = false;
    (async () => {
      try {
        const offerings = await Purchases.getOfferings();
        if (!cancelled) setOffering(offerings.current ?? null);
      } catch {
        if (!cancelled) setOffering(null);
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

  const monthlyPackage = offering?.monthly ?? null;
  const annualPackage = offering?.annual ?? null;

  const purchase = useCallback(
    async (pkg: PurchasesPackage): Promise<PurchaseOutcome> => {
      setIsPurchasing(true);
      try {
        const { customerInfo: info } = await Purchases.purchasePackage(pkg);
        setCustomerInfo(info);
        const active =
          info.entitlements.active?.[PLUS_ENTITLEMENT_ID] !== undefined;
        return active ? 'success' : 'error';
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
      return info.entitlements.active?.[PLUS_ENTITLEMENT_ID] !== undefined;
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
      monthlyPackage,
      annualPackage,
      isPurchasing,
      isRestoring,
      purchase,
      restore,
    }),
    [
      isConfigured,
      isReady,
      monthlyPackage,
      annualPackage,
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
