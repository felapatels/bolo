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

  // If the stored language isn't supported (e.g. removed), fall back to the
  // first available one so the app never gets stuck on a bad code.
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
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return ctx;
}
