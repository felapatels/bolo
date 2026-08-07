import React from 'react';
import { getGetTokensQueryKey, useGetTokens } from '@workspace/api-client-react';

// What Bolo is wearing, resolved once and read by every mascot on screen
// (mobile twin of the web EquippedOutfitProvider).
//
// It rides GET /tokens — the wallet query the app already runs — so equipping
// an outfit redresses every surface as soon as that query is invalidated.
//
// The default is null (canonical Bolo), so a component rendered outside the
// provider (auth screens, unit tests) is undressed rather than broken.
const EquippedOutfitContext = React.createContext<string | null>(null);

export function EquippedOutfitProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data } = useGetTokens({
    query: { queryKey: getGetTokensQueryKey() },
  });
  return (
    <EquippedOutfitContext.Provider value={data?.equippedOutfit ?? null}>
      {children}
    </EquippedOutfitContext.Provider>
  );
}

export function useEquippedOutfit(): string | null {
  return React.useContext(EquippedOutfitContext);
}
