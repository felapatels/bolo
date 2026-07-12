import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useListLanguages, type Language } from "@workspace/api-client-react";

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

  // If the stored language isn't in the supported list (e.g. removed), fall
  // back to the first available one so the app never gets stuck on a bad code.
  useEffect(() => {
    if (languages.length > 0 && !languages.some((l) => l.code === activeLang)) {
      setActiveLang(languages[0].code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languages]);

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
