import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetProgressSummaryQueryKey,
  getGetStreakRepairQueryKey,
  getGetTokensQueryKey,
  useGetStreakRepair,
  useGetTokens,
  useRepairStreak,
} from '@workspace/api-client-react';
import {
  EXPRESS_MULTIPLIER_COST,
  FIRST_CLASS_COST,
  GOLD_PALETTE,
  STATION_PAUSE_COST,
  STATION_PAUSE_MAX_EQUIPPED,
  missedDayLabel,
  useExpressCountdown,
  useFirstClassBuy,
  useFirstClassCountdown,
  useSpendWithNotice,
} from '@/components/ChaiWallet';
import { ChaiGlyph } from '@/components/ChaiStall';
import { TrainEngine } from '@/components/journey/TrainEngine';
import { PressableScale } from '@/components/PressableScale';
import { AllAccessUpgradeCard } from '@/components/PlusUpsell';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { repairErrorMessage } from '@/lib/chai-errors';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { hapticLight } from '@/lib/haptics';

/**
 * THE TICKET COUNTER'S STAMPS (build 22, the owner's bazaar mockup: "Ticket
 * counter should match the mockup"). Every Chai spend that keeps the line
 * running, each as a stamp: a perforated card with a picture, a name, a
 * line and its price. The tills, countdowns and the mend offer are the
 * wallet's own hooks, unchanged; only the paper is new. Two copies of a
 * spend is two places for a spend bug to hide, so nothing here decides what
 * a purchase does.
 */
const STAMP = {
  paper: '#FBF3E6',
  edge: '#DCCBAF',
  ink: '#3B2A1E',
  inkMuted: '#7A6551',
} as const;

function Stamp({
  picture,
  tint,
  title,
  line,
  meta,
  price,
  cta,
  active,
  disabled,
  onPress,
  testID,
}: {
  picture: React.ReactNode;
  tint: string;
  title: string;
  line: string;
  meta?: string;
  /** Chai. Omitted while the pass is active, when the state line shows instead. */
  price?: number;
  cta: string;
  /** A running pass's own line ("✦ 23h 12m"). */
  active?: string | null;
  disabled?: boolean;
  onPress: () => void;
  testID: string;
}) {
  const colors = useColors();
  return (
    <View style={[styles.stamp, { backgroundColor: STAMP.paper, borderColor: STAMP.edge }]} testID={testID}>
      <View pointerEvents="none" style={[styles.perforation, { borderColor: STAMP.edge }]} />
      <View style={[styles.picture, { backgroundColor: tint }]}>{picture}</View>
      <Text style={[styles.title, { color: STAMP.ink }]} numberOfLines={2}>{title}</Text>
      <Text style={[styles.line, { color: STAMP.inkMuted }]} numberOfLines={3}>{line}</Text>
      {meta ? <Text style={[styles.meta, { color: STAMP.inkMuted }]} numberOfLines={1}>{meta}</Text> : null}
      <View style={{ flex: 1 }} />
      {active ? (
        <Text style={[styles.active, { color: '#92650A' }]} numberOfLines={1} testID={`${testID}-active`}>
          {active}
        </Text>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${cta} ${title} for ${price ?? 0} Chai`}
          disabled={disabled}
          onPress={() => {
            hapticLight();
            onPress();
          }}
          style={({ pressed }) => [styles.priceBtn, { backgroundColor: colors.primary }, (pressed || disabled) && styles.pressed]}
          testID={`${testID}-buy`}
        >
          <Text style={[styles.priceText, { color: colors.primaryForeground }]}>{price ?? 0}</Text>
          <ChaiGlyph size={14} />
        </Pressable>
      )}
    </View>
  );
}

export function PassesAndBoosts({ onNotice }: { onNotice: (message: string) => void }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const tokens = useGetTokens();
  const spend = useSpendWithNotice(onNotice);
  const firstClass = useFirstClassBuy(onNotice);
  const firstClassCountdown = useFirstClassCountdown(tokens.data?.firstClassActiveUntil);
  const expressCountdown = useExpressCountdown(tokens.data?.expressMultiplierActiveUntil);
  const offerQuery = useGetStreakRepair();
  const offer = offerQuery.data;
  const repair = useRepairStreak({
    mutation: {
      onError: (error: unknown) => onNotice(repairErrorMessage(error)),
      onSuccess: (result) => {
        onNotice(`${missedDayLabel(result.repairedDay)} is covered. Your ${result.restoredStreakDays}-day streak rides on.`);
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: getGetTokensQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetStreakRepairQueryKey() });
        queryClient.invalidateQueries({ queryKey: [getGetProgressSummaryQueryKey()[0]] });
      },
    },
  });
  const pausesEquipped = tokens.data?.stationPausesEquipped ?? 0;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
      <Stamp
        testID="ticket-first-class"
        tint="rgba(232,185,60,0.22)"
        picture={
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <TrainEngine tint={GOLD_PALETTE.chassis} width={56} height={36} palette={GOLD_PALETTE} />
          </View>
        }
        title="First Class Pass"
        line="24 hours of gold-train status, with an Express boost on boarding."
        price={FIRST_CLASS_COST}
        cta="Board"
        active={firstClassCountdown ? `✦ ${firstClassCountdown}` : null}
        disabled={firstClass.mutation.isPending}
        onPress={() => firstClass.mutation.mutate({ data: { refId: firstClass.refId } })}
      />
      <Stamp
        testID="ticket-express"
        tint={`${colors.primary}1F`}
        picture={
          <View style={styles.glyphWrap}>
            <Feather name="zap" size={30} color={colors.primary} />
            <View style={[styles.twoX, { backgroundColor: colors.primary }]}>
              <Text style={styles.twoXText}>2x</Text>
            </View>
          </View>
        }
        title="Express Multiplier"
        line="Double XP for 20 minutes."
        price={EXPRESS_MULTIPLIER_COST}
        cta="Start"
        active={expressCountdown ? `Running · ${expressCountdown}` : null}
        disabled={spend.isPending}
        onPress={() => spend.mutate({ data: { item: 'express_multiplier' } })}
      />
      <Stamp
        testID="ticket-pause"
        tint="rgba(240,163,43,0.22)"
        picture={<MaterialCommunityIcons name="seat-passenger" size={34} color="#92650A" />}
        title="Station Pause"
        line="Equip it before you need it. The next day you miss is already covered."
        meta={`${pausesEquipped} of ${STATION_PAUSE_MAX_EQUIPPED} equipped`}
        price={STATION_PAUSE_COST}
        cta="Equip"
        disabled={spend.isPending || pausesEquipped >= STATION_PAUSE_MAX_EQUIPPED}
        onPress={() => spend.mutate({ data: { item: 'station_pause' } })}
      />
      {offer?.eligible && offer.missedDay ? (
        <Stamp
          testID="ticket-mend"
          tint="rgba(34,197,94,0.16)"
          picture={<MaterialCommunityIcons name="needle" size={32} color="#1E7357" />}
          title="Mend the streak"
          line={`${missedDayLabel(offer.missedDay)} got away from you. Cover it and your ${offer.restoresStreakDays}-day streak rides on.`}
          price={offer.cost}
          cta="Mend"
          disabled={repair.isPending}
          onPress={() => repair.mutate()}
        />
      ) : null}
    </ScrollView>
  );
}

/**
 * UPGRADES: the one upgrade the product sells is All-Access, and it is not
 * bought with Chai, so the card explores rather than prices. Hidden once the
 * learner has it. (The mockup's "First Class Experience" at 75 Chai is not a
 * product; First Class is the 24-hour pass above.)
 */
export function Upgrades() {
  const colors = useColors();
  const router = useRouter();
  const { isPlus, isLoading } = useEntitlements();
  if (isLoading || isPlus) return null;
  // ONE CARD, drawn by PlusUpsell since build 23: the home shows this same
  // card now, and a second copy of it here is how the two drifted apart in
  // the first place (owner: "not the same as the new ones we created").
  return (
    <AllAccessUpgradeCard
      onPress={() => {
        hapticLight();
        router.push('/(app)/paywall');
      }}
      testID="ticket-upgrade"
    />
  );
}

const styles = StyleSheet.create({
  rail: { gap: 12, paddingRight: 4 },
  stamp: {
    width: 156,
    minHeight: 236,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 10,
    gap: 6,
  },
  // The perforation: a dashed hairline set in from the edge, the stamp's own.
  perforation: {
    position: 'absolute',
    left: 4,
    right: 4,
    top: 4,
    bottom: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    opacity: 0.8,
  },
  picture: { height: 78, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  glyphWrap: { alignItems: 'center', justifyContent: 'center' },
  twoX: { position: 'absolute', right: -22, top: -10, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  twoXText: { fontFamily: AppFonts.extrabold, fontSize: 10, color: '#FFFFFF' },
  title: { fontFamily: AppFonts.extrabold, fontSize: 14, lineHeight: 18 },
  line: { fontFamily: AppFonts.regular, fontSize: 11.5, lineHeight: 15 },
  meta: { fontFamily: AppFonts.semibold, fontSize: 11 },
  active: { fontFamily: AppFonts.extrabold, fontSize: 13, paddingVertical: 8 },
  priceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 999,
    paddingVertical: 8,
  },
  priceText: { fontFamily: AppFonts.extrabold, fontSize: 15 },
  pressed: { opacity: 0.6 },
});
