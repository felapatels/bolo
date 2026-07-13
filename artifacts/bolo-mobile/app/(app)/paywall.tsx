import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { PurchasesPackage } from 'react-native-purchases';
import { getGetEntitlementsQueryKey } from '@workspace/api-client-react';
import { Screen } from '@/components/Screen';
import { ChunkyButton } from '@/components/ChunkyButton';
import {
  usePurchases,
  isTestPurchaseRuntime,
} from '@/contexts/PurchasesContext';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

const BENEFITS: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  desc: string;
}[] = [
  {
    icon: 'globe',
    title: 'Every language',
    desc: 'Learn any language, not just Hindi.',
  },
  {
    icon: 'zap',
    title: 'Unlimited lessons',
    desc: 'No daily cap — practice as much as you like.',
  },
  {
    icon: 'repeat',
    title: 'Review weakest phrases',
    desc: 'Smart sessions drill exactly what you miss.',
  },
  {
    icon: 'bar-chart-2',
    title: 'Advanced analytics',
    desc: 'See detailed progress across every topic.',
  },
  {
    icon: 'award',
    title: 'Exclusive badges',
    desc: 'Earn Plus-only achievements as you learn.',
  },
];

const UNIT_WORDS: Record<string, string> = {
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month',
  YEAR: 'year',
};

// Derives the free-trial label straight from the store product metadata — never
// hardcoded. The Test Store can't model trials, so this returns null there.
function trialLabel(pkg: PurchasesPackage | null): string | null {
  const intro = pkg?.product.introPrice;
  if (!intro || intro.price !== 0) return null;
  const n = intro.periodNumberOfUnits;
  const unit = UNIT_WORDS[intro.periodUnit ?? ''] ?? 'day';
  return `${n}-${unit}${n === 1 ? '' : 's'} free trial`;
}

export default function PaywallScreen() {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    monthlyPackage,
    annualPackage,
    isConfigured,
    isReady,
    isPurchasing,
    isRestoring,
    purchase,
    restore,
  } = usePurchases();
  const { isPlus } = useEntitlements();

  const [selected, setSelected] = useState<'annual' | 'monthly'>('annual');
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [status, setStatus] = useState<{
    kind: 'error' | 'success' | 'info';
    text: string;
  } | null>(null);

  const selectedPackage =
    selected === 'annual' ? annualPackage : monthlyPackage;
  const hasOfferings = !!(monthlyPackage || annualPackage);
  const trial = trialLabel(selectedPackage ?? annualPackage ?? monthlyPackage);

  const close = useCallback(() => router.back(), [router]);

  // The server (via the store webhook / reconcile-on-read) is the source of
  // truth for the plan, so after a purchase we invalidate every query to pull
  // the freshly-unlocked entitlements and gated content, then close.
  const onUnlocked = useCallback(async () => {
    setStatus({ kind: 'success', text: 'You’re Plus! Unlocking everything…' });
    await queryClient.refetchQueries({ queryKey: getGetEntitlementsQueryKey() });
    await queryClient.invalidateQueries();
    setTimeout(close, 1100);
  }, [queryClient, close]);

  const runPurchase = useCallback(
    async (pkg: PurchasesPackage) => {
      setStatus(null);
      const outcome = await purchase(pkg);
      if (outcome === 'success') {
        await onUnlocked();
      } else if (outcome === 'error') {
        setStatus({
          kind: 'error',
          text: 'That purchase didn’t go through. Please try again.',
        });
      }
      // 'cancelled' — silently return to the paywall.
    },
    [purchase, onUnlocked],
  );

  const onSubscribe = useCallback(() => {
    if (!selectedPackage) return;
    // Guard test/sandbox purchases behind an explicit confirm (custom modal, not
    // a system alert) so a tap can't accidentally trigger a store purchase.
    if (isTestPurchaseRuntime()) {
      setConfirmVisible(true);
      return;
    }
    runPurchase(selectedPackage);
  }, [selectedPackage, runPurchase]);

  const onRestore = useCallback(async () => {
    setStatus(null);
    const ok = await restore();
    if (ok) {
      await onUnlocked();
    } else {
      setStatus({
        kind: 'info',
        text: 'No previous purchases found to restore.',
      });
    }
  }, [restore, onUnlocked]);

  const busy = isPurchasing || isRestoring;

  return (
    <Screen padTop={false}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={[styles.brandDot, { backgroundColor: colors.gold }]}>
            <Feather name="star" size={16} color="#1a1200" />
          </View>
          <Text style={[styles.brand, { color: colors.foreground }]}>
            Bolo! Plus
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Close"
          onPress={close}
          style={[styles.closeBtn, { backgroundColor: colors.muted }]}
        >
          <Feather name="x" size={20} color={colors.foreground} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.headline, { color: colors.foreground }]}>
          Learn faster, in every language
        </Text>
        <Text style={[styles.subhead, { color: colors.mutedForeground }]}>
          Unlock the full Bolo! experience.
        </Text>

        {/* Benefits */}
        <View style={{ marginTop: 20, marginBottom: 24, gap: 14 }}>
          {BENEFITS.map((b) => (
            <View key={b.title} style={styles.benefitRow}>
              <View
                style={[
                  styles.benefitIcon,
                  { backgroundColor: `${colors.primary}1A` },
                ]}
              >
                <Feather name={b.icon} size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.benefitTitle, { color: colors.foreground }]}
                >
                  {b.title}
                </Text>
                <Text
                  style={[
                    styles.benefitDesc,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {b.desc}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {isPlus ? (
          <View
            style={[
              styles.plusState,
              { backgroundColor: `${colors.success}1A`, borderColor: colors.success },
            ]}
          >
            <Feather name="check-circle" size={22} color={colors.success} />
            <Text style={[styles.plusStateText, { color: colors.foreground }]}>
              You’re already a Plus member. Everything’s unlocked!
            </Text>
          </View>
        ) : isConfigured && !isReady ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
        ) : hasOfferings ? (
          <>
            {annualPackage ? (
              <PlanOption
                label="Annual"
                priceString={annualPackage.product.priceString}
                period="per year"
                best
                monthlyEquivalent={perMonthString(annualPackage)}
                selected={selected === 'annual'}
                onPress={() => setSelected('annual')}
              />
            ) : null}
            {monthlyPackage ? (
              <PlanOption
                label="Monthly"
                priceString={monthlyPackage.product.priceString}
                period="per month"
                selected={selected === 'monthly'}
                onPress={() => setSelected('monthly')}
              />
            ) : null}

            {trial ? (
              <Text style={[styles.trialNote, { color: colors.success }]}>
                {trial}, then billed automatically. Cancel anytime.
              </Text>
            ) : null}

            {status ? (
              <Text
                style={[
                  styles.status,
                  {
                    color:
                      status.kind === 'error'
                        ? colors.destructive
                        : status.kind === 'success'
                          ? colors.success
                          : colors.mutedForeground,
                  },
                ]}
              >
                {status.text}
              </Text>
            ) : null}

            <ChunkyButton
              title={trial ? 'Start free trial' : 'Subscribe'}
              icon="unlock"
              onPress={onSubscribe}
              loading={isPurchasing}
              disabled={busy || !selectedPackage}
              style={{ marginTop: 18 }}
            />

            <Pressable
              onPress={onRestore}
              disabled={busy}
              style={{ marginTop: 16, alignItems: 'center' }}
            >
              <Text style={[styles.restore, { color: colors.mutedForeground }]}>
                {isRestoring ? 'Restoring…' : 'Restore purchases'}
              </Text>
            </Pressable>
          </>
        ) : (
          <View
            style={[
              styles.unavailable,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Feather name="clock" size={22} color={colors.mutedForeground} />
            <Text
              style={[styles.unavailableText, { color: colors.mutedForeground }]}
            >
              Subscriptions aren’t available in this build yet. Check back soon.
            </Text>
            <Pressable
              onPress={onRestore}
              disabled={busy}
              style={{ marginTop: 6 }}
            >
              <Text style={[styles.restore, { color: colors.primary }]}>
                {isRestoring ? 'Restoring…' : 'Restore purchases'}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Custom test-purchase confirmation (never a system Alert). */}
      <Modal
        visible={confirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmVisible(false)}
      >
        <View style={styles.modalScrim}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Confirm test purchase
            </Text>
            <Text
              style={[styles.modalBody, { color: colors.mutedForeground }]}
            >
              You’re in a test environment. Continue with a sandbox purchase of{' '}
              {selectedPackage?.product.priceString ?? 'this plan'}?
            </Text>
            <ChunkyButton
              title="Continue"
              onPress={() => {
                setConfirmVisible(false);
                if (selectedPackage) runPurchase(selectedPackage);
              }}
              style={{ marginTop: 18 }}
            />
            <Pressable
              onPress={() => setConfirmVisible(false)}
              style={{ marginTop: 14, alignItems: 'center' }}
            >
              <Text style={[styles.restore, { color: colors.mutedForeground }]}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

// Localized per-month equivalent of an annual package, for the "just $x/mo" hint.
function perMonthString(pkg: PurchasesPackage): string {
  const perMonth = pkg.product.price / 12;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: pkg.product.currencyCode ?? 'USD',
    }).format(perMonth);
  } catch {
    return `${perMonth.toFixed(2)}`;
  }
}

function PlanOption({
  label,
  priceString,
  period,
  monthlyEquivalent,
  best,
  selected,
  onPress,
}: {
  label: string;
  priceString: string;
  period: string;
  monthlyEquivalent?: string;
  best?: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.plan,
        {
          backgroundColor: selected ? `${colors.primary}12` : colors.card,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
    >
      <View
        style={[
          styles.radio,
          { borderColor: selected ? colors.primary : colors.border },
        ]}
      >
        {selected ? (
          <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.planLabelRow}>
          <Text style={[styles.planLabel, { color: colors.foreground }]}>
            {label}
          </Text>
          {best ? (
            <View style={[styles.bestPill, { backgroundColor: colors.success }]}>
              <Text style={styles.bestText}>BEST VALUE</Text>
            </View>
          ) : null}
        </View>
        {monthlyEquivalent ? (
          <Text style={[styles.planSub, { color: colors.mutedForeground }]}>
            Just {monthlyEquivalent}/mo
          </Text>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.planPrice, { color: colors.foreground }]}>
          {priceString}
        </Text>
        <Text style={[styles.planPeriod, { color: colors.mutedForeground }]}>
          {period}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandDot: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { fontFamily: AppFonts.extrabold, fontSize: 20 },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: { fontFamily: AppFonts.extrabold, fontSize: 26, lineHeight: 32 },
  subhead: { fontFamily: AppFonts.regular, fontSize: 15, marginTop: 6 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  benefitIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitTitle: { fontFamily: AppFonts.bold, fontSize: 16 },
  benefitDesc: { fontFamily: AppFonts.regular, fontSize: 13, marginTop: 1 },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 20,
    borderWidth: 2,
    marginBottom: 12,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 12, height: 12, borderRadius: 6 },
  planLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planLabel: { fontFamily: AppFonts.bold, fontSize: 17 },
  planSub: { fontFamily: AppFonts.regular, fontSize: 13, marginTop: 2 },
  planPrice: { fontFamily: AppFonts.extrabold, fontSize: 18 },
  planPeriod: { fontFamily: AppFonts.regular, fontSize: 12, marginTop: 1 },
  bestPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  bestText: {
    fontFamily: AppFonts.extrabold,
    fontSize: 9,
    letterSpacing: 0.5,
    color: '#ffffff',
  },
  trialNote: {
    fontFamily: AppFonts.semibold,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  status: {
    fontFamily: AppFonts.semibold,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 14,
  },
  restore: { fontFamily: AppFonts.semibold, fontSize: 15 },
  plusState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 18,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  plusStateText: { flex: 1, fontFamily: AppFonts.semibold, fontSize: 15 },
  unavailable: {
    alignItems: 'center',
    gap: 10,
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
  },
  unavailableText: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  modalScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    padding: 22,
    borderRadius: 24,
    borderWidth: 1,
  },
  modalTitle: { fontFamily: AppFonts.extrabold, fontSize: 20 },
  modalBody: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
});
