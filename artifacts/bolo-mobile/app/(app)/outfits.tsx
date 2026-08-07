import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { ChaiGlyph } from '@/components/ChaiStall';
import { MilestoneToast } from '@/components/MilestoneToast';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

// Bolo's wardrobe (mobile twin of artifacts/gujarati-coach/src/pages/outfits.tsx).
//
// Outfits are a Chai sink: bought once, owned forever, worn everywhere the
// mascot appears. The shop previews a costume ON THE LEARNER'S OWN BOLO rather
// than showing a grid of thumbnails — tap it, see the bird wearing it, then buy
// it or back out. Prices, ownership and the equipped choice all come from the
// server; nothing here hardcodes a number.
export default function OutfitsScreen() {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const outfitsQuery = useGetOutfits();
  const data = outfitsQuery.data;
  const equipped = data?.equipped ?? null;
  const balance = data?.balance ?? 0;

  // `undefined` means "whatever is equipped": the moment the learner taps a
  // card we hold their choice, and backing out returns to their real Bolo.
  const [previewed, setPreviewed] = React.useState<string | null | undefined>(
    undefined,
  );
  const shown = previewed === undefined ? equipped : previewed;
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
      setPreviewed(undefined);
      await refresh();
    },
    onError: () => showNotice("That didn't go through. Give it another try."),
  };
  const buy = useBuyOutfit({ mutation: mutationOptions });
  const equip = useEquipOutfit({ mutation: mutationOptions });
  const busy = buy.isPending || equip.isPending;

  const shownOutfit = data?.outfits.find((o) => o.id === shown) ?? null;

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
        <Text style={[styles.headerLabel, { color: colors.foreground }]}>
          Bolo's wardrobe
        </Text>
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

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: TAB_BAR_CLEARANCE,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>
          Dress him up with Chai. Once he owns it, it's his for good.
        </Text>

        {/* Preview: the learner's own Bolo, wearing whatever is selected. */}
        <View
          testID="outfit-preview"
          style={[
            styles.previewCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Mascot pose="wave" size={180} motion="float" outfit={shown} />
          <Text style={[styles.previewName, { color: colors.foreground }]}>
            {shownOutfit ? shownOutfit.name : 'Bolo, as he comes'}
          </Text>
          {shownOutfit ? (
            <Text
              style={[styles.previewTagline, { color: colors.mutedForeground }]}
            >
              {shownOutfit.tagline}
            </Text>
          ) : null}
        </View>

        {/* Action for whatever is on the bird right now. */}
        <View style={styles.actionRow}>
          {shownOutfit == null ? (
            equipped == null ? null : (
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
                  Take it off
                </Text>
              </Pressable>
            )
          ) : shownOutfit.owned ? (
            shownOutfit.id === equipped ? (
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
                  Wear this
                </Text>
              </Pressable>
            )
          ) : balance < shownOutfit.cost ? (
            <Text
              testID="outfit-short"
              style={[styles.shortText, { color: colors.mutedForeground }]}
            >
              {shownOutfit.cost - balance} more Chai and he can wear it.
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

        {/* The rack. Tapping a costume only previews it — nothing is spent and
            nothing is worn until the learner says so above. */}
        <View style={styles.rack}>
          {(data?.outfits ?? []).map((outfit) => (
            <Pressable
              key={outfit.id}
              testID={`outfit-card-${outfit.id}`}
              accessibilityRole="button"
              onPress={() => setPreviewed(outfit.id)}
              style={[
                styles.card,
                {
                  backgroundColor: colors.card,
                  borderColor:
                    shown === outfit.id ? colors.primary : colors.border,
                },
              ]}
            >
              <View style={styles.cardInfo}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                  {outfit.name}
                </Text>
                <Text
                  style={[styles.cardDesc, { color: colors.mutedForeground }]}
                >
                  {outfit.tagline}
                </Text>
              </View>
              {outfit.owned ? (
                <Text style={[styles.ownedTag, { color: colors.primary }]}>
                  {outfit.id === equipped ? 'Wearing' : 'Owned'}
                </Text>
              ) : (
                <View style={styles.priceTag}>
                  <Text style={[styles.priceText, { color: colors.foreground }]}>
                    {outfit.cost}
                  </Text>
                  <ChaiGlyph size={14} />
                </View>
              )}
            </Pressable>
          ))}

          {shown !== equipped ? (
            <Pressable
              testID="outfit-cancel-preview"
              accessibilityRole="button"
              onPress={() => setPreviewed(undefined)}
              style={[styles.cancelBtn, { borderColor: colors.border }]}
            >
              <Text
                style={[styles.cancelText, { color: colors.mutedForeground }]}
              >
                Back out — show my Bolo as he is
              </Text>
            </Pressable>
          ) : null}
        </View>
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
  headerLabel: { flex: 1, fontFamily: AppFonts.extrabold, fontSize: 20 },
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
  sub: { fontFamily: AppFonts.regular, fontSize: 14, marginBottom: 16 },
  previewCard: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 24,
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  previewName: {
    fontFamily: AppFonts.extrabold,
    fontSize: 15,
    marginTop: 12,
    textAlign: 'center',
  },
  previewTagline: {
    fontFamily: AppFonts.regular,
    fontSize: 12,
    marginTop: 2,
    textAlign: 'center',
  },
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
  rack: { marginTop: 24, gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  cardInfo: { flex: 1, minWidth: 0 },
  cardTitle: { fontFamily: AppFonts.extrabold, fontSize: 15 },
  cardDesc: { fontFamily: AppFonts.regular, fontSize: 12, marginTop: 2 },
  ownedTag: { fontFamily: AppFonts.extrabold, fontSize: 12, letterSpacing: 0.5 },
  priceTag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  priceText: { fontFamily: AppFonts.extrabold, fontSize: 15 },
  cancelBtn: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 18,
    padding: 14,
    alignItems: 'center',
  },
  cancelText: { fontFamily: AppFonts.bold, fontSize: 13 },
});
