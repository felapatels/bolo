import { useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useUpdateAccountPreferences,
  getGetAccountQueryKey,
  type Account,
} from '@workspace/api-client-react';

// Session-scoped "skip for now" marker for the first-time language-selection
// step (B1 parity with web). Deliberately an in-memory module flag — NOT
// AsyncStorage: skipping must not loop within one app session, but the step
// returns on the next cold start. Only an explicit choice (server-side
// hasChosenLanguage) retires it for good.
let skipped = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function hasSkippedLanguageStep(): boolean {
  return skipped;
}

export function markLanguageStepSkipped(): void {
  skipped = true;
  notify();
}

/** Test-only: simulates an app restart (the in-memory flag clears). */
export function resetLanguageStepSkipForTests(): void {
  skipped = false;
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Reactive read of the session skip flag. Backed by a tiny external store so
 * dependent screens re-evaluate the moment "Skip for now" is tapped
 * (a plain module read would leave them holding stale state).
 */
export function useLanguageStepSkipped(): boolean {
  return useSyncExternalStore(subscribe, hasSkippedLanguageStep);
}

// An EXPLICIT language pick (the selection step or the language picker modal):
// persists activeLanguage AND marks hasChosenLanguage server-side in one
// PATCH, then merges the response into the account cache — no second refetch,
// so LanguageProvider's single-settle reconcile stays single. The provider's
// own seed/correction writes deliberately do NOT go through here: seeding a
// default is not a choice.
export function useExplicitLanguageChoice() {
  const updatePrefs = useUpdateAccountPreferences();
  const queryClient = useQueryClient();

  const choose = (
    code: string,
    callbacks?: { onSuccess?: () => void; onError?: () => void },
  ) => {
    updatePrefs.mutate(
      { data: { activeLanguage: code, hasChosenLanguage: true } },
      {
        onSuccess: (res) => {
          const key = getGetAccountQueryKey();
          const current = queryClient.getQueryData<Account>(key);
          if (current) {
            queryClient.setQueryData(key, {
              ...current,
              preferences: res.preferences,
            });
          }
          callbacks?.onSuccess?.();
        },
        onError: () => callbacks?.onError?.(),
      },
    );
  };

  return { choose, isPending: updatePrefs.isPending };
}
