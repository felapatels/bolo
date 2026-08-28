import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListLanguages,
  useGetAccount,
  getGetAccountQueryKey,
  useUpdateAccountPreferences,
  type Account,
  type Language,
  type LanguageSpeechCapability,
} from '@workspace/api-client-react';
import { useEntitlements } from '@/contexts/EntitlementsContext';

const STORAGE_KEY = 'bolo.activeLang';
/**
 * Set when a language change could not be saved to the account.
 *
 * WITHOUT THIS, A FAILED SAVE IS SILENTLY REVERTED. Pick a language on a flaky
 * connection, the PATCH fails, pushRemote swallows it (onError is empty and
 * react-query does not retry mutations), and the app works locally. On the NEXT
 * launch, reconciliation reads the server's older value and adopts it, and the
 * learner's choice is gone with nothing ever having said so. Traced 2026-08-28
 * from a screenshot showing one language picked and another in the home
 * context.
 *
 * With the flag, an unsynced local choice WINS reconciliation and is pushed
 * again, which also gives the once-only reconciliation something to repair.
 */
const UNSYNCED_KEY = 'bolo.activeLang.unsynced';
const DEFAULT_LANG = 'hi';

type LanguageContextValue = {
  languages: Language[];
  activeLang: string;
  activeLanguage: Language | undefined;
  /**
   * How well speech recognition hears the active language. Absent/undefined is
   * treated as 'supported' so older servers (and languages that never carry the
   * field) keep full scored practice.
   */
  speechCapability: LanguageSpeechCapability;
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
  /**
   * Update only the local mirror (in-memory + AsyncStorage), without a server
   * write. For call sites that persist the choice themselves via the explicit
   * language-choice helper (which PATCHes activeLanguage + hasChosenLanguage
   * in one write) — going through setActiveLang too would double-PATCH.
   */
  adoptLanguageLocally: (code: string) => void;
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

  // The learner's account carries the authoritative, cross-device copy of the
  // active language (persisted through PATCH /account/preferences). We mirror it
  // locally in AsyncStorage so the choice survives offline and applies instantly,
  // then reconcile the two once the account loads.
  const account = useGetAccount();
  const updatePrefs = useUpdateAccountPreferences();
  const qc = useQueryClient();

  const [activeLang, setActiveLangState] = useState<string>(DEFAULT_LANG);
  // Gate server reconciliation on the local load so we compare against the
  // stored choice, not the transient default.
  const [hydrated, setHydrated] = useState(false);
  const reconciled = useRef(false);
  /** True when the local choice has not reached the account. See UNSYNCED_KEY. */
  const unsynced = useRef(false);

  // Load the persisted selection once on mount, and whether it ever synced.
  useEffect(() => {
    let cancelled = false;
    Promise.all([AsyncStorage.getItem(STORAGE_KEY), AsyncStorage.getItem(UNSYNCED_KEY)])
      .then(([stored, dirty]) => {
        if (cancelled) return;
        if (stored) setActiveLangState(stored);
        unsynced.current = dirty === '1';
      })
      .catch(() => {
        // Ignore storage failures; the default keeps the app usable.
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist the choice to the backend so it follows the learner to their other
  // devices. Failure is non-fatal — the local mirror still drives this session —
  // so we swallow it rather than surface an error for a background sync.
  const pushRemote = (code: string) => {
    updatePrefs.mutate(
      { data: { activeLanguage: code } },
      {
        onSuccess: (res) => {
          unsynced.current = false;
          AsyncStorage.removeItem(UNSYNCED_KEY).catch(() => {});
          const current = qc.getQueryData<Account>(getGetAccountQueryKey());
          if (current) {
            qc.setQueryData(getGetAccountQueryKey(), {
              ...current,
              preferences: res.preferences,
            });
          }
        },
        onError: () => {
          // Still non-fatal for this session, but REMEMBERED, so the next
          // reconciliation keeps the learner's choice instead of discarding it.
          unsynced.current = true;
          AsyncStorage.setItem(UNSYNCED_KEY, '1').catch(() => {});
        },
      },
    );
  };

  // Update just the local mirror (in-memory + AsyncStorage) without touching the
  // server — used when adopting the server's own value during reconciliation.
  const applyLocal = (code: string) => {
    setActiveLangState(code);
    AsyncStorage.setItem(STORAGE_KEY, code).catch(() => {});
  };

  const setActiveLang = (code: string) => {
    applyLocal(code);
    pushRemote(code);
  };

  // Reconcile the local choice with the account once, after both have loaded.
  // A language saved on another device wins here; if the account has never
  // recorded one, seed it from the local choice so future devices inherit it.
  useEffect(() => {
    if (!hydrated || reconciled.current || !account.data) return;
    reconciled.current = true;
    const server = account.data.preferences.learning.activeLanguage;
    // AN UNSYNCED LOCAL CHOICE WINS. The learner picked it on this device and
    // the save failed; the server's value is simply older, not authoritative.
    // Retrying here is also the only repair path, since reconciliation runs
    // once per mount and nothing else ever revisits it.
    if (unsynced.current) {
      pushRemote(activeLang);
    } else if (server) {
      if (server !== activeLang) applyLocal(server);
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
      // Intl zone lookup unavailable — leave the server value untouched.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, account.data]);

  // Keep the active language valid for the supported list: if the stored code
  // isn't supported at all, fall back to the first available (synced to the
  // backend via setActiveLang).
  //
  // Deliberately NOT corrected here: a supported-but-locked language (free
  // caller). The journey-map showroom (Spec D1b-M, mirroring the web ruling
  // that removed the same auto-revert) requires a locked adoption from the
  // picker to survive — routes that need entitlement handle their own 402/403
  // states (UpgradeRequiredScreen, showroom rendering) instead of a global
  // guard silently flipping the language back.
  useEffect(() => {
    if (languages.length === 0) return;

    if (!languages.some((l) => l.code === activeLang)) {
      setActiveLang(languages[0].code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languages, activeLang]);

  const activeLanguage = languages.find((l) => l.code === activeLang);
  // Absence means the server hasn't classified this language (or is an older
  // build); default to full scored practice.
  const speechCapability = activeLanguage?.speechCapability ?? 'supported';

  const value: LanguageContextValue = {
    languages,
    activeLang,
    activeLanguage,
    speechCapability,
    timezone: account.data?.preferences.learning.timezone ?? null,
    setActiveLang,
    adoptLanguageLocally: applyLocal,
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
