import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListLanguages,
  useGetAccount,
  getGetAccountQueryKey,
  useUpdateAccountPreferences,
  type Account,
  type Language,
} from "@workspace/api-client-react";

const STORAGE_KEY = "bolo.activeLang";
const DEFAULT_LANG = "hi";

type LanguageContextValue = {
  languages: Language[];
  activeLang: string;
  activeLanguage: Language | undefined;
  /**
   * The learner's STORED IANA time zone, as the account carries it — null
   * until the account loads, or when it has never been recorded.
   *
   * Exposed here because this provider already holds the account query, so
   * day-boundary consumers (the XP strip's midnight reset) get it without a
   * second `useGetAccount` call. Consumers must treat absence as "fall back to
   * the device zone" (see `resolveLearnerTimeZone` in @workspace/train-class),
   * never as "no zone".
   */
  timezone: string | null;
  setActiveLang: (code: string) => void;
  isLoading: boolean;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useListLanguages();
  const languages = useMemo(() => data ?? [], [data]);

  const { isSignedIn } = useUser();

  // The learner's account carries the authoritative, cross-device copy of the
  // active language (persisted through PATCH /account/preferences via the account
  // page). We mirror it locally in localStorage so the choice applies instantly,
  // then reconcile the two once the account loads — so a language picked on
  // another device follows the learner here.
  const account = useGetAccount({
    // Only signed-in callers have an account; skip on public routes (landing
    // page) where the request would 401.
    query: {
      enabled: !!isSignedIn,
      queryKey: getGetAccountQueryKey(),
    },
  });
  const updatePrefs = useUpdateAccountPreferences();
  const queryClient = useQueryClient();
  const reconciled = useRef(false);

  const [activeLang, setActiveLangState] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_LANG;
    return window.localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;
  });

  // Update just the local mirror (in-memory + localStorage) without touching the
  // server — used both for direct selections (the account page owns the remote
  // push) and when adopting the server's own value during reconciliation.
  const setActiveLang = (code: string) => {
    setActiveLangState(code);
    try {
      window.localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // Ignore storage failures (e.g. private mode); selection still works in-session.
    }
  };

  // Persist the choice to the backend so it follows the learner to their other
  // devices. Only used to seed the account when it has never recorded a language;
  // failure is non-fatal for a background sync, so we swallow it.
  const pushRemote = (code: string) => {
    updatePrefs.mutate(
      { data: { activeLanguage: code } },
      {
        onSuccess: (res) => {
          const current = queryClient.getQueryData<Account>(
            getGetAccountQueryKey(),
          );
          if (current) {
            queryClient.setQueryData(getGetAccountQueryKey(), {
              ...current,
              preferences: res.preferences,
            });
          }
        },
        onError: () => {},
      },
    );
  };

  // Reconcile the local choice with the account once, after it loads. A language
  // saved on another device wins here; if the account has never recorded one,
  // seed it from the local choice so future devices inherit it. The localStorage
  // read above is synchronous, so `activeLang` already holds the stored value by
  // the time this runs — no need to gate on a separate hydration flag.
  useEffect(() => {
    if (reconciled.current || !account.data) return;
    reconciled.current = true;
    const server = account.data.preferences.learning.activeLanguage;
    if (server) {
      if (server !== activeLang) setActiveLang(server);
    } else {
      pushRemote(activeLang);
    }

    // Also report the device's IANA time zone so the server buckets streak days
    // by the learner's local midnight instead of UTC. The device wins (the
    // learner may have moved); failure is non-fatal for a background sync.
    try {
      const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (deviceTz && deviceTz !== account.data.preferences.learning.timezone) {
        updatePrefs.mutate({ data: { timezone: deviceTz } }, { onError: () => {} });
      }
    } catch {
      // Intl unavailable — leave the server value untouched.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.data]);

  // Keep the active language valid for the supported list: if the stored code
  // isn't supported (e.g. removed), fall back to the first available.
  //
  // Plan-locked languages are deliberately PERMITTED as the active language:
  // the journey page renders them in showroom mode (a browsable teaser with an
  // upgrade path), and every gated surface degrades to its own upgrade state.
  // Auto-reverting here used to make the showroom unreachable on web.
  useEffect(() => {
    if (languages.length === 0) return;

    if (!languages.some((l) => l.code === activeLang)) {
      setActiveLang(languages[0].code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languages, activeLang]);

  const activeLanguage = languages.find((l) => l.code === activeLang);

  const value: LanguageContextValue = {
    languages,
    activeLang,
    activeLanguage,
    timezone: account.data?.preferences.learning.timezone ?? null,
    setActiveLang,
    isLoading,
  };

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return ctx;
}

// How well speech recognition hears a language. The field is optional (mobile
// back-compat), so absence is treated as full "supported" practice.
export type SpeechCapability = "supported" | "degraded" | "unsupported";

export function speechCapabilityOf(
  language: Language | undefined,
): SpeechCapability {
  return language?.speechCapability ?? "supported";
}

// Reads the active language's speech-recognition capability, defaulting to
// "supported" when the server omits the field. Practice/review surfaces use
// this to soften (degraded) or replace (unsupported) scored feedback.
export function useSpeechCapability(): SpeechCapability {
  const { activeLanguage } = useLanguage();
  return speechCapabilityOf(activeLanguage);
}

// Returns style + dir props to render text in the active language's own script
// (correct font + right-to-left for Perso-Arabic scripts). Spread onto any
// element that shows native-script text.
export function useNativeText(): { style: CSSProperties; dir: "rtl" | "ltr"; isNastaliq: boolean } {
  const { activeLanguage } = useLanguage();
  return nativeTextProps(activeLanguage);
}

// Nastaliq-script glyphs cascade vertically and need extra line-height.
// Kashmiri (ks), Urdu (ur), and Sindhi (sd) all use Noto Nastaliq Urdu.
function isNastaliqFont(fontFamily: string | undefined): boolean {
  return fontFamily?.toLowerCase().includes("nastaliq") ?? false;
}

export function nativeTextProps(language: Language | undefined): {
  style: CSSProperties;
  dir: "rtl" | "ltr";
  /** True for Kashmiri, Urdu, Sindhi — Nastaliq glyphs need extra vertical room. */
  isNastaliq: boolean;
} {
  const nastaliq = isNastaliqFont(language?.fontFamily);
  return {
    style: language
      ? {
          fontFamily: `'${language.fontFamily}', 'Noto Sans', sans-serif`,
          // Nastaliq glyphs cascade far below the baseline; 2× line-height
          // prevents them from being clipped or overlapping the row below.
          ...(nastaliq ? { lineHeight: "2" } : {}),
        }
      : {},
    dir: language?.rtl ? "rtl" : "ltr",
    isNastaliq: nastaliq,
  };
}
