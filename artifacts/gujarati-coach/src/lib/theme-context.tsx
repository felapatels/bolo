import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useUser } from "@clerk/react";
import { useGetAccount, getGetAccountQueryKey } from "@workspace/api-client-react";

// The colour theme the learner picks in Account settings. "system" follows the
// OS preference; "light"/"dark" force it. The choice is applied by toggling the
// `.dark` class on <html> (the stylesheet keys every colour token off it) and is
// persisted server-side so it follows the learner across devices — with a
// localStorage cache so the correct theme paints immediately on load (no flash)
// and works for signed-out visitors too.

export type Theme = "system" | "light" | "dark";

const STORAGE_KEY = "bolo.theme";
const THEMES: Theme[] = ["system", "light", "dark"];

function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && THEMES.includes(value as Theme);
}

function readStored(): Theme {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isTheme(stored) ? stored : "system";
}

function prefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const dark = theme === "dark" || (theme === "system" && prefersDark());
  document.documentElement.classList.toggle("dark", dark);
}

type ThemeContextValue = {
  theme: Theme;
  /** Applies the theme immediately and caches it locally. Persisting to the
   *  backend is the caller's responsibility (the settings screen does it). */
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStored);

  const { isSignedIn } = useUser();
  // Adopt the server-stored theme once the account loads so the choice follows
  // the learner across devices. Skipped (401s) for signed-out visitors, who
  // fall back to the localStorage cache above.
  const { data: account } = useGetAccount({
    query: {
      enabled: !!isSignedIn,
      queryKey: getGetAccountQueryKey(),
    },
  });
  const serverTheme = account?.preferences.learning.theme;

  useEffect(() => {
    if (isTheme(serverTheme) && serverTheme !== theme) {
      setThemeState(serverTheme);
      try {
        window.localStorage.setItem(STORAGE_KEY, serverTheme);
      } catch {
        // Ignore storage failures (e.g. private mode).
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverTheme]);

  // Apply on every change, and — while on "system" — keep in sync with the OS.
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage failures; the in-session choice still applies.
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
