import React from 'react';
import { getGetTokensQueryKey, useGetTokens } from '@workspace/api-client-react';

// What Bolo is wearing, resolved once and read by every mascot on screen
// (mobile twin of the web EquippedOutfitProvider).
//
// TWO SLOTS (owner ruling, Aug 8 2026): a garment on her belly and an
// accessory on her head, worn at the same time. They stay separate because
// either can come off without disturbing the other, one "equipped" value
// would make putting a hat on silently strip the outfit.
//
// It rides GET /tokens, the wallet query the app already runs, so equipping
// redresses every surface as soon as that query is invalidated.
//
// The default is nothing worn (canonical Bolo), so a component rendered
// outside the provider (auth screens, unit tests) is undressed rather than
// broken.
export type WornOutfits = {
  garment: string | null;
  accessory: string | null;
};

const NOTHING_WORN: WornOutfits = { garment: null, accessory: null };

const EquippedOutfitContext = React.createContext<WornOutfits>(NOTHING_WORN);

export function EquippedOutfitProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data } = useGetTokens({
    query: { queryKey: getGetTokensQueryKey() },
  });
  const worn = React.useMemo<WornOutfits>(
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
  return React.useContext(EquippedOutfitContext);
}
