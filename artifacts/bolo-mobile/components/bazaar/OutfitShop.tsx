import React from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetOutfitsQueryKey,
  getGetTokensQueryKey,
  useBuyOutfit,
  useEquipOutfit,
  useGetOutfits,
  type OutfitCatalogItem,
} from '@workspace/api-client-react';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { PressableScale } from '@/components/PressableScale';
import { ChaiShortfallSheet } from '@/components/ChaiShortfallSheet';
import { ChaiWalletSheet, shortfallFromSpendError, spendErrorMessage } from '@/components/ChaiWallet';
import { Mascot } from '@/components/Mascot';
import { mascotSource } from '@/lib/mascotOutfits';
import { ChaiGlyph } from '@/components/ChaiStall';
import { MilestoneToast } from '@/components/MilestoneToast';
import { BazaarHeader } from '@/components/bazaar/BazaarHeader';
import { SceneBand } from '@/components/bazaar/SceneBand';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { hapticLight } from '@/lib/haptics';

/**
 * THE OUTFIT SHOP, BEHIND TWO DOORS (build 22, the owner's bazaar redesign:
 * "The Tailor: outfits, headwear and accessories for Bolo" and "Station
 * Master: hats, uniforms and station essentials"). One component, because
 * both doors sell from the same catalogue with the same till: the Tailor
 * shows everything, the Station Master the station-themed pieces. It is the
 * old bazaar screen's tailor stall (app/(app)/bazaar.tsx until build 22)
 * with its logic and every test pin intact, laid out to the mockup: the
 * scene with the dressed bird large and the keeper beside her, the two
 * category buttons on the scene, Share Look, the two "Wearing" chips, the
 * Everything / My Wardrobe tabs, and a rail of cards per section.
 *
 * WHAT IS NOT HERE, AND WHY: the mockup's Station Master rack lists a
 * uniform and four caps. The catalogue has one station piece (the station
 * master's cap); every item is delivered art in five poses, so the rest
 * arrive when they are drawn, not by listing them.
 */
export type ShopDoor = 'tailor' | 'station';

/** The station-themed pieces of the catalogue, by id. Grows with the art. */
const STATION_IDS: ReadonlySet<string> = new Set(['station-cap']);

const RACK_SECTIONS: ReadonlyArray<{ kind: string; label: string }> = [
  { kind: 'garment', label: 'Outfits' },
  { kind: 'accessory', label: 'Headwear' },
];

function groupOutfits<T extends { kind?: string | null }>(
  outfits: readonly T[],
): Array<{ kind: string; label: string; items: T[] }> {
  const known = new Set(RACK_SECTIONS.map((s) => s.kind));
  return RACK_SECTIONS.map((section, index) => ({
    ...section,
    items: outfits.filter((o) => {
      const kind = o.kind ?? '';
      return known.has(kind) ? kind === section.kind : index === 0;
    }),
  })).filter((section) => section.items.length > 0);
}

// The head crop for hats (see the old shop's OutfitThumb): RN has no
// transform-origin, so the head is moved to the middle of the box instead.
const HEAD_X = 0.53;
const HEAD_Y = 0.26;
const HEAD_ZOOM = 2.3;
const CARD_W = 108;
const THUMB = CARD_W - 16;

function OutfitThumb({ outfitId, preview, size }: { outfitId: string; preview?: string | null; size: number }) {
  const head = preview === 'head';
  return (
    <View style={[styles.thumb, { width: size, height: size }]}>
      <Image
        source={mascotSource('wave', outfitId)}
        accessible={false}
        resizeMode="contain"
        style={[
          { width: size, height: size },
          head
            ? {
                transform: [
                  { scale: HEAD_ZOOM },
                  { translateX: (0.5 - HEAD_X) * size },
                  { translateY: (0.5 - HEAD_Y) * size },
                ],
              }
            : { transform: [{ scale: 1.04 }] },
        ]}
      />
    </View>
  );
}

const DOORS: Record<ShopDoor, { title: string; subtitle: string; stall: 'tailor' | 'ticket' }> = {
  tailor: { title: 'The Tailor', subtitle: 'Dress Bolo for the journey.', stall: 'tailor' },
  station: { title: 'Station Master', subtitle: 'Hats, uniforms and more.', stall: 'ticket' },
};

export function OutfitShop({ door }: { door: ShopDoor }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { width: windowW } = useWindowDimensions();
  const sceneW = Math.max(1, windowW - 40);
  const sceneH = Math.round(sceneW * 0.86);
  const outfitsQuery = useGetOutfits();
  const data = outfitsQuery.data;
  const equipped = data?.equipped ?? null;
  const equippedAccessory = data?.equippedAccessory ?? null;
  const balance = data?.balance ?? 0;
  const [previewed, setPreviewed] = React.useState<string | null>(null);
  const [ownedOnly, setOwnedOnly] = React.useState(false);
  const [kindFilter, setKindFilter] = React.useState<'all' | 'garment' | 'accessory'>('all');
  const [walletOpen, setWalletOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState('');
  const [noticeKey, setNoticeKey] = React.useState(0);
  const [shortfall, setShortfall] = React.useState<number | null>(null);
  const showNotice = (message: string) => {
    setNotice(message);
    setNoticeKey((k) => k + 1);
  };
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetOutfitsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetTokensQueryKey() }),
    ]);
  };
  const mutationOptions = {
    onSuccess: async () => {
      setPreviewed(null);
      await refresh();
    },
    onError: (error: unknown) => {
      const short = shortfallFromSpendError(error);
      if (short !== null) {
        setShortfall(short);
        return;
      }
      showNotice(spendErrorMessage(error));
    },
  };
  const buy = useBuyOutfit({ mutation: mutationOptions });
  const equip = useEquipOutfit({ mutation: mutationOptions });
  const busy = buy.isPending || equip.isPending;
  const shownOutfit = data?.outfits.find((o) => o.id === previewed) ?? null;
  const previewedKind = shownOutfit?.kind ?? 'garment';
  const shownGarment = shownOutfit && previewedKind === 'garment' ? shownOutfit.id : equipped;
  const shownAccessory = shownOutfit && previewedKind === 'accessory' ? shownOutfit.id : equippedAccessory;
  const shown = `${shownGarment ?? ''}|${shownAccessory ?? ''}`;
  const isWorn = (id: string, kind?: string | null) =>
    kind === 'accessory' ? id === equippedAccessory : id === equipped;
  const catalogue = data?.outfits ?? [];
  // The door's own stock: the Tailor sells everything, the Station Master
  // the station pieces.
  const allItems = door === 'station' ? catalogue.filter((o) => STATION_IDS.has(o.id)) : catalogue;
  const ownedCount = allItems.filter((o) => o.owned).length;
  const rackItems = (ownedOnly ? allItems.filter((o) => o.owned) : allItems).filter((o) =>
    kindFilter === 'all' ? true : (o.kind ?? 'garment') === kindFilter,
  );
  const wornGarment = catalogue.find((o) => o.id === equipped) ?? null;
  const wornAccessory = catalogue.find((o) => o.id === equippedAccessory) ?? null;

  // NO DRESSING ROOM (owner, on the first cut: "get rid of the dressing room
  // thing"): the bird stands in the tailor's scene itself, and a change of
  // clothes is instant. The old shop's curtain and its beat went with it.
  void shown;

  const tryOn = (outfitId: string) => setPreviewed(outfitId);
  const shareLook = async () => {
    hapticLight();
    const pieces = [wornGarment?.name, wornAccessory?.name].filter(Boolean);
    const line = pieces.length > 0 ? `My Bolo is wearing ${pieces.join(' and ')} on Bolo!` : 'Come dress your Bolo on Bolo!';
    try {
      await Share.share({ message: line });
    } catch {
      // The learner closed the sheet; nothing to say.
    }
  };
  const meta = DOORS[door];

  return (
    <Screen>
      <MilestoneToast message={notice} toastKey={noticeKey} />
      {/* CONFIRM BEFORE SPENDING. Chai is earned slowly, an outfit is bought
          once and there is no refund and no undo, so a single mistaken tap
          used to be final. */}
      <Modal transparent visible={confirming !== null} animationType="fade" onRequestClose={() => setConfirming(null)}>
        <Pressable style={styles.confirmScrim} onPress={() => setConfirming(null)}>
          <Pressable
            testID="outfit-buy-confirm"
            style={[styles.confirmCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {}}
          >
            <Text style={[styles.confirmTitle, { color: colors.foreground }]}>
              Buy {data?.outfits.find((o) => o.id === confirming)?.name ?? 'this outfit'}?
            </Text>
            <Text style={[styles.confirmBody, { color: colors.mutedForeground }]}>
              {data?.outfits.find((o) => o.id === confirming)?.cost ?? 0} Chai, and it is yours for
              good. Chai is not refundable.
            </Text>
            <View style={styles.confirmRow}>
              <Pressable onPress={() => setConfirming(null)} style={[styles.confirmBtn, { borderColor: colors.border }]}>
                <Text style={[styles.confirmBtnText, { color: colors.foreground }]}>Not yet</Text>
              </Pressable>
              <Pressable
                testID="outfit-buy-confirm-yes"
                onPress={() => {
                  const id = confirming;
                  setConfirming(null);
                  if (id) buy.mutate({ data: { outfitId: id } });
                }}
                style={[styles.confirmBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
              >
                <Text style={[styles.confirmBtnText, { color: colors.primaryForeground }]}>Buy it</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <ChaiShortfallSheet needed={shortfall} itemName={shownOutfit?.name} onClose={() => setShortfall(null)} />
      <BazaarHeader title={meta.title} subtitle={meta.subtitle} centred onWallet={() => setWalletOpen(true)} />
      <ScrollView contentContainerStyle={styles.street} showsVerticalScrollIndicator={false}>
        {/* THE SCENE: the keeper's shop with the bird dressed, large, and the
            two category buttons standing on it. */}
        <View testID="outfit-storefront">
          <SceneBand stall={meta.stall} width={sceneW} height={sceneH} testID="outfit-scene">
            <View style={styles.sceneVeil} pointerEvents="none" />
            <View style={styles.sideButtons}>
              <CategoryButton
                label="Outfits"
                glyph={<Feather name="user" size={20} color={colors.primary} />}
                active={kindFilter === 'garment'}
                onPress={() => setKindFilter((k) => (k === 'garment' ? 'all' : 'garment'))}
                testID="outfit-kind-garment"
              />
              <CategoryButton
                label="Headwear"
                glyph={<MaterialCommunityIcons name="hat-fedora" size={20} color={colors.primary} />}
                active={kindFilter === 'accessory'}
                onPress={() => setKindFilter((k) => (k === 'accessory' ? 'all' : 'accessory'))}
                testID="outfit-kind-accessory"
              />
            </View>
            <View testID="outfit-preview" style={styles.stage} pointerEvents="none">
              <Mascot pose="cheer" size={Math.round(sceneH * 0.58)} motion="float" outfit={shownGarment} accessory={shownAccessory} />
            </View>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Share Bolo's look"
              onPress={shareLook}
              style={[styles.shareBtn, { backgroundColor: colors.card }]}
              testID="outfit-share-look"
            >
              <Feather name="share" size={14} color={colors.foreground} />
              <Text style={[styles.shareText, { color: colors.foreground }]}>Share Look</Text>
            </PressableScale>
          </SceneBand>
          {/* WHAT SHE HAS ON: one chip per slot. */}
          <View style={styles.wearingRow}>
            <WearingChip
              label={wornGarment?.name ?? 'Nothing on'}
              worn={wornGarment !== null}
              glyph={<Feather name="user" size={15} color={colors.gold} />}
            />
            <WearingChip
              label={wornAccessory?.name ?? 'Bare head'}
              worn={wornAccessory !== null}
              glyph={<MaterialCommunityIcons name="hat-fedora" size={15} color={colors.gold} />}
            />
          </View>
        </View>

        {/* THE TRY-ON, when something is picked off the rail: its name, its
            line, and the one action that fits. */}
        {previewed ? (
          <View testID="outfit-dressing-room" style={[styles.tryOn, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {shownOutfit ? (
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.previewName, { color: colors.foreground }]} numberOfLines={1}>{shownOutfit.name}</Text>
                <Text style={[styles.previewTagline, { color: colors.mutedForeground }]} numberOfLines={2}>{shownOutfit.tagline}</Text>
              </View>
            ) : null}
            <View style={styles.actionRow}>
              {shownOutfit == null ? (
                equipped == null && equippedAccessory == null ? null : (
                  <Pressable
                    testID="outfit-unequip"
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => equip.mutate({ data: { outfitId: null } })}
                    style={[styles.secondaryBtn, { borderColor: colors.border }, busy && styles.btnDisabled]}
                  >
                    <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>Take it all off</Text>
                  </Pressable>
                )
              ) : shownOutfit.owned ? (
                isWorn(shownOutfit.id, shownOutfit.kind) ? (
                  <Pressable
                    testID="outfit-unequip"
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() =>
                      equip.mutate({
                        data: { outfitId: null, slot: (shownOutfit.kind ?? 'garment') as 'garment' | 'accessory' },
                      })
                    }
                    style={[styles.secondaryBtn, { borderColor: colors.border }, busy && styles.btnDisabled]}
                  >
                    <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>Take it off</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    testID="outfit-wear"
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => equip.mutate({ data: { outfitId: shownOutfit.id } })}
                    style={[styles.primaryBtn, { backgroundColor: colors.primary }, busy && styles.btnDisabled]}
                  >
                    <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>Dress Bolo</Text>
                  </Pressable>
                )
              ) : balance < shownOutfit.cost ? (
                <Text testID="outfit-short" style={[styles.shortText, { color: colors.mutedForeground }]}>
                  {shownOutfit.cost - balance} more Chai and she can wear it.
                </Text>
              ) : (
                <Pressable
                  testID="outfit-buy"
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => setConfirming(shownOutfit.id)}
                  style={[styles.primaryBtn, { backgroundColor: colors.primary }, busy && styles.btnDisabled]}
                >
                  <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>Buy · {shownOutfit.cost}</Text>
                  <ChaiGlyph size={14} />
                </Pressable>
              )}
              {shownOutfit && !isWorn(shownOutfit.id, shownOutfit.kind) ? (
                <Pressable
                  testID="outfit-cancel-preview"
                  accessibilityRole="button"
                  onPress={() => setPreviewed(null)}
                  style={styles.cancelBtn}
                >
                  <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Back out</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* EVERYTHING / MY WARDROBE. */}
        <View testID="outfit-filters" style={styles.filters}>
          <Pressable
            testID="outfit-filter-all"
            accessibilityRole="button"
            accessibilityState={{ selected: !ownedOnly }}
            onPress={() => setOwnedOnly(false)}
            style={[styles.filterChip, ownedOnly ? { borderColor: colors.border, backgroundColor: colors.card } : { borderColor: colors.primary, backgroundColor: colors.primary }]}
          >
            <Text style={[styles.filterText, { color: ownedOnly ? colors.foreground : colors.primaryForeground }]}>Everything</Text>
          </Pressable>
          <Pressable
            testID="outfit-filter-owned"
            accessibilityRole="button"
            accessibilityState={{ selected: ownedOnly }}
            onPress={() => setOwnedOnly(true)}
            style={[styles.filterChip, ownedOnly ? { borderColor: colors.primary, backgroundColor: colors.primary } : { borderColor: colors.border, backgroundColor: colors.card }]}
          >
            <Text style={[styles.filterText, { color: ownedOnly ? colors.primaryForeground : colors.foreground }]}>
              My Wardrobe · {ownedCount}
            </Text>
          </Pressable>
        </View>

        {rackItems.length === 0 ? (
          <Text testID="outfit-filter-empty" style={[styles.emptyRack, { color: colors.mutedForeground, borderColor: colors.border }]}>
            {door === 'station' && !ownedOnly
              ? 'The station master is still sewing. New caps and uniforms arrive as they are drawn.'
              : 'Nothing bought yet. Everything on the rail is one tap away.'}
          </Text>
        ) : null}

        {groupOutfits(rackItems).map((section, si) => (
          <View key={section.kind} testID={`outfit-section-${section.kind}`} style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionLabel, { color: colors.foreground }]}>{section.label.toUpperCase()}</Text>
              {si === 0 ? (
                <View style={styles.newArrivals}>
                  <Text style={[styles.newArrivalsText, { color: colors.primary }]}>New arrivals</Text>
                  <MaterialCommunityIcons name="star-four-points" size={12} color={colors.gold} />
                </View>
              ) : null}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
              {section.items.map((outfit) => (
                <RailCard
                  key={outfit.id}
                  outfit={outfit}
                  shown={previewed === outfit.id}
                  worn={isWorn(outfit.id, outfit.kind)}
                  busy={busy}
                  onTry={() => tryOn(outfit.id)}
                  onWearToggle={(worn) =>
                    equip.mutate({
                      data: { outfitId: worn ? null : outfit.id, slot: (outfit.kind ?? 'garment') as 'garment' | 'accessory' },
                    })
                  }
                  onBuyNow={() => {
                    setPreviewed(outfit.id);
                    buy.mutate({ data: { outfitId: outfit.id } });
                  }}
                />
              ))}
            </ScrollView>
          </View>
        ))}
        <Text style={[styles.shopLine, { color: colors.mutedForeground }]}>
          Buy once, keep forever. Bolo wears your pick everywhere in the app, and a hat and an outfit go on at the same time.
        </Text>
      </ScrollView>
      <ChaiWalletSheet visible={walletOpen} onClose={() => setWalletOpen(false)} />
    </Screen>
  );
}

function CategoryButton({ label, glyph, active, onPress, testID }: { label: string; glyph: React.ReactNode; active: boolean; onPress: () => void; testID?: string }) {
  const colors = useColors();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      style={[styles.categoryBtn, { backgroundColor: 'rgba(255,253,249,0.94)', borderColor: active ? colors.primary : 'rgba(207,200,240,0.9)' }]}
    >
      {glyph}
      <Text style={[styles.categoryText, { color: colors.foreground }]}>{label}</Text>
    </PressableScale>
  );
}

function WearingChip({ label, worn, glyph }: { label: string; worn: boolean; glyph: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.wearingChip, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.wearingGlyph, { backgroundColor: `${colors.gold}22` }]}>{glyph}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.wearingName, { color: colors.foreground }]} numberOfLines={1}>{label}</Text>
        <Text style={[styles.wearingState, { color: worn ? colors.success : colors.mutedForeground }]}>{worn ? 'Wearing' : 'Empty'}</Text>
      </View>
      {worn ? <Feather name="check-circle" size={18} color={colors.success} /> : null}
    </View>
  );
}

function RailCard({
  outfit,
  shown,
  worn,
  busy,
  onTry,
  onWearToggle,
  onBuyNow,
}: {
  outfit: OutfitCatalogItem;
  shown: boolean;
  worn: boolean;
  busy: boolean;
  onTry: () => void;
  onWearToggle: (worn: boolean) => void;
  onBuyNow: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      testID={`outfit-card-${outfit.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${outfit.name}, ${outfit.owned ? (worn ? 'wearing' : 'owned') : `${outfit.cost} Chai`}`}
      onPress={onTry}
      style={[styles.card, { backgroundColor: colors.card, borderColor: shown ? colors.primary : colors.border }]}
    >
      <View style={[styles.cardThumb, { backgroundColor: `${colors.gold}14` }]}>
        <OutfitThumb outfitId={outfit.id} preview={outfit.preview} size={THUMB} />
      </View>
      <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>{outfit.name}</Text>
      {outfit.owned ? (
        <Pressable
          testID={worn ? `outfit-takeoff-${outfit.id}` : `outfit-wear-${outfit.id}`}
          accessibilityRole="button"
          accessibilityLabel={worn ? `Take off ${outfit.name}` : `Dress Bolo in ${outfit.name}`}
          disabled={busy}
          onPress={() => onWearToggle(worn)}
          style={({ pressed }) => [styles.cardPill, { backgroundColor: worn ? `${colors.success}1F` : `${colors.primary}14` }, (pressed || busy) && styles.btnDisabled]}
        >
          <Text style={[styles.cardPillText, { color: worn ? colors.success : colors.primary }]}>{worn ? 'Wearing' : 'Dress Bolo'}</Text>
        </Pressable>
      ) : (
        <Pressable
          testID={`outfit-buynow-${outfit.id}`}
          accessibilityRole="button"
          accessibilityLabel={`Buy ${outfit.name} for ${outfit.cost} Chai`}
          disabled={busy}
          onPress={onBuyNow}
          style={({ pressed }) => [styles.cardPrice, (pressed || busy) && styles.btnDisabled]}
        >
          <Text style={[styles.cardPriceText, { color: colors.foreground }]}>{outfit.cost}</Text>
          <ChaiGlyph size={14} />
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  confirmScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  confirmCard: { width: '100%', borderRadius: 22, borderWidth: 1.5, padding: 20, gap: 10 },
  confirmTitle: { fontSize: 18, fontFamily: AppFonts.extrabold },
  confirmBody: { fontSize: 14, fontFamily: AppFonts.regular, lineHeight: 20 },
  confirmRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  confirmBtn: { flex: 1, borderRadius: 999, borderWidth: 1.5, paddingVertical: 11, alignItems: 'center' },
  confirmBtnText: { fontSize: 15, fontFamily: AppFonts.bold },
  street: { paddingHorizontal: 20, paddingBottom: TAB_BAR_CLEARANCE, gap: 14 },
  sceneVeil: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(43,26,18,0.08)' },
  sideButtons: { position: 'absolute', left: 12, top: 14, gap: 10 },
  categoryBtn: { width: 74, height: 74, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 4 },
  categoryText: { fontFamily: AppFonts.semibold, fontSize: 11 },
  // Bolo stands left of centre so the keeper at the scene's right shows beside her.
  stage: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 6, paddingLeft: 42, paddingRight: 44 },
  shareBtn: { position: 'absolute', right: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  shareText: { fontFamily: AppFonts.bold, fontSize: 13 },
  wearingRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  // Tight on purpose: two chips share the width, and "Marigold pagdi" has to
  // fit beside a glyph and a tick (it clipped at 34 and 13 on the simulator).
  wearingChip: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 8 },
  wearingGlyph: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  wearingName: { fontFamily: AppFonts.bold, fontSize: 12.5 },
  wearingState: { fontFamily: AppFonts.semibold, fontSize: 11, marginTop: 1 },
  tryOn: { borderRadius: 16, borderWidth: 1, padding: 12, gap: 10 },
  previewName: { fontFamily: AppFonts.extrabold, fontSize: 16 },
  previewTagline: { fontFamily: AppFonts.regular, fontSize: 13, marginTop: 2 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 11 },
  primaryBtnText: { fontFamily: AppFonts.bold, fontSize: 15 },
  secondaryBtn: { borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 16, paddingVertical: 10 },
  secondaryBtnText: { fontFamily: AppFonts.bold, fontSize: 14 },
  btnDisabled: { opacity: 0.55 },
  shortText: { fontFamily: AppFonts.semibold, fontSize: 14, flexShrink: 1 },
  cancelBtn: { paddingVertical: 8, paddingHorizontal: 4 },
  cancelText: { fontFamily: AppFonts.semibold, fontSize: 13 },
  filters: { flexDirection: 'row', gap: 10 },
  filterChip: { borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 16, paddingVertical: 9 },
  filterText: { fontFamily: AppFonts.bold, fontSize: 14 },
  emptyRack: { fontFamily: AppFonts.regular, fontSize: 14, lineHeight: 20, borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, padding: 14, textAlign: 'center' },
  section: { gap: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { fontFamily: AppFonts.extrabold, fontSize: 12, letterSpacing: 1.4 },
  newArrivals: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  newArrivalsText: { fontFamily: AppFonts.semibold, fontSize: 12 },
  rail: { gap: 10, paddingRight: 4 },
  card: { width: CARD_W, borderRadius: 16, borderWidth: 1.5, padding: 8, alignItems: 'center', gap: 6 },
  cardThumb: { borderRadius: 12, overflow: 'hidden' },
  thumb: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontFamily: AppFonts.semibold, fontSize: 12, lineHeight: 15, textAlign: 'center', minHeight: 30 },
  cardPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  cardPillText: { fontFamily: AppFonts.bold, fontSize: 12 },
  cardPrice: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  cardPriceText: { fontFamily: AppFonts.extrabold, fontSize: 15 },
  shopLine: { fontFamily: AppFonts.regular, fontSize: 12.5, lineHeight: 18, textAlign: 'center', paddingHorizontal: 8 },
});
