import { Redirect } from "wouter";
import { Loader2 } from "lucide-react";
import { useUser } from "@clerk/react";
import {
  useGetAccount,
  getGetAccountQueryKey,
} from "@workspace/api-client-react";
import { hasSkippedLanguageStep } from "@/lib/language-step";

// B1: a signed-in learner who has never explicitly chosen a language is routed
// to the full-screen selection step before home. Keyed on the server-side
// hasChosenLanguage flag — NOT on activeLanguage, which LanguageProvider seeds
// with a local default on first reconcile. The session-scoped skip marker
// keeps "skip for now" from looping within one session; the step returns next
// session because skipping never writes the flag. Fails open: if the account
// can't load, home renders normally.
export function LanguageChoiceGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isSignedIn } = useUser();
  const account = useGetAccount({
    query: { enabled: !!isSignedIn, queryKey: getGetAccountQueryKey() },
  });

  if (!account.data && account.isLoading) {
    return (
      <div
        className="flex min-h-[60vh] items-center justify-center"
        data-testid="language-gate-loading"
      >
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (
    account.data &&
    !account.data.preferences.learning.hasChosenLanguage &&
    !hasSkippedLanguageStep()
  ) {
    return <Redirect to="/choose-language" />;
  }

  return <>{children}</>;
}
