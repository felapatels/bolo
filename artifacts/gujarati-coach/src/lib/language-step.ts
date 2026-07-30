import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateAccountPreferences,
  getGetAccountQueryKey,
  type Account,
} from "@workspace/api-client-react";

// Session-scoped "skip for now" marker for the language-selection onboarding
// step (B1). sessionStorage on purpose: skipping must not loop within one
// session, but the step returns on the next fresh session — only an explicit
// choice (server-side hasChosenLanguage) retires it for good.
const SKIP_KEY = "bolo.langStepSkipped";

export function hasSkippedLanguageStep(): boolean {
  try {
    return window.sessionStorage.getItem(SKIP_KEY) === "1";
  } catch {
    return false;
  }
}

export function markLanguageStepSkipped(): void {
  try {
    window.sessionStorage.setItem(SKIP_KEY, "1");
  } catch {
    // Private mode etc. — worst case the step re-appears this session.
  }
}

// An EXPLICIT language pick (the selection step, the home picker, or account
// settings): persists activeLanguage AND marks hasChosenLanguage server-side
// in one write, then merges the response into the account cache — no second
// refetch, so the single-settle reconcile in LanguageProvider stays single.
// The provider's first-reconcile seed write deliberately does NOT go through
// here: seeding a default is not a choice.
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
