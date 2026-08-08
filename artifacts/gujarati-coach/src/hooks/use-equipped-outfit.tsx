import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useUser } from "@clerk/react";
import { getGetTokensQueryKey, useGetTokens } from "@workspace/api-client-react";

// What Bolo is wearing, resolved once and read by every mascot on screen.
//
// TWO SLOTS (owner ruling, Aug 8 2026): a garment on her belly and an
// accessory on her head, worn at the same time. They are separate because
// either can be taken off without disturbing the other — a single "equipped"
// value would make putting a hat on silently strip the outfit.
//
// It rides GET /tokens — the wallet query the app already runs — so equipping
// updates every surface as soon as that query is invalidated, and no screen
// needs an outfit fetch of its own.
//
// The default is nothing worn (canonical Bolo), so a component rendered
// outside the provider (signed-out chrome, unit tests) is undressed rather
// than broken.
export type WornOutfits = {
  garment: string | null;
  accessory: string | null;
};

const NOTHING_WORN: WornOutfits = { garment: null, accessory: null };

const EquippedOutfitContext = createContext<WornOutfits>(NOTHING_WORN);

export function EquippedOutfitProvider({ children }: { children: ReactNode }) {
  const { isSignedIn } = useUser();
  // Signed-out visitors must not fire an authed request just to look at the
  // landing page's mascot. orval needs the queryKey alongside `enabled`.
  const { data } = useGetTokens({
    query: { enabled: Boolean(isSignedIn), queryKey: getGetTokensQueryKey() },
  });
  const worn = useMemo<WornOutfits>(
    () => ({
      garment: data?.equippedOutfit ?? null,
      accessory: data?.equippedAccessory ?? null,
    }),
    [data?.equippedOutfit, data?.equippedAccessory],
  );
  return (
    <EquippedOutfitContext.Provider value={worn}>
      {children}
    </EquippedOutfitContext.Provider>
  );
}

export function useEquippedOutfit(): WornOutfits {
  return useContext(EquippedOutfitContext);
}
