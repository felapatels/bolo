import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useUser } from "@clerk/react";
import {
  useListLanguages,
  useGetEntitlements,
  getGetEntitlementsQueryKey,
  type Language,
} from "@workspace/api-client-react";

const STORAGE_KEY = "bolo.activeLang";
const DEFAULT_LANG = "gu";

type LanguageContextValue = {
  languages: Language[];
  activeLang: string;
  activeLanguage: Language | undefined;
  setActiveLang: (code: string) => void;
  isLoading: boolean;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useListLanguages();
  const languages = useMemo(() => data ?? [], [data]);

  // The caller's plan decides which languages they may actually open. Free plans
  // are limited (e.g. to a single language); Plus unlocks all. We use this to
  // avoid defaulting to — or getting stuck on — a locked language, which would
  // make every gated screen (topics, progress, review) come back empty.
  const { isSignedIn } = useUser();
  const { data: entitlements } = useGetEntitlements({
    // Only signed-in callers have entitlements; skip the request (which 401s)
    // on public routes like the marketing landing page.
    query: {
      enabled: !!isSignedIn,
      queryKey: getGetEntitlementsQueryKey(),
    },
  });
  const allowedLanguages = entitlements?.allowedLanguages;

  const [activeLang, setActiveLangState] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_LANG;
    return window.localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;
  });

  const setActiveLang = (code: string) => {
    setActiveLangState(code);
    try {
      window.localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // Ignore storage failures (e.g. private mode); selection still works in-session.
    }
  };

  // Keep the active language valid for both the supported list and the caller's
  // plan. If the stored language isn't supported (e.g. removed), fall back to the
  // first available. If it's supported but locked for this plan, switch to the
  // first allowed language so gated screens never render empty.
  useEffect(() => {
    if (languages.length === 0) return;

    if (!languages.some((l) => l.code === activeLang)) {
      setActiveLang(languages[0].code);
      return;
    }

    if (
      allowedLanguages &&
      allowedLanguages.length > 0 &&
      !allowedLanguages.includes(activeLang)
    ) {
      // Intersect with the supported list so we never set an allowed-but-unknown
      // code (which would oscillate with the unsupported-guard above). If there's
      // no overlap, do nothing rather than loop.
      const firstAllowed = languages.find((l) =>
        allowedLanguages.includes(l.code),
      )?.code;
      if (firstAllowed && firstAllowed !== activeLang) {
        setActiveLang(firstAllowed);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languages, allowedLanguages, activeLang]);

  const activeLanguage = languages.find((l) => l.code === activeLang);

  const value: LanguageContextValue = {
    languages,
    activeLang,
    activeLanguage,
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

// Returns style + dir props to render text in the active language's own script
// (correct font + right-to-left for Perso-Arabic scripts). Spread onto any
// element that shows native-script text.
export function useNativeText(): { style: CSSProperties; dir: "rtl" | "ltr" } {
  const { activeLanguage } = useLanguage();
  return nativeTextProps(activeLanguage);
}

export function nativeTextProps(language: Language | undefined): {
  style: CSSProperties;
  dir: "rtl" | "ltr";
} {
  return {
    style: language
      ? { fontFamily: `'${language.fontFamily}', 'Noto Sans', sans-serif` }
      : {},
    dir: language?.rtl ? "rtl" : "ltr",
  };
}
