import { createContext, useContext, type ReactNode } from "react";
import { useUser } from "@clerk/react";
import { getGetTokensQueryKey, useGetTokens } from "@workspace/api-client-react";

// What Bolo is wearing, resolved once and read by every mascot on screen.
//
// It rides GET /tokens — the wallet query the app already runs — so equipping
// an outfit updates every surface as soon as that query is invalidated, and no
// screen needs an outfit fetch of its own.
//
// The default is null (canonical Bolo), so a component rendered outside the
// provider (signed-out chrome, unit tests) is undressed rather than broken.
const EquippedOutfitContext = createContext<string | null>(null);

export function EquippedOutfitProvider({ children }: { children: ReactNode }) {
  const { isSignedIn } = useUser();
  // Signed-out visitors must not fire an authed request just to look at the
  // landing page's mascot. orval needs the queryKey alongside `enabled`.
  const { data } = useGetTokens({
    query: { enabled: Boolean(isSignedIn), queryKey: getGetTokensQueryKey() },
  });
  return (
    <EquippedOutfitContext.Provider value={data?.equippedOutfit ?? null}>
      {children}
    </EquippedOutfitContext.Provider>
  );
}

export function useEquippedOutfit(): string | null {
  return useContext(EquippedOutfitContext);
}
