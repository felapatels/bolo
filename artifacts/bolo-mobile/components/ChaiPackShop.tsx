// Chai packs on iOS — buying Chai with money, through Apple.
//
// Everything visible here is DARK until the flag below is flipped, exactly as
// the web shop is (artifacts/gujarati-coach/src/components/chai-packs.tsx).
// The plumbing underneath it is not: the catalog endpoint, the StoreKit
// purchase, the webhook credit and the launch recovery are all live and
// tested, so switching packs on is a display change rather than the first run
// of untried code.
//
// The price a learner reads here comes from the StoreKit product itself. The
// server sends the pack id, the Apple product id and the Chai; it never sends
// a price, so no number on this screen can drift from what Apple charges.

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Purchases from 'react-native-purchases';
import { useQueryClient } from '@tanstack/react-query';
import { getGetTokensQueryKey } from '@workspace/api-client-react';
import { ChaiGlyph } from '@/components/ChaiStall';
import { usePurchasesOptional } from '@/contexts/PurchasesContext';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { INDIA } from '@/constants/india';

/**
 * THE FLAG. Same shape and same default as web's CHAI_PACKS_LIVE: a plain
 * exported constant, overridable per-render by the `live` prop so tests can
 * exercise both states.
 *
 * What it gates: the pack shop SURFACE only. It does not gate GET
 * /chai-packs, the StoreKit purchase, the webhook credit, the ledger write or
 * the launch recovery; all of those stay live and exercised while this is
 * false.
 */
// LIT on 2026-08-18, at the owner's word, in the same breath as web's. The
// twins must flip together: one platform selling Chai while the other hides
// the shop is the worst of both.
export const CHAI_PACKS_LIVE = true;

// Web's register, word for word where the words still fit — a learner who
// uses both should not meet two different shops.
export const PACK_COPY = {
  title: 'Out of Chai?',
  blurb: 'Top up the wallet, or keep practising. Both fill the cup.',
  failed: 'That purchase did not go through. Nothing has been charged.',
  cancelled: 'Purchase cancelled. Nothing has been charged.',
  // The honest line for "Apple charged, the Chai has not landed yet". It never
  // claims the Chai has arrived, because it has not.
  pending: 'Chai on the way. Your balance updates in a moment.',
  buying: 'Talking to the App Store…',
} as const;

type PackTile = {
  id: string;
  appleProductId: string;
  chai: number;
  price: string;
};

/**
 * The pack shop, as a section inside the wallet sheet.
 *
 * Renders NOTHING when the flag is off, and nothing when the store could not
 * price a single pack — a shop with no prices is worse than no shop, and no
 * money string is ever invented client-side.
 */
/**
 * Whether the store can actually sell anything right now.
 *
 * The shop hides itself when Apple prices nothing, which is correct and is what
 * makes CHAI_PACKS_LIVE safe to leave on before the products are approved. But
 * anything rendered AROUND the shop has to ask the same question, or it ends up
 * advertising a counter with nobody behind it: a badge saying "top up to keep
 * shopping" above an empty space, or a shortfall sheet offering packs that are
 * not there.
 *
 * Added 2026-08-19, the same day the bazaar grew both of those.
 */
export function useChaiPacksSellable(live = CHAI_PACKS_LIVE): boolean {
  const purchases = usePurchasesOptional();
  // Same source and same stable identity as the component below, so the hook
  // and the shop can never disagree about whether there is anything to sell.
  const chaiPacks = purchases?.chaiPacks;
  const [sellable, setSellable] = useState(false);
  useEffect(() => {
    if (!live || !chaiPacks || chaiPacks.length === 0) {
      setSellable(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const products = await Purchases.getProducts(
          chaiPacks.map((pack: { appleProductId: string }) => pack.appleProductId),
          // NON_SUBSCRIPTION is load-bearing on Android and ignored on iOS.
          // getProducts defaults to SUBSCRIPTION (see the SDK's own JSDoc and
          // `type = PRODUCT_CATEGORY.SUBSCRIPTION` in its implementation), and
          // Google Play keeps subscriptions and one-time products in two
          // separate catalogues. Asking the subscription catalogue for a chai
          // pack returns nothing, so the shop hid itself on every Android
          // build. StoreKit has one catalogue, which is why iOS never noticed.
          Purchases.PRODUCT_CATEGORY.NON_SUBSCRIPTION,
        );
        if (!cancelled) setSellable(products.length > 0);
      } catch {
        // An unreachable store sells nothing, which is the safe reading.
        if (!cancelled) setSellable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [live, chaiPacks]);
  return sellable;
}

export function ChaiPackShop({ live = CHAI_PACKS_LIVE }: { live?: boolean }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const purchases = usePurchasesOptional();
  // Left undefined (not defaulted to a fresh []) so the effect below has a
  // stable dependency instead of a new array identity every render.
  const chaiPacks = purchases?.chaiPacks;
  const isBuyingChai = purchases?.isBuyingChai ?? false;
  const [tiles, setTiles] = useState<PackTile[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!live || !chaiPacks || chaiPacks.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const products = await Purchases.getProducts(
          chaiPacks.map((pack) => pack.appleProductId),
          // See useChaiPacksSellable above: without this Android returns no
          // products and the shop renders empty.
          Purchases.PRODUCT_CATEGORY.NON_SUBSCRIPTION,
        );
        if (cancelled) return;
        const priced: PackTile[] = [];
        for (const pack of chaiPacks) {
          const product = products.find(
            (p) => p.identifier === pack.appleProductId,
          );
          if (!product) continue;
          priced.push({
            id: pack.id,
            appleProductId: pack.appleProductId,
            chai: pack.chai,
            price: product.priceString,
          });
        }
        setTiles(priced);
      } catch {
        if (!cancelled) setTiles([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [live, chaiPacks]);

  if (!live) return null;
  if (tiles.length === 0) return null;

  const handleBuy = async (tile: PackTile) => {
    if (!purchases) return;
    setNotice(null);
    const outcome = await purchases.purchaseChaiPack(tile.appleProductId);
    if (outcome === 'success') {
      // The server has the Chai; go and read the new balance.
      void queryClient.invalidateQueries({ queryKey: getGetTokensQueryKey() });
      return;
    }
    if (outcome === 'pending') {
      setNotice(PACK_COPY.pending);
      void queryClient.invalidateQueries({ queryKey: getGetTokensQueryKey() });
      return;
    }
    if (outcome === 'cancelled') {
      setNotice(PACK_COPY.cancelled);
      return;
    }
    setNotice(PACK_COPY.failed);
  };

  return (
    <View
      testID="chai-pack-shop"
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.title, { color: colors.foreground }]}>
        {PACK_COPY.title}
      </Text>
      <Text style={[styles.blurb, { color: colors.mutedForeground }]}>
        {PACK_COPY.blurb}
      </Text>
      <View style={styles.row}>
        {tiles.map((tile) => (
          <Pressable
            key={tile.id}
            testID={`chai-pack-${tile.id}`}
            accessibilityRole="button"
            disabled={isBuyingChai}
            onPress={() => void handleBuy(tile)}
            style={({ pressed }) => [
              styles.tile,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
              },
              (pressed || isBuyingChai) && styles.tilePressed,
            ]}
          >
            <ChaiGlyph size={26} />
            <Text style={[styles.chai, { color: colors.foreground }]}>
              {tile.chai}
            </Text>
            <Text style={[styles.chaiLabel, { color: colors.mutedForeground }]}>
              CHAI
            </Text>
            <Text style={styles.price}>{tile.price}</Text>
          </Pressable>
        ))}
      </View>
      {isBuyingChai && (
        <Text
          testID="chai-pack-pending"
          style={[styles.notice, { color: colors.mutedForeground }]}
        >
          {PACK_COPY.buying}
        </Text>
      )}
      {notice && !isBuyingChai && (
        <Text
          testID="chai-pack-notice"
          style={[styles.notice, { color: colors.mutedForeground }]}
        >
          {notice}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 2,
  },
  title: {
    fontFamily: AppFonts.extrabold,
    fontSize: 16,
  },
  blurb: {
    fontFamily: AppFonts.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    marginTop: 10,
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 10,
  },
  tilePressed: {
    opacity: 0.6,
  },
  chai: {
    fontFamily: AppFonts.extrabold,
    fontSize: 18,
    lineHeight: 20,
  },
  chaiLabel: {
    fontFamily: AppFonts.bold,
    fontSize: 9,
    letterSpacing: 1,
  },
  notice: {
    marginTop: 8,
    fontFamily: AppFonts.bold,
    fontSize: 11,
  },
  price: {
    marginTop: 4,
    fontFamily: AppFonts.extrabold,
    fontSize: 12,
    color: INDIA.boardDeep,
    backgroundColor: `${INDIA.gold}2E`,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
});
