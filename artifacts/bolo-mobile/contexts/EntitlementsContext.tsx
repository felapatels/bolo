import React, { createContext, useContext, useMemo } from 'react';
import { useAuth } from '@clerk/expo';
import {
  useGetEntitlements,
  getGetEntitlementsQueryKey,
  type DailyLessonAllowance,
  type Entitlements,
} from '@workspace/api-client-react';

/**
 * Server-authoritative view of what the signed-in learner has unlocked.
 *
 * The server (GET /entitlements, backed by the store purchase via RevenueCat) is
 * the single source of truth for the plan, the languages the caller may open,
 * the Plus feature flags, and the remaining daily-lesson allowance. The client
 * never assumes a tier from a local purchase — it reads it from here, so a
 * purchase only "counts" once the server reflects it.
 */
type EntitlementsContextValue = {
  entitlements: Entitlements | undefined;
  isLoading: boolean;
  isPlus: boolean;
  /** Concrete language codes the caller may open (empty until loaded). */
  allowedLanguages: string[];
  /** Whether a given language code is unlocked for the caller. */
  isLanguageAllowed: (code: string) => boolean;
  /** Plus feature flags. */
  canReview: boolean;
  canUseAdvancedAnalytics: boolean;
  /** Today's new-lesson allowance (null limit/remaining means unlimited). */
  dailyNewLessons: DailyLessonAllowance | undefined;
  refetch: () => void;
};

const EntitlementsContext = createContext<EntitlementsContextValue | null>(null);

export function EntitlementsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isSignedIn } = useAuth();

  const query = useGetEntitlements({
    query: {
      // Only signed-in callers have entitlements; the query key is required
      // alongside `enabled` for the generated hook's option typing.
      enabled: !!isSignedIn,
      queryKey: getGetEntitlementsQueryKey(),
      staleTime: 30_000,
    },
  });

  const e = query.data;
  const refetch = query.refetch;

  const value = useMemo<EntitlementsContextValue>(() => {
    const isPlus = e?.plan === 'plus';
    const allowedLanguages = e?.allowedLanguages ?? [];
    return {
      entitlements: e,
      isLoading: query.isLoading,
      isPlus,
      allowedLanguages,
      isLanguageAllowed: (code: string) => {
        if (!e) return true; // unknown yet — don't lock prematurely
        if (isPlus) return true;
        return allowedLanguages.includes(code);
      },
      canReview: e?.features.review ?? false,
      canUseAdvancedAnalytics: e?.features.advancedAnalytics ?? false,
      dailyNewLessons: e?.limits.dailyNewLessons,
      refetch: () => {
        refetch();
      },
    };
  }, [e, query.isLoading, refetch]);

  return (
    <EntitlementsContext.Provider value={value}>
      {children}
    </EntitlementsContext.Provider>
  );
}

export function useEntitlements(): EntitlementsContextValue {
  const ctx = useContext(EntitlementsContext);
  if (!ctx) {
    throw new Error(
      'useEntitlements must be used within an EntitlementsProvider',
    );
  }
  return ctx;
}
