import React, { createContext, useContext, useMemo } from 'react';
import { useAuth } from '@clerk/expo';
import {
  shouldAskAiConsent,
  aiFeaturesAllowed,
} from '@workspace/ai-consent';
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
/** The effective plan the server resolved the caller to. */
export type Plan = 'free' | 'one_language' | 'plus';

type EntitlementsContextValue = {
  entitlements: Entitlements | undefined;
  isLoading: boolean;
  /** The effective plan ("free", "one_language", or "plus"). */
  plan: Plan;
  /** All-access Bolo! Plus. */
  isPlus: boolean;
  /** The middle One Language ($6.99) tier. */
  isOneLanguage: boolean;
  /** The single language a One-Language subscriber unlocked (null otherwise). */
  chosenLanguage: string | null;
  /** Concrete language codes the caller may open (empty until loaded). */
  allowedLanguages: string[];
  /**
   * The one language every tier gets for free, named by the server. Empty
   * until the snapshot loads. It describes the language, not the viewer, so
   * it is the same string on every plan.
   */
  freeLanguage: string;
  /** Whether a given language code is unlocked for the caller. */
  isLanguageAllowed: (code: string) => boolean;
  /** Plus feature flags. */
  canReview: boolean;
  canUseAdvancedAnalytics: boolean;
  /** Today's new-lesson allowance (null limit/remaining means unlimited). */
  dailyNewLessons: DailyLessonAllowance | undefined;
  /**
   * AI data consent, Apple 5.1.1(i) / 5.1.2(i).
   *
   * `aiConsentDecision` is the raw three-state value and is `undefined` until
   * the snapshot lands. DO NOT READ IT DIRECTLY to decide whether to ask:
   * undefined is not undecided, and treating it as such draws the consent
   * screen on every cold start. Use the two derived booleans, which are both
   * FALSE while loading.
   */
  aiConsentDecision: 'granted' | 'declined' | null | undefined;
  /** True only for a LOADED never-asked learner. */
  shouldAskAiConsent: boolean;
  /** True only on an explicit granted. Speaking, chat and the call read this. */
  aiFeaturesAllowed: boolean;
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
    const plan: Plan =
      e?.plan === 'plus' || e?.plan === 'one_language' ? e.plan : 'free';
    const isPlus = plan === 'plus';
    const isOneLanguage = plan === 'one_language';
    const allowedLanguages = e?.allowedLanguages ?? [];
    // undefined until the snapshot lands; null once it has and nobody has asked.
    const decision = e?.aiConsent?.decision;
    return {
      entitlements: e,
      isLoading: query.isLoading,
      plan,
      isPlus,
      isOneLanguage,
      chosenLanguage: e?.chosenLanguage ?? null,
      allowedLanguages,
      freeLanguage: e?.freeLanguage ?? '',
      isLanguageAllowed: (code: string) => {
        if (!e) return true; // unknown yet — don't lock prematurely
        if (isPlus) return true;
        return allowedLanguages.includes(code);
      },
      canReview: e?.features.review ?? false,
      canUseAdvancedAnalytics: e?.features.advancedAnalytics ?? false,
      dailyNewLessons: e?.limits.dailyNewLessons,
      aiConsentDecision: decision,
      // Both derived through the shared helpers so mobile and web cannot drift
      // on the one rule that matters here: FALSE WHILE LOADING.
      shouldAskAiConsent: shouldAskAiConsent(decision, query.isLoading),
      aiFeaturesAllowed: aiFeaturesAllowed(decision, query.isLoading),
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
