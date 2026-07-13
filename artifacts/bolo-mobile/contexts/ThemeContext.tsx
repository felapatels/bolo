import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

/**
 * The learner's colour-theme preference. `system` follows the device
 * appearance; `light` / `dark` force a palette regardless of the device.
 */
export type ThemePref = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'bolo.theme';

function isThemePref(value: unknown): value is ThemePref {
  return value === 'system' || value === 'light' || value === 'dark';
}

type ThemeContextValue = {
  themePref: ThemePref;
  setThemePref: (pref: ThemePref) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Holds the active theme preference for the whole app.
 *
 * The value is cached locally (AsyncStorage) so the chosen palette applies
 * instantly on the next launch, even offline. The account screen also
 * persists it to the backend and syncs the stored value back down, so the
 * preference follows the learner across devices.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themePref, setThemePrefState] = useState<ThemePref>('system');

  // Load the persisted preference once on mount.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!cancelled && isThemePref(stored)) setThemePrefState(stored);
      })
      .catch(() => {
        // Ignore storage failures; `system` keeps the app usable.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setThemePref = (pref: ThemePref) => {
    setThemePrefState(pref);
    AsyncStorage.setItem(STORAGE_KEY, pref).catch(() => {});
  };

  return (
    <ThemeContext.Provider value={{ themePref, setThemePref }}>
      {children}
    </ThemeContext.Provider>
  );
}

/** Read/write the theme preference. Must be used within a ThemeProvider. */
export function useThemePref(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useThemePref must be used within a ThemeProvider');
  }
  return ctx;
}

/**
 * The theme preference for palette resolution, safe to call outside a
 * ThemeProvider (falls back to `system`). Used by `useColors`, which runs in
 * the root layout above where the provider mounts.
 */
export function useThemePrefValue(): ThemePref {
  return useContext(ThemeContext)?.themePref ?? 'system';
}
