import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type ActiveProfile = {
  id: number;
  name: string;
  color: string;
  avatar: string;
};

const STORAGE_KEY = "gujarati-coach:profile";

type ProfileContextValue = {
  profile: ActiveProfile | null;
  setProfile: (p: ActiveProfile) => void;
  clearProfile: () => void;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

function readStored(): ActiveProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveProfile;
    if (typeof parsed?.id === "number" && typeof parsed?.name === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<ActiveProfile | null>(() => readStored());

  const setProfile = useCallback((p: ActiveProfile) => {
    setProfileState(p);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch {
      // Ignore storage failures; the in-memory value still works this session.
    }
  }, []);

  const clearProfile = useCallback(() => {
    setProfileState(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore.
    }
  }, []);

  return (
    <ProfileContext.Provider value={{ profile, setProfile, clearProfile }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within a ProfileProvider");
  return ctx;
}
