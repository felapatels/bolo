import { useRef, useState } from "react";
import { Redirect, useLocation } from "wouter";
import { Headphones, Loader2 } from "lucide-react";
import { useUser } from "@clerk/react";
import {
  useGetAccount,
  getGetAccountQueryKey,
  type Language,
} from "@workspace/api-client-react";
import {
  useLanguage,
  nativeTextProps,
  speechCapabilityOf,
} from "@/lib/language-context";
import { useEntitlements } from "@/lib/entitlements";
import {
  useExplicitLanguageChoice,
  markLanguageStepSkipped,
} from "@/lib/language-step";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// B1: the full-screen language-selection step a first-time account sees before
// home. Shows all 22 languages with no free/locked marking, the choice is
// aspirational; gating happens downstream (a locked pick lands in the journey
// showroom, exactly like the home picker). Confirming writes activeLanguage +
// hasChosenLanguage server-side so the step never returns; skipping only sets
// a session marker so it comes back next fresh session.
export default function ChooseLanguage() {
  const { languages, isLoading, setActiveLang } = useLanguage();
  const { isLanguageAllowed } = useEntitlements();
  const { choose } = useExplicitLanguageChoice();
  const { isSignedIn } = useUser();
  const account = useGetAccount({
    query: { enabled: !!isSignedIn, queryKey: getGetAccountQueryKey() },
  });
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const navigatingRef = useRef(false);

  // Already chosen (deep link back here, or a second tab): the step never
  // re-shows for this account. Skipped while we're mid-confirm navigation so
  // a locked pick isn't yanked from /journey to /app by the cache update.
  if (
    account.data?.preferences.learning.hasChosenLanguage &&
    !navigatingRef.current
  ) {
    return <Redirect to="/app" />;
  }

  const confirm = (code: string) => {
    if (pendingCode) return;
    setPendingCode(code);
    choose(code, {
      onSuccess: () => {
        navigatingRef.current = true;
        // Reflect the pick in the running app immediately, the provider's
        // one-time reconcile has already settled, so it won't adopt it for us.
        setActiveLang(code);
        // A locked pick is welcome (aspirational): it lands in the existing
        // journey showroom with its teaser and upgrade path.
        setLocation(isLanguageAllowed(code) ? "/app" : "/journey");
      },
      onError: () => {
        setPendingCode(null);
        toast({
          variant: "destructive",
          title: "Couldn't save that",
          description: "Check your connection and tap your language again.",
        });
      },
    });
  };

  const skip = () => {
    markLanguageStepSkipped();
    setLocation("/app");
  };

  const showCommunityNote = languages.some((l) => l.communityReviewed);

  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <header className="text-center">
          <h1 className="text-3xl font-extrabold text-foreground sm:text-4xl">
            Choose your language
          </h1>
          <p className="mt-2 text-muted-foreground">
            All 22 South Asian languages, ready to learn. You can switch
            anytime.
          </p>
        </header>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {languages.map((lang) => (
              <LanguageTile
                key={lang.code}
                lang={lang}
                pending={pendingCode === lang.code}
                disabled={pendingCode !== null}
                onSelect={() => confirm(lang.code)}
              />
            ))}
          </div>
        )}

        <div className="mt-8 flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={skip}
            className="text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
            data-testid="skip-language-step"
          >
            Skip for now
          </button>

          {showCommunityNote && (
            <p
              className="max-w-md text-center text-xs text-muted-foreground"
              data-testid="community-note"
            >
              Bolo's lessons are AI-assisted and reviewed with community help.
              Spot something off? You can flag any phrase in the app.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function LanguageTile({
  lang,
  pending,
  disabled,
  onSelect,
}: {
  lang: Language;
  pending: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const native = nativeTextProps(lang);
  // Speech-capability honesty: only verifiably unsupported languages carry the
  // listening-and-reading badge. Degraded languages practice with scoring (the
  // in-practice "feedback is approximate" notice covers the nuance), so they
  // render like supported ones here, support is the default expectation.
  const listeningOnly = speechCapabilityOf(lang) === "unsupported";

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        // Softer treatment: rounder corners, hairline border, gentler surface.
        "relative flex flex-col rounded-3xl border border-card-border/70 bg-card p-4 text-left shadow-sm transition-all",
        "hover:border-primary/30 active:scale-[0.98] disabled:opacity-60",
        pending && "border-primary",
      )}
      data-testid={`choose-lang-${lang.code}`}
    >
      <span
        className={cn(
          "block text-2xl font-bold text-foreground",
          // Nastaliq glyphs (Kashmiri, Urdu, Sindhi) cascade vertically, // clipping truncation would cut them off.
          native.isNastaliq ? "overflow-visible" : "leading-tight truncate",
        )}
        style={native.style}
        dir={native.dir}
      >
        {lang.nativeName}
      </span>
      <span className="mt-1 text-sm font-medium text-muted-foreground">
        {lang.name}
      </span>
      {listeningOnly && (
        <span
          className="mt-2 inline-flex w-fit items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
          data-testid={`listening-badge-${lang.code}`}
        >
          <Headphones className="h-3 w-3" />
          Listening & reading practice
        </span>
      )}
      {pending && (
        <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-primary" />
      )}
    </button>
  );
}
