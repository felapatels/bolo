import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useListLanguages, type Language } from '@workspace/api-client-react';
import { useEntitlements } from '@/contexts/EntitlementsContext';

const STORAGE_KEY = 'bolo.activeLang';
const DEFAULT_LANG = 'hi';

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

  // Which languages the caller's plan actually unlocks. Used so we never default
  // to — or get stuck on — a locked language (which would make gated screens
  // 402 / render empty) after a downgrade.
  const { allowedLanguages, isPlus } = useEntitlements();

  const [activeLang, setActiveLangState] = useState<string>(DEFAULT_LANG);

  // Load the persisted selection once on mount.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!cancelled && stored) setActiveLangState(stored);
      })
      .catch(() => {
        // Ignore storage failures; the default keeps the app usable.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setActiveLang = (code: string) => {
    setActiveLangState(code);
    AsyncStorage.setItem(STORAGE_KEY, code).catch(() => {});
  };

  // Keep the active language valid for both the supported list and the caller's
  // plan. If the stored code isn't supported, fall back to the first available.
  // If it's supported but locked for this plan (e.g. after a downgrade), switch
  // to the first allowed language so gated screens never render empty.
  useEffect(() => {
    if (languages.length === 0) return;

    if (!languages.some((l) => l.code === activeLang)) {
      setActiveLang(languages[0].code);
      return;
    }

    if (
      !isPlus &&
      allowedLanguages.length > 0 &&
      !allowedLanguages.includes(activeLang)
    ) {
      const firstAllowed = languages.find((l) =>
        allowedLanguages.includes(l.code),
      )?.code;
      if (firstAllowed && firstAllowed !== activeLang) {
        setActiveLang(firstAllowed);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languages, allowedLanguages, isPlus, activeLang]);

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
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return ctx;
}
