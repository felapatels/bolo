import React from 'react';
import {
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetOutfitsQueryKey,
  getGetTokensQueryKey,
  useBuyOutfit,
  useEquipOutfit,
  useGetOutfits,
} from '@workspace/api-client-react';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { PressableScale } from '@/components/PressableScale';
import { Mascot } from '@/components/Mascot';
import { mascotSource } from '@/lib/mascotOutfits';
import { ChaiGlyph } from '@/components/ChaiStall';
import { MilestoneToast } from '@/components/MilestoneToast';
import { Awning, MarigoldString } from '@/components/IndiaDecor';
import { DressingRoom } from '@/components/DressingRoom';
import { INDIA } from '@/constants/india';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

// Bolo Bazaar (mobile twin of artifacts/gujarati-coach/src/pages/outfits.tsx).
//
// Outfits are a Chai sink: bought once, owned forever, worn everywhere the
// mascot appears. The shop previews a costume ON THE LEARNER'S OWN BOLO rather
// than showing a grid of thumbnails — tap it, see the bird wearing it, then buy
// it or back out. Prices, ownership and the equipped choice all come from the
// server; nothing here hardcodes a number.
//
// THE THEME is a roadside cloth shop: striped awning with a scalloped hem, a
// marigold toran strung under it, a hand-painted signboard, and a timber
// counter the bird stands behind. The awning and toran are shared dressing
// (components/IndiaDecor.tsx) and the colours come from the fixed INDIA
// palette (constants/india.ts) — a painted scene, so it reads the same in
// light and dark mode. Only the scene is fixed; every control stays on the
// design system.

/** Rack sections, in the order the shop shows them (web twin: outfit-card.tsx). */
const RACK_SECTIONS: ReadonlyArray<{ kind: string; label: string }> = [
  { kind: 'garment', label: 'Outfits' },
  { kind: 'accessory', label: 'Accessories' },
];

/**
 * Group the catalog into the sections above. An item whose kind this client
 * does not recognise (a newer server, an older app) falls into the first
 * section rather than off the floor, so unknown stock stays shoppable.
 */
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

// Rack geometry. Two columns of square pictures inside the screen's 20pt
// gutters; the thumb is the card minus its own padding, so the picture is a
// true square whatever the handset width.
const H_PADDING = 20;
const COLUMN_GAP = 12;
const CARD_PADDING = 10;
const CARD_WIDTH =
  (Dimensions.get('window').width - H_PADDING * 2 - COLUMN_GAP) / 2;
const THUMB_SIZE = CARD_WIDTH - CARD_PADDING * 2;

// How far into the wave master her head sits, as a fraction of the frame.
// Measured once against the canonical art; every item is composited into the
// same frame, so one pair of numbers crops all of them.
const HEAD_X = 0.53;
const HEAD_Y = 0.26;
const HEAD_ZOOM = 2.3;

/**
 * The item, worn, in a square box — the picture IS the item on Bolo, drawn
 * from the same pose files the shop already ships, so a card can never
 * advertise something different from what the learner gets (and a new item
 * costs zero extra assets).
 *
 * An accessory in a full-body crop is a few unreadable pixels, so the catalog
 * says to zoom the head. RN has no transform-origin, so the head is moved to
 * the middle of the box instead: with `scale` applied first, a translate is
 * expressed in PRE-scale units, which is why these are plain fractions of the
 * box rather than the scaled offsets the maths would otherwise need.
 */
function OutfitThumb({
  outfitId,
  preview,
  size,
}: {
  outfitId: string;
  preview?: string | null;
  size: number;
}) {
  const head = preview === 'head';
  return (
    <View style={[styles.thumb, { height: size }]}>
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

export default function OutfitsScreen() {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const outfitsQuery = useGetOutfits();
  const data = outfitsQuery.data;
  const equipped = data?.equipped ?? null;
  const equippedAccessory = data?.equippedAccessory ?? null;
  const balance = data?.balance ?? 0;

  // Which item the learner is trying on; null means "nothing being tried" and
  // the bird stands in exactly what she is wearing.
  //
  // TWO SLOTS: trying a hat on must not take her outfit off, so the item under
  // consideration only replaces ITS OWN slot and the other slot keeps showing
  // what is equipped.
  const [previewed, setPreviewed] = React.useState<string | null>(null);
  // The rack grows; what a learner already paid for should not need hunting
  // for. One chip narrows it to their own wardrobe.
  const [ownedOnly, setOwnedOnly] = React.useState(false);
  const [notice, setNotice] = React.useState('');
  const [noticeKey, setNoticeKey] = React.useState(0);

  const showNotice = (message: string) => {
    setNotice(message);
    setNoticeKey((k) => k + 1);
  };

  const refresh = async () => {
    // The equipped outfit rides GET /tokens, so refreshing both keys is what
    // redresses every other mascot in the app.
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
    onError: () => showNotice("That didn't go through. Give it another try."),
  };
  const buy = useBuyOutfit({ mutation: mutationOptions });
  const equip = useEquipOutfit({ mutation: mutationOptions });
  const busy = buy.isPending || equip.isPending;

  const shownOutfit = data?.outfits.find((o) => o.id === previewed) ?? null;
  const previewedKind = shownOutfit?.kind ?? 'garment';
  const shownGarment =
    shownOutfit && previewedKind === 'garment' ? shownOutfit.id : equipped;
  const shownAccessory =
    shownOutfit && previewedKind === 'accessory'
      ? shownOutfit.id
      : equippedAccessory;
  // Both slots decide what is behind the curtain, so the key is the pair.
  const shown = `${shownGarment ?? ''}|${shownAccessory ?? ''}`;
  const isWorn = (id: string, kind?: string | null) =>
    kind === 'accessory' ? id === equippedAccessory : id === equipped;

  const allItems = data?.outfits ?? [];
  const ownedCount = allItems.filter((o) => o.owned).length;
  const rackItems = ownedOnly ? allItems.filter((o) => o.owned) : allItems;

  // The changing room. Every costume change draws the curtain, swaps the art
  // behind it and opens again — an in-place swap read as a glitch. Outfit art
  // is bundled here rather than fetched, so the wait is a dressing beat, not
  // a load; the timer is still cleared on unmount so the curtain cannot be
  // left shut over the product.
  const [changing, setChanging] = React.useState(false);
  const dressedAs = React.useRef<string | undefined>(undefined);

  React.useEffect(() => {
    if (dressedAs.current === shown) return;
    const first = dressedAs.current === undefined;
    dressedAs.current = shown;
    if (first) return; // the shop opens with the curtain already up

    setChanging(true);
    // Long enough to read as a change of clothes rather than a flicker.
    const beat = setTimeout(() => setChanging(false), 1100);
    return () => clearTimeout(beat);
  }, [shown]);

  const tryOn = (outfitId: string) => setPreviewed(outfitId);

  return (
    <Screen>
      <MilestoneToast message={notice} toastKey={noticeKey} />
      <View style={styles.header}>
        <PressableScale
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={[
            styles.backBtn,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </PressableScale>
        {/* The shop's name lives on the painted board below, so the nav row
            stays a back button and the tin. */}
        <View style={styles.headerSpacer} />
        <View
          testID="outfit-balance"
          style={[
            styles.balancePill,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.balanceValue, { color: colors.foreground }]}>
            {balance}
          </Text>
          <ChaiGlyph size={14} />
        </View>
      </View>

      {/* THE DRESSING ROOM STAYS PUT. It sits outside the scroller, so the
          rack is the only thing that moves: a learner comparing eight items
          should never have to scroll the bird back into view to see what a
          costume looks like on her. */}
      <View testID="outfit-dressing-room" style={styles.dressingRoom}>
        {/* The storefront: awning, toran, painted board, and the counter Bolo
            stands behind — one shop rather than a header stacked on a card. */}
        <View
          testID="outfit-storefront"
          style={[styles.storefront, { borderColor: colors.border }]}
        >
          <Awning />

          <View style={styles.shopBody}>
            <MarigoldString />

            <View style={styles.signboard}>
              <Text style={styles.signName}>Bolo Bazaar</Text>
              <Text style={styles.signSub}>OUTFITS · PAID IN CHAI</Text>
            </View>

            {/* Preview: the learner's own Bolo, at the counter in whatever is
                selected. */}
            <View testID="outfit-preview" style={styles.preview}>
              <DressingRoom closed={changing}>
                <View style={styles.stage}>
                  <Mascot
                    pose="wave"
                    size={150}
                    motion="float"
                    outfit={shownGarment}
                    accessory={shownAccessory}
                  />
                </View>
              </DressingRoom>
              {shownOutfit ? (
                <Text style={styles.previewName}>{shownOutfit.name}</Text>
              ) : null}
              {shownOutfit ? (
                <Text style={styles.previewTagline}>{shownOutfit.tagline}</Text>
              ) : null}
            </View>
          </View>

          <View style={styles.counter}>
            <View style={styles.counterLip} />
          </View>
        </View>

        {/* Action for whatever is on the bird right now. Taking something off
            always names its slot, so removing a hat leaves the outfit on. */}
        <View style={styles.actionRow}>
          {shownOutfit == null ? (
            equipped == null && equippedAccessory == null ? null : (
              <Pressable
                testID="outfit-unequip"
                accessibilityRole="button"
                disabled={busy}
                onPress={() => equip.mutate({ data: { outfitId: null } })}
                style={[
                  styles.secondaryBtn,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  busy && styles.btnDisabled,
                ]}
              >
                <Text
                  style={[styles.secondaryBtnText, { color: colors.foreground }]}
                >
                  Take it all off
                </Text>
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
                    data: {
                      outfitId: null,
                      slot: previewedKind as 'garment' | 'accessory',
                    },
                  })
                }
                style={[
                  styles.secondaryBtn,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  busy && styles.btnDisabled,
                ]}
              >
                <Text
                  style={[styles.secondaryBtnText, { color: colors.foreground }]}
                >
                  Take it off
                </Text>
              </Pressable>
            ) : (
              <Pressable
                testID="outfit-wear"
                accessibilityRole="button"
                disabled={busy}
                onPress={() =>
                  equip.mutate({ data: { outfitId: shownOutfit.id } })
                }
                style={[
                  styles.primaryBtn,
                  { backgroundColor: colors.primary },
                  busy && styles.btnDisabled,
                ]}
              >
                <Text
                  style={[
                    styles.primaryBtnText,
                    { color: colors.primaryForeground },
                  ]}
                >
                  Dress Bolo
                </Text>
              </Pressable>
            )
          ) : balance < shownOutfit.cost ? (
            <Text
              testID="outfit-short"
              style={[styles.shortText, { color: colors.mutedForeground }]}
            >
              {shownOutfit.cost - balance} more Chai and she can wear it.
            </Text>
          ) : (
            <Pressable
              testID="outfit-buy"
              accessibilityRole="button"
              disabled={busy}
              onPress={() => buy.mutate({ data: { outfitId: shownOutfit.id } })}
              style={[
                styles.primaryBtn,
                { backgroundColor: colors.primary },
                busy && styles.btnDisabled,
              ]}
            >
              <Text
                style={[
                  styles.primaryBtnText,
                  { color: colors.primaryForeground },
                ]}
              >
                Buy · {shownOutfit.cost}
              </Text>
              <ChaiGlyph size={14} />
            </Pressable>
          )}
        </View>

      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: TAB_BAR_CLEARANCE,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* The two facts the UI cannot show on its own: the pick is worn
            app-wide, and the slots combine. */}
        <Text style={[styles.shopLine, { color: colors.mutedForeground }]}>
          Buy once, keep forever. Bolo wears your pick everywhere in the app,
          and a hat and an outfit go on at the same time.
        </Text>

        {/* Quick filter. Owned stock is what a learner comes back for, and it
            is scattered through a rack sorted by kind. */}
        <View testID="outfit-filters" style={styles.filters}>
          <Pressable
            testID="outfit-filter-all"
            accessibilityRole="button"
            accessibilityState={{ selected: !ownedOnly }}
            onPress={() => setOwnedOnly(false)}
            style={[
              styles.filterChip,
              ownedOnly
                ? { backgroundColor: colors.card, borderColor: colors.border }
                : { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
          >
            <Text
              style={[
                styles.filterText,
                {
                  color: ownedOnly
                    ? colors.mutedForeground
                    : colors.primaryForeground,
                },
              ]}
            >
              Everything
            </Text>
          </Pressable>
          <Pressable
            testID="outfit-filter-owned"
            accessibilityRole="button"
            accessibilityState={{ selected: ownedOnly }}
            onPress={() => setOwnedOnly(true)}
            style={[
              styles.filterChip,
              ownedOnly
                ? { backgroundColor: colors.primary, borderColor: colors.primary }
                : { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text
              style={[
                styles.filterText,
                {
                  color: ownedOnly
                    ? colors.primaryForeground
                    : colors.mutedForeground,
                },
              ]}
            >
              My wardrobe · {ownedCount}
            </Text>
          </Pressable>
        </View>

        {/* The rack. Stock is grouped by what it is and laid out as a grid of
            square pictures rather than a list of names: the catalog is growing
            and a name alone does not tell a learner what she is buying. Every
            card still carries its own two doors — Try On is a free preview,
            Buy Now is the till — and the card body previews on press as a
            convenience. */}
        {rackItems.length === 0 ? (
          <Text
            testID="outfit-filter-empty"
            style={[styles.emptyRack, { color: colors.mutedForeground, borderColor: colors.border }]}
          >
            Nothing bought yet. Everything on the rack is one tap away.
          </Text>
        ) : null}

        {groupOutfits(rackItems).map((section) => (
          <View
            key={section.kind}
            testID={`outfit-section-${section.kind}`}
            style={styles.section}
          >
            <Text
              style={[styles.sectionLabel, { color: colors.mutedForeground }]}
            >
              {section.label.toUpperCase()}
            </Text>
            <View style={styles.rack}>
              {section.items.map((outfit) => {
                const isShown = previewed === outfit.id;
                const worn = isWorn(outfit.id, outfit.kind);
                const short = outfit.cost - balance;
                return (
                  <Pressable
                    key={outfit.id}
                    testID={`outfit-card-${outfit.id}`}
                    accessibilityRole="button"
                    onPress={() => tryOn(outfit.id)}
                    style={[
                      styles.card,
                      {
                        backgroundColor: colors.card,
                        borderColor: isShown ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <View>
                      <OutfitThumb
                        outfitId={outfit.id}
                        preview={outfit.preview}
                        size={THUMB_SIZE}
                      />
                      {/* Ownership reads off the picture itself, so the eye
                          can skim the rack without reading every card. */}
                      {outfit.owned ? (
                        <View style={[styles.badge, { backgroundColor: INDIA.board }]}>
                          <Text style={[styles.badgeText, { color: INDIA.cream }]}>
                            {worn ? 'WEARING' : 'OWNED'}
                          </Text>
                        </View>
                      ) : (
                        <View style={[styles.badge, styles.priceBadge]}>
                          <Text style={[styles.badgeText, { color: INDIA.board }]}>
                            {outfit.cost}
                          </Text>
                          <ChaiGlyph size={11} />
                        </View>
                      )}
                    </View>

                    <Text
                      numberOfLines={1}
                      style={[styles.cardTitle, { color: colors.foreground }]}
                    >
                      {outfit.name}
                    </Text>
                    <Text
                      numberOfLines={2}
                      style={[styles.cardDesc, { color: colors.mutedForeground }]}
                    >
                      {outfit.tagline}
                    </Text>

                    <View style={styles.cardActions}>
                      <Pressable
                        testID={`outfit-tryon-${outfit.id}`}
                        accessibilityRole="button"
                        onPress={() => tryOn(outfit.id)}
                        style={({ pressed }) => [
                          styles.tryOnBtn,
                          pressed && styles.btnDisabled,
                        ]}
                      >
                        <Text style={styles.tryOnText}>
                          {isShown ? 'On the bird' : 'Try On'}
                        </Text>
                      </Pressable>

                      {outfit.owned ? (
                        <Pressable
                          testID={
                            worn
                              ? `outfit-takeoff-${outfit.id}`
                              : `outfit-wear-${outfit.id}`
                          }
                          accessibilityRole="button"
                          disabled={busy}
                          onPress={() =>
                            equip.mutate({
                              data: {
                                outfitId: worn ? null : outfit.id,
                                slot: (outfit.kind ?? 'garment') as
                                  | 'garment'
                                  | 'accessory',
                              },
                            })
                          }
                          style={({ pressed }) => [
                            styles.cardPrimaryBtn,
                            { backgroundColor: colors.primary },
                            (pressed || busy) && styles.btnDisabled,
                          ]}
                        >
                          <Text
                            style={[
                              styles.cardBtnText,
                              { color: colors.primaryForeground },
                            ]}
                          >
                            {worn ? 'Take it off' : 'Dress Bolo'}
                          </Text>
                        </Pressable>
                      ) : (
                        <Pressable
                          testID={`outfit-buynow-${outfit.id}`}
                          accessibilityRole="button"
                          disabled={busy || short > 0}
                          onPress={() => {
                            setPreviewed(outfit.id);
                            buy.mutate({ data: { outfitId: outfit.id } });
                          }}
                          style={({ pressed }) => [
                            styles.buyNowBtn,
                            (pressed || busy || short > 0) && styles.btnDisabled,
                          ]}
                        >
                          <Text
                            style={[styles.cardBtnText, { color: INDIA.cream }]}
                          >
                            {short > 0 ? `${short} more` : `Buy · ${outfit.cost}`}
                          </Text>
                          <ChaiGlyph size={12} />
                        </Pressable>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        {shownOutfit && !isWorn(shownOutfit.id, shownOutfit.kind) ? (
          <Pressable
            testID="outfit-cancel-preview"
            accessibilityRole="button"
            onPress={() => setPreviewed(null)}
            style={[styles.cancelBtn, { borderColor: colors.border }]}
          >
            <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>
              Back out — show my Bolo as she is
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: { flex: 1 },
  balancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  balanceValue: { fontFamily: AppFonts.extrabold, fontSize: 15 },
  storefront: {
    borderWidth: 1,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: INDIA.wall,
  },
  shopBody: { paddingHorizontal: 16, paddingTop: 14 },
  signboard: {
    alignSelf: 'flex-start',
    borderWidth: 2,
    borderColor: INDIA.gold,
    backgroundColor: INDIA.board,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  signName: { fontFamily: AppFonts.extrabold, fontSize: 22, color: INDIA.cream },
  signSub: {
    fontFamily: AppFonts.extrabold,
    fontSize: 9,
    letterSpacing: 2,
    marginTop: 3,
    color: INDIA.gold,
  },
  shopLine: {
    fontFamily: AppFonts.bold,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 12,
  },
  preview: { alignItems: 'center', marginTop: 8 },
  stage: { alignItems: 'center', paddingTop: 12 },
  previewName: {
    fontFamily: AppFonts.extrabold,
    fontSize: 15,
    marginTop: 8,
    textAlign: 'center',
    color: INDIA.board,
  },
  previewTagline: {
    fontFamily: AppFonts.bold,
    fontSize: 12,
    marginTop: 2,
    textAlign: 'center',
    color: INDIA.ink,
  },
  counter: { marginTop: 12, height: 14, backgroundColor: INDIA.timber },
  counterLip: { height: 6, backgroundColor: INDIA.timberShade, marginTop: 8 },
  actionRow: { alignItems: 'center', marginTop: 16 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  primaryBtnText: { fontFamily: AppFonts.extrabold, fontSize: 15 },
  secondaryBtn: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  secondaryBtnText: { fontFamily: AppFonts.extrabold, fontSize: 15 },
  btnDisabled: { opacity: 0.5 },
  shortText: { fontFamily: AppFonts.bold, fontSize: 14, textAlign: 'center' },
  dressingRoom: { paddingHorizontal: 20 },
  filters: { flexDirection: 'row', gap: 8, marginTop: 14 },
  filterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  filterText: { fontFamily: AppFonts.extrabold, fontSize: 12 },
  emptyRack: {
    fontFamily: AppFonts.bold,
    fontSize: 13,
    textAlign: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 18,
    padding: 20,
    marginTop: 16,
  },
  section: { marginTop: 18 },
  sectionLabel: {
    fontFamily: AppFonts.extrabold,
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  rack: { flexDirection: 'row', flexWrap: 'wrap', gap: COLUMN_GAP },
  card: {
    width: CARD_WIDTH,
    borderWidth: 1,
    borderRadius: 18,
    padding: CARD_PADDING,
  },
  thumb: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: INDIA.cloth,
  },
  badge: {
    position: 'absolute',
    left: 6,
    top: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  priceBadge: { backgroundColor: INDIA.cream },
  badgeText: {
    fontFamily: AppFonts.extrabold,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  cardActions: { gap: 6, marginTop: 10 },
  tryOnBtn: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: INDIA.gold,
    backgroundColor: INDIA.cloth,
    borderRadius: 12,
    paddingVertical: 10,
  },
  tryOnText: { fontFamily: AppFonts.extrabold, fontSize: 13, color: INDIA.board },
  cardPrimaryBtn: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 10,
  },
  buyNowBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 10,
    backgroundColor: INDIA.board,
    borderBottomWidth: 3,
    borderBottomColor: INDIA.boardDeep,
  },
  cardBtnText: { fontFamily: AppFonts.extrabold, fontSize: 13 },
  cardTitle: { fontFamily: AppFonts.extrabold, fontSize: 14, marginTop: 8 },
  cardDesc: {
    fontFamily: AppFonts.regular,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
    minHeight: 30,
  },
  cancelBtn: {
    marginTop: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 18,
    padding: 14,
    alignItems: 'center',
  },
  cancelText: { fontFamily: AppFonts.bold, fontSize: 13 },
});
